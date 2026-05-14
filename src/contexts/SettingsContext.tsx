import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';

import { applyFiscalSecretsFromEnv, settingsWithoutPersistedFiscalSecrets } from '../utils/fiscalEnvDefaults';
import type { FiscalSeriesDocKey, ReceiptSeriesProfile } from '../fiscal/receiptSeriesProfile';
import { defaultSeriesProfiles, normalizeStoredSeriesProfile } from '../fiscal/receiptSeriesProfile';

function mergeSeriesProfilesDeep(
    base: Record<FiscalSeriesDocKey, ReceiptSeriesProfile>,
    patch?: Partial<Record<FiscalSeriesDocKey, Partial<ReceiptSeriesProfile>>>
): Record<FiscalSeriesDocKey, ReceiptSeriesProfile> {
    if (!patch) return base;
    const keys: FiscalSeriesDocKey[] = ['FS', 'FT', 'NC'];
    const out: Record<FiscalSeriesDocKey, ReceiptSeriesProfile> = { ...base };
    for (const k of keys) {
        const p = patch[k];
        if (p) {
            out[k] = { ...base[k], ...p };
        }
    }
    return out;
}

function mergeReceiptBranch(
    prev: SystemSettings['receipt'],
    patch?: DeepPartial<SystemSettings['receipt']>
): SystemSettings['receipt'] {
    if (!patch) return { ...prev, printDuplicateOnIssue: false };
    return {
        ...prev,
        ...patch,
        printDuplicateOnIssue: false,
        seriesProfiles: mergeSeriesProfilesDeep(prev.seriesProfiles, patch.seriesProfiles),
    };
}

function migrateStoredReceipt(raw: unknown, defaults: SystemSettings['receipt']): SystemSettings['receipt'] {
    if (!raw || typeof raw !== 'object') return defaults;

    const r = raw as Record<string, unknown>;
    if (r.seriesProfiles && typeof r.seriesProfiles === 'object') {
        const sp = r.seriesProfiles as Partial<Record<FiscalSeriesDocKey, Partial<ReceiptSeriesProfile>>>;
        return {
            defaultDocumentType:
                r.defaultDocumentType === 'FATURA' || r.defaultDocumentType === 'FATURA_SIMPLIFICADA'
                    ? r.defaultDocumentType
                    : defaults.defaultDocumentType,
            counterLabel: typeof r.counterLabel === 'string' ? r.counterLabel : defaults.counterLabel,
            printDuplicateOnIssue: false,
            seriesProfiles: {
                FS: normalizeStoredSeriesProfile(
                    { ...defaults.seriesProfiles.FS, ...sp.FS } as Parameters<typeof normalizeStoredSeriesProfile>[0],
                    defaults.seriesProfiles.FS
                ),
                FT: normalizeStoredSeriesProfile(
                    { ...defaults.seriesProfiles.FT, ...sp.FT } as Parameters<typeof normalizeStoredSeriesProfile>[0],
                    defaults.seriesProfiles.FT
                ),
                NC: normalizeStoredSeriesProfile(
                    { ...defaults.seriesProfiles.NC, ...sp.NC } as Parameters<typeof normalizeStoredSeriesProfile>[0],
                    defaults.seriesProfiles.NC
                ),
            },
        };
    }

    const slice = normalizeStoredSeriesProfile(
        {
            series: String(r.series ?? defaults.seriesProfiles.FS.series),
            seriesDescription:
                typeof r.seriesDescription === 'string'
                    ? r.seriesDescription
                    : defaults.seriesProfiles.FS.seriesDescription,
            numericWidth:
                typeof r.numericWidth === 'number' && Number.isFinite(r.numericWidth)
                    ? r.numericWidth
                    : defaults.seriesProfiles.FS.numericWidth,
            resetPolicy:
                r.resetPolicy === 'yearly' || r.resetPolicy === 'monthly'
                    ? r.resetPolicy
                    : defaults.seriesProfiles.FS.resetPolicy,
            lastSeriesKey: String(r.lastSeriesKey ?? ''),
            currentNumber:
                typeof r.currentNumber === 'number' && Number.isFinite(r.currentNumber)
                    ? r.currentNumber
                    : defaults.seriesProfiles.FS.currentNumber,
            atValidationCode: String(r.atValidationCode ?? defaults.seriesProfiles.FS.atValidationCode),
            atValidationCodeIssuedAt:
                typeof r.atValidationCodeIssuedAt === 'string' ? r.atValidationCodeIssuedAt : undefined,
            seriesDiscontinued: Boolean(r.seriesDiscontinued),
            ...(typeof r.seriesPrefix === 'string' ? { seriesPrefix: r.seriesPrefix } : {}),
        },
        defaults.seriesProfiles.FS
    );
    const dup = { ...slice };
    return {
        defaultDocumentType:
            r.defaultDocumentType === 'FATURA' || r.defaultDocumentType === 'FATURA_SIMPLIFICADA'
                ? r.defaultDocumentType
                : defaults.defaultDocumentType,
        counterLabel: typeof r.counterLabel === 'string' ? r.counterLabel : defaults.counterLabel,
        printDuplicateOnIssue: false,
        seriesProfiles: { FS: { ...dup }, FT: { ...dup }, NC: { ...dup } },
    };
}

