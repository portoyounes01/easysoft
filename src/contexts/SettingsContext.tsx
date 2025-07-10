import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';

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
}

interface SettingsState {
    settings: SystemSettings;
    isLoading: boolean;
}

interface SettingsContextType extends SettingsState {
    updateSettings: (settings: Partial<SystemSettings>) => void;
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
};

type SettingsAction =
    | { type: 'LOAD_SETTINGS'; payload: SystemSettings }
    | { type: 'UPDATE_SETTINGS'; payload: Partial<SystemSettings> }
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

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(settingsReducer, {
        settings: defaultSettings,
        isLoading: true,
    });

    const updateSettings = (newSettings: Partial<SystemSettings>) => {
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
        };

        localStorage.setItem('pos_system_settings', JSON.stringify(updatedSettings));
    };

    const resetToDefaults = () => {
        dispatch({ type: 'RESET_SETTINGS' });
        localStorage.setItem('pos_system_settings', JSON.stringify(defaultSettings));
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
                    };
                    dispatch({ type: 'LOAD_SETTINGS', payload: mergedSettings });
                } else {
                    dispatch({ type: 'LOAD_SETTINGS', payload: defaultSettings });
                }
            } catch (error) {
                console.error('Error loading settings:', error);
                dispatch({ type: 'LOAD_SETTINGS', payload: defaultSettings });
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