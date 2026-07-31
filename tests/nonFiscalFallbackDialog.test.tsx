// Interaction tests for the fallback dialog.
//
// The attestation was previously a 20px native checkbox at the end of the
// dialog BODY. The shell scrolls the body and pins the footer, so on a till the
// gate could sit below the fold while the permanently-disabled button stayed in
// view — and the checkbox was too small to hit with a finger anyway. Asserting
// on the classifier could never surface that; only driving the control can.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NonFiscalFallbackDialog from '../src/components/NonFiscalFallbackDialog';
import {
    FiscalBackendUnavailableError,
    FiscalIssueRejectedError,
    FiscalIssueUnresolvedError,
} from '../src/fiscal/fiscalFailure';

const offline = (provider: 'fiskaly' | 'vendus' | 'invoicexpress' = 'fiskaly') =>
    new FiscalBackendUnavailableError(provider, 'offline');
const unresolved = (provider: 'fiskaly' | 'vendus' | 'invoicexpress' = 'fiskaly') =>
    new FiscalIssueUnresolvedError(provider, 'POS-abc', 'a1', 'timeout');
const rejected = () => new FiscalIssueRejectedError('vendus', 'POS-abc', 'a1', 422, 'invalid NIF');

const setup = (failure: Parameters<typeof NonFiscalFallbackDialog>[0]['failure']) => {
    const onIssueSlip = vi.fn();
    const onRetry = vi.fn();
    render(
        <NonFiscalFallbackDialog
            failure={failure}
            onCancel={vi.fn()}
            onRetry={onRetry}
            onIssueSlip={onIssueSlip}
        />
    );
    // Queried by testid, not by label: react-i18next is not wired to the real
    // resources under vitest, so every t() here renders as its key and text
    // matchers would pass or fail for reasons unrelated to the behaviour.
    const issueButton = screen.getByTestId('fallback-issue-slip');
    return { onIssueSlip, onRetry, issueButton };
};

describe('the attestation gate', () => {
    it('is togglable, and enables the slip button — the bug that blocked the till', () => {
        const { issueButton } = setup(unresolved());
        const attestation = screen.getByTestId('fallback-attestation');

        expect(attestation).toHaveAttribute('aria-checked', 'false');
        expect(issueButton).toBeDisabled();

        fireEvent.click(attestation);

        expect(attestation).toHaveAttribute('aria-checked', 'true');
        expect(issueButton).toBeEnabled();
    });

    it('toggles back off', () => {
        const { issueButton } = setup(unresolved());
        const attestation = screen.getByTestId('fallback-attestation');
        fireEvent.click(attestation);
        fireEvent.click(attestation);
        expect(issueButton).toBeDisabled();
    });

    it('passes the attestation on to the caller', () => {
        const { onIssueSlip, issueButton } = setup(unresolved());
        fireEvent.click(screen.getByTestId('fallback-attestation'));
        fireEvent.click(issueButton);
        expect(onIssueSlip).toHaveBeenCalledWith(
            expect.objectContaining({ operatorAttested: true })
        );
    });

    // A disabled button with no visible reason is what the operator actually hit.
    it('explains why the button is disabled, and stops once satisfied', () => {
        setup(unresolved());
        expect(screen.getByTestId('fallback-attestation-hint')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('fallback-attestation'));
        expect(screen.queryByTestId('fallback-attestation-hint')).not.toBeInTheDocument();
    });
});

describe('failures that need no attestation', () => {
    it('offers the slip immediately when nothing was ever dispatched', () => {
        const { issueButton } = setup(offline());
        expect(screen.queryByTestId('fallback-attestation')).not.toBeInTheDocument();
        expect(issueButton).toBeEnabled();
    });

    it('offers the slip immediately when the provider proved it refused', () => {
        const { issueButton } = setup(rejected());
        expect(screen.queryByTestId('fallback-attestation')).not.toBeInTheDocument();
        expect(issueButton).toBeEnabled();
    });
});

describe('the retry button', () => {
    it('is offered on an unresolved failure only where a re-send is idempotent', () => {
        setup(unresolved('fiskaly'));
        expect(screen.getByTestId('fallback-retry')).toBeInTheDocument();
    });

    it('is withheld for InvoiceXpress, where a re-send could issue a second document', () => {
        setup(unresolved('invoicexpress'));
        expect(screen.queryByTestId('fallback-retry')).not.toBeInTheDocument();
    });

    it('is always offered when nothing was dispatched', () => {
        setup(offline('invoicexpress'));
        expect(screen.getByTestId('fallback-retry')).toBeInTheDocument();
    });
});
