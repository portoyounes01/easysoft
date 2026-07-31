import { supabase, isSupabaseConfigured, connectionStatus } from '../lib/supabase';
import { transactionLocalService } from '../lib/localDatabase';
import {
    isPgrstMissingTransactionsColumnError,
    stripOptionalFiscalTransactionFields,
} from '../utils/transactionFiscalServerColumns';
import {
    TransactionRow,
    TransactionItemRow,
    TransactionInsert,
    TransactionItemInsert,
    LocalTransaction,
    LocalTransactionItem,
    PendingTransactionOperation,
    SyncMetadata
} from '../types/supabase';

// Service class that manages transaction synchronization with server
export class TransactionSyncService {
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

    // Pull transactions from server using delta sync (with window limit for storage management)
    async pullTransactions(lastSyncTimestamp?: string, windowDays: number = 90): Promise<void> {
        if (!(await this.isOnline())) {
            console.log('TransactionSync: Offline, skipping pull');
            return;
        }

        try {
            console.log('TransactionSync: Pulling transactions from server...');
            
            // Calculate window cutoff date
            const windowCutoff = new Date();
            windowCutoff.setDate(windowCutoff.getDate() - windowDays);
            const windowCutoffString = windowCutoff.toISOString();

            // Use the more recent of lastSyncTimestamp or windowCutoff to limit data
            const effectiveTimestamp = lastSyncTimestamp && lastSyncTimestamp > windowCutoffString 
                ? lastSyncTimestamp 
                : windowCutoffString;

            // Call the delta functions to get transactions and items changed since last sync
            const [transactionsResult, itemsResult] = await Promise.all([
                supabase.rpc('get_transactions_delta', {
                    last_sync_timestamp: effectiveTimestamp
                }),
                supabase.rpc('get_transaction_items_delta', {
                    last_sync_timestamp: effectiveTimestamp
                })
            ]);

            if (transactionsResult.error) {
                console.error('TransactionSync: Error pulling transactions:', transactionsResult.error);
                throw transactionsResult.error;
            }

            if (itemsResult.error) {
                console.error('TransactionSync: Error pulling transaction items:', itemsResult.error);
                throw itemsResult.error;
            }

            const transactions = transactionsResult.data || [];
            const transactionItems = itemsResult.data || [];

            if (transactions.length === 0 && transactionItems.length === 0) {
                console.log('TransactionSync: No transactions to pull');
                await this.updateSyncMetadata('lastPulledAt', new Date().toISOString());
                return;
            }

            console.log(`TransactionSync: Pulled ${transactions.length} transactions and ${transactionItems.length} items`);

            // Bulk insert/update local transactions and items
            await transactionLocalService.bulkInsertFromServer(transactions, transactionItems);

            // Clean up old transactions outside the window to manage storage
            await this.pruneOldTransactions(windowDays);

            // Update sync metadata
            await this.updateSyncMetadata('lastPulledAt', new Date().toISOString());

            console.log('TransactionSync: Pull completed successfully');
        } catch (error) {
            console.error('TransactionSync: Pull failed:', error);
            throw error;
        }
    }

