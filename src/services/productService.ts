import { supabase, connectionStatus } from '../lib/supabase';
import { localDb } from '../lib/localDatabase';
import { generateUUID } from '../utils/uuid';
import { readPosTrackInventoryFromStorage } from '../utils/posSettingsStorage';
import {
    ProductRow,
    CategoryRow,
    LocalProduct,
    LocalCategory,
    PendingProductOperation,
    PendingCategoryOperation,
    calculateStockStatus,
    calculateTaxAmount,
    calculatePriceWithTax
} from '../types/supabase';

/** Stable UUID for the fallback category when the local catalog has none (server-safe). */
export const DEFAULT_GENERAL_CATEGORY_ID = '00000001-0001-4001-8001-000000000001';

// =====================================================
// CATEGORY SERVICE
// =====================================================

export class CategoryService {
    // Get all categories (offline-first)
    async getAllCategories(): Promise<LocalCategory[]> {
        const categories = await localDb.categories
            .filter(cat => cat.deleted_at === null)
            .toArray();

        return categories.sort((a, b) => a.display_order - b.display_order);
    }

    // Get category by ID
    async getCategoryById(id: string): Promise<LocalCategory | undefined> {
        return await localDb.categories.get(id);
    }

    // Create new category
    async createCategory(categoryData: Omit<LocalCategory, 'id' | 'created_at' | 'updated_at' | 'needs_push' | 'is_conflicted' | 'last_synced_at'>): Promise<string> {
        const id = generateUUID();
        const category: LocalCategory = {
            ...categoryData,
            id,
            created_at: new Date(),
            updated_at: new Date(),
            needs_push: true,
            is_conflicted: false,
            last_synced_at: null,
        };

        await localDb.transaction('rw', [localDb.categories, localDb.categorySyncQueue], async () => {
            await localDb.categories.add(category);
            await this.queueCategoryOperation('CREATE', id, category);
        });

        return id;
    }

    /**
     * When there are no active (non-deleted) categories, inserts or restores "Geral" so products can be added without a manual setup step.
     */
    async ensureDefaultGeneralCategory(): Promise<void> {
        const anyActive = await localDb.categories.filter((c) => c.deleted_at === null).first();
        if (anyActive) {
            return;
        }

        const now = new Date();
        const existing = await localDb.categories.get(DEFAULT_GENERAL_CATEGORY_ID);

        if (existing) {
            const updatePayload: Partial<LocalCategory> = {
                deleted_at: null,
                is_active: true,
                updated_at: now,
                needs_push: true,
            };
            await localDb.transaction('rw', [localDb.categories, localDb.categorySyncQueue], async () => {
                await localDb.categories.update(DEFAULT_GENERAL_CATEGORY_ID, updatePayload);
                await this.queueCategoryOperation('UPDATE', DEFAULT_GENERAL_CATEGORY_ID, updatePayload);
            });
            return;
        }

        const category: LocalCategory = {
            id: DEFAULT_GENERAL_CATEGORY_ID,
            name: 'Geral',
            description: null,
            color: 'from-gray-500 to-slate-600',
            icon: 'folder',
            display_order: 0,
            is_active: true,
            created_at: now,
            updated_at: now,
            last_synced_at: null,
            deleted_at: null,
            needs_push: true,
            is_conflicted: false,
        };

        await localDb.transaction('rw', [localDb.categories, localDb.categorySyncQueue], async () => {
            // Use put (upsert) so concurrent loadData / Strict Mode races cannot throw ConstraintError on duplicate PK.
            await localDb.categories.put(category);
            await this.queueCategoryOperation('CREATE', DEFAULT_GENERAL_CATEGORY_ID, category);
        });
    }

    // Update category
    async updateCategory(id: string, updates: Partial<LocalCategory>): Promise<void> {
        const updateData = {
            ...updates,
            updated_at: new Date(),
            needs_push: true,
        };

        await localDb.transaction('rw', [localDb.categories, localDb.categorySyncQueue], async () => {
            await localDb.categories.update(id, updateData);
            await this.queueCategoryOperation('UPDATE', id, updateData);
        });
    }