export interface SystemSettings {
    autoLogout: {
        enabled: boolean;
        timeoutMinutes: number;
        warningSeconds: number;
        protectWhenCartHasItems: boolean;
    };
    pos: {
        currencySymbol: string;
        taxRate: number;
        /** When false, sales do not change stock levels and POS does not enforce stock limits. */
        trackInventory: boolean;
        allowNegativeStock: boolean;
        autoClearCart: {
            enabled: boolean;
            timeoutMinutes: number;
        };
    };
    display: {
        itemsPerPage: number;
        showEmployeePhotos: boolean;
        compactMode: boolean;
    };
    company: {
        name: string;
        address: string;
        postalCode: string;
        city: string;
        taxNumber: string;
        phone?: string;
        email?: string;
        slogan?: string;
        softwareInfo?: string;
        certificationNumber?: string;
        softwareCertNumber?: string; // AT software certification number
    };
    receipt: {
        defaultDocumentType: 'FATURA' | 'FATURA_SIMPLIFICADA';
        counterLabel: string;
        /**
         * FS = fatura simplificada, FT = fatura, NC = série de notas de crédito (registo AT).
         * A emissão de NC sobre uma venda continua a usar a cadeia/hash do documento original.
         */
        seriesProfiles: Record<FiscalSeriesDocKey, ReceiptSeriesProfile>;
        printDuplicateOnIssue?: boolean;
    };
    /** Portugal AT: signing, training mode, key version (HashControl). */
    fiscal: {
        hashControlVersion: string;
        /** RSA private key PKCS#8 PEM — dev/local; prefer secure storage in production */
        privateKeyPem?: string;
        trainingMode: boolean;
    };
}

export type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Strip AT secrets from partial updates — values come only from env via applyFiscalSecretsFromEnv on load. */
function sanitizeSettingsUpdatePatch(patch: DeepPartial<SystemSettings>): DeepPartial<SystemSettings> {
    const next: DeepPartial<SystemSettings> = { ...patch };
    if (patch.company) {
        const { certificationNumber: _cn, softwareCertNumber: _sn, ...companyRest } = patch.company;
        next.company = companyRest as DeepPartial<SystemSettings['company']>;
    }
    if (patch.fiscal) {
        const { privateKeyPem: _pem, hashControlVersion: _hc, ...fiscalRest } = patch.fiscal;
        next.fiscal = fiscalRest as DeepPartial<SystemSettings['fiscal']>;
    }
    return next;
}

interface SettingsState {
    settings: SystemSettings;
    isLoading: boolean;
}

interface SettingsContextType extends SettingsState {
    updateSettings: (settings: DeepPartial<SystemSettings>) => void;
    resetToDefaults: () => void;
}

const defaultSettings: SystemSettings = {
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
        autoClearCart: {
            enabled: false,
            timeoutMinutes: 0, // 0 means NEVER
        },
    },
    display: {
        itemsPerPage: 20,
        showEmployeePhotos: true,
        compactMode: false,
    },
    company: {
        name: 'Nome da Empresa',
        address: 'Morada',
        postalCode: '1000-001',
        city: 'Lisboa',
        taxNumber: '000000000',
        phone: '',
        email: '',
        slogan: 'Slogan',
        softwareInfo: '',
    },
    receipt: {
        defaultDocumentType: 'FATURA_SIMPLIFICADA',
        counterLabel: 'BALCÃO 1',
        /** Fatura simplificada, fatura completa, e série NC (registo AT); emissão de NC continua a cadeia do documento original. */
        seriesProfiles: defaultSeriesProfiles(),
        printDuplicateOnIssue: false,
    },
    fiscal: {
        hashControlVersion: '1',
        privateKeyPem: undefined,
        trainingMode: false,
    },
};

type SettingsAction =
    | { type: 'LOAD_SETTINGS'; payload: SystemSettings }
    | { type: 'UPDATE_SETTINGS'; payload: DeepPartial<SystemSettings> }
    | { type: 'RESET_SETTINGS' }
    | { type: 'SET_LOADING'; payload: boolean };