    // Push local transaction changes to server
    async pushTransactions(): Promise<void> {
        if (!(await this.isOnline())) {
            console.log('TransactionSync: Offline, skipping push');
            return;
        }

        if (this.syncInProgress) {
            console.log('TransactionSync: Push already in progress, skipping');
            return;
        }

        this.syncInProgress = true;

        try {
            console.log('TransactionSync: Pushing local transactions to server...');

            // Get transactions that need to be pushed
            const transactionsToSync = await transactionLocalService.getTransactionsNeedingPush();
            const itemsToSync = await transactionLocalService.getTransactionItemsNeedingPush();

            if (transactionsToSync.length === 0 && itemsToSync.length === 0) {
                console.log('TransactionSync: No transactions to push');
                await this.updateSyncMetadata('lastPushedAt', new Date().toISOString());
                return;
            }

            console.log(`TransactionSync: Pushing ${transactionsToSync.length} transactions and ${itemsToSync.length} items`);

            // Process transactions with their items together
            const results = [];

            for (const transaction of transactionsToSync) {
                try {
                    // Get items for this transaction
                    const transactionItems = itemsToSync.filter(item => item.transaction_id === transaction.id);

                    // Convert LocalTransaction to server format
                    let fiscalMeta: unknown = null;
                    if (transaction.fiscal_metadata_json != null) {
                        try {
                            fiscalMeta =
                                typeof transaction.fiscal_metadata_json === 'string'
                                    ? JSON.parse(transaction.fiscal_metadata_json)
                                    : transaction.fiscal_metadata_json;
                        } catch {
                            fiscalMeta = null;
                        }
                    }

                    const transactionData = {
                        id: transaction.id,
                        transaction_number: transaction.transaction_number,
                        employee_id: transaction.employee_id,
                        employee_name: transaction.employee_name,
                        customer_id: transaction.customer_id,
                        customer_name: transaction.customer_name,
                        transaction_date: transaction.transaction_date,
                        transaction_time: transaction.transaction_time,
                        subtotal: transaction.subtotal,
                        discount: transaction.discount,
                        tax: transaction.tax,
                        total: transaction.total,
                        payment_method: transaction.payment_method,
                        amount_paid: transaction.amount_paid,
                        change_given: transaction.change_given,
                        status: transaction.status,
                        notes: transaction.notes,
                        receipt_number: transaction.receipt_number,
                        fiscal_document_id: transaction.fiscal_document_id ?? null,
                        fiscal_metadata_json: fiscalMeta ?? null,
                        fiscal_cancelled_at: transaction.fiscal_cancelled_at ?? null,
                        fiscal_cancelled_reason: transaction.fiscal_cancelled_reason ?? null,
                        fiscal_cancelled_by_employee_id: transaction.fiscal_cancelled_by_employee_id ?? null,
                        created_at: transaction.created_at.toISOString(),
                        updated_at: transaction.updated_at.toISOString(),
                        deleted_at: transaction.deleted_at?.toISOString() || null
                    };

                    // Convert items to server format
                    const itemsData = transactionItems.map(item => ({
                        id: item.id,
                        transaction_id: item.transaction_id,
                        product_id: item.product_id,
                        product_name: item.product_name,
                        product_sku: item.product_sku,
                        category_id: item.category_id,
                        category_name: item.category_name,
                        quantity: item.quantity,
                        unit: item.unit ?? 'un',
                        unit_price: item.unit_price,
                        unit_cost: item.unit_cost,
                        iva_rate: item.iva_rate,
                        line_total: item.line_total,
                        tax_amount: item.tax_amount,
                        profit_amount: item.profit_amount,
                        discount_amount: item.discount_amount,
                        discount_percentage: item.discount_percentage,
                        created_at: item.created_at.toISOString(),
                        updated_at: item.updated_at.toISOString(),
                        deleted_at: item.deleted_at?.toISOString() || null
                    }));

                    // Use upsert RPC to handle conflicts (assuming we'll create this RPC)
                    const { data: result, error } = await supabase.rpc('upsert_transaction_with_items', {
                        transaction_data: transactionData,
                        items_data: itemsData
                    });

                    if (error) {
                        // Fallback if RPC missing (PGRST202 / 404): perform direct upserts
                        if ((error as any).code === 'PGRST202' || (error as any).message?.includes('schema cache')) {
                            try {
                                // Upsert transaction header first
                                const td = transactionData as Record<string, unknown>;
                                let { error: upsertTxnErr } = await supabase
                                    .from('transactions')
                                    .upsert([td], { onConflict: 'id' });
                                if (
                                    upsertTxnErr &&
                                    isPgrstMissingTransactionsColumnError(upsertTxnErr)
                                ) {
                                    const retry = await supabase
                                        .from('transactions')
                                        .upsert([stripOptionalFiscalTransactionFields(td)], {
                                            onConflict: 'id',
                                        });
                                    upsertTxnErr = retry.error;
                                }
                                if (upsertTxnErr) throw upsertTxnErr;

                                // Only replace items if we actually have items to push
                                if (itemsData.length > 0) {
                                    const { error: delErr } = await supabase
                                        .from('transaction_items')
                                        .delete()
                                        .eq('transaction_id', transaction.id);
                                    if (delErr) throw delErr;

                                    const { error: upsertItemsErr } = await supabase
                                        .from('transaction_items')
                                        .upsert(itemsData, { onConflict: 'id' });
                                    if (upsertItemsErr) throw upsertItemsErr;
                                }

                                console.log(`TransactionSync: Fallback upsert succeeded for ${transaction.id}`);
                                results.push({ transactionId: transaction.id, success: true, result: null });
                            } catch (fallbackErr: any) {
                                console.error(`TransactionSync: Fallback failed for ${transaction.id}:`, fallbackErr);
                                results.push({ transactionId: transaction.id, success: false, error: fallbackErr.message || String(fallbackErr) });
                            }
                        } else {
                            console.error(`TransactionSync: Error pushing transaction ${transaction.id}:`, error);
                            results.push({ transactionId: transaction.id, success: false, error: error.message });
                        }
                    } else {
                        // HTTP 200 is NOT success: the RPC catches per-row errors and returns
                        // [{transaction_id, success, error}] with success=false (e.g. the credit-note
                        // 'transaction_id is ambiguous' failure). Trusting the transport marked failed
                        // rows as synced -> the row was never retried: SILENT FISCAL DATA LOSS.
                        const row = Array.isArray(result)
                            ? (result[0] as { success?: boolean; error?: string | null } | undefined)
                            : null;
                        const rowOk = row ? row.success === true : true; // older fn shapes return no row set
                        if (rowOk) {
                            console.log(`TransactionSync: Successfully pushed transaction ${transaction.id}`);
                            results.push({ transactionId: transaction.id, success: true, result });
                        } else {
                            console.error(`TransactionSync: Server rejected transaction ${transaction.id}:`, row?.error);
                            results.push({ transactionId: transaction.id, success: false, error: row?.error ?? 'server_rejected' });
                        }
                    }
                } catch (error) {
                    console.error(`TransactionSync: Error processing transaction ${transaction.id}:`, error);
                    results.push({ transactionId: transaction.id, success: false, error: error.message });
                }
            }

            // Mark successfully synced transactions and items
            const syncedTransactionIds = results
                .filter(result => result.success)
                .map(result => result.transactionId);

            if (syncedTransactionIds.length > 0) {
                await transactionLocalService.markTransactionsSynced(syncedTransactionIds);
                
                // Mark items as synced too
                const syncedItemIds = itemsToSync
                    .filter(item => syncedTransactionIds.includes(item.transaction_id))
                    .map(item => item.id);
                
                if (syncedItemIds.length > 0) {
                    await transactionLocalService.markTransactionItemsSynced(syncedItemIds);
                }
            }

            // Handle any failed syncs
            const failedSyncs = results.filter(result => !result.success);
            if (failedSyncs.length > 0) {
                console.warn('TransactionSync: Some transactions failed to sync:', failedSyncs);
                // Could implement retry logic here
            }

            // Process pending operations queue
            await this.processPendingOperations();

            // Update sync metadata
            await this.updateSyncMetadata('lastPushedAt', new Date().toISOString());

            console.log('TransactionSync: Push completed successfully');
        } catch (error) {
            console.error('TransactionSync: Push failed:', error);
            throw error;
        } finally {
            this.syncInProgress = false;
        }
    }