    // Soft delete category
    async deleteCategory(id: string): Promise<void> {
        await localDb.transaction('rw', [localDb.categories, localDb.categorySyncQueue], async () => {
            await localDb.categories.update(id, {
                deleted_at: new Date(),
                is_active: false,
                needs_push: true,
                updated_at: new Date(),
            });
            await this.queueCategoryOperation('DELETE', id, null);
        });
    }

    // Search categories
    async searchCategories(query: string): Promise<LocalCategory[]> {
        const normalizedQuery = query.toLowerCase();
        return await localDb.categories
            .filter(cat =>
                cat.deleted_at === null &&
                (cat.name.toLowerCase().includes(normalizedQuery) ||
                    (!!cat.description && cat.description.toLowerCase().includes(normalizedQuery)))
            )
            .toArray();
    }

    // Queue sync operation for categories
    private async queueCategoryOperation(
        type: 'CREATE' | 'UPDATE' | 'DELETE',
        categoryId: string,
        data: any
    ): Promise<void> {
        const operation: PendingCategoryOperation = {
            id: generateUUID(),
            type,
            categoryId,
            data,
            timestamp: new Date().toISOString(),
            retryCount: 0,
        };

        await localDb.categorySyncQueue.add(operation);
    }

    // Bulk insert categories from server
    async bulkInsertCategoriesFromServer(categories: CategoryRow[]): Promise<void> {
        await localDb.transaction('rw', [localDb.categories], async () => {
            for (const category of categories) {
                const localCategory: LocalCategory = {
                    ...category,
                    created_at: new Date(category.created_at),
                    updated_at: new Date(category.updated_at),
                    last_synced_at: category.last_synced_at ? new Date(category.last_synced_at) : null,
                    deleted_at: category.deleted_at ? new Date(category.deleted_at) : null,
                    needs_push: false,
                    is_conflicted: false,
                };

                await localDb.categories.put(localCategory);
            }
        });
    }
}

// =====================================================
// PRODUCT SERVICE
// =====================================================

export class ProductService {
    // Get all products (offline-first)
    async getAllProducts(): Promise<LocalProduct[]> {
        const products = await localDb.products
            .filter(prod => prod.deleted_at === null)
            .toArray();

        return products.sort((a, b) => a.display_order - b.display_order);
    }

    // Get product by ID
    async getProductById(id: string): Promise<LocalProduct | undefined> {
        return await localDb.products.get(id);
    }

    // Get product by SKU
    async getProductBySku(sku: string): Promise<LocalProduct | undefined> {
        return await localDb.products
            .filter(prod => prod.sku === sku && prod.deleted_at === null)
            .first();
    }

    // Get products by category
    async getProductsByCategory(categoryId: string): Promise<LocalProduct[]> {
        const products = await localDb.products
            .filter(prod => prod.category_id === categoryId && prod.deleted_at === null)
            .toArray();

        return products.sort((a, b) => a.display_order - b.display_order);
    }

    // Get active products only
    async getActiveProducts(): Promise<LocalProduct[]> {
        const products = await localDb.products
            .filter(prod => prod.is_active && prod.deleted_at === null)
            .toArray();

        return products.sort((a, b) => a.display_order - b.display_order);
    }

    // Get products with low stock
    async getLowStockProducts(): Promise<LocalProduct[]> {
        const products = await localDb.products
            .filter(prod =>
                prod.deleted_at === null &&
                prod.is_active &&
                readPosTrackInventoryFromStorage() &&
                prod.track_stock &&
                prod.stock <= prod.min_stock
            )
            .toArray();

        return products.sort((a, b) => a.stock - b.stock);
    }

