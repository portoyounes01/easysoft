import React, { createContext, useContext, useState, useEffect } from 'react';
import i18n from '../i18n';

export interface LanguageContextType {
    language: string;
    setLanguage: (lang: string) => void;
}

const LanguageContext = createContext<LanguageContextType>({
    language: 'en',
    setLanguage: () => { },
});

/** Default UI language for the operating country when the user hasn't explicitly picked one. */
const deriveCountryLanguage = (): string | null => {
    if (typeof window === 'undefined') return null;
    const c = (localStorage.getItem('operating_country') || '').toUpperCase();
    if (c === 'ES') return 'es';
    if (c === 'PT') return 'pt';
    return null;
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Init priority: explicit user choice (localStorage 'language') > operating-country default
    // (mirrored to localStorage by SettingsContext) > i18next detection > 'en'.
    const [language, setLanguageState] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            const explicit = localStorage.getItem('language');
            if (explicit) return explicit;
            return deriveCountryLanguage() || i18n.language || 'en';
        }
        return 'en';
    });

    // Apply to i18next, but do NOT persist here — persisting only on an explicit setLanguage()
    // keeps a country default from being frozen as if the user had chosen it.
    useEffect(() => {
        i18n.changeLanguage(language);
    }, [language]);

    const setLanguage = (lang: string) => {
        setLanguageState(lang);
        if (typeof window !== 'undefined') {
            localStorage.setItem('language', lang);
        }
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => useContext(LanguageContext); 