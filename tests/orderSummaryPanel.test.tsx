import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import OrderSummaryPanel, { OrderSummaryItem } from '../src/components/OrderSummaryPanel';

describe('OrderSummaryPanel', () => {
    const items: OrderSummaryItem[] = [
        // @ts-expect-error minimal fields for test; component only uses id, name, price
        { product: { id: '1', name: 'Classic Crispyburger', price: 4.75 }, quantity: 1 },
        // @ts-expect-error minimal fields
        { product: { id: '2', name: 'Sprite', price: 3.00 }, quantity: 1 }
    ];

    test('renders items and total', () => {
        render(
            <OrderSummaryPanel
                items={items}
                onClearAll={() => { }}
                onCustomer={() => { }}
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
                onCustomer={() => { }}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /Clear/i }));
        expect(onClearAll).toHaveBeenCalled();
    });

    test('cart qty minus calls onDecrementCartLine with product id', () => {
        const onDecrement = vi.fn();
        render(
            <OrderSummaryPanel
                items={items}
                onClearAll={() => { }}
                onCustomer={() => { }}
                onDecrementCartLine={onDecrement}
            />
        );

        const minusButtons = screen.getAllByRole('button', { name: /pos\.cartQtyDecrease/i });
        expect(minusButtons.length).toBe(2);
        fireEvent.click(minusButtons[0]);
        expect(onDecrement).toHaveBeenCalledWith('1');
    });

    test('cart qty plus calls onIncrementCartLine with product id', () => {
        const onIncrement = vi.fn();
        render(
            <OrderSummaryPanel
                items={items}
                onClearAll={() => { }}
                onCustomer={() => { }}
                onIncrementCartLine={onIncrement}
            />
        );

        const plusButtons = screen.getAllByRole('button', { name: /pos\.cartQtyIncrease/i });
        expect(plusButtons.length).toBe(2);
        fireEvent.click(plusButtons[1]);
        expect(onIncrement).toHaveBeenCalledWith('2');
    });
});