    // Create new product
    async createProduct(productData: Omit<LocalProduct, 'id' | 'created_at' | 'updated_at' | 'needs_push' | 'is_conflicted' | 'last_synced_at'>): Promise<string> {
        console.log('ProductService: Creating new product with data:', productData);

        // Populate category_name from category_id if available
        let categoryName = productData.category_name;
        if (!categoryName && productData.category_id) {
            try {
                console.log('ProductService: Attempting to get category for ID:', productData.category_id);
                // Get category directly from database
                const category = await localDb.categories.get(productData.category_id);
                if (category) {
                    categoryName = category.name;
                    console.log('ProductService: Populated category_name from category_id:', categoryName, 'for category:', category);
                } else {
                    console.warn('ProductService: No category found for ID:', productData.category_id);

                    // If category_id exists but category not found, try to get all categories and find it
                    try {
                        const allCategories = await localDb.categories.filter((cat: any) => cat.deleted_at === null).toArray();
                        const foundCategory = allCategories.find((cat: any) => cat.id === productData.category_id);
                        if (foundCategory) {
                            categoryName = foundCategory.name;
                            console.log('ProductService: Found category using all categories:', categoryName);
                        } else {
                            console.error('ProductService: Category not found even in all categories. category_id:', productData.category_id);
                        }
                    } catch (allCatsError) {
                        console.error('ProductService: Error getting all categories:', allCatsError);
                    }
                }
            } catch (error) {
                console.warn('ProductService: Could not populate category_name:', error);
            }
        } else if (productData.category_id) {
            console.log('ProductService: Category name already exists or no category_id provided');
        }

        const id = generateUUID();
        const product: LocalProduct = {
            ...productData,
            category_name: categoryName,
            id,
            created_at: new Date(),
            updated_at: new Date(),
            needs_push: true,
            is_conflicted: false,
            last_synced_at: null,
        };

        console.log('ProductService: Created product object with category_name:', categoryName, 'and category_id:', productData.category_id);
        console.log('ProductService: Final product object:', product);

        await localDb.transaction('rw', [localDb.products, localDb.productSyncQueue], async () => {
            await localDb.products.add(product);
            console.log('ProductService: Product added to local database');
            await this.queueProductOperation('CREATE', id, product);
            console.log('ProductService: Product queued for sync');
        });

        console.log('ProductService: Product creation completed, returning ID:', id);
        return id;
    }

    // Update product
    async updateProduct(id: string, updates: Partial<LocalProduct>): Promise<void> {
        const updateData = {
            ...updates,
            updated_at: new Date(),
            needs_push: true,
        };

        await localDb.transaction('rw', [localDb.products, localDb.productSyncQueue], async () => {
            await localDb.products.update(id, updateData);
            await this.queueProductOperation('UPDATE', id, updateData);
        });
    }

    // Update product stock (for POS transactions)
    async updateProductStock(id: string, quantityChange: number): Promise<void> {
        const product = await this.getProductById(id);
        if (!product || !readPosTrackInventoryFromStorage() || !product.track_stock) return;

        const newStock = Math.max(0, product.stock + quantityChange);
        await this.updateProduct(id, { stock: newStock });
    }

    // Soft delete product
    async deleteProduct(id: string): Promise<void> {
        await localDb.transaction('rw', [localDb.products, localDb.productSyncQueue], async () => {
            await localDb.products.update(id, {
                deleted_at: new Date(),
                is_active: false,
                needs_push: true,
                updated_at: new Date(),
            });
            await this.queueProductOperation('DELETE', id, null);
        });
    }

    // Search products
    async searchProducts(query: string): Promise<LocalProduct[]> {
        const normalizedQuery = query.toLowerCase();
        return await localDb.products
            .filter(prod =>
                prod.deleted_at === null &&
                (prod.name.toLowerCase().includes(normalizedQuery) ||
                    prod.sku.toLowerCase().includes(normalizedQuery) ||
                    (!!prod.barcode && prod.barcode.toLowerCase().includes(normalizedQuery)) ||
                    (!!prod.description && prod.description.toLowerCase().includes(normalizedQuery)))
            )
            .toArray();
    }

    // Filter products
    async filterProducts(filters: {
        categoryId?: string;
        isActive?: boolean;
        stockStatus?: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
        priceMin?: number;
        priceMax?: number;
        supplier?: string;
    }): Promise<LocalProduct[]> {
        let collection = localDb.products.filter(prod => prod.deleted_at === null);

        if (filters.categoryId && filters.categoryId !== 'all') {
            collection = collection.filter(prod => prod.category_id === filters.categoryId);
        }

        if (filters.isActive !== undefined) {
            collection = collection.filter(prod => prod.is_active === filters.isActive);
        }

        if (filters.stockStatus && filters.stockStatus !== 'all') {
            collection = collection.filter(prod => {
                const status = calculateStockStatus(prod);
                return status === filters.stockStatus;
            });
        }

        if (filters.priceMin !== undefined) {
            collection = collection.filter(prod => prod.price >= filters.priceMin!);
        }

        if (filters.priceMax !== undefined) {
            collection = collection.filter(prod => prod.price <= filters.priceMax!);
        }

        if (filters.supplier) {
            collection = collection.filter(prod =>
                !!prod.supplier && prod.supplier.toLowerCase().includes(filters.supplier!.toLowerCase())
            );
        }

        const products = await collection.toArray();
        return products.sort((a, b) => a.display_order - b.display_order);
    }

    // Queue sync operation for products
    private async queueProductOperation(
        type: 'CREATE' | 'UPDATE' | 'DELETE',
        productId: string,
        data: any
    ): Promise<void> {
        const operation: PendingProductOperation = {
            id: generateUUID(),
            type,
            productId,
            data,
            timestamp: new Date().toISOString(),
            retryCount: 0,
        };

        await localDb.productSyncQueue.add(operation);
    }

    // Bulk insert products from server
    async bulkInsertProductsFromServer(products: ProductRow[]): Promise<void> {
        await localDb.transaction('rw', [localDb.products], async () => {
            for (const product of products) {
                const localProduct: LocalProduct = {
                    ...product,
                    created_at: new Date(product.created_at),
                    updated_at: new Date(product.updated_at),
                    last_synced_at: product.last_synced_at ? new Date(product.last_synced_at) : null,
                    deleted_at: product.deleted_at ? new Date(product.deleted_at) : null,
                    needs_push: false,
                    is_conflicted: false,
                };

                await localDb.products.put(localProduct);
            }
        });
    }

    // Get enhanced product with calculated fields
    async getEnhancedProduct(id: string): Promise<(LocalProduct & {
        stock_status: 'in_stock' | 'low_stock' | 'out_of_stock';
        tax_amount: number;
        price_with_tax: number;
    }) | undefined> {
        const product = await this.getProductById(id);
        if (!product) return undefined;

        return {
            ...product,
            stock_status: calculateStockStatus(product),
            tax_amount: calculateTaxAmount(product.price, product.iva_rate),
            price_with_tax: calculatePriceWithTax(product.price, product.iva_rate),
        };
    }
}

// =====================================================
// SYNC SERVICE
// =====================================================

export class ProductSyncService {
    private categoryService = new CategoryService();
    private productService = new ProductService();

    // Check if online
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

    // Pull categories from server
    async pullCategories(lastSyncTimestamp?: string): Promise<void> {
        if (!(await this.isOnline())) return;

        try {
            const { data, error } = await supabase.rpc('get_categories_delta', {
                last_sync_timestamp: lastSyncTimestamp || '1970-01-01T00:00:00Z'
            });

            if (error) throw error;

            if (data && data.length > 0) {
                await this.categoryService.bulkInsertCategoriesFromServer(data);
                await this.updateSyncMetadata('categories', 'lastPulledAt', new Date().toISOString());
            }
        } catch (error) {
            console.error('Failed to pull categories:', error);
            throw error;
        }
    }

    // Pull products from server
    async pullProducts(lastSyncTimestamp?: string): Promise<void> {
        if (!(await this.isOnline())) return;

        try {
            const { data, error } = await supabase.rpc('get_products_delta', {
                last_sync_timestamp: lastSyncTimestamp || '1970-01-01T00:00:00Z'
            });

            if (error) throw error;

            if (data && data.length > 0) {
                await this.productService.bulkInsertProductsFromServer(data);
                await this.updateSyncMetadata('products', 'lastPulledAt', new Date().toISOString());
            }
        } catch (error) {
            console.error('Failed to pull products:', error);
            throw error;
        }
    }

    // Push categories to server
    async pushCategories(): Promise<void> {
        if (!(await this.isOnline())) return;

        const pendingCategories = await localDb.categories
            .filter(cat => cat.needs_push === true)
            .toArray();

        if (pendingCategories.length === 0) return;

        try {
            // Convert to server format
            const serverCategories = pendingCategories.map(cat => ({
                ...cat,
                created_at: cat.created_at.toISOString(),
                updated_at: cat.updated_at.toISOString(),
                last_synced_at: cat.last_synced_at?.toISOString() || null,
                deleted_at: cat.deleted_at?.toISOString() || null,
            }));

            const { error } = await supabase.rpc('upsert_categories', {
                categories_data: serverCategories
            });

            if (error) throw error;

            // Mark as synced
            const categoryIds = pendingCategories.map(cat => cat.id);
            await this.markCategoriesSynced(categoryIds);
            await this.updateSyncMetadata('categories', 'lastPushedAt', new Date().toISOString());
        } catch (error) {
            console.error('Failed to push categories:', error);
            throw error;
        }
    }

    // Push products to server
    async pushProducts(): Promise<void> {
        if (!(await this.isOnline())) return;

        const pendingProducts = await localDb.products
            .filter(prod => prod.needs_push === true)
            .toArray();

        if (pendingProducts.length === 0) return;

        try {
            // Convert to server format
            const serverProducts = pendingProducts.map(prod => ({
                ...prod,
                created_at: prod.created_at.toISOString(),
                updated_at: prod.updated_at.toISOString(),
                last_synced_at: prod.last_synced_at?.toISOString() || null,
                deleted_at: prod.deleted_at?.toISOString() || null,
            }));

            const { error } = await supabase.rpc('upsert_products', {
                products_data: serverProducts
            });

            if (error) throw error;

            // Mark as synced
            const productIds = pendingProducts.map(prod => prod.id);
            await this.markProductsSynced(productIds);
            await this.updateSyncMetadata('products', 'lastPushedAt', new Date().toISOString());
        } catch (error) {
            console.error('Failed to push products:', error);
            throw error;
        }
    }

    // Full sync (pull then push)
    async fullSync(): Promise<void> {
        try {
            // Get last sync timestamps
            const categorySyncMeta = await localDb.syncMetadata.get('categories');
            const productSyncMeta = await localDb.syncMetadata.get('products');

            // Pull latest data from server
            await this.pullCategories(categorySyncMeta?.lastPulledAt || undefined);
            await this.pullProducts(productSyncMeta?.lastPulledAt || undefined);

            // Push local changes to server
            await this.pushCategories();
            await this.pushProducts();

            console.log('Product and category sync completed successfully');
        } catch (error) {
            console.error('Sync failed:', error);
            throw error;
        }
    }

    // Mark categories as synced
    private async markCategoriesSynced(categoryIds: string[]): Promise<void> {
        const now = new Date();
        await localDb.transaction('rw', [localDb.categories], async () => {
            for (const id of categoryIds) {
                await localDb.categories.update(id, {
                    needs_push: false,
                    last_synced_at: now,
                });
            }
        });
    }

    // Mark products as synced
    private async markProductsSynced(productIds: string[]): Promise<void> {
        const now = new Date();
        await localDb.transaction('rw', [localDb.products], async () => {
            for (const id of productIds) {
                await localDb.products.update(id, {
                    needs_push: false,
                    last_synced_at: now,
                });
            }
        });
    }

    // Update sync metadata
    private async updateSyncMetadata(
        entity: 'categories' | 'products',
        field: 'lastPulledAt' | 'lastPushedAt',
        value: string
    ): Promise<void> {
        const current = await localDb.syncMetadata.get(entity);
        if (current) {
            await localDb.syncMetadata.put({
                ...current,
                [field]: value,
            });
        } else {
            await localDb.syncMetadata.put({
                id: entity,
                lastPulledAt: field === 'lastPulledAt' ? value : null,
                lastPushedAt: field === 'lastPushedAt' ? value : null,
                pendingOperations: 0,
                conflictCount: 0,
            });
        }
    }
}

// Export service instances
export const categoryService = new CategoryService();
export const productService = new ProductService();
export const productSyncService = new ProductSyncService(); 