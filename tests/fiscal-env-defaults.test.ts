import { describe, it, expect } from 'vitest';

import type { SystemSettings } from '../src/contexts/SettingsContext';
import { defaultSeriesProfiles } from '../src/fiscal/receiptSeriesProfile';
import {
    applyFiscalSecretsFromEnv,
    getFiscalRsaPrivateKeyPemFromEnv,
    settingsWithoutPersistedFiscalSecrets,
} from '../src/utils/fiscalEnvDefaults';

describe('fiscalEnvDefaults', () => {
    it('getFiscalRsaPrivateKeyPemFromEnv unescapes literal \\n in env value', () => {
        const pem = getFiscalRsaPrivateKeyPemFromEnv({
            VITE_FISCAL_RSA_PRIVATE_KEY_PEM: 'line1\\nline2',
        });
        expect(pem).toBe('line1\nline2');
    });

    const baseSettings = (): SystemSettings => ({
        autoLogout: {
            enabled: true,
            timeoutMinutes: 15,
            warningSeconds: 30,
            protectWhenCartHasItems: true,
        },
        pos: {
            currencySymbol: '€',
            taxRate: 0.23,
            trackInventory: true,
            allowNegativeStock: false,
            autoClearCart: { enabled: false, timeoutMinutes: 0 },
        },
        display: { itemsPerPage: 20, showEmployeePhotos: true, compactMode: false },
        company: {
            name: 'Co',
            address: '',
            postalCode: '',
            city: '',
            taxNumber: '',
            certificationNumber: 'SHOULD_NOT_APPEAR',
            softwareCertNumber: 'ALSO_STRIPPED',
        },
        receipt: {
            defaultDocumentType: 'FATURA_SIMPLIFICADA',
            counterLabel: '1',
            seriesProfiles: defaultSeriesProfiles(),
            printDuplicateOnIssue: false,
        },
        fiscal: {
            hashControlVersion: '99',
            privateKeyPem: 'STORED',
            trainingMode: false,
        },
    });

    it('applyFiscalSecretsFromEnv fills certification, software cert, hash and PEM from env (overrides stored)', () => {
        const out = applyFiscalSecretsFromEnv(baseSettings(), {
            VITE_FISCAL_CERTIFICATION_NUMBER: ' 55/AT ',
            VITE_FISCAL_SOFTWARE_CERT_NUMBER: 'SW-1',
            VITE_FISCAL_HASH_CONTROL_VERSION: ' 3 ',
            VITE_FISCAL_RSA_PRIVATE_KEY_PEM: '-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----',
        });
        expect(out.company.certificationNumber).toBe('55/AT');
        expect(out.company.softwareCertNumber).toBe('SW-1');
        expect(out.fiscal.hashControlVersion).toBe('3');
        expect(out.fiscal.privateKeyPem).toBe('-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----');
    });

    it('applyFiscalSecretsFromEnv defaults hash to 1 when env unset', () => {
        const out = applyFiscalSecretsFromEnv(baseSettings(), {});
        expect(out.fiscal.hashControlVersion).toBe('1');
        expect(out.company.certificationNumber).toBeUndefined();
        expect(out.fiscal.privateKeyPem).toBeUndefined();
    });

    it('settingsWithoutPersistedFiscalSecrets clears secret fields', () => {
        const stripped = settingsWithoutPersistedFiscalSecrets(baseSettings());
        expect(stripped.company.certificationNumber).toBeUndefined();
        expect(stripped.company.softwareCertNumber).toBeUndefined();
        expect(stripped.fiscal.privateKeyPem).toBeUndefined();
        expect(stripped.fiscal.hashControlVersion).toBe('1');
    });
});
