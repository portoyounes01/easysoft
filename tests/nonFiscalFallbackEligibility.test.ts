import { describe, expect, it } from 'vitest';
import { FiscalBackendUnavailableError, FiscalIssueUnresolvedError } from '../src/fiscal/fiscalFailure';
import {
    canIssueNonFiscalFallback,
    isNonFiscalFallbackProvider,
    isNonFiscalSlipReference,
    nonFiscalSlipPrefix,
} from '../src/fiscal/nonFiscalFallback';

const offline = (provider: 'vendus' | 'invoicexpress' | 'fiskaly' | 'sign_es') =>
    new FiscalBackendUnavailableError(provider, 'offline');
const unresolved = () => new FiscalIssueUnresolvedError('vendus', 'POS-1', 'a1', 'timeout');

describe('isNonFiscalFallbackProvider', () => {
    it('covers the three Portuguese cloud issuers', () => {
        expect(isNonFiscalFallbackProvider('vendus')).toBe(true);
        expect(isNonFiscalFallbackProvider('invoicexpress')).toBe(true);
        expect(isNonFiscalFallbackProvider('fiskaly')).toBe(true);
    });

    // local_at signs offline, so it is never unreachable — falling back there
    // would swap a perfectly valid fatura for a slip.
    it('excludes the local AT chain', () => {
        expect(isNonFiscalFallbackProvider('local_at')).toBe(false);
    });

    // Spain has its own contingency route (Veri*factu deferred remission);
    // routing it through the Portuguese paper book would be wrong in both.
    it('excludes SIGN ES', () => {
        expect(isNonFiscalFallbackProvider('sign_es')).toBe(false);
    });
});

describe('canIssueNonFiscalFallback', () => {
    it('allows it outright when nothing was ever dispatched', () => {
        expect(canIssueNonFiscalFallback({ failure: offline('vendus') })).toBe(true);
    });

    // The document may already exist at the provider. Issuing a paper invoice
    // on top of it is the one outcome this whole path exists to prevent.
    it('refuses an unresolved failure until the operator has checked', () => {
        expect(canIssueNonFiscalFallback({ failure: unresolved() })).toBe(false);
        expect(canIssueNonFiscalFallback({ failure: unresolved(), operatorAttested: false })).toBe(false);
    });

    it('allows it once the operator attests no document exists', () => {
        expect(canIssueNonFiscalFallback({ failure: unresolved(), operatorAttested: true })).toBe(true);
    });

    it('never allows it for a provider outside the fallback regime', () => {
        expect(canIssueNonFiscalFallback({ failure: offline('sign_es') })).toBe(false);
        expect(
            canIssueNonFiscalFallback({ failure: offline('sign_es'), operatorAttested: true })
        ).toBe(false);
    });
});

describe('slip references', () => {
    it('are prefixed so they can never be read as a fatura number', () => {
        const prefix = nonFiscalSlipPrefix();
        expect(prefix.startsWith('TNF-')).toBe(true);
        expect(prefix.endsWith('-')).toBe(true);
        expect(isNonFiscalSlipReference(`${prefix}000001`)).toBe(true);
    });

    it('do not match real document numbers', () => {
        expect(isNonFiscalSlipReference('FS 33A2501/80084')).toBe(false);
        expect(isNonFiscalSlipReference('')).toBe(false);
        expect(isNonFiscalSlipReference(null)).toBe(false);
    });

    // Two tills that go offline together must not mint the same reference:
    // the audit log is per-device, so recording the paper invoice for one
    // would otherwise clear the other's reminder too.
    it('carry a till discriminator between the prefix and the counter', () => {
        expect(nonFiscalSlipPrefix()).toMatch(/^TNF-[0-9A-Z]+-$/);
    });
});
