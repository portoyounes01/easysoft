import React, { useState, useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
    AlignLeft,
    Palette,
    MousePointerClick,
    Image,
    TextCursorInput,
    Table2 as TableNavIcon,
    Box,
    LayoutGrid,
    Sparkles,
    Layers,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TabButton } from '../components/ui/TabButton';
import ColorPalette from '../components/DesignSystem2/ColorPalette';
import Typography from '../components/DesignSystem2/Typography';
import Buttons2 from '../components/DesignSystem2/Buttons2';
import InputFields from '../components/DesignSystem2/InputFields';
import Elevation from '../components/DesignSystem2/Elevation';
import Table2 from '../components/DesignSystem2/Table2';
import Premade2 from '../components/DesignSystem2/Premade2';
import '../styles/design-system-2-scope.css';
import DesignSystem2Customizer from '../components/DesignSystem2/DesignSystem2Customizer';
import {
    useDesignSystem2Customization,
} from '../contexts/DesignSystem2CustomizationContext';

type Section =
    | 'text-style'
    | 'color-style'
    | 'buttons'
    | 'icons'
    | 'input-fields'
    | 'table'
    | 'base'
    | 'premade'
    | 'illustration'
    | 'elevation';

const DesignSystem2Inner: React.FC = () => {
    const { t } = useTranslation();
    const { layoutClasses, visualStyle, prefs } = useDesignSystem2Customization();
    const [activeSection, setActiveSection] = useState<Section>('text-style');

    /** Core Colors uses Tailwind hue scales tied to Customize — keep outside `.ds2-visual-scope` so scope `!important` rules never flatten swatches. */
    const colorDocsOutsidePreviewScope = activeSection === 'color-style';

    const navItems: { id: Section; label: string; icon: LucideIcon }[] = useMemo(
        () => [
            { id: 'text-style', label: t('designSystemPage.nav.textStyle'), icon: AlignLeft },
            { id: 'color-style', label: t('designSystemPage.nav.colorStyle'), icon: Palette },
            { id: 'buttons', label: t('designSystemPage.nav.buttons'), icon: MousePointerClick },
            { id: 'icons', label: t('designSystemPage.nav.icons'), icon: Image },
            { id: 'input-fields', label: t('designSystemPage.nav.inputFields'), icon: TextCursorInput },
            { id: 'table', label: t('designSystemPage.nav.table'), icon: TableNavIcon },
            { id: 'base', label: t('designSystemPage.nav.base'), icon: Box },
            { id: 'premade', label: t('designSystemPage.nav.premade'), icon: LayoutGrid },
            { id: 'illustration', label: t('designSystemPage.nav.illustration'), icon: Sparkles },
            { id: 'elevation', label: t('designSystemPage.nav.elevation'), icon: Layers },
        ],
        [t]
    );

    const renderSection = () => {
        switch (activeSection) {
            case 'color-style':
                return (
                    <ColorPalette
                        customizationPrimaryHue={prefs.primaryColorId}
                        customizationSecondaryHue={prefs.secondaryColorId}
                        customizationNeutralFamily={prefs.neutralFamilyId}
                    />
                );
            case 'text-style':
                return <Typography />;
            case 'buttons':
                return <Buttons2 />;
            case 'input-fields':
                return <InputFields />;
            case 'elevation':
                return <Elevation />;
            case 'table':
                return <Table2 />;
            case 'premade':
                return <Premade2 />;
            default:
                return (
                    <div className="p-8 text-center text-gray-500">
                        <h2 className="text-xl font-semibold mb-2">{t('designSystemPage.comingSoon')}</h2>
                        <p>
                            {t('designSystemPage.sectionUnderConstruction', {
                                section: activeSection.replace('-', ' '),
                            })}
                        </p>
                    </div>
                );
        }
    };

    return (
        <div className={`flex h-screen min-h-0 min-w-0 ${layoutClasses.rootBg}`}>
            <div
                className={`ds2-visual-scope ${layoutClasses.sidebarW} shrink-0 flex flex-col bg-gradient-to-b from-slate-900 to-slate-800 text-white shadow-2xl border-r border-slate-800 overflow-y-auto`}
                style={visualStyle}
                data-ds2-neutral={prefs.neutralFamilyId}
            >
                <div className="p-6 border-b border-slate-700">
                    <h1 className="text-2xl font-bold text-white">{t('designSystemPage.title')} (2)</h1>
                    <p className="text-sm text-slate-400 mt-1">{t('designSystemPage.subtitle')} — referenced UI</p>
                </div>
                <nav className="flex-1 p-4">
                    <ul className="space-y-2">
                        {navItems.map((item) => (
                            <li key={item.id}>
                                <TabButton
                                    variant="sidebar"
                                    active={activeSection === item.id}
                                    label={item.label}
                                    icon={item.icon}
                                    onClick={() => setActiveSection(item.id)}
                                    type="button"
                                    className="w-full justify-start"
                                />
                            </li>
                        ))}
                    </ul>
                </nav>
            </div>

            <div
                className={
                    colorDocsOutsidePreviewScope
                        ? 'flex-1 overflow-y-auto min-w-0'
                        : 'ds2-visual-scope flex-1 overflow-y-auto min-w-0'
                }
                style={colorDocsOutsidePreviewScope ? undefined : visualStyle}
                data-ds2-neutral={colorDocsOutsidePreviewScope ? undefined : prefs.neutralFamilyId}
            >
                <div className={`${layoutClasses.mainScrollPadding}`}>
                    <div className={`${layoutClasses.contentColumnMaxW} mx-auto`}>
                        <div className="mb-8">
                            <h2 className="text-3xl font-bold text-gray-900 capitalize">
                                {navItems.find((i) => i.id === activeSection)?.label ?? activeSection}
                            </h2>
                        </div>
                        <div className={layoutClasses.previewSurface}>{renderSection()}</div>
                    </div>
                </div>
            </div>

            <DesignSystem2Customizer />
        </div>
    );
};

export default DesignSystem2Inner;
