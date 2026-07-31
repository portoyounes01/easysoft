import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import POS2 from '../src/pages/POS2';
import { useProducts } from '../src/contexts/ProductsContext';
import type { LocalCategory, LocalProduct } from '../src/types/supabase';
import i18n from '../src/i18n';

vi.mock('../src/contexts/ProductsContext', () => ({
    useProducts: vi.fn(),
}));

const now = new Date('2026-07-16T12:00:00.000Z');

const makeCategory = (id: string, name: string, displayOrder: number): LocalCategory => ({
    id,
    name,
    description: null,
    color: 'from-gray-500 to-slate-600',
    icon: 'folder',
    display_order: displayOrder,
    is_active: true,
    created_at: now,
    updated_at: now,
    last_synced_at: null,
    deleted_at: null,
    needs_push: false,
    is_conflicted: false,
});

const makeProduct = (
    id: string,
    name: string,
    categoryId: string,
    displayOrder: number,
    overrides: Partial<LocalProduct> = {},
): LocalProduct => ({
    id,
    name,
    description: null,
    sku: `SKU-${id}`,
    barcode: null,
    category_id: categoryId,
    category_name: null,
    price: 2.5,
    cost: 1,
    iva_rate: 0.23,
    stock: 10,
    min_stock: 1,
    track_stock: false,
    sold_by_weight: false,
    image_url: null,
    supplier: null,
    location: null,
    is_active: true,
    display_order: displayOrder,
    created_at: now,
    updated_at: now,
    last_synced_at: null,
    deleted_at: null,
    needs_push: false,
    is_conflicted: false,
    ...overrides,
});

describe('/pos2 real catalog', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');

        const bakery = makeCategory('bakery', 'Bakery', 1);
        const drinks = makeCategory('drinks', 'Drinks', 2);
        const products = [
            makeProduct('espresso', 'Espresso', drinks.id, 2, { image_url: '/espresso.png' }),
            makeProduct('bread', 'Sourdough Bread', bakery.id, 1),
            makeProduct('inactive', 'Hidden Product', drinks.id, 3, { is_active: false }),
            makeProduct('deleted', 'Deleted Product', bakery.id, 4, { deleted_at: now }),
        ];

        vi.mocked(useProducts).mockReturnValue({
            products,
            categories: [drinks, bakery],
            isLoading: false,
            error: null,
        } as ReturnType<typeof useProducts>);
    });

    it('shows active products and filters them by real category', () => {
        const { container } = render(<POS2 />);

        const categoryLabels = Array.from(container.querySelectorAll('.pos2-category-pill')).map(
            (element) => element.textContent,
        );
        expect(categoryLabels).toEqual(['All', 'Bakery', 'Drinks']);
        expect(screen.getByText('Sourdough Bread')).toBeInTheDocument();
        expect(screen.getByText('Espresso')).toBeInTheDocument();
        expect(screen.queryByText('Hidden Product')).not.toBeInTheDocument();
        expect(screen.queryByText('Deleted Product')).not.toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Espresso' })).toHaveAttribute('src', '/espresso.png');
        expect(screen.getAllByText('€2.50')).toHaveLength(2);

        fireEvent.click(screen.getByRole('button', { name: 'Drinks' }));

        expect(screen.getByText('Espresso')).toBeInTheDocument();
        expect(screen.queryByText('Sourdough Bread')).not.toBeInTheDocument();
    });
});
