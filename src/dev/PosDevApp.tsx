// Local dev mode for the POS (entry: /pos-dev.html, dev server only).
//
// Mounts the REAL POS page with a fake authenticated operator so the full
// till workflow — product grid, cart, discounts, weighing, payment — can be
// exercised in a plain browser without device pairing or employee login.
// Data lives in the browser's local Dexie database; a small demo catalog is
// seeded on first run when the database is empty.
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '../index.css';
import '../i18n';
import { AuthContext, type AuthContextType } from '../contexts/SupabaseAuthContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import { DesignSystem2CustomizationProvider } from '../contexts/DesignSystem2CustomizationContext';
import { SettingsProvider } from '../contexts/SettingsContext';
import { ProductsProvider } from '../contexts/ProductsContext';
import { EmployeesProvider } from '../contexts/EmployeesContext';
import { POSProvider } from '../contexts/POSContext';
import { LayoutNavProvider } from '../contexts/LayoutNavContext';
import POS from '../pages/POS';
import { categoryService, productService } from '../services/productService';
import { customerLocalService } from '../lib/localDatabase';
import type { Employee } from '../types/supabase';
import type { Principal } from '../types/principal';

const DEV_EMPLOYEE: Employee = {
    id: 'dev-employee-1',
    employee_number: 'DEV001',
    name: 'Dev Operator',
    email: null,
    phone: null,
    role: 'admin',
    access_levels: ['all_access'],
    is_active: true,
    hire_date: '2024-01-01',
    total_sales: 0,
    transaction_count: 0,
    average_transaction: 0,
    hours_worked: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_synced_at: null,
    deleted_at: null,
};

const DEV_PRINCIPAL: Principal = {
    source: 'employee',
    userId: 'dev-user-1',
    displayName: DEV_EMPLOYEE.name,
    role: 'admin',
    tenantId: null,
    storeIds: [],
    capabilities: new Set<string>(),
};

const DEV_AUTH: AuthContextType = {
    user: null,
    employee: DEV_EMPLOYEE,
    principal: DEV_PRINCIPAL,
    session: null,
    isAuthenticated: true,
    isLoading: false,
    error: null,
    signInWithEmailAndPassword: async () => ({ success: false, error: 'dev mode' }),
    signInWithEmployeeCredentials: async () => ({ success: false, error: 'dev mode' }),
    signInWithPwaCredentials: async () => ({ success: false, error: 'dev mode' }),
    signOut: async () => undefined,
    hasPermission: () => true,
    refreshEmployeeSession: () => undefined,
    clearError: () => undefined,
};

/** Seed a small demo catalog once, so the grid isn't empty on first launch. */
async function seedDemoCatalog(): Promise<void> {
    const products = await productService.getAllProducts();
    if (products.length > 0) return;

    await categoryService.ensureDefaultGeneralCategory();
    const drinksId = await categoryService.createCategory({
        name: 'Drinks', description: null, color: 'from-sky-400 to-blue-600', icon: 'coffee',
        display_order: 1, is_active: true, deleted_at: null,
    });
    const bakeryId = await categoryService.createCategory({
        name: 'Bakery', description: null, color: 'from-amber-400 to-orange-600', icon: 'cake',
        display_order: 2, is_active: true, deleted_at: null,
    });

    await productService.createProduct({
        name: 'Espresso', description: 'Double shot espresso', sku: 'DRK-ESP-001', barcode: null,
        category_id: drinksId, category_name: 'Drinks', price: 2.5, cost: 0.6, iva_rate: 0.13,
        stock: 0, min_stock: 0, track_stock: false, sold_by_weight: false, image_url: null,
        supplier: null, location: null, is_active: true, display_order: 1, deleted_at: null,
    });
    await productService.createProduct({
        name: 'Almond Croissant', description: 'Butter croissant with almond cream', sku: 'BAK-CRO-002', barcode: null,
        category_id: bakeryId, category_name: 'Bakery', price: 3.4, cost: 1.1, iva_rate: 0.13,
        stock: 0, min_stock: 0, track_stock: false, sold_by_weight: false, image_url: null,
        supplier: null, location: null, is_active: true, display_order: 2, deleted_at: null,
    });
    await productService.createProduct({
        name: 'Queijo da Serra', description: 'Sold by weight', sku: 'DEL-QDS-003', barcode: null,
        category_id: bakeryId, category_name: 'Bakery', price: 18.9, cost: 9.5, iva_rate: 0.06,
        stock: 0, min_stock: 0, track_stock: false, sold_by_weight: true, image_url: null,
        supplier: null, location: null, is_active: true, display_order: 3, deleted_at: null,
    });
    await customerLocalService.createCustomer({
        name: 'Maria Silva', tax_number: '123456789', country: 'PT', email: 'maria@example.com',
        phone: '912345678', address: 'Rua A, 12', city: 'Lisboa', postal_code: '1000-001',
        total_spent: 342.5, transaction_count: 6, loyalty_points: 120, is_active: true,
        preferred_payment_method: null, deleted_at: null,
    });
}

class DevErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
    state = { error: null as Error | null };
    static getDerivedStateFromError(error: Error) { return { error }; }
    render() {
        if (this.state.error) {
            return (
                <pre style={{ padding: 24, whiteSpace: 'pre-wrap', color: '#b91c1c', fontSize: 13 }} data-dev-error>
                    {String(this.state.error.stack || this.state.error.message)}
                </pre>
            );
        }
        return this.props.children;
    }
}

const Root: React.FC = () => {
    const [ready, setReady] = useState(false);
    const [seedError, setSeedError] = useState('');

    useEffect(() => {
        seedDemoCatalog()
            .catch(error => setSeedError(error instanceof Error ? error.message : String(error)))
            .finally(() => setReady(true));
    }, []);

    if (!ready) {
        return <div style={{ padding: 24, fontFamily: 'sans-serif' }}>Preparing dev POS…</div>;
    }

    return (
        <AuthContext.Provider value={DEV_AUTH}>
            <MemoryRouter initialEntries={['/pos']}>
                <LanguageProvider>
                    <DesignSystem2CustomizationProvider>
                        <SettingsProvider>
                            <ProductsProvider>
                                <EmployeesProvider>
                                    <POSProvider>
                                        {seedError && (
                                            <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '8px 16px', fontSize: 13 }}>
                                                Demo seed failed: {seedError}
                                            </div>
                                        )}
                                        <LayoutNavProvider value={{ toggleNavSidebar: () => undefined, closeNavSidebar: () => undefined, isPosOverlayNav: true }}>
                                            <div className="dev-pos-root" style={{ minHeight: '100vh' }}>
                                                <DevErrorBoundary>
                                                    <POS />
                                                </DevErrorBoundary>
                                            </div>
                                        </LayoutNavProvider>
                                    </POSProvider>
                                </EmployeesProvider>
                            </ProductsProvider>
                        </SettingsProvider>
                    </DesignSystem2CustomizationProvider>
                </LanguageProvider>
            </MemoryRouter>
        </AuthContext.Provider>
    );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);
