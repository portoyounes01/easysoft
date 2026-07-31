import { connectionStatus, supabase } from '../lib/supabase';
import { isPwaHost } from '../lib/host';
import { employeeService } from './employeeService';
import { productSyncService } from './productService';
import { customerSyncService } from './customerSyncService';
import { pullTenantReceiptLogo } from './receiptBrandingSync';
import { pullCompanyProfile } from './companyProfileSync';
import { pullStoreScopedCatalogue } from './storeScopedSyncService';
import { transactionSyncService } from './transactionSyncService';

// Types for sync status
export interface EntitySyncStatus {
    lastPulledAt: Date | null;
    lastPushedAt: Date | null;
    pendingOperations: number;
    isOnline: boolean;
    syncInProgress: boolean;
    error?: string;
}

export interface SyncManagerStatus {
    isOnline: boolean;
    globalSyncInProgress: boolean;
    lastGlobalSync: Date | null;
    entities: {
        employees: EntitySyncStatus;
        products: EntitySyncStatus;
        categories: EntitySyncStatus;
        customers: EntitySyncStatus;
        transactions: EntitySyncStatus;
    };
    totalPendingOperations: number;
}

// Sync events
export type SyncEvent = 
    | 'sync_started'
    | 'sync_completed' 
    | 'sync_failed'
    | 'entity_sync_started'
    | 'entity_sync_completed'
    | 'entity_sync_failed'
    | 'connection_changed';

export type SyncEventCallback = (event: SyncEvent, data?: any) => void;

// Central sync manager that coordinates all entity synchronization
export class SyncManager {
    private syncInProgress = false;
    private lastGlobalSync: Date | null = null;
    private syncInterval: NodeJS.Timeout | null = null;
    private callbacks: SyncEventCallback[] = [];
    private retryTimeouts: Map<string, NodeJS.Timeout> = new Map();

    // Sync configuration
    private config = {
        syncIntervalMs: 5 * 60 * 1000, // 5 minutes
        retryDelayMs: 30 * 1000, // 30 seconds
        maxRetries: 3,
        transactionWindowDays: 90, // Keep 90 days of transactions locally
        backgroundSyncEnabled: true,
    };

    constructor() {
        this.initialize();
    }

    // Initialize the sync manager
    private initialize(): void {
        // PWA host (browser) must NOT run the Dexie/delta sync engine at all — it reads
        // tenant data via direct PostgREST (docs/pwa-plan.md §2.5). Only the Electron till
        // (isPwaHost === false) drives sync. This also stops a background singleton from
        // firing the tenant-scoped delta RPCs in a manager's browser.
        if (isPwaHost) return;

        // Listen for connection status changes
        connectionStatus.subscribe(this.handleConnectionChange.bind(this));

        // Start background sync if enabled
        if (this.config.backgroundSyncEnabled) {
            this.startBackgroundSync();
        }
    }

    // Handle connection status changes
    private handleConnectionChange(status: { isOnline: boolean; isSupabaseOnline: boolean }): void {
        this.notifyCallbacks('connection_changed', status);

        // If we just came online, trigger a sync
        if (status.isOnline && status.isSupabaseOnline && !this.syncInProgress) {
            this.performBackgroundSync();
        }
    }

