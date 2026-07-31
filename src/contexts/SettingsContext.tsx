import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';

import { applyFiscalSecretsFromEnv, settingsWithoutPersistedFiscalSecrets } from '../utils/fiscalEnvDefaults';
import type { ReceiptLogo } from '../utils/receiptLogo';
import { RECEIPT_LOGO_CHANGED_EVENT } from '../services/receiptBrandingSync';
import { COMPANY_PROFILE_CHANGED_EVENT } from '../services/companyProfileSync';
import type { FiscalSeriesDocKey, ReceiptSeriesProfile } from '../fiscal/receiptSeriesProfile';
import { defaultSeriesProfiles, normalizeStoredSeriesProfile } from '../fiscal/receiptSeriesProfile';
import { normalizeReceiptLanguage, type ReceiptLanguage } from '../utils/receiptLanguage';
import { type OperatingCountry, normalizeCountry, setActiveCountry } from '../lib/countryProfile';

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
    if (!patch) {
        return {
            ...prev,
            printDuplicateOnIssue: false,
            defaultDocumentType: 'FATURA',
            receiptLanguage: normalizeReceiptLanguage(prev.receiptLanguage),
        };
    }
    return {
        ...prev,
        ...patch,
        defaultDocumentType: 'FATURA',
        printDuplicateOnIssue: false,
        receiptLanguage: patch.receiptLanguage
            ? normalizeReceiptLanguage(patch.receiptLanguage)
            : prev.receiptLanguage,
        seriesProfiles: mergeSeriesProfilesDeep(prev.seriesProfiles, patch.seriesProfiles),
    };
}

function defaultVendusSettings(): VendusFiscalSettings {
    return {
        enabled: false,
        mode: 'tests',
        registerId: '',
        storeId: '',
        documentType: 'FT',
        output: 'html',
        paymentMethodIds: {
            cash: '',
            card: '',
            mixed: '',
        },
        exemptTax: {
            code: 'M99',
            law: '',
        },
    };
}

function defaultInvoiceXpressSettings(): InvoiceXpressFiscalSettings {
    return {
        enabled: false,
        accountName: '',
        documentType: 'invoice_receipt',
        finalizeOnIssue: true,
        sequenceId: '',
        exemptTax: {
            code: 'M99',
            law: '',
        },
    };
}

function defaultFiskalySettings(): FiskalyFiscalSettings {
    return {
        enabled: false,
        environment: 'test',
        taxpayerId: '',
        locationId: '',
        systemId: '',
        seriesId: '',
        documentType: 'FT',
        exemptTax: {
            code: 'M99',
            law: '',
        },
    };
}

function mergeFiscalBranch(
    prev: SystemSettings['fiscal'],
    patch?: DeepPartial<SystemSettings['fiscal']>
): SystemSettings['fiscal'] {
    if (!patch) return prev;
    return {
        ...prev,
        ...patch,
        vendus: {
            ...prev.vendus,
            ...(patch.vendus || {}),
            paymentMethodIds: {
                ...prev.vendus.paymentMethodIds,
                ...(patch.vendus?.paymentMethodIds || {}),
            },
            exemptTax: {
                ...prev.vendus.exemptTax,
                ...(patch.vendus?.exemptTax || {}),
            },
        },
        invoicexpress: {
            ...prev.invoicexpress,
            ...(patch.invoicexpress || {}),
            exemptTax: {
                ...prev.invoicexpress.exemptTax,
                ...(patch.invoicexpress?.exemptTax || {}),
            },
        },
        fiskaly: {
            ...prev.fiskaly,
            ...(patch.fiskaly || {}),
            exemptTax: {
                ...prev.fiskaly.exemptTax,
                ...(patch.fiskaly?.exemptTax || {}),
            },
        },
        accounting: {
            ...prev.accounting,
            ...(patch.accounting || {}),
        },
    };
}

