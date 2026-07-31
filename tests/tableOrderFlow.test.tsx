import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { POSProvider, usePOS } from '../src/contexts/POSContext';
import { initializeLocalDatabase, localDb } from '../src/lib/localDatabase';
import Tables from '../src/pages/Tables';
import type { LocalProduct } from '../src/types/supabase';

const tableId = 'table-1';

const product: LocalProduct = {
    id: 'product-soup',
    name: 'Soup',
    description: null,
    sku: 'SOU-001',
    barcode: null,
    category_id: 'food',
    category_name: 'Food',
    price: 4,
    cost: 1,
    iva_rate: 0.13,
    stock: 9,
    min_stock: 0,
    track_stock: true,
    image_url: null,
    supplier: null,
    location: null,
    is_active: true,
    display_order: 1,
    created_at: new Date(),
    updated_at: new Date(),
    last_synced_at: null,
    deleted_at: null,
    needs_push: false,
    is_conflicted: false,
};

const POSHarness: React.FC = () => {
    const navigate = useNavigate();
    const { cart, addToCart, clearCart, clearActiveTableOrder, activeTableOrder } = usePOS();

    return (
        <div>
            <button type="button" onClick={() => addToCart(product)}>Add soup</button>
            <button type="button" onClick={() => navigate('/tables')}>Go to tables</button>
            <button type="button" onClick={() => {
                clearCart();
                clearActiveTableOrder();
            }}>
                Forget live cart
            </button>
            <p data-testid="cart-line-count">{cart.length}</p>
            <p data-testid="active-table-name">{activeTableOrder?.tableName ?? 'none'}</p>
        </div>
    );
};

const renderFlow = () => render(
    <MemoryRouter initialEntries={['/pos']}>
        <POSProvider>
            <Routes>
                <Route path="/pos" element={<POSHarness />} />
                <Route path="/tables" element={<Tables />} />
            </Routes>
        </POSProvider>
    </MemoryRouter>
);

describe('table order flow', () => {
    beforeEach(async () => {
        localStorage.clear();
        localStorage.setItem('pos.table-layout.v1', JSON.stringify({
            tables: [{
                id: tableId,
                name: 'Table 1',
                capacity: 4,
                shape: 'square',
                x: 35,
                y: 35,
                rotation: 0,
            }],
            showCashier: true,
        }));
        await initializeLocalDatabase();
        await Promise.all([
            localDb.tableOrders.clear(),
            localDb.transactions.clear(),
            localDb.transactionItems.clear(),
            localDb.fiscalDocuments.clear(),
        ]);
    });

    it('assigns a cart to a table, writes no fiscal data, then restores it when reopened', async () => {
        renderFlow();

        fireEvent.click(screen.getByRole('button', { name: 'Add soup' }));
        expect(screen.getByTestId('cart-line-count')).toHaveTextContent('1');
        fireEvent.click(screen.getByRole('button', { name: 'Go to tables' }));

        await waitFor(() => expect(screen.getByTestId(`table-floor-${tableId}`)).toBeInTheDocument());
        fireEvent.click(screen.getByTestId(`table-floor-${tableId}`));
        expect(screen.getByRole('dialog', { name: 'Assign Table 1?' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Assign order' }));

        await waitFor(() => {
            expect(screen.getByTestId('active-table-name')).toHaveTextContent('Table 1');
        });
        expect(screen.getByTestId('cart-line-count')).toHaveTextContent('1');
        expect(await localDb.tableOrders.count()).toBe(1);
        expect(await localDb.transactions.count()).toBe(0);
        expect(await localDb.transactionItems.count()).toBe(0);
        expect(await localDb.fiscalDocuments.count()).toBe(0);

        fireEvent.click(screen.getByRole('button', { name: 'Go to tables' }));

        await waitFor(() => expect(screen.getByTestId('active-table-order')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Park order' }));
        await waitFor(() => expect(screen.getByTestId(`table-status-${tableId}`)).toHaveTextContent('used'));
        fireEvent.click(screen.getByTestId(`table-floor-${tableId}`));
        fireEvent.click(screen.getByRole('button', { name: 'Open order' }));

        await waitFor(() => {
            expect(screen.getByTestId('cart-line-count')).toHaveTextContent('1');
            expect(screen.getByTestId('active-table-name')).toHaveTextContent('Table 1');
        });
    });
});
