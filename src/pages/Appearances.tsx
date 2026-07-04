import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import {
    Check,
    Image as ImageIcon,
    Info,
    LayoutPanelLeft,
    Monitor,
    Palette,
    RotateCcw,
    ShoppingBag,
    SlidersHorizontal,
    Sun,
    Type,
} from 'lucide-react';
import { AdminActionButton } from '../components/ui/AdminActionButton';
import {
    useDesignSystem2Customization,
    type DesignSystem2BaseColorId,
    type DesignSystem2ColorChoiceId,
    type DesignSystem2Density,
    type DesignSystem2MaxWidth,
    type DesignSystem2NeutralFamilyId,
    type DesignSystem2PreviewChrome,
    type DesignSystem2RadiusPreset,
    type DesignSystem2SidebarWidth,
} from '../contexts/DesignSystem2CustomizationContext';
import {
    DESIGN_SYSTEM_2_ACCENTS,
    DESIGN_SYSTEM_2_BASE_OPTIONS,
    DESIGN_SYSTEM_2_NEUTRAL_OPTIONS,
} from '../theme/designSystem2VisualTokens';
import '../styles/design-system-2-scope.css';

type PreviewTab = 'order' | 'menu';

interface SegmentOption<T extends string> {
    value: T;
    label: string;
    icon?: LucideIcon;
}

interface SegmentedControlProps<T extends string> {
    options: SegmentOption<T>[];
    value: T;
    onChange: (value: T) => void;
    columnsClassName?: string;
}

interface SectionCardProps {
    icon: LucideIcon;
    title: string;
    description: string;
    children: React.ReactNode;
}

interface ColorSwatchButtonProps {
    color: {
        id: DesignSystem2ColorChoiceId;
        label: string;
    };
    selected: boolean;
    onClick: () => void;
}

interface BaseCanvasButtonProps {
    option: {
        id: DesignSystem2BaseColorId;
        label: string;
    };
    selected: boolean;
    onClick: () => void;
}

interface AppearancePreviewProps {
    previewTab: PreviewTab;
    onPreviewTabChange: (tab: PreviewTab) => void;
}

const COLOR_SWATCH_CLASSES: Record<DesignSystem2ColorChoiceId, string> = {
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    indigo: 'bg-indigo-500',
    violet: 'bg-violet-500',
    orange: 'bg-orange-500',
    rose: 'bg-rose-500',
    teal: 'bg-teal-500',
    slate: 'bg-slate-600',
};

const BASE_CANVAS_CLASSES: Record<DesignSystem2BaseColorId, string> = {
    white: 'bg-white',
    stone50: 'bg-stone-50',
    slate50: 'bg-slate-50',
    zinc50: 'bg-zinc-50',
    gray50: 'bg-gray-50',
};

function SegmentedControl<T extends string>({
    options,
    value,
    onChange,
    columnsClassName = 'grid-cols-1 sm:grid-cols-3',
}: SegmentedControlProps<T>) {
    return (
        <div className={`grid gap-3 ${columnsClassName}`}>
            {options.map((option) => {
                const Icon = option.icon;
                const selected = option.value === value;

                return (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onChange(option.value)}
                        className={`relative flex min-h-touch-sm items-center justify-center gap-2 border px-3 py-2 text-sm font-semibold transition-all duration-200 ds2-control-radius-lg ${selected
                            ? 'border-green-500 bg-green-50 text-green-600 shadow-sm'
                            : 'border-neutral-200 bg-white text-neutral-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'
                            }`}
                    >
                        {Icon && <Icon className="h-4 w-4" />}
                        <span>{option.label}</span>
                        {selected && <Check className="absolute right-3 h-4 w-4" />}
                    </button>
                );
            })}
        </div>
    );
}

const SectionCard: React.FC<SectionCardProps> = ({ icon: Icon, title, description, children }) => (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
                <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
                <p className="mt-1 text-sm leading-5 text-neutral-500">{description}</p>
            </div>
        </div>
        {children}
    </section>
);

const ColorSwatchButton: React.FC<ColorSwatchButtonProps> = ({ color, selected, onClick }) => {
    const { t } = useTranslation();
    return (
    <button
        type="button"
        aria-label={t('appearances.colorSwatchAriaLabel', { label: color.label })}
        aria-pressed={selected}
        onClick={onClick}
        className={`flex min-h-touch-sm items-center justify-center gap-3 rounded-2xl border bg-white px-3 transition-all duration-200 ${selected
            ? 'border-green-500 shadow-sm ring-2 ring-green-500/20'
            : 'border-neutral-200 hover:border-blue-200 hover:bg-blue-50'
            }`}
    >
        <span className={`flex h-11 w-11 items-center justify-center rounded-full ${COLOR_SWATCH_CLASSES[color.id]}`}>
            {selected && <Check className="h-5 w-5 text-white" />}
        </span>
        <span className="hidden text-sm font-semibold text-neutral-700 sm:inline">{color.label}</span>
    </button>
    );
};

const BaseCanvasButton: React.FC<BaseCanvasButtonProps> = ({ option, selected, onClick }) => (
    <button
        type="button"
        aria-pressed={selected}
        onClick={onClick}
        className={`rounded-2xl border bg-white p-3 text-left transition-all duration-200 ${selected
            ? 'border-green-500 shadow-sm ring-2 ring-green-500/20'
            : 'border-neutral-200 hover:border-blue-200 hover:bg-blue-50'
            }`}
    >
        <div className={`mb-3 h-20 rounded-xl border border-neutral-200 ${BASE_CANVAS_CLASSES[option.id]} p-3`}>
            <div className="h-full rounded-lg border border-neutral-200 bg-white/80 p-2">
                <div className="mb-2 h-3 w-2/3 rounded-full bg-neutral-200" />
                <div className="h-3 w-1/2 rounded-full bg-neutral-100" />
            </div>
        </div>
        <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-neutral-900">{option.label}</span>
            {selected && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white">
                    <Check className="h-4 w-4" />
                </span>
            )}
        </div>
    </button>
);

const OrderPreview: React.FC = () => {
    const { t } = useTranslation();
    const orderItems = [
        {
            id: 'cheeseburger',
            quantity: 2,
            name: t('appearances.orderItemDoubleCheeseburgerName'),
            detail: t('appearances.orderItemDoubleCheeseburgerDetail'),
            amount: '$10.98',
        },
        {
            id: 'fries',
            quantity: 1,
            name: t('appearances.orderItemFriesName'),
            detail: t('appearances.orderItemFriesDetail'),
            amount: '$2.49',
        },
        {
            id: 'coffee',
            quantity: 1,
            name: t('appearances.orderItemIcedCoffeeName'),
            detail: t('appearances.orderItemIcedCoffeeDetail'),
            amount: '$2.49',
        },
        {
            id: 'pie',
            quantity: 1,
            name: t('appearances.orderItemApplePieName'),
            detail: t('appearances.orderItemApplePieDetail'),
            amount: '$1.99',
        },
    ];

    return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
            <div className="flex items-baseline gap-3">
                <h3 className="text-2xl font-bold text-neutral-900">{t('appearances.orderPreviewTitle')}</h3>
                <span className="text-sm font-bold text-green-600">{t('appearances.orderPreviewEatIn')}</span>
            </div>
            <button
                type="button"
                aria-label={t('appearances.orderPreviewActionsAria')}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100 text-neutral-900"
            >
                ...
            </button>
        </div>

        <div className="space-y-4">
            {orderItems.map((item) => (
                <div key={item.id} className="grid grid-cols-[2rem_1fr_auto] gap-3 text-sm">
                    <span className="font-bold text-neutral-900">{item.quantity}</span>
                    <div>
                        <p className="font-bold text-neutral-900">{item.name}</p>
                        <p className="mt-1 text-neutral-500">{item.detail}</p>
                    </div>
                    <span className="font-bold text-neutral-900">{item.amount}</span>
                </div>
            ))}
        </div>

        <div className="my-6 border-t border-neutral-200 pt-4">
            <div className="mb-2 flex justify-between text-sm text-neutral-500">
                <span>{t('appearances.orderPreviewSubtotal')}</span>
                <span>$17.95</span>
            </div>
            <div className="mb-5 flex justify-between text-sm text-neutral-500">
                <span>{t('appearances.orderPreviewTax')}</span>
                <span>$1.48</span>
            </div>
            <div className="flex justify-between text-xl font-bold text-neutral-900">
                <span>{t('appearances.orderPreviewTotal')}</span>
                <span>$19.43</span>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
            <button type="button" className="min-h-touch-sm rounded-xl bg-neutral-100 px-4 font-bold text-neutral-900">
                {t('appearances.orderPreviewSaveOrder')}
            </button>
            <button
                type="button"
                className="min-h-touch-sm rounded-xl bg-green-500 px-4 font-bold text-white hover:bg-green-600"
            >
                {t('appearances.orderPreviewCharge')}
            </button>
        </div>
    </div>
    );
};

const MenuPreview: React.FC = () => {
    const { t } = useTranslation();
    const menuItems = [
        { id: 'houseBurger', name: t('appearances.menuItemHouseBurgerName'), price: '$8.95', badge: t('appearances.badgePopular') },
        { id: 'chickenWrap', name: t('appearances.menuItemChickenWrapName'), price: '$7.40', badge: t('appearances.badgeLunch') },
        { id: 'caesarSalad', name: t('appearances.menuItemCaesarSaladName'), price: '$6.80', badge: t('appearances.badgeFresh') },
        { id: 'coldBrew', name: t('appearances.menuItemColdBrewName'), price: '$3.20', badge: t('appearances.badgeDrink') },
    ];

    return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
            <div>
                <h3 className="text-2xl font-bold text-neutral-900">{t('appearances.menuPreviewTitle')}</h3>
                <p className="mt-1 text-sm text-neutral-500">{t('appearances.menuPreviewDescription')}</p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">{t('appearances.badgeLunch')}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
            {menuItems.map((item) => (
                <button
                    key={item.id}
                    type="button"
                    className="min-h-[9rem] rounded-2xl border border-neutral-200 bg-white p-3 text-left transition-all duration-200 hover:border-blue-200 hover:shadow-sm"
                >
                    <div className="mb-3 flex h-16 items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-neutral-50">
                        <ImageIcon className="h-6 w-6" />
                    </div>
                    <p className="font-bold text-neutral-900">{item.name}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-neutral-500">{item.price}</span>
                        <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-bold text-green-600">
                            {item.badge}
                        </span>
                    </div>
                </button>
            ))}
        </div>
    </div>
    );
};

const AppearancePreview: React.FC<AppearancePreviewProps> = ({ previewTab, onPreviewTabChange }) => {
    const { t } = useTranslation();
    const previewTabOptions: SegmentOption<PreviewTab>[] = [
        { value: 'order', label: t('appearances.previewTabOrder'), icon: ShoppingBag },
        { value: 'menu', label: t('appearances.previewTabMenu'), icon: ImageIcon },
    ];

    return (
    <aside className="space-y-5">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Monitor className="h-5 w-5" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-neutral-900">{t('appearances.previewTitle')}</h2>
                    <p className="mt-1 text-sm leading-5 text-neutral-500">{t('appearances.previewDescription')}</p>
                </div>
            </div>

            <SegmentedControl
                options={previewTabOptions}
                value={previewTab}
                onChange={onPreviewTabChange}
                columnsClassName="grid-cols-2"
            />

            <div className="mt-5">{previewTab === 'order' ? <OrderPreview /> : <MenuPreview />}</div>
        </section>

        <div className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600 shadow-sm">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" />
            <div>
                <p className="font-bold text-neutral-900">{t('appearances.savedOnDeviceTitle')}</p>
                <p className="mt-1">{t('appearances.savedOnDeviceDescription')}</p>
            </div>
        </div>
    </aside>
    );
};

const Appearances: React.FC = () => {
    const { prefs, setPrefs, resetPrefs, layoutClasses, visualStyle } = useDesignSystem2Customization();
    const { t } = useTranslation();
    const [previewTab, setPreviewTab] = useState<PreviewTab>('order');

    const densityOptions = useMemo<SegmentOption<DesignSystem2Density>[]>(
        () => [
            { value: 'compact', label: t('appearances.optionCompact') },
            { value: 'normal', label: t('appearances.optionDefault') },
            { value: 'spacious', label: t('appearances.optionSpacious') },
        ],
        [t]
    );

    const radiusOptions = useMemo<SegmentOption<DesignSystem2RadiusPreset>[]>(
        () => [
            { value: 'none', label: t('appearances.optionNone') },
            { value: 'sharp', label: t('appearances.optionSharp') },
            { value: 'default', label: t('appearances.optionDefault') },
            { value: 'soft', label: t('appearances.optionSoft') },
        ],
        [t]
    );

    const sidebarOptions = useMemo<SegmentOption<DesignSystem2SidebarWidth>[]>(
        () => [
            { value: 'sm', label: t('appearances.optionNarrow') },
            { value: 'md', label: t('appearances.optionDefault') },
            { value: 'lg', label: t('appearances.optionWide') },
        ],
        [t]
    );

    const maxWidthOptions = useMemo<SegmentOption<DesignSystem2MaxWidth>[]>(
        () => [
            { value: '5xl', label: '5xl' },
            { value: '6xl', label: '6xl' },
            { value: '7xl', label: '7xl' },
            { value: 'full', label: t('appearances.optionFull') },
        ],
        [t]
    );

    const previewSurfaceOptions = useMemo<SegmentOption<DesignSystem2PreviewChrome>[]>(
        () => [
            { value: 'roundedShadow', label: t('appearances.optionCard') },
            { value: 'roundedFlat', label: t('appearances.optionFlat') },
            { value: 'minimal', label: t('appearances.optionMinimal') },
        ],
        [t]
    );

    const neutralOptions = useMemo<SegmentOption<DesignSystem2NeutralFamilyId>[]>(
        () =>
            DESIGN_SYSTEM_2_NEUTRAL_OPTIONS.map((option) => ({
                value: option.id,
                label: option.label.replace(' (default)', ''),
            })),
        []
    );

    return (
        <div
            className={`ds2-visual-scope min-h-full ${layoutClasses.rootBg} px-4 py-6 sm:px-6 lg:px-8`}
            style={visualStyle}
            data-ds2-neutral={prefs.neutralFamilyId}
        >
            <div className={`${layoutClasses.contentColumnMaxW} mx-auto`}>
                <header className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-green-50 text-green-600">
                            <SlidersHorizontal className="h-6 w-6" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-3xl font-bold tracking-normal text-neutral-900">{t('appearances.pageTitle')}</h1>
                            <p className="mt-2 max-w-2xl text-base leading-6 text-neutral-500">
                                {t('appearances.pageDescription')}
                            </p>
                        </div>
                    </div>
                    <AdminActionButton
                        type="button"
                        variant="outline"
                        icon={RotateCcw}
                        label={t('appearances.resetButton')}
                        onClick={resetPrefs}
                        className="ds2-control-radius-lg shrink-0"
                    />
                </header>

                <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(24rem,0.9fr)]">
                    <div className="space-y-5">
                        <SectionCard
                            icon={Sun}
                            title={t('appearances.canvasTitle')}
                            description={t('appearances.canvasDescription')}
                        >
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {DESIGN_SYSTEM_2_BASE_OPTIONS.map((option) => (
                                    <BaseCanvasButton
                                        key={option.id}
                                        option={option}
                                        selected={prefs.baseColorId === option.id}
                                        onClick={() => setPrefs({ baseColorId: option.id })}
                                    />
                                ))}
                            </div>
                        </SectionCard>

                        <SectionCard
                            icon={Palette}
                            title={t('appearances.primaryColorTitle')}
                            description={t('appearances.primaryColorDescription')}
                        >
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                {DESIGN_SYSTEM_2_ACCENTS.map((color) => (
                                    <ColorSwatchButton
                                        key={color.id}
                                        color={color}
                                        selected={prefs.primaryColorId === color.id}
                                        onClick={() => setPrefs({ primaryColorId: color.id })}
                                    />
                                ))}
                            </div>
                        </SectionCard>

                        <SectionCard
                            icon={Palette}
                            title={t('appearances.interfaceColorTitle')}
                            description={t('appearances.interfaceColorDescription')}
                        >
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                {DESIGN_SYSTEM_2_ACCENTS.map((color) => (
                                    <ColorSwatchButton
                                        key={color.id}
                                        color={color}
                                        selected={prefs.secondaryColorId === color.id}
                                        onClick={() => setPrefs({ secondaryColorId: color.id })}
                                    />
                                ))}
                            </div>
                        </SectionCard>

                        <SectionCard
                            icon={Type}
                            title={t('appearances.densityCornersTitle')}
                            description={t('appearances.densityCornersDescription')}
                        >
                            <div className="space-y-5">
                                <div>
                                    <p className="mb-2 text-sm font-bold text-neutral-700">{t('appearances.contentDensityLabel')}</p>
                                    <SegmentedControl
                                        options={densityOptions}
                                        value={prefs.density}
                                        onChange={(density) => setPrefs({ density })}
                                    />
                                </div>
                                <div>
                                    <p className="mb-2 text-sm font-bold text-neutral-700">{t('appearances.cornerRadiusLabel')}</p>
                                    <SegmentedControl
                                        options={radiusOptions}
                                        value={prefs.radiusPreset}
                                        onChange={(radiusPreset) => setPrefs({ radiusPreset })}
                                        columnsClassName="grid-cols-2 lg:grid-cols-4"
                                    />
                                </div>
                            </div>
                        </SectionCard>

                        <SectionCard
                            icon={LayoutPanelLeft}
                            title={t('appearances.layoutTitle')}
                            description={t('appearances.layoutDescription')}
                        >
                            <div className="space-y-5">
                                <div>
                                    <p className="mb-2 text-sm font-bold text-neutral-700">{t('appearances.sidebarWidthLabel')}</p>
                                    <SegmentedControl
                                        options={sidebarOptions}
                                        value={prefs.sidebarWidth}
                                        onChange={(sidebarWidth) => setPrefs({ sidebarWidth })}
                                    />
                                </div>
                                <div>
                                    <p className="mb-2 text-sm font-bold text-neutral-700">{t('appearances.contentWidthLabel')}</p>
                                    <SegmentedControl
                                        options={maxWidthOptions}
                                        value={prefs.maxWidth}
                                        onChange={(maxWidth) => setPrefs({ maxWidth })}
                                        columnsClassName="grid-cols-2 lg:grid-cols-4"
                                    />
                                </div>
                                <div>
                                    <p className="mb-2 text-sm font-bold text-neutral-700">{t('appearances.cardStyleLabel')}</p>
                                    <SegmentedControl
                                        options={previewSurfaceOptions}
                                        value={prefs.previewChrome}
                                        onChange={(previewChrome) => setPrefs({ previewChrome })}
                                    />
                                </div>
                                <div>
                                    <p className="mb-2 text-sm font-bold text-neutral-700">{t('appearances.neutralScaleLabel')}</p>
                                    <SegmentedControl
                                        options={neutralOptions}
                                        value={prefs.neutralFamilyId}
                                        onChange={(neutralFamilyId) => setPrefs({ neutralFamilyId })}
                                        columnsClassName="grid-cols-2 lg:grid-cols-4"
                                    />
                                </div>
                            </div>
                        </SectionCard>
                    </div>

                    <div className="xl:sticky xl:top-4">
                        <AppearancePreview previewTab={previewTab} onPreviewTabChange={setPreviewTab} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Appearances;
