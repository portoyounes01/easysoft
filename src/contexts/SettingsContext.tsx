import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';

import { mergeFiscalPemFromEnv } from '../utils/fiscalEnvDefaults';

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
        series: string; // e.g., 'FAT2026' - series name for AT registration
        /** Shown on thermal header / SAFT human-readable series title. */
        seriesDescription?: string;
        seriesPrefix: string; // e.g., 'ABC' (legacy, for numbering)
        numericWidth: number; // e.g., 4 → 1000 minimum
        resetPolicy: 'monthly' | 'yearly';
        lastSeriesKey: string; // e.g., 'ABC-202508'
        currentNumber: number; // last allocated; starts at 999 so first becomes 1000
        defaultDocumentType: 'FATURA' | 'FATURA_SIMPLIFICADA';
        counterLabel: string; // e.g., 'BALCÃO 1'
        atValidationCode: string; // e.g., 'AT56789X1' - from AT portal registration
        /** ISO date when validation code was issued (optional; expiry warnings). */
        atValidationCodeIssuedAt?: string;
        seriesDiscontinued?: boolean;
        /** After checkout, show Duplicado receipt immediately after Original. */
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
        name: 'Your Company Lda',
        address: 'Your Address, 123',
        postalCode: '1000-001',
        city: 'Lisboa',
        taxNumber: '000000000',
        phone: '',
        email: '',
        slogan: 'Your slogan here',
        softwareInfo: 'Software ZSRest - www.zsrest.com',
        certificationNumber: '196/AT',
        softwareCertNumber: 'PTR-A-001', // Placeholder - AT software certification
    },
    receipt: {
        series: 'FAT2026', // Series name for AT registration
        seriesDescription: '',
        seriesPrefix: '',
        numericWidth: 4,
        resetPolicy: 'monthly',
        lastSeriesKey: '',
        currentNumber: 999, // start so that first allocation becomes 1000
        defaultDocumentType: 'FATURA_SIMPLIFICADA',
        counterLabel: 'BALCÃO 1',
        atValidationCode: 'AT0000001', // Placeholder - replace with real code from AT portal
        seriesDiscontinued: false,
        printDuplicateOnIssue: true,
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
                    receipt: {
                        ...state.settings.receipt,
                        ...(action.payload.receipt || {}),
                    },
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
        settings: mergeFiscalPemFromEnv(cloneDefaultSettings()),
        isLoading: true,
    });

    const updateSettings = (newSettings: DeepPartial<SystemSettings>) => {
        dispatch({ type: 'UPDATE_SETTINGS', payload: newSettings });

        // Save to localStorage
        const updatedSettings = {
            ...state.settings,
            ...newSettings,
            // Deep merge for nested objects
            autoLogout: {
                ...state.settings.autoLogout,
                ...(newSettings.autoLogout || {}),
            },
            pos: {
                ...state.settings.pos,
                ...(newSettings.pos || {}),
                autoClearCart: {
                    ...state.settings.pos.autoClearCart,
                    ...(newSettings.pos?.autoClearCart || {}),
                },
            },
            display: {
                ...state.settings.display,
                ...(newSettings.display || {}),
            },
            company: {
                ...state.settings.company,
                ...(newSettings.company || {}),
            },
            receipt: {
                ...state.settings.receipt,
                ...(newSettings.receipt || {}),
            },
            fiscal: {
                ...state.settings.fiscal,
                ...(newSettings.fiscal || {}),
            },
        };

        localStorage.setItem('pos_system_settings', JSON.stringify(updatedSettings));
    };

    const resetToDefaults = () => {
        const next = mergeFiscalPemFromEnv(cloneDefaultSettings());
        dispatch({ type: 'LOAD_SETTINGS', payload: next });
        localStorage.setItem('pos_system_settings', JSON.stringify(next));
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
                        receipt: {
                            ...defaultSettings.receipt,
                            ...(parsedSettings.receipt || {}),
                        },
                        fiscal: {
                            ...defaultSettings.fiscal,
                            ...(parsedSettings.fiscal || {}),
                        },
                    };
                    dispatch({ type: 'LOAD_SETTINGS', payload: mergeFiscalPemFromEnv(mergedSettings) });
                } else {
                    dispatch({ type: 'LOAD_SETTINGS', payload: mergeFiscalPemFromEnv(cloneDefaultSettings()) });
                }
            } catch (error) {
                console.error('Error loading settings:', error);
                dispatch({ type: 'LOAD_SETTINGS', payload: mergeFiscalPemFromEnv(cloneDefaultSettings()) });
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