import { describe, it, expect } from 'vitest';

import { getFiscalRsaPrivateKeyPemFromEnv, mergeFiscalPemFromEnv } from '../src/utils/fiscalEnvDefaults';

describe('fiscalEnvDefaults', () => {
    it('getFiscalRsaPrivateKeyPemFromEnv unescapes literal \\n in env value', () => {
        const pem = getFiscalRsaPrivateKeyPemFromEnv({
            VITE_FISCAL_RSA_PRIVATE_KEY_PEM: 'line1\\nline2',
        });
        expect(pem).toBe('line1\nline2');
    });

    it('mergeFiscalPemFromEnv fills missing privateKeyPem from env', () => {
        const base = {
            fiscal: {
                hashControlVersion: '1',
                trainingMode: false as boolean,
            },
        };
        const out = mergeFiscalPemFromEnv(base, {
            VITE_FISCAL_RSA_PRIVATE_KEY_PEM: '-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----',
        });
        expect(out.fiscal.privateKeyPem).toBe('-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----');
    });

    it('mergeFiscalPemFromEnv does not override stored PEM', () => {
        const base = {
            fiscal: {
                hashControlVersion: '1',
                privateKeyPem: 'STORED',
                trainingMode: false,
            },
        };
        const out = mergeFiscalPemFromEnv(base, {
            VITE_FISCAL_RSA_PRIVATE_KEY_PEM: 'FROM_ENV',
        });
        expect(out.fiscal.privateKeyPem).toBe('STORED');
    });
});