const settingsReducer = (state: SettingsState, action: SettingsAction): SettingsState => {
    switch (action.type) {
        case 'LOAD_SETTINGS':
            return {
                ...state,
                settings: action.payload,
                isLoading: false,
            };
        case 'UPDATE_SETTINGS':
            return {
                ...state,
                settings: {
                    ...state.settings,
                    ...action.payload,
                    // Deep merge for nested objects
                    autoLogout: {
                        ...state.settings.autoLogout,
                        ...(action.payload.autoLogout || {}),
                    },
                    pos: {
                        ...state.settings.pos,
                        ...(action.payload.pos || {}),
                        autoClearCart: {
                            ...state.settings.pos.autoClearCart,
                            ...(action.payload.pos?.autoClearCart || {}),
                        },
                    },
                    display: {
                        ...state.settings.display,
                        ...(action.payload.display || {}),
                    },
                    company: {
                        ...state.settings.company,
                        ...(action.payload.company || {}),
                    },
                    receipt: mergeReceiptBranch(state.settings.receipt, action.payload.receipt),
                    fiscal: {
                        ...state.settings.fiscal,
                        ...(action.payload.fiscal || {}),
                    },
                },
            };
        case 'RESET_SETTINGS':
            return {
                ...state,
                settings: defaultSettings,
            };
        case 'SET_LOADING':
            return {
                ...state,
                isLoading: action.payload,
            };
        default:
            return state;
    }
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const cloneDefaultSettings = (): SystemSettings =>
    JSON.parse(JSON.stringify(defaultSettings)) as SystemSettings;

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(settingsReducer, {
        settings: applyFiscalSecretsFromEnv(settingsWithoutPersistedFiscalSecrets(cloneDefaultSettings())),
        isLoading: true,
    });

    const updateSettings = (newSettings: DeepPartial<SystemSettings>) => {
        const patch = sanitizeSettingsUpdatePatch(newSettings);
        dispatch({ type: 'UPDATE_SETTINGS', payload: patch });

        // Save to localStorage
        const updatedSettings = {
            ...state.settings,
            ...patch,
            // Deep merge for nested objects
            autoLogout: {
                ...state.settings.autoLogout,
                ...(patch.autoLogout || {}),
            },
            pos: {
                ...state.settings.pos,
                ...(patch.pos || {}),
                autoClearCart: {
                    ...state.settings.pos.autoClearCart,
                    ...(patch.pos?.autoClearCart || {}),
                },
            },
            display: {
                ...state.settings.display,
                ...(patch.display || {}),
            },
            company: {
                ...state.settings.company,
                ...(patch.company || {}),
            },
            receipt: mergeReceiptBranch(state.settings.receipt, patch.receipt),
            fiscal: {
                ...state.settings.fiscal,
                ...(patch.fiscal || {}),
            },
        };

        localStorage.setItem(
            'pos_system_settings',
            JSON.stringify(settingsWithoutPersistedFiscalSecrets(updatedSettings))
        );
    };

    const resetToDefaults = () => {
        const next = applyFiscalSecretsFromEnv(settingsWithoutPersistedFiscalSecrets(cloneDefaultSettings()));
        dispatch({ type: 'LOAD_SETTINGS', payload: next });
        localStorage.setItem('pos_system_settings', JSON.stringify(settingsWithoutPersistedFiscalSecrets(next)));
    };

    useEffect(() => {
        // Load settings from localStorage
        const loadSettings = () => {
            try {
                const storedSettings = localStorage.getItem('pos_system_settings');
                if (storedSettings) {
                    const parsedSettings = JSON.parse(storedSettings);
                    // Merge with defaults to ensure all required fields exist
                    const mergedSettings = {
                        ...defaultSettings,
                        ...parsedSettings,
                        autoLogout: {
                            ...defaultSettings.autoLogout,
                            ...(parsedSettings.autoLogout || {}),
                        },
                        pos: {
                            ...defaultSettings.pos,
                            ...(parsedSettings.pos || {}),
                            autoClearCart: {
                                ...defaultSettings.pos.autoClearCart,
                                ...(parsedSettings.pos?.autoClearCart || {}),
                            },
                        },
                        display: {
                            ...defaultSettings.display,
                            ...(parsedSettings.display || {}),
                        },
                        company: {
                            ...defaultSettings.company,
                            ...(parsedSettings.company || {}),
                        },
                        receipt: migrateStoredReceipt(parsedSettings.receipt, defaultSettings.receipt),
                        fiscal: {
                            ...defaultSettings.fiscal,
                            ...(parsedSettings.fiscal || {}),
                        },
                    };
                    dispatch({
                        type: 'LOAD_SETTINGS',
                        payload: applyFiscalSecretsFromEnv(settingsWithoutPersistedFiscalSecrets(mergedSettings)),
                    });
                } else {
                    dispatch({
                        type: 'LOAD_SETTINGS',
                        payload: applyFiscalSecretsFromEnv(settingsWithoutPersistedFiscalSecrets(cloneDefaultSettings())),
                    });
                }
            } catch (error) {
                console.error('Error loading settings:', error);
                dispatch({
                    type: 'LOAD_SETTINGS',
                    payload: applyFiscalSecretsFromEnv(settingsWithoutPersistedFiscalSecrets(cloneDefaultSettings())),
                });
            }
        };

        loadSettings();
    }, []);

    return (
        <SettingsContext.Provider value={{ ...state, updateSettings, resetToDefaults }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}; 