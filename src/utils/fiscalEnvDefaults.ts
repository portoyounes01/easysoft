import type { SystemSettings } from '../contexts/SettingsContext';

type FiscalEnv = Record<string, string | boolean | undefined>;

function trimEnvString(raw: string | undefined): string | undefined {
    if (raw === undefined || raw === null || typeof raw !== 'string') {
        return undefined;
    }
    const t = raw.trim();
    return t.length ? t : undefined;
}

/**
 * Optional PKCS#8/PKCS#1 PEM for AT signing when Electron secure key is not used.
 * Set `VITE_FISCAL_RSA_PRIVATE_KEY_PEM` in `.env` / deployment env (never commit real keys).
 * Vite inlines `VITE_*` at build time — treat production bundles as carrying secret material if set.
 */
export function getFiscalRsaPrivateKeyPemFromEnv(env: FiscalEnv = import.meta.env as FiscalEnv): string | undefined {
    const raw = env.VITE_FISCAL_RSA_PRIVATE_KEY_PEM;
    const t = trimEnvString(typeof raw === 'string' ? raw : undefined);
    if (!t) {
        return undefined;
    }
    return t.replace(/\\n/g, '\n');
}

export function getFiscalCertificationNumberFromEnv(env: FiscalEnv = import.meta.env as FiscalEnv): string | undefined {
    return trimEnvString(env.VITE_FISCAL_CERTIFICATION_NUMBER as string | undefined);
}

export function getFiscalSoftwareCertNumberFromEnv(env: FiscalEnv = import.meta.env as FiscalEnv): string | undefined {
    return trimEnvString(env.VITE_FISCAL_SOFTWARE_CERT_NUMBER as string | undefined);
}

/** HashControl for new documents; default `1` when unset (not read from persisted settings). */
export function getFiscalHashControlVersionFromEnv(env: FiscalEnv = import.meta.env as FiscalEnv): string {
    return trimEnvString(env.VITE_FISCAL_HASH_CONTROL_VERSION as string | undefined) ?? '1';
}

/**
 * AT secrets are not stored in localStorage or shown in Settings — only env (and Electron secure key for signing).
 */
export function applyFiscalSecretsFromEnv(
    settings: SystemSettings,
    env: FiscalEnv = import.meta.env as FiscalEnv
): SystemSettings {
    const pem = getFiscalRsaPrivateKeyPemFromEnv(env);
    const cert = getFiscalCertificationNumberFromEnv(env);
    const swCert = getFiscalSoftwareCertNumberFromEnv(env);
    const hash = getFiscalHashControlVersionFromEnv(env);

    return {
        ...settings,
        company: {
            ...settings.company,
            certificationNumber: cert,
            softwareCertNumber: swCert,
        },
        fiscal: {
            ...settings.fiscal,
            hashControlVersion: hash,
            privateKeyPem: pem,
        },
    };
}

/** Strip fiscal secrets before persisting settings so they never remain in localStorage. */
export function settingsWithoutPersistedFiscalSecrets(settings: SystemSettings): SystemSettings {
    return {
        ...settings,
        company: {
            ...settings.company,
            certificationNumber: undefined,
            softwareCertNumber: undefined,
        },
        fiscal: {
            ...settings.fiscal,
            hashControlVersion: '1',
            privateKeyPem: undefined,
        },
    };
}
