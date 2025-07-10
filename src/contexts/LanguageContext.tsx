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

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Initialize language from localStorage or i18next current language
    const [language, setLanguageState] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('language') || i18n.language || 'en';
        }
        return 'en';
    });

    useEffect(() => {
        i18n.changeLanguage(language);
        if (typeof window !== 'undefined') {
            localStorage.setItem('language', language);
        }
    }, [language]);

    const setLanguage = (lang: string) => {
        setLanguageState(lang);
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => useContext(LanguageContext); 