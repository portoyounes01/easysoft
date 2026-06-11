import React from 'react';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';

interface LanguageSwitcherProps {
    className?: string;
    /** Sidebar style (matches `Sidebar` footer actions) */
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
    const languageCode = language.split(/[-_]/)[0].toLowerCase();
    const languageLabel = languageCode.toUpperCase();
    const languageName = languageCode === 'pt' ? 'Português' : 'English';

    const toggleLanguage = () => {
        const newLang = languageCode === 'en' ? 'pt' : 'en';
        setLanguage(newLang);
    };

    if (variant === 'sidebar') {
        const label = t('common.language');
        return (
            <button
                type="button"
                onClick={toggleLanguage}
                className={`group relative mb-2 flex min-h-touch-xs w-full items-center rounded-md border border-gray-200 bg-white px-2.5 py-2 text-gray-900 transition-all duration-200 hover:border-emerald-100 hover:bg-emerald-50 hover:text-emerald-700 ${collapsed ? 'justify-center space-x-0' : 'space-x-2.5'
                    } ${className || ''}`}
                title={collapsed ? `${label} (${languageLabel})` : undefined}
                aria-label={`${label}: ${languageName}`}
            >
                <Languages className="h-4 w-4 flex-shrink-0" />
                {!collapsed && (
                    <>
                        <span className="flex-1 text-left text-xs font-medium">{label}</span>
                        <span className="rounded bg-gray-100 px-2 py-1 text-[11px] font-semibold tabular-nums text-gray-500 group-hover:bg-white group-hover:text-emerald-700">
                            {languageLabel}
                        </span>
                    </>
                )}
                {collapsed && (
                    <div className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-900 opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100">
                        {label} ({languageLabel})
                    </div>
                )}
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={toggleLanguage}
            className={`bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1 rounded-lg text-xs font-semibold transition-colors min-h-touch-xs min-w-touch-xs ${className || ''}`}
            aria-label={`${t('common.language')}: ${languageName}`}
        >
            {languageLabel}
        </button>
    );
};

export default LanguageSwitcher;