function migrateStoredReceipt(raw: unknown, defaults: SystemSettings['receipt']): SystemSettings['receipt'] {
    if (!raw || typeof raw !== 'object') return defaults;

    const r = raw as Record<string, unknown>;
    if (r.seriesProfiles && typeof r.seriesProfiles === 'object') {
        const sp = r.seriesProfiles as Partial<Record<FiscalSeriesDocKey, Partial<ReceiptSeriesProfile>>>;
        return {
            defaultDocumentType: 'FATURA',
            counterLabel: typeof r.counterLabel === 'string' ? r.counterLabel : defaults.counterLabel,
            printDuplicateOnIssue: false,
            receiptLanguage: normalizeReceiptLanguage(r.receiptLanguage ?? defaults.receiptLanguage),
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
        defaultDocumentType: 'FATURA',
        counterLabel: typeof r.counterLabel === 'string' ? r.counterLabel : defaults.counterLabel,
        printDuplicateOnIssue: false,
        receiptLanguage: normalizeReceiptLanguage(r.receiptLanguage ?? defaults.receiptLanguage),
        seriesProfiles: { FS: { ...dup }, FT: { ...dup }, NC: { ...dup } },
    };
}

export interface SystemSettings {
    /**
     * Operating country — the single source of truth for every PT vs ES difference
     * (fiscal issuer set, VAT/IVA rates, tax-id format, locale/formatting, default UI +
     * receipt language, postal/phone shape). See src/lib/countryProfile.ts.
     */
    operatingCountry: OperatingCountry;
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
    loyalty: {
        enabled: boolean;
        programName: string;
        pointsPerEuroEarned: number;
        pointsPerEuroRedeemed: number;
        vouchersEnabled: boolean;
        vouchers: LoyaltyVoucher[];
    };
    orderQueue: {
        enabled: boolean;
        prefix: string;
        startNumber: number;
        padding: number;
        readyRetentionMinutes: number;
    };
    hr: {
        defaultAnnualHolidayDays: number;
        defaultWeeklyHours: number;
        monthlyHolidayAccrualRate: number;
        contractExpiryWarningDays: number;
        requirePinForClocking: boolean;
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
        /** Printed at the top of every receipt. Prepared once when chosen
         *  (utils/receiptLogo.ts) because the ESC/POS builder is synchronous.
         *  Per-device: settings live in localStorage and are not synced. */
        logo?: ReceiptLogo;
    };
    receipt: {
        defaultDocumentType: 'FATURA' | 'FATURA_SIMPLIFICADA';
        counterLabel: string;
        /**
         * FS = fatura simplificada, FT = fatura, NC = série de notas de crédito (registo AT).
         * NC tem série e cadeia AT próprias (`seriesProfiles.NC`); referencia o documento original via settled invoice.
         */
        seriesProfiles: Record<FiscalSeriesDocKey, ReceiptSeriesProfile>;
        printDuplicateOnIssue?: boolean;
        /** Printed receipt language (thermal preview / reprints); independent of app UI language. */
        receiptLanguage: ReceiptLanguage;
    };
    /** Portugal AT: signing, training mode, key version (HashControl). */
    fiscal: {
        issuer: 'local_at' | 'vendus' | 'invoicexpress' | 'fiskaly' | 'sign_es';
        hashControlVersion: string;
        /** RSA private key PKCS#8 PEM — dev/local; prefer secure storage in production */
        privateKeyPem?: string;
        trainingMode: boolean;
        vendus: VendusFiscalSettings;
        invoicexpress: InvoiceXpressFiscalSettings;
        fiskaly: FiskalyFiscalSettings;
        /**
         * Automatic delivery of the periodic SAF-T file to the accountant by email.
         * NOTE: only the configuration is wired today — no mail transport (SMTP /
         * provider API) is connected yet, so nothing is actually sent.
         */
        accounting: {
            autoEmailSaft: boolean;
            accountantEmail: string;
            frequency: 'monthly' | 'quarterly';
        };
    };
}

export interface LoyaltyVoucher {
    id: string;
    code: string;
    description: string;
    type: 'percentage' | 'fixed';
    value: number;
    enabled: boolean;
}

export interface VendusFiscalSettings {
    enabled: boolean;
    mode: 'normal' | 'tests';
    registerId: string;
    storeId?: string;
    documentType: 'FT' | 'FS' | 'FR';
    output: 'auto' | 'pdf_url' | 'pdf' | 'html' | 'escpos' | 'tpasibs';
    paymentMethodIds: {
        cash?: string;
        card?: string;
        mixed?: string;
    };
    exemptTax: {
        code?: string;
        law?: string;
    };
}

/**
 * InvoiceXpress (cloud, PT-certified). API key lives in the `invoicexpress-fiscal`
 * edge function env (INVOICEXPRESS_API_KEY); only non-secret routing config is stored here.
 */
export interface InvoiceXpressFiscalSettings {
    enabled: boolean;
    /** Subdomain: `{accountName}.app.invoicexpress.com`. */
    accountName: string;
    /** Maps to the document endpoint + SAF-T document type. */
    documentType: 'invoice_receipt' | 'simplified_invoice' | 'invoice';
    /** Change-state the document to `finalized` immediately after creation. */
    finalizeOnIssue: boolean;
    /** Optional fixed série id (InvoiceXpress `sequence_id`); blank = account default. */
    sequenceId?: string;
    exemptTax: {
        code?: string;
        law?: string;
    };
}

/**
 * Fiskaly SIGN PT — the Portugal service of fiskaly's UNIFIED API (shared hosts,
 * not a specialized per-country API like SIGN ES). API key/secret live in the
 * `fiskaly-fiscal` edge function env (FISKALY_API_KEY / FISKALY_API_SECRET);
 * routing config is stored here. ⚠️ fiskaly claims AT certification but publishes
 * no certificate number (REGISTER B5/B14) — `local_at` stays the PT primary issuer.
 */
export interface FiskalyFiscalSettings {
    enabled: boolean;
    /** `test` → test.api.fiskaly.com, `live` → live.api.fiskaly.com. */
    environment: 'test' | 'live';
    /** Fiskaly unified-API resource hierarchy: taxpayer → location → system. */
    taxpayerId: string;
    locationId: string;
    systemId: string;
    /**
     * Client-chosen series LABEL (there is no series resource in the unified API —
     * document numbers/series are taxpayer-generated, charset [0-9A-Z_/\-.]).
     */
    seriesId?: string;
    documentType: 'FT' | 'FS' | 'FR';
    exemptTax: {
        code?: string;
        law?: string;
    };
}

export type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Strip AT secrets from partial updates — values come only from env via applyFiscalSecretsFromEnv on load. */
function sanitizeSettingsUpdatePatch(patch: DeepPartial<SystemSettings>): DeepPartial<SystemSettings> {
    const next: DeepPartial<SystemSettings> = { ...patch };
    if (patch.company) {
        const companyRest = { ...patch.company };
        delete companyRest.certificationNumber;
        delete companyRest.softwareCertNumber;
        next.company = companyRest as DeepPartial<SystemSettings['company']>;
    }
    if (patch.fiscal) {
        const fiscalRest = { ...patch.fiscal };
        delete fiscalRest.privateKeyPem;
        delete fiscalRest.hashControlVersion;
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
    operatingCountry: 'PT',
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
    loyalty: {
        enabled: false,
        programName: 'Loyalty',
        pointsPerEuroEarned: 1,
        pointsPerEuroRedeemed: 100,
        vouchersEnabled: true,
        vouchers: [],
    },
    orderQueue: {
        enabled: true,
        prefix: '',
        startNumber: 1,
        padding: 3,
        readyRetentionMinutes: 10,
    },
    hr: {
        defaultAnnualHolidayDays: 22,
        defaultWeeklyHours: 40,
        monthlyHolidayAccrualRate: 1.5,
        contractExpiryWarningDays: 60,
        requirePinForClocking: true,
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
        defaultDocumentType: 'FATURA',
        counterLabel: 'BALCÃO 1',
        /** Fatura simplificada, fatura completa, e série NC (cadeia e numeração independentes). */
        seriesProfiles: defaultSeriesProfiles(),
        printDuplicateOnIssue: false,
        receiptLanguage: 'pt',
    },
    fiscal: {
        issuer: 'local_at',
        hashControlVersion: '1',
        privateKeyPem: undefined,
        trainingMode: false,
        vendus: defaultVendusSettings(),
        invoicexpress: defaultInvoiceXpressSettings(),
        fiskaly: defaultFiskalySettings(),
        accounting: {
            autoEmailSaft: false,
            accountantEmail: '',
            frequency: 'monthly',
        },
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
                    loyalty: {
                        ...state.settings.loyalty,
                        ...(action.payload.loyalty || {}),
                        vouchers:
                            action.payload.loyalty?.vouchers === undefined
                                ? state.settings.loyalty.vouchers
                                : (action.payload.loyalty.vouchers as LoyaltyVoucher[]),
                    },
                    orderQueue: {
                        ...state.settings.orderQueue,
                        ...(action.payload.orderQueue || {}),
                    },
                    hr: {
                        ...state.settings.hr,
                        ...(action.payload.hr || {}),
                        requirePinForClocking: true,
                    },
                    company: {
                        ...state.settings.company,
                        ...(action.payload.company || {}),
                    },
                    receipt: mergeReceiptBranch(state.settings.receipt, action.payload.receipt),
                    fiscal: mergeFiscalBranch(state.settings.fiscal, action.payload.fiscal),
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
            loyalty: {
                ...state.settings.loyalty,
                ...(patch.loyalty || {}),
                vouchers:
                    patch.loyalty?.vouchers === undefined
                        ? state.settings.loyalty.vouchers
                        : (patch.loyalty.vouchers as LoyaltyVoucher[]),
            },
            orderQueue: {
                ...state.settings.orderQueue,
                ...(patch.orderQueue || {}),
            },
            hr: {
                ...state.settings.hr,
                ...(patch.hr || {}),
                requirePinForClocking: true,
            },
            company: {
                ...state.settings.company,
                ...(patch.company || {}),
            },
            receipt: mergeReceiptBranch(state.settings.receipt, patch.receipt),
            fiscal: mergeFiscalBranch(state.settings.fiscal, patch.fiscal),
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
                        operatingCountry: normalizeCountry(parsedSettings.operatingCountry),
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
                        loyalty: {
                            ...defaultSettings.loyalty,
                            ...(parsedSettings.loyalty || {}),
                            vouchers: Array.isArray(parsedSettings.loyalty?.vouchers)
                                ? parsedSettings.loyalty.vouchers
                                : defaultSettings.loyalty.vouchers,
                        },
                        orderQueue: {
                            ...defaultSettings.orderQueue,
                            ...(parsedSettings.orderQueue || {}),
                        },
                        hr: {
                            ...defaultSettings.hr,
                            ...(parsedSettings.hr || {}),
                            requirePinForClocking: true,
                        },
                        company: {
                            ...defaultSettings.company,
                            ...(parsedSettings.company || {}),
                        },
                        receipt: migrateStoredReceipt(parsedSettings.receipt, defaultSettings.receipt),
                        fiscal: mergeFiscalBranch(defaultSettings.fiscal, parsedSettings.fiscal),
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

    // Keep the module-level active country (used by country-aware formatters/validators) and a
    // lightweight localStorage mirror in sync. The mirror lets LanguageContext — which is mounted
    // A sync that pulls a new tenant logo writes it straight into the persisted
    // settings blob (services/receiptBrandingSync). Mirror it into live state so
    // a till that syncs mid-shift prints the new logo without a reload.
    useEffect(() => {
        const onLogoChanged = (event: Event) => {
            const logo = (event as CustomEvent).detail as SystemSettings['company']['logo'] | null;
            dispatch({ type: 'UPDATE_SETTINGS', payload: { company: { logo: logo ?? undefined } } });
        };
        window.addEventListener(RECEIPT_LOGO_CHANGED_EVENT, onLogoChanged);
        return () => window.removeEventListener(RECEIPT_LOGO_CHANGED_EVENT, onLogoChanged);
    }, []);

    // Same bridge for the company block (services/companyProfileSync). The
    // server owns it now, so a till that syncs mid-shift starts printing the
    // corrected header without a reload.
    useEffect(() => {
        const onCompanyChanged = (event: Event) => {
            const company = (event as CustomEvent).detail as Partial<SystemSettings['company']>;
            dispatch({ type: 'UPDATE_SETTINGS', payload: { company } });
        };
        window.addEventListener(COMPANY_PROFILE_CHANGED_EVENT, onCompanyChanged);
        return () => window.removeEventListener(COMPANY_PROFILE_CHANGED_EVENT, onCompanyChanged);
    }, []);

    // ABOVE SettingsProvider — resolve the country's default language at init time.
    useEffect(() => {
        setActiveCountry(state.settings.operatingCountry);
        try {
            localStorage.setItem('operating_country', state.settings.operatingCountry);
        } catch {
            /* non-fatal */
        }
    }, [state.settings.operatingCountry]);

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