    // Process pending sync operations from the queue
    private async processPendingOperations(): Promise<void> {
        const pendingOps = await transactionLocalService.getPendingSyncOperations();
        
        for (const operation of pendingOps) {
            try {
                switch (operation.type) {
                    case 'CREATE':
                    case 'UPDATE':
                        // These are handled by the main push logic above
                        await transactionLocalService.clearSyncOperation(operation.id);
                        break;
                    case 'DELETE':
                        // For deletes, we just need to mark as synced since soft delete was already pushed
                        await transactionLocalService.clearSyncOperation(operation.id);
                        break;
                }
            } catch (error) {
                console.error(`TransactionSync: Failed to process operation ${operation.id}:`, error);
                await transactionLocalService.markSyncOperationFailed(operation.id, error.message);
            }
        }
    }

    // Prune old transactions to manage local storage
    private async pruneOldTransactions(windowDays: number): Promise<void> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - windowDays);
            const cutoffDateString = cutoffDate.toISOString().split('T')[0];

            // Delete transactions and items older than the window that have been synced
            const oldTransactions = await transactionLocalService.getAllTransactions();
            const transactionsToPrune = oldTransactions.filter(t => 
                t.transaction_date < cutoffDateString && 
                !t.needs_push && 
                t.last_synced_at &&
                !t.fiscal_document_id
            );

            if (transactionsToPrune.length > 0) {
                console.log(`TransactionSync: Pruning ${transactionsToPrune.length} old transactions`);
                
                // Actually delete (not soft delete) old synced transactions to free space
                for (const transaction of transactionsToPrune) {
                    await transactionLocalService.deleteTransaction(transaction.id);
                }
            }
        } catch (error) {
            console.warn('TransactionSync: Failed to prune old transactions:', error);
        }
    }

    // Full bi-directional sync with window management
    async fullSync(windowDays: number = 90): Promise<void> {
        try {
            // Get last sync timestamps
            const syncMeta = await transactionLocalService.getSyncMetadata();

            // Pull latest data from server (within window)
            await this.pullTransactions(syncMeta?.lastPulledAt || undefined, windowDays);

            // Push local changes to server
            await this.pushTransactions();

            console.log('TransactionSync: Full sync completed successfully');
        } catch (error) {
            console.error('TransactionSync: Full sync failed:', error);
            throw error;
        }
    }

    // Update sync metadata helper
    private async updateSyncMetadata(field: 'lastPulledAt' | 'lastPushedAt', value: string): Promise<void> {
        try {
            await transactionLocalService.updateSyncMetadata({ [field]: value });
        } catch (error) {
            console.warn('TransactionSync: Failed to update sync metadata:', error);
        }
    }

    // Get sync status
    async getSyncStatus(): Promise<{
        lastPulledAt: Date | null;
        lastPushedAt: Date | null;
        pendingOperations: number;
        isOnline: boolean;
        syncInProgress: boolean;
        stats: Awaited<ReturnType<typeof transactionLocalService.getStats>>;
    }> {
        const [syncMeta, isOnline, stats] = await Promise.all([
            transactionLocalService.getSyncMetadata(),
            this.isOnline(),
            transactionLocalService.getStats()
        ]);

        return {
            lastPulledAt: syncMeta?.lastPulledAt ? new Date(syncMeta.lastPulledAt) : null,
            lastPushedAt: syncMeta?.lastPushedAt ? new Date(syncMeta.lastPushedAt) : null,
            pendingOperations: syncMeta?.pendingOperations || 0,
            isOnline,
            syncInProgress: this.syncInProgress,
            stats,
        };
    }

    // Force sync (for manual trigger)
    async forceSync(windowDays: number = 90): Promise<void> {
        console.log('TransactionSync: Force sync triggered');
        await this.fullSync(windowDays);
    }

    // Bootstrap initial transaction data (for new installations)
    async bootstrapTransactions(days: number = 30): Promise<void> {
        if (!(await this.isOnline())) {
            console.log('TransactionSync: Offline, cannot bootstrap');
            return;
        }

        try {
            console.log(`TransactionSync: Bootstrapping last ${days} days of transactions...`);
            
            // Clear existing sync metadata to force full pull
            await transactionLocalService.updateSyncMetadata({ 
                lastPulledAt: null, 
                lastPushedAt: null 
            });

            // Pull transactions from the bootstrap window
            await this.pullTransactions(undefined, days);

            console.log('TransactionSync: Bootstrap completed');
        } catch (error) {
            console.error('TransactionSync: Bootstrap failed:', error);
            throw error;
        }
    }
}

// Export singleton service instance
export const transactionSyncService = new TransactionSyncService();