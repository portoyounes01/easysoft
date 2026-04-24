import React from 'react';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';

interface LanguageSwitcherProps {
    className?: string;
    /** Dark sidebar style (matches `Sidebar` footer actions) */
    variant?: 'default' | 'sidebar';
    /** When sidebar is collapsed: icon-only + tooltip */
    collapsed?: boolean;
}

const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
    className,
    variant = 'default',
    collapsed = false,
}) => {
    const { language, setLanguage } = useLanguage();
    const { t } = useTranslation();

    const toggleLanguage = () => {
        const newLang = language === 'en' ? 'pt' : 'en';
        setLanguage(newLang);
    };

    if (variant === 'sidebar') {
        const label = t('common.language');
        return (
            <button
                type="button"
                onClick={toggleLanguage}
                className={`w-full flex items-center px-4 py-3 min-h-[60px] text-slate-300 hover:bg-slate-700 hover:text-white rounded-lg transition-all duration-200 hover:transform hover:scale-105 group relative mb-3 border border-slate-600/40 hover:border-slate-500 ${collapsed ? 'justify-center space-x-0' : 'space-x-3'
                    } ${className || ''}`}
                title={collapsed ? `${label} (${language.toUpperCase()})` : undefined}
                aria-label={`${label}: ${language === 'en' ? 'English' : 'Português'}`}
            >
                <Languages className="w-5 h-5 flex-shrink-0" />
                {!collapsed && (
                    <>
                        <span className="font-medium flex-1 text-left">{label}</span>
                        <span className="text-xs font-semibold bg-slate-600 px-2 py-1.5 rounded-md tabular-nums">
                            {language.toUpperCase()}
                        </span>
                    </>
                )}
                {collapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                        {label} ({language.toUpperCase()})
                    </div>
                )}
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={toggleLanguage}
            className={`bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1 rounded-lg text-xs font-semibold transition-colors min-h-[44px] min-w-[44px] ${className || ''}`}
        >
            {language.toUpperCase()}
        </button>
    );
};

export default LanguageSwitcher;
