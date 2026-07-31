import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import OrderSummaryPanel, { OrderSummaryItem } from '../src/components/OrderSummaryPanel';

describe('OrderSummaryPanel', () => {
    const items: OrderSummaryItem[] = [
        // @ts-expect-error minimal fields for test; component only uses id, name, price
        { lineId: '1', product: { id: '1', name: 'Classic Crispyburger', price: 4.75 }, quantity: 1 },
        // @ts-expect-error minimal fields
        { lineId: '2', product: { id: '2', name: 'Sprite', price: 3.00 }, quantity: 1 }
    ];

    test('renders items and total', () => {
        render(
            <OrderSummaryPanel
                items={items}
                onClearAll={() => { }}
            />
        );

        expect(screen.getByText('Classic Crispyburger')).toBeInTheDocument();
        expect(screen.getByText('Sprite')).toBeInTheDocument();
        expect(screen.getByText('pos.totalLabel')).toBeInTheDocument();
    });

    test('fires clear all', () => {
        const onClearAll = vi.fn();
        render(
            <OrderSummaryPanel
                items={items}
                onClearAll={onClearAll}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /Clear/i }));
        expect(onClearAll).toHaveBeenCalled();
    });

    test('cart qty minus calls onDecrementCartLine with the line id', () => {
        const onDecrement = vi.fn();
        render(
            <OrderSummaryPanel
                items={items}
                onClearAll={() => { }}
                onDecrementCartLine={onDecrement}
            />
        );

        const minusButtons = screen.getAllByRole('button', { name: /pos\.cartQtyDecrease/i });
        expect(minusButtons.length).toBe(2);
        fireEvent.click(minusButtons[0]);
        expect(onDecrement).toHaveBeenCalledWith('1');
    });

    test('cart qty plus calls onIncrementCartLine with the line id', () => {
        const onIncrement = vi.fn();
        render(
            <OrderSummaryPanel
                items={items}
                onClearAll={() => { }}
                onIncrementCartLine={onIncrement}
            />
        );

        const plusButtons = screen.getAllByRole('button', { name: /pos\.cartQtyIncrease/i });
        expect(plusButtons.length).toBe(2);
        fireEvent.click(plusButtons[1]);
        expect(onIncrement).toHaveBeenCalledWith('2');
    });

    test('weighed lines render kg quantity, €/kg price, no + button, and − passes the line id', () => {
        const onDecrement = vi.fn();
        const onIncrement = vi.fn();
        const weighedItems: OrderSummaryItem[] = [
            // Two weighings of the SAME product stay separate lines
            // @ts-expect-error minimal fields
            { lineId: 'p9::w1', product: { id: 'p9', name: 'Queijo da Serra', price: 12.90 }, quantity: 0.625, unit: 'kg' },
            // @ts-expect-error minimal fields
            { lineId: 'p9::w2', product: { id: 'p9', name: 'Queijo da Serra', price: 12.90 }, quantity: 0.310, unit: 'kg' },
        ];
        render(
            <OrderSummaryPanel
                items={weighedItems}
                onClearAll={() => { }}
                onDecrementCartLine={onDecrement}
                onIncrementCartLine={onIncrement}
            />
        );

        expect(screen.getAllByText('Queijo da Serra').length).toBe(2);
        expect(screen.getByText('0.625 kg')).toBeInTheDocument();
        expect(screen.getByText('0.310 kg')).toBeInTheDocument();
        // + is hidden on weighed lines; − removes the whole weighing
        expect(screen.queryAllByRole('button', { name: /pos\.cartQtyIncrease/i }).length).toBe(0);
        const minusButtons = screen.getAllByRole('button', { name: /pos\.cartQtyDecrease/i });
        expect(minusButtons.length).toBe(2);
        fireEvent.click(minusButtons[1]);
        expect(onDecrement).toHaveBeenCalledWith('p9::w2');
    });
});
