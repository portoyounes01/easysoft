type FiscalEnv = Record<string, string | boolean | undefined>;

/**
 * Optional dev/local default for Settings → Fiscal AT → PEM field.
 * Set `VITE_FISCAL_RSA_PRIVATE_KEY_PEM` in `.env` (never commit real keys).
 * Vite inlines `VITE_*` at build time — do not use production secrets here.
 */
export function getFiscalRsaPrivateKeyPemFromEnv(env: FiscalEnv = import.meta.env as FiscalEnv): string | undefined {
    const raw = env.VITE_FISCAL_RSA_PRIVATE_KEY_PEM;
    if (raw === undefined || raw === null || typeof raw !== 'string') {
        return undefined;
    }
    const t = raw.trim();
    if (!t) {
        return undefined;
    }
    return t.replace(/\\n/g, '\n');
}

/** When no PEM is stored in settings, apply env default (if any). */
export function mergeFiscalPemFromEnv<T extends { fiscal: { privateKeyPem?: string } }>(
    settings: T,
    env: FiscalEnv = import.meta.env as FiscalEnv
): T {
    const envPem = getFiscalRsaPrivateKeyPemFromEnv(env);
    if (!envPem) {
        return settings;
    }
    const current = settings.fiscal.privateKeyPem?.trim();
    if (current) {
        return settings;
    }
    return {
        ...settings,
        fiscal: {
            ...settings.fiscal,
            privateKeyPem: envPem,
        },
    };
}