    // Start background sync interval
    startBackgroundSync(): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }

        this.syncInterval = setInterval(() => {
            this.performBackgroundSync();
        }, this.config.syncIntervalMs);

        console.log('SyncManager: Background sync started');
    }

    // Stop background sync interval
    stopBackgroundSync(): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }

        console.log('SyncManager: Background sync stopped');
    }

    // Perform background sync (with error handling)
    private async performBackgroundSync(): Promise<void> {
        try {
            await this.fullSync();
        } catch (error) {
            console.warn('SyncManager: Background sync failed:', error);
            // Don't throw for background sync failures
            this.scheduleRetry('background_sync');
        }
    }

    // Schedule a retry for failed sync
    private scheduleRetry(operation: string, retryCount: number = 0): void {
        if (retryCount >= this.config.maxRetries) {
            console.warn(`SyncManager: Max retries reached for ${operation}`);
            return;
        }

        const timeout = setTimeout(() => {
            console.log(`SyncManager: Retrying ${operation} (attempt ${retryCount + 1})`);
            this.performBackgroundSync();
        }, this.config.retryDelayMs * Math.pow(2, retryCount)); // Exponential backoff

        this.retryTimeouts.set(operation, timeout);
    }

    // Clear retry timeout
    private clearRetry(operation: string): void {
        const timeout = this.retryTimeouts.get(operation);
        if (timeout) {
            clearTimeout(timeout);
            this.retryTimeouts.delete(operation);
        }
    }

    // All sync RPCs are authenticated + tenant-scoped post-cutover (Phase 2/3). Without a
    // device/user session there is nothing we can legitimately sync, and firing the RPCs
    // anyway 401s / 42501s — which the UI misreads as "could not reach server". So skip
    // quietly until a session exists (e.g. on the pre-login screen, or a browser-core view
    // with no device session). A real paired till restores its device session at boot.
    private async hasAuthSession(): Promise<boolean> {
        try {
            const { data } = await supabase.auth.getSession();
            return !!data.session;
        } catch {
            return false;
        }
    }

    // Perform full sync of all entities
    async fullSync(): Promise<void> {
        if (this.syncInProgress) {
            console.log('SyncManager: Sync already in progress, skipping');
            return;
        }

        if (!(await this.hasAuthSession())) {
            console.log('SyncManager: no auth session yet — skipping sync (nothing to sync unauthenticated)');
            return;
        }

        this.syncInProgress = true;
        this.notifyCallbacks('sync_started');

        try {
            console.log('SyncManager: Starting full sync...');

            // Sync entities in order of dependency
            // 1. Core entities first (employees, categories, products)
            await this.syncEntity('employees', () => employeeService.performSync());
            await this.syncEntity('categories', () => productSyncService.pullCategories());
            await this.syncEntity('products', () => productSyncService.pullProducts());

            // Push any local changes for core entities
            await this.syncEntity('categories_push', () => productSyncService.pushCategories());
            await this.syncEntity('products_push', () => productSyncService.pushProducts());

            // 2. Then customers (needed for transactions)
            await this.syncEntity('customers', () => customerSyncService.fullSync());

            // 2b. Receipt branding — a singleton, no dependencies. Pulled before
            // transactions so a till that syncs and then prints has the logo.
            await this.syncEntity('receipt_branding', () => pullTenantReceiptLogo());

            // 2b-ii. The rest of the receipt header — company name, NIF, the
            // address of THIS till's store, slogan. Same singleton, same reason
            // for the ordering, and the same offline rule: a failed pull leaves
            // the cached block alone rather than printing a blank header.
            await this.syncEntity('company_profile', () => pullCompanyProfile());

            // 2c. Store-scoped catalogue and stock. AFTER products, because the
            // store rows fold price/stock onto product records that must already
            // exist locally. This is what makes `product.price` and
            // `rawMaterial.stock` mean THIS store's figures rather than a pool
            // shared with every other store in the tenant.
            await this.syncEntity('store_catalogue', async () => {
                await pullStoreScopedCatalogue();
            });

            // 3. Finally transactions (depends on employees, products, customers)
            await this.syncEntity('transactions', () => 
                transactionSyncService.fullSync(this.config.transactionWindowDays)
            );

            this.lastGlobalSync = new Date();
            this.clearRetry('background_sync');
            
            console.log('SyncManager: Full sync completed successfully');
            this.notifyCallbacks('sync_completed', { timestamp: this.lastGlobalSync });

        } catch (error) {
            console.error('SyncManager: Full sync failed:', error);
            this.notifyCallbacks('sync_failed', error);
            throw error;
        } finally {
            this.syncInProgress = false;
        }
    }

    // Sync individual entity with error handling
    private async syncEntity(entityName: string, syncFunction: () => Promise<void>): Promise<void> {
        try {
            console.log(`SyncManager: Syncing ${entityName}...`);
            this.notifyCallbacks('entity_sync_started', { entity: entityName });
            
            await syncFunction();
            
            console.log(`SyncManager: ${entityName} sync completed`);
            this.notifyCallbacks('entity_sync_completed', { entity: entityName });
        } catch (error) {
            console.error(`SyncManager: ${entityName} sync failed:`, error);
            this.notifyCallbacks('entity_sync_failed', { entity: entityName, error });
            // Don't throw - continue with other entities
        }
    }

    // Force sync (for manual trigger)
    async forceSync(): Promise<void> {
        console.log('SyncManager: Force sync triggered');
        this.clearRetry('background_sync'); // Clear any pending retries
        await this.fullSync();
    }

    // Get comprehensive sync status
    async getSyncStatus(): Promise<SyncManagerStatus> {
        const connectionState = connectionStatus.getStatus();
        
        // Get status from all sync services
        const [employeesStatus, productsStatus, customersStatus, transactionsStatus] = await Promise.all([
            this.getEmployeeSyncStatus(),
            this.getProductSyncStatus(),
            customerSyncService.getSyncStatus(),
            transactionSyncService.getSyncStatus()
        ]);

        const totalPendingOperations = 
            employeesStatus.pendingOperations +
            productsStatus.pendingOperations +
            customersStatus.pendingOperations +
            transactionsStatus.pendingOperations;

        return {
            isOnline: connectionState.isOnline && connectionState.isSupabaseOnline,
            globalSyncInProgress: this.syncInProgress,
            lastGlobalSync: this.lastGlobalSync,
            entities: {
                employees: employeesStatus,
                products: productsStatus,
                categories: productsStatus, // Categories are handled by productSyncService
                customers: customersStatus,
                transactions: transactionsStatus,
            },
            totalPendingOperations,
        };
    }

    // Get employee sync status (adapter for existing service)
    private async getEmployeeSyncStatus(): Promise<EntitySyncStatus> {
        try {
            // The existing employee service doesn't have a getSyncStatus method
            // So we'll create a basic status from what's available
            const connectionState = connectionStatus.getStatus();
            
            return {
                lastPulledAt: null, // Would need to be added to existing service
                lastPushedAt: null, // Would need to be added to existing service
                pendingOperations: 0, // Would need to get from local service
                isOnline: connectionState.isOnline && connectionState.isSupabaseOnline,
                syncInProgress: false, // Would need to be tracked
            };
        } catch (error) {
            return {
                lastPulledAt: null,
                lastPushedAt: null,
                pendingOperations: 0,
                isOnline: false,
                syncInProgress: false,
                error: error.message,
            };
        }
    }

    // Get product/category sync status (adapter for existing service)
    private async getProductSyncStatus(): Promise<EntitySyncStatus> {
        try {
            const connectionState = connectionStatus.getStatus();
            
            return {
                lastPulledAt: null, // Would need to be added to existing service
                lastPushedAt: null, // Would need to be added to existing service
                pendingOperations: 0, // Would need to get from local service
                isOnline: connectionState.isOnline && connectionState.isSupabaseOnline,
                syncInProgress: false, // Would need to be tracked
            };
        } catch (error) {
            return {
                lastPulledAt: null,
                lastPushedAt: null,
                pendingOperations: 0,
                isOnline: false,
                syncInProgress: false,
                error: error.message,
            };
        }
    }

    // Bootstrap all entities (for new installations)
    async bootstrap(): Promise<void> {
        console.log('SyncManager: Starting bootstrap...');

        if (!(await this.hasAuthSession())) {
            console.log('SyncManager: no auth session yet — skipping bootstrap');
            return;
        }

        try {
            // Bootstrap in dependency order
            await this.syncEntity('employees', () => employeeService.performSync());
            await this.syncEntity('categories', () => productSyncService.pullCategories());
            await this.syncEntity('products', () => productSyncService.pullProducts());
            // A fresh install must land the store's own price/stock too, or the
            // first shift runs against the tenant defaults.
            await this.syncEntity('store_catalogue', async () => {
                await pullStoreScopedCatalogue();
            });
            await this.syncEntity('customers', () => customerSyncService.fullSync());
            await this.syncEntity('transactions', () => 
                transactionSyncService.bootstrapTransactions(30) // Bootstrap last 30 days
            );

            console.log('SyncManager: Bootstrap completed');
        } catch (error) {
            console.error('SyncManager: Bootstrap failed:', error);
            throw error;
        }
    }

    // Update sync configuration
    updateConfig(newConfig: Partial<typeof this.config>): void {
        this.config = { ...this.config, ...newConfig };
        
        // Restart background sync if interval changed
        if (newConfig.syncIntervalMs !== undefined || newConfig.backgroundSyncEnabled !== undefined) {
            if (this.config.backgroundSyncEnabled) {
                this.startBackgroundSync();
            } else {
                this.stopBackgroundSync();
            }
        }
    }

    // Add event listener
    addListener(callback: SyncEventCallback): void {
        this.callbacks.push(callback);
    }

    // Remove event listener
    removeListener(callback: SyncEventCallback): void {
        const index = this.callbacks.indexOf(callback);
        if (index > -1) {
            this.callbacks.splice(index, 1);
        }
    }

    // Notify all callbacks
    private notifyCallbacks(event: SyncEvent, data?: any): void {
        this.callbacks.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('SyncManager: Error in event callback:', error);
            }
        });
    }

    // Clean up resources
    destroy(): void {
        this.stopBackgroundSync();
        
        // Clear all retry timeouts
        this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
        this.retryTimeouts.clear();
        
        // Remove connection listener
        connectionStatus.removeListener(this.handleConnectionChange.bind(this));
        
        // Clear callbacks
        this.callbacks = [];
    }
}

// Export singleton instance
export const syncManager = new SyncManager();