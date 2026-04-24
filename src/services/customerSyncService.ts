import { supabase, isSupabaseConfigured, connectionStatus } from '../lib/supabase';
import { customerLocalService } from '../lib/localDatabase';
import {
    CustomerRow,
    CustomerInsert,
    CustomerUpdate,
    LocalCustomer,
    PendingCustomerOperation,
    SyncMetadata
} from '../types/supabase';

// Service class that manages customer synchronization with server
export class CustomerSyncService {
    private syncInProgress = false;

    // Check if online (use centralized connection status)
    private async isOnline(): Promise<boolean> {
        try {
            const status = connectionStatus.getStatus();
            if (!status.isOnline) return false;
            if (status.isSupabaseOnline) return true;
            const { checkSupabaseConnection } = await import('../lib/supabase');
            return await checkSupabaseConnection();
        } catch {
            return false;
        }
    }

    // Pull customers from server using delta sync
    async pullCustomers(lastSyncTimestamp?: string): Promise<void> {
        if (!(await this.isOnline())) {
            console.log('CustomerSync: Offline, skipping pull');
            return;
        }

        try {
            console.log('CustomerSync: Pulling customers from server...');
            
            // Call the delta function to get customers changed since last sync
            const { data: customers, error } = await supabase.rpc('get_customers_delta', {
                since_timestamp: lastSyncTimestamp || null
            });

            if (error) {
                console.error('CustomerSync: Error pulling customers:', error);
                throw error;
            }

            if (!customers || customers.length === 0) {
                console.log('CustomerSync: No customers to pull');
                await this.updateSyncMetadata('lastPulledAt', new Date().toISOString());
                return;
            }

            console.log(`CustomerSync: Pulled ${customers.length} customers`);

            // Bulk insert/update local customers
            await customerLocalService.bulkInsertFromServer(customers);

            // Update sync metadata
            await this.updateSyncMetadata('lastPulledAt', new Date().toISOString());

            console.log('CustomerSync: Pull completed successfully');
        } catch (error) {
            console.error('CustomerSync: Pull failed:', error);
            throw error;
        }
    }

    // Push local customer changes to server
    async pushCustomers(): Promise<void> {
        if (!(await this.isOnline())) {
            console.log('CustomerSync: Offline, skipping push');
            return;
        }

        if (this.syncInProgress) {
            console.log('CustomerSync: Push already in progress, skipping');
            return;
        }

        this.syncInProgress = true;

        try {
            console.log('CustomerSync: Pushing local customers to server...');

            // Get customers that need to be pushed
            const customersToSync = await customerLocalService.getCustomersNeedingPush();

            if (customersToSync.length === 0) {
                console.log('CustomerSync: No customers to push');
                await this.updateSyncMetadata('lastPushedAt', new Date().toISOString());
                return;
            }

            console.log(`CustomerSync: Pushing ${customersToSync.length} customers`);

            // Convert LocalCustomer to server format
            const customersData = customersToSync.map(customer => ({
                id: customer.id,
                name: customer.name,
                tax_number: customer.tax_number,
                country: customer.country ?? 'PT',
                email: customer.email,
                phone: customer.phone,
                address: customer.address,
                city: customer.city ?? null,
                postal_code: customer.postal_code ?? null,
                total_spent: customer.total_spent,
                transaction_count: customer.transaction_count,
                loyalty_points: customer.loyalty_points,
                is_active: customer.is_active,
                preferred_payment_method: customer.preferred_payment_method,
                created_at: customer.created_at.toISOString(),
                updated_at: customer.updated_at.toISOString(),
                deleted_at: customer.deleted_at?.toISOString() || null
            }));

            // Use upsert RPC to handle conflicts
            const { data: results, error } = await supabase.rpc('upsert_customers', {
                customers_data: customersData
            });

            if (error) {
                console.error('CustomerSync: Error pushing customers:', error);
                throw error;
            }

            console.log('CustomerSync: Push results:', results);

            // Mark successfully synced customers
            const syncedCustomerIds = customersToSync
                .filter((_, index) => results && results[index]?.success)
                .map(customer => customer.id);

            if (syncedCustomerIds.length > 0) {
                await customerLocalService.markCustomersSynced(syncedCustomerIds);
            }

            // Handle any failed syncs
            const failedSyncs = customersToSync
                .filter((_, index) => results && !results[index]?.success)
                .map((customer, index) => ({ customer, error: results?.[index]?.error }));

            if (failedSyncs.length > 0) {
                console.warn('CustomerSync: Some customers failed to sync:', failedSyncs);
                // Could implement retry logic here
            }

            // Process pending operations queue
            await this.processPendingOperations();

            // Update sync metadata
            await this.updateSyncMetadata('lastPushedAt', new Date().toISOString());

            console.log('CustomerSync: Push completed successfully');
        } catch (error) {
            console.error('CustomerSync: Push failed:', error);
            throw error;
        } finally {
            this.syncInProgress = false;
        }
    }

    // Process pending sync operations from the queue
    private async processPendingOperations(): Promise<void> {
        const pendingOps = await customerLocalService.getPendingSyncOperations();
        
        for (const operation of pendingOps) {
            try {
                switch (operation.type) {
                    case 'CREATE':
                    case 'UPDATE':
                        // These are handled by the main push logic above
                        await customerLocalService.clearSyncOperation(operation.id);
                        break;
                    case 'DELETE':
                        // For deletes, we just need to mark as synced since soft delete was already pushed
                        await customerLocalService.clearSyncOperation(operation.id);
                        break;
                }
            } catch (error) {
                console.error(`CustomerSync: Failed to process operation ${operation.id}:`, error);
                await customerLocalService.markSyncOperationFailed(operation.id, error.message);
            }
        }
    }

    // Full bi-directional sync
    async fullSync(): Promise<void> {
        try {
            // Get last sync timestamps
            const syncMeta = await customerLocalService.getSyncMetadata();

            // Pull latest data from server
            await this.pullCustomers(syncMeta?.lastPulledAt || undefined);

            // Push local changes to server
            await this.pushCustomers();

            console.log('CustomerSync: Full sync completed successfully');
        } catch (error) {
            console.error('CustomerSync: Full sync failed:', error);
            throw error;
        }
    }

    // Update sync metadata helper
    private async updateSyncMetadata(field: 'lastPulledAt' | 'lastPushedAt', value: string): Promise<void> {
        try {
            await customerLocalService.updateSyncMetadata({ [field]: value });
        } catch (error) {
            console.warn('CustomerSync: Failed to update sync metadata:', error);
        }
    }

    // Get sync status
    async getSyncStatus(): Promise<{
        lastPulledAt: Date | null;
        lastPushedAt: Date | null;
        pendingOperations: number;
        isOnline: boolean;
        syncInProgress: boolean;
    }> {
        const syncMeta = await customerLocalService.getSyncMetadata();
        const isOnline = await this.isOnline();

        return {
            lastPulledAt: syncMeta?.lastPulledAt ? new Date(syncMeta.lastPulledAt) : null,
            lastPushedAt: syncMeta?.lastPushedAt ? new Date(syncMeta.lastPushedAt) : null,
            pendingOperations: syncMeta?.pendingOperations || 0,
            isOnline,
            syncInProgress: this.syncInProgress,
        };
    }

    // Force sync (for manual trigger)
    async forceSync(): Promise<void> {
        console.log('CustomerSync: Force sync triggered');
        await this.fullSync();
    }
}

// Export singleton service instance
export const customerSyncService = new CustomerSyncService();