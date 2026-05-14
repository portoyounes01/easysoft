import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    LocalProduct,
    LocalCategory,
    ProductFormData,
    CategoryFormData,
    ProductFilters,
    calculateStockStatus,
    calculateTaxAmount,
    calculatePriceWithTax
} from '../types/supabase';
import { categoryService, productService, productSyncService } from '../services/productService';
import { initializeLocalDatabase, localDb } from '../lib/localDatabase';
import { readPosTrackInventoryFromStorage } from '../utils/posSettingsStorage';

// =====================================================
// Types
// =====================================================

interface ProductsState {
    products: LocalProduct[];
    categories: LocalCategory[];
    isLoading: boolean;
    /** Local catalog read / Dexie failures — blocks POS grid until resolved. */
    error: string | null;
    /** Background cloud sync failure — banner only; local catalog still usable. */
    syncError: string | null;
    syncStatus: {
        isOnline: boolean;
        lastSync: Date | null;
        isSyncing: boolean;
    };
}

// Interface definitions are imported from types file

type ProductsAction =
    | { type: 'SET_LOADING'; payload: boolean }
    | { type: 'SET_ERROR'; payload: string | null }
    | { type: 'SET_SYNC_ERROR'; payload: string | null }
    | { type: 'SET_PRODUCTS'; payload: LocalProduct[] }
    | { type: 'SET_CATEGORIES'; payload: LocalCategory[] }
    | { type: 'ADD_PRODUCT'; payload: LocalProduct }
    | { type: 'UPDATE_PRODUCT'; payload: { id: string; updates: Partial<LocalProduct> } }
    | { type: 'REMOVE_PRODUCT'; payload: string }
    | { type: 'ADD_CATEGORY'; payload: LocalCategory }
    | { type: 'UPDATE_CATEGORY'; payload: { id: string; updates: Partial<LocalCategory> } }
    | { type: 'REMOVE_CATEGORY'; payload: string }
    | { type: 'SET_SYNC_STATUS'; payload: Partial<ProductsState['syncStatus']> };

interface ProductsContextType {
    // State
    products: LocalProduct[];
    categories: LocalCategory[];
    isLoading: boolean;
    error: string | null;
    syncError: string | null;
    syncStatus: ProductsState['syncStatus'];

    // Product operations
    createProduct: (productData: ProductFormData) => Promise<string>;
    updateProduct: (id: string, updates: Partial<LocalProduct>) => Promise<void>;
    deleteProduct: (id: string) => Promise<void>;
    getProductById: (id: string) => LocalProduct | undefined;
    getProductBySku: (sku: string) => Promise<LocalProduct | undefined>;
    searchProducts: (query: string) => Promise<LocalProduct[]>;
    filterProducts: (filters: ProductFilters) => Promise<LocalProduct[]>;
    updateProductStock: (id: string, quantityChange: number) => Promise<void>;

    // Category operations
    createCategory: (categoryData: CategoryFormData) => Promise<string>;
    updateCategory: (id: string, updates: Partial<LocalCategory>) => Promise<void>;
    deleteCategory: (id: string) => Promise<void>;
    getCategoryById: (id: string) => LocalCategory | undefined;
    searchCategories: (query: string) => Promise<LocalCategory[]>;

    // Computed data
    getProductsByCategory: (categoryId: string) => LocalProduct[];
    getActiveProducts: () => LocalProduct[];
    getLowStockProducts: () => LocalProduct[];
    getProductWithCalculations: (id: string) => (LocalProduct & {
        stock_status: 'in_stock' | 'low_stock' | 'out_of_stock';
        tax_amount: number;
        price_with_tax: number;
    }) | undefined;

    // Sync operations
    syncData: () => Promise<void>;
    refreshData: () => Promise<void>;
    clearSyncError: () => void;
}

// =====================================================
// Reducer
// =====================================================

const productsReducer = (state: ProductsState, action: ProductsAction): ProductsState => {
    switch (action.type) {
        case 'SET_LOADING':
            return { ...state, isLoading: action.payload };
        case 'SET_ERROR':
            return { ...state, error: action.payload };
        case 'SET_SYNC_ERROR':
            return { ...state, syncError: action.payload };
        case 'SET_PRODUCTS':
            return { ...state, products: action.payload };
        case 'SET_CATEGORIES':
            return { ...state, categories: action.payload };
        case 'ADD_PRODUCT':
            return { ...state, products: [...state.products, action.payload] };
        case 'UPDATE_PRODUCT':
            return {
                ...state,
                products: state.products.map(p =>
                    p.id === action.payload.id ? { ...p, ...action.payload.updates } : p
                )
            };
        case 'REMOVE_PRODUCT':
            return {
                ...state,
                products: state.products.filter(p => p.id !== action.payload)
            };
        case 'ADD_CATEGORY':
            return { ...state, categories: [...state.categories, action.payload] };
        case 'UPDATE_CATEGORY':
            return {
                ...state,
                categories: state.categories.map(c =>
                    c.id === action.payload.id ? { ...c, ...action.payload.updates } : c
                )
            };
        case 'REMOVE_CATEGORY':
            return {
                ...state,
                categories: state.categories.filter(c => c.id !== action.payload)
            };
        case 'SET_SYNC_STATUS':
            return {
                ...state,
                syncStatus: { ...state.syncStatus, ...action.payload }
            };
        default:
            return state;
    }
};

// =====================================================
// Context
// =====================================================

const ProductsContext = createContext<ProductsContextType | null>(null);

// =====================================================
// Provider
// =====================================================

