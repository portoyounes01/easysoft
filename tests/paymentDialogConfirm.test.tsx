import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import PaymentDialog, { type PaymentConfirmation } from '../src/components/PaymentDialog';

/** The cash amount is optional: an empty field means the customer paid the
 *  exact total. The confirmation must still say 'cash' — the flow used to
 *  infer the method from `cashReceived > 0`, which recorded an exact-payment
 *  cash sale as a CARD sale (wrong fiscal record, and no drawer kick). */
function renderDialog(onConfirm: (c: PaymentConfirmation) => void, cashReceived = 0) {
    return render(
        <PaymentDialog
            open
            total={12.5}
            cashReceived={cashReceived}
            onChangeCash={() => { }}
            onClose={() => { }}
            onConfirm={onConfirm}
        />
    );
}

const confirmButton = () => screen.getByRole('button', { name: /confirm|confirmar/i });

describe('PaymentDialog confirmation', () => {
    it('confirms a cash sale with no amount typed, as exact payment', () => {
        const onConfirm = vi.fn();
        renderDialog(onConfirm);

        const button = confirmButton();
        expect(button).not.toBeDisabled();
        fireEvent.click(button);

        expect(onConfirm).toHaveBeenCalledWith({ method: 'cash', cashReceived: 12.5, change: 0 });
    });

    it('reports the tendered amount and change when one is typed', () => {
        const onConfirm = vi.fn();
        const { rerender } = renderDialog(onConfirm);

        fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '20' } });
        rerender(
            <PaymentDialog
                open
                total={12.5}
                cashReceived={20}
                onChangeCash={() => { }}
                onClose={() => { }}
                onConfirm={onConfirm}
            />
        );

        fireEvent.click(confirmButton());
        expect(onConfirm).toHaveBeenCalledWith({ method: 'cash', cashReceived: 20, change: 7.5 });
    });

    it('still blocks a typed amount that does not cover the total', () => {
        const onConfirm = vi.fn();
        const { rerender } = renderDialog(onConfirm);

        fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '5' } });
        rerender(
            <PaymentDialog
                open
                total={12.5}
                cashReceived={5}
                onChangeCash={() => { }}
                onClose={() => { }}
                onConfirm={onConfirm}
            />
        );

        expect(confirmButton()).toBeDisabled();
        // A typed 0 is a mistake too, not "exact".
        fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '0' } });
        expect(confirmButton()).toBeDisabled();
    });

    it('reports a card sale with no cash figures', () => {
        const onConfirm = vi.fn();
        renderDialog(onConfirm);

        // No i18next instance in this harness, so labels render as raw keys.
        fireEvent.click(screen.getByRole('button', { name: /^(pos\.card|card|cartão|tarjeta)$/i }));
        fireEvent.click(confirmButton());

        expect(onConfirm).toHaveBeenCalledWith({ method: 'card', cashReceived: 0, change: 0 });
    });
});