export const ProductsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { t } = useTranslation();
    const [state, dispatch] = useReducer(productsReducer, {
        products: [],
        categories: [],
        isLoading: false,
        error: null,
        syncError: null,
        syncStatus: {
            isOnline: navigator.onLine,
            lastSync: null,
            isSyncing: false
        }
    });

    const loadData = useCallback(async () => {
        try {
            dispatch({ type: 'SET_LOADING', payload: true });
            dispatch({ type: 'SET_ERROR', payload: null });

            await initializeLocalDatabase();
            await categoryService.ensureDefaultGeneralCategory();

            // Use direct database queries to avoid service layer issues
            const [products, categories] = await Promise.all([
                localDb.products.filter((prod: LocalProduct) => prod.deleted_at === null).toArray(),
                localDb.categories.filter((cat: LocalCategory) => cat.deleted_at === null).toArray()
            ]);

            // Sort the results manually
            const sortedProducts = products.sort((a: LocalProduct, b: LocalProduct) => a.display_order - b.display_order);
            const sortedCategories = categories.sort((a: LocalCategory, b: LocalCategory) => a.display_order - b.display_order);

            dispatch({ type: 'SET_PRODUCTS', payload: sortedProducts });
            dispatch({ type: 'SET_CATEGORIES', payload: sortedCategories });
        } catch (error) {
            console.error('Failed to load products and categories:', error);
            dispatch({ type: 'SET_ERROR', payload: t('pos.failedToLoadData') });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [t]);

    useEffect(() => {
        loadData();

        // Set up online/offline listeners
        const handleOnline = () => {
            dispatch({ type: 'SET_SYNC_STATUS', payload: { isOnline: true } });
            // Auto-sync when coming back online
            syncData();
        };

        const handleOffline = () => {
            dispatch({ type: 'SET_SYNC_STATUS', payload: { isOnline: false } });
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // =====================================================
    // PRODUCT OPERATIONS
    // =====================================================

    const createProduct = async (productData: ProductFormData): Promise<string> => {
        try {
            dispatch({ type: 'SET_ERROR', payload: null });

            // Convert form data to local product format
            const localProductData = {
                ...productData,
                barcode: null, // Will be set by the service
                category_name: null, // Will be populated by the service
                display_order: 0,
                deleted_at: null,
            };

            console.log('ProductsContext: Creating product with category_id:', productData.category_id);
            console.log('ProductsContext: Local product data before service call:', localProductData);

            const id = await productService.createProduct(localProductData);

            console.log('ProductsContext: Product created with ID:', id);
            const newProduct = await productService.getProductById(id);

            if (newProduct) {
                dispatch({ type: 'ADD_PRODUCT', payload: newProduct });
                console.log('New product added to context:', newProduct);
                console.log('POS: New product created with ID:', id, 'Name:', newProduct.name);
            } else {
                console.error('POS: Failed to retrieve newly created product!');
            }

            // Refresh the data to ensure consistency
            await refreshData();

            return id;
        } catch (error) {
            console.error('Failed to create product:', error);
            dispatch({ type: 'SET_ERROR', payload: 'Failed to create product' });
            throw error;
        }
    };

    const updateProduct = async (id: string, updates: Partial<LocalProduct>): Promise<void> => {
        try {
            dispatch({ type: 'SET_ERROR', payload: null });

            await productService.updateProduct(id, updates);
            dispatch({ type: 'UPDATE_PRODUCT', payload: { id, updates } });
        } catch (error) {
            console.error('Failed to update product:', error);
            dispatch({ type: 'SET_ERROR', payload: 'Failed to update product' });
            throw error;
        }
    };

    const deleteProduct = async (id: string): Promise<void> => {
        try {
            dispatch({ type: 'SET_ERROR', payload: null });

            await productService.deleteProduct(id);
            dispatch({ type: 'REMOVE_PRODUCT', payload: id });
        } catch (error) {
            console.error('Failed to delete product:', error);
            dispatch({ type: 'SET_ERROR', payload: 'Failed to delete product' });
            throw error;
        }
    };

    const getProductById = (id: string): LocalProduct | undefined => {
        return state.products.find(product => product.id === id);
    };

    const getProductBySku = async (sku: string): Promise<LocalProduct | undefined> => {
        return await productService.getProductBySku(sku);
    };

    const searchProducts = async (query: string): Promise<LocalProduct[]> => {
        return await productService.searchProducts(query);
    };

    const filterProducts = async (filters: ProductFilters): Promise<LocalProduct[]> => {
        return await productService.filterProducts(filters);
    };

    const updateProductStock = async (id: string, quantityChange: number): Promise<void> => {
        try {
            await productService.updateProductStock(id, quantityChange);

            // Update local state
            const product = getProductById(id);
            if (product && readPosTrackInventoryFromStorage() && product.track_stock) {
                const newStock = Math.max(0, product.stock + quantityChange);
                dispatch({ type: 'UPDATE_PRODUCT', payload: { id, updates: { stock: newStock } } });
            }
        } catch (error) {
            console.error('Failed to update product stock:', error);
            throw error;
        }
    };

    // =====================================================
    // CATEGORY OPERATIONS
    // =====================================================

    const createCategory = async (categoryData: CategoryFormData): Promise<string> => {
        try {
            dispatch({ type: 'SET_ERROR', payload: null });

            const localCategoryData = {
                ...categoryData,
                deleted_at: null,
            };

            const id = await categoryService.createCategory(localCategoryData);
            const newCategory = await categoryService.getCategoryById(id);

            if (newCategory) {
                dispatch({ type: 'ADD_CATEGORY', payload: newCategory });
            }

            return id;
        } catch (error) {
            console.error('Failed to create category:', error);
            dispatch({ type: 'SET_ERROR', payload: 'Failed to create category' });
            throw error;
        }
    };

    const updateCategory = async (id: string, updates: Partial<LocalCategory>): Promise<void> => {
        try {
            dispatch({ type: 'SET_ERROR', payload: null });

            await categoryService.updateCategory(id, updates);
            dispatch({ type: 'UPDATE_CATEGORY', payload: { id, updates } });
        } catch (error) {
            console.error('Failed to update category:', error);
            dispatch({ type: 'SET_ERROR', payload: 'Failed to update category' });
            throw error;
        }
    };

    const deleteCategory = async (id: string): Promise<void> => {
        try {
            dispatch({ type: 'SET_ERROR', payload: null });

            await categoryService.deleteCategory(id);
            dispatch({ type: 'REMOVE_CATEGORY', payload: id });
        } catch (error) {
            console.error('Failed to delete category:', error);
            dispatch({ type: 'SET_ERROR', payload: 'Failed to delete category' });
            throw error;
        }
    };

    const getCategoryById = (id: string): LocalCategory | undefined => {
        return state.categories.find(category => category.id === id);
    };

    const searchCategories = async (query: string): Promise<LocalCategory[]> => {
        return await categoryService.searchCategories(query);
    };

    // =====================================================
    // COMPUTED DATA
    // =====================================================

    const getProductsByCategory = (categoryId: string): LocalProduct[] => {
        return state.products.filter(product =>
            product.category_id === categoryId &&
            product.is_active &&
            product.deleted_at === null
        );
    };

    const getActiveProducts = (): LocalProduct[] => {
        return state.products.filter(product =>
            product.is_active &&
            product.deleted_at === null
        );
    };

    const getLowStockProducts = (): LocalProduct[] => {
        return state.products.filter(product => {
            if (!product.is_active || product.deleted_at || !readPosTrackInventoryFromStorage() || !product.track_stock) return false;
            return product.stock <= product.min_stock;
        });
    };

    const getProductWithCalculations = (id: string) => {
        const product = getProductById(id);
        if (!product) return undefined;

        return {
            ...product,
            stock_status: calculateStockStatus(product),
            tax_amount: calculateTaxAmount(product.price, product.iva_rate),
            price_with_tax: calculatePriceWithTax(product.price, product.iva_rate),
        };
    };

    // =====================================================
    // SYNC OPERATIONS
    // =====================================================

    const syncData = async (): Promise<void> => {
        if (!state.syncStatus.isOnline) return;

        try {
            dispatch({ type: 'SET_SYNC_STATUS', payload: { isSyncing: true } });
            dispatch({ type: 'SET_SYNC_ERROR', payload: null });

            await productSyncService.fullSync();

            // Reload data after sync
            await loadData();

            dispatch({
                type: 'SET_SYNC_STATUS',
                payload: {
                    lastSync: new Date(),
                    isSyncing: false
                }
            });
            dispatch({ type: 'SET_SYNC_ERROR', payload: null });
        } catch (error) {
            console.error('Sync failed:', error);
            const message = error instanceof Error ? error.message : 'Sync failed';
            dispatch({ type: 'SET_SYNC_ERROR', payload: message });
            dispatch({ type: 'SET_SYNC_STATUS', payload: { isSyncing: false } });
        }
    };

    const clearSyncError = useCallback(() => {
        dispatch({ type: 'SET_SYNC_ERROR', payload: null });
    }, []);

    const refreshData = async (): Promise<void> => {
        await loadData();
    };

    // =====================================================
    // CONTEXT VALUE
    // =====================================================

    const contextValue: ProductsContextType = {
        // State
        products: state.products,
        categories: state.categories,
        isLoading: state.isLoading,
        error: state.error,
        syncError: state.syncError,
        syncStatus: state.syncStatus,

        // Product operations
        createProduct,
        updateProduct,
        deleteProduct,
        getProductById,
        getProductBySku,
        searchProducts,
        filterProducts,
        updateProductStock,

        // Category operations
        createCategory,
        updateCategory,
        deleteCategory,
        getCategoryById,
        searchCategories,

        // Computed data
        getProductsByCategory,
        getActiveProducts,
        getLowStockProducts,
        getProductWithCalculations,

        // Sync operations
        syncData,
        refreshData,
        clearSyncError,
    };

    return (
        <ProductsContext.Provider value={contextValue}>
            {children}
        </ProductsContext.Provider>
    );
};

// =====================================================
// HOOKS
// =====================================================

export const useProducts = (): ProductsContextType => {
    const context = useContext(ProductsContext);
    if (context === null) {
        throw new Error('useProducts must be used within a ProductsProvider');
    }
    return context;
};

// Utility hooks for common patterns
export const useProductsByCategory = (categoryId: string): LocalProduct[] => {
    const { getProductsByCategory } = useProducts();
    return getProductsByCategory(categoryId);
};

export const useActiveProducts = (): LocalProduct[] => {
    const { getActiveProducts } = useProducts();
    return getActiveProducts();
};

export const useLowStockProducts = (): LocalProduct[] => {
    const { getLowStockProducts } = useProducts();
    return getLowStockProducts();
};

export const useProductWithCalculations = (id: string) => {
    const { getProductWithCalculations } = useProducts();
    return getProductWithCalculations(id);
}; 