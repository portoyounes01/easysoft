import React, { useEffect, useState } from 'react';
import {
    AlertCircle,
    Check,
    Maximize2,
    RotateCcw,
    Save,
    Table2,
} from 'lucide-react';
import { ConfiguredDialogShell } from './ui/ConfiguredDialogShell';
import {
    applyDialogStyle,
    dialogButtonClasses,
    DIALOG_CONTROL_CLASSES,
    DIALOG_PALETTES,
    isValidDialogStyleConfig,
    resetDialogStyle,
    useAppliedDialogStyle,
    type DialogStyleConfig,
} from '../theme/dialogStyle';

/**
 * Internal design tool: composes a dialog style from one variant per axis
 * (all variants observed in the app's seven dialog families A–G, plus presets
 * that snap every axis to one family). "Save" applies the composed style to
 * EVERY dialog in the app (via ConfiguredDialogShell + useAppliedDialogStyle);
 * "Reset" restores each dialog's original look.
 */

const DRAFT_KEY = 'dialog-lab-config';

/** Style C (the legacy BaseDialog family) is the baseline. */
const DEFAULT_CONFIG: DialogStyleConfig = {
    overlayOpacity: '50',
    overlayPadding: 'none',
    centering: 'flex',
    panelRadius: 'xl',
    sizing: 'vwvh',
    header: 'grayBarCentered',
    closeButton: 'textX',
    palette: 'gray',
    controls: 'legacyGreen',
    primaryCta: 'greenGradient',
    footer: 'borderedBar',
    bodyTint: 'soft',
};

const PRESETS: Record<string, { label: string; config: DialogStyleConfig }> = {
    A: {
        label: 'A · Cash drawer / Purchase import',
        config: {
            overlayOpacity: '55', overlayPadding: 'p-4', centering: 'flex', panelRadius: '2rem',
            sizing: 'max-w-xl', header: 'chipLeft', closeButton: 'slateSquare', palette: 'slate',
            controls: 'rounded2xlSlate', primaryCta: 'orange500', footer: 'inBody', bodyTint: 'white',
        },
    },
    B: {
        label: 'B · My profile (clock in/out)',
        config: {
            overlayOpacity: '55', overlayPadding: 'p-4', centering: 'flex', panelRadius: '2rem',
            sizing: 'max-w-md', header: 'borderedLeft', closeButton: 'slateSquare', palette: 'slate',
            controls: 'rounded2xlSlate', primaryCta: 'green500', footer: 'inBody', bodyTint: 'soft',
        },
    },
    C: {
        label: 'C · Legacy BaseDialog (payment, NIF…)',
        config: DEFAULT_CONFIG,
    },
    D: {
        label: 'D · Inventory / HR',
        config: {
            overlayOpacity: '55', overlayPadding: 'p-4', centering: 'flex', panelRadius: '2rem',
            sizing: 'max-w-lg', header: 'bareLeft', closeButton: 'slateSquare', palette: 'slate',
            controls: 'rounded2xlSlate', primaryCta: 'slate950', footer: 'inBody', bodyTint: 'white',
        },
    },
    E: {
        label: 'E · View product / customer',
        config: {
            overlayOpacity: '40', overlayPadding: 'none', centering: 'transform', panelRadius: '2xl',
            sizing: 'max-w-2xl', header: 'gradientBar', closeButton: 'whiteGhost', palette: 'neutral',
            controls: 'roundedXlEmerald', primaryCta: 'blue600', footer: 'tintedBar', bodyTint: 'soft',
        },
    },
    F: {
        label: 'F · Custom invoice',
        config: {
            overlayOpacity: '55', overlayPadding: 'p-4', centering: 'flex', panelRadius: '2xl',
            sizing: 'max-w-3xl', header: 'borderedChip', closeButton: 'graySquare', palette: 'gray',
            controls: 'roundedLgBlue', primaryCta: 'blue600', footer: 'tintedBar', bodyTint: 'white',
        },
    },
    G: {
        label: 'G · Tables (add/edit table)',
        config: {
            overlayOpacity: '50', overlayPadding: 'p-4', centering: 'flex', panelRadius: '3xl',
            sizing: 'max-w-md', header: 'bareBold', closeButton: 'ghostRound', palette: 'neutral',
            controls: 'roundedXlEmerald', primaryCta: 'emerald600', footer: 'inBody', bodyTint: 'white',
        },
    },
};

function loadDraft(): DialogStyleConfig {
    try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return DEFAULT_CONFIG;
        const merged = { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<DialogStyleConfig>) };
        return isValidDialogStyleConfig(merged) ? merged : DEFAULT_CONFIG;
    } catch {
        return DEFAULT_CONFIG;
    }
}

interface AxisOption<T extends string> {
    value: T;
    label: string;
}

interface AxisRowProps<T extends string> {
    label: string;
    options: AxisOption<T>[];
    value: T;
    onChange: (value: T) => void;
}

function AxisRow<T extends string>({ label, options, value, onChange }: AxisRowProps<T>) {
    return (
        <div>
            <p className="mb-1.5 text-sm font-bold text-neutral-700">{label}</p>
            <div className="flex flex-wrap gap-1.5">
                {options.map((option) => {
                    const selected = option.value === value;
                    return (
                        <button
                            key={option.value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => onChange(option.value)}
                            className={`rounded-lg border px-2.5 py-1.5 font-mono text-xs font-semibold transition-colors ${selected
                                ? 'border-green-500 bg-green-50 text-green-700'
                                : 'border-neutral-200 bg-white text-neutral-600 hover:border-blue-200 hover:bg-blue-50'
                                }`}
                        >
                            {option.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

interface SamplePreviewProps {
    config: DialogStyleConfig;
    embedded: boolean;
    onClose?: () => void;
}

/** Sample "Edit table" content rendered through the real shared shell. */
const SamplePreview: React.FC<SamplePreviewProps> = ({ config, embedded, onClose }) => {
    const p = DIALOG_PALETTES[config.palette];
    const inputClass = `w-full bg-white outline-none transition ${DIALOG_CONTROL_CLASSES[config.controls]}`;
    const buttons = dialogButtonClasses(config);

    return (
        <ConfiguredDialogShell
            config={config}
            title="Edit table"
            subtitle="Dialog lab preview"
            icon={Table2}
            onClose={onClose ?? (() => undefined)}
            overlayClassName={embedded ? '' : 'z-[95]'}
            embedded={embedded}
            footer={
                <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={onClose} className={buttons.secondary}>Cancel</button>
                    <button type="button" className={buttons.primary}>Save</button>
                </div>
            }
        >
            <div className="space-y-4 px-6 py-5">
                <label className="block">
                    <span className={`mb-1.5 block text-sm font-semibold ${p.titleText}`}>Table name</span>
                    <input className={inputClass} placeholder="e.g. Table 21" readOnly value="Table 12" onChange={() => undefined} />
                </label>
                <label className="block">
                    <span className={`mb-1.5 block text-sm font-semibold ${p.titleText}`}>Type</span>
                    <select className={inputClass} value="4" onChange={() => undefined}>
                        <option value="2">Small · 2 seats</option>
                        <option value="4">Medium · 4 seats</option>
                        <option value="6">Large · 6 seats</option>
                    </select>
                </label>
                <div className={`flex items-start gap-2 rounded-xl ${config.bodyTint === 'soft' ? 'bg-white' : p.tintBg} px-4 py-3 text-sm ${p.subText}`}>
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    Small tables seat 2, medium tables seat 4, and large tables seat 6.
                </div>
            </div>
        </ConfiguredDialogShell>
    );
};

const DialogLab: React.FC = () => {
    const [config, setConfig] = useState<DialogStyleConfig>(() => loadDraft());
    const [fullscreenOpen, setFullscreenOpen] = useState(false);
    const applied = useAppliedDialogStyle();

    useEffect(() => {
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(config));
        } catch {
            /* ignore quota / private mode */
        }
    }, [config]);

    const set = <K extends keyof DialogStyleConfig>(key: K, value: DialogStyleConfig[K]) =>
        setConfig((current) => ({ ...current, [key]: value }));

    const matchesConfig = (candidate: DialogStyleConfig) =>
        (Object.keys(candidate) as (keyof DialogStyleConfig)[]).every((key) => config[key] === candidate[key]);

    const activePreset = Object.entries(PRESETS).find(([, preset]) => matchesConfig(preset.config))?.[0];
    const isApplied = applied !== null && matchesConfig(applied);

    return (
        <>
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)]">
                <div className="space-y-4">
                    <div>
                        <p className="mb-1.5 text-sm font-bold text-neutral-700">Presets (existing styles)</p>
                        <div className="flex flex-wrap gap-1.5">
                            {Object.entries(PRESETS).map(([key, preset]) => (
                                <button
                                    key={key}
                                    type="button"
                                    aria-pressed={activePreset === key}
                                    title={preset.label}
                                    onClick={() => setConfig(preset.config)}
                                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${activePreset === key
                                        ? 'border-green-500 bg-green-500 text-white'
                                        : 'border-neutral-200 bg-white text-neutral-600 hover:border-blue-200 hover:bg-blue-50'
                                        }`}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <AxisRow
                        label="Overlay dim"
                        value={config.overlayOpacity}
                        onChange={(value) => set('overlayOpacity', value)}
                        options={[
                            { value: '40', label: 'black/40' },
                            { value: '45', label: 'black/45' },
                            { value: '50', label: 'black/50' },
                            { value: '55', label: 'black/55' },
                        ]}
                    />
                    <AxisRow
                        label="Overlay padding"
                        value={config.overlayPadding}
                        onChange={(value) => set('overlayPadding', value)}
                        options={[
                            { value: 'none', label: 'none' },
                            { value: 'p-3', label: 'p-3' },
                            { value: 'p-4', label: 'p-4' },
                            { value: 'p-6', label: 'p-6' },
                        ]}
                    />
                    <AxisRow
                        label="Centering / placement"
                        value={config.centering}
                        onChange={(value) => set('centering', value)}
                        options={[
                            { value: 'flex', label: 'flex center' },
                            { value: 'transform', label: 'transform center' },
                            { value: 'bottomSheet', label: 'bottom sheet' },
                        ]}
                    />
                    <AxisRow
                        label="Panel radius"
                        value={config.panelRadius}
                        onChange={(value) => set('panelRadius', value)}
                        options={[
                            { value: 'xl', label: 'xl · 12px' },
                            { value: '2xl', label: '2xl · 16px' },
                            { value: '3xl', label: '3xl · 24px' },
                            { value: '2rem', label: '2rem · 32px' },
                        ]}
                    />
                    <AxisRow
                        label="Sizing"
                        value={config.sizing}
                        onChange={(value) => set('sizing', value)}
                        options={[
                            { value: 'max-w-sm', label: 'max-w-sm' },
                            { value: 'max-w-md', label: 'max-w-md' },
                            { value: 'max-w-lg', label: 'max-w-lg' },
                            { value: 'max-w-xl', label: 'max-w-xl' },
                            { value: 'max-w-2xl', label: 'max-w-2xl' },
                            { value: 'max-w-3xl', label: 'max-w-3xl' },
                            { value: 'vwvh', label: '50vw × 60vh' },
                        ]}
                    />
                    <AxisRow
                        label="Header"
                        value={config.header}
                        onChange={(value) => set('header', value)}
                        options={[
                            { value: 'grayBarCentered', label: 'gray bar · centered' },
                            { value: 'borderedLeft', label: 'bordered · left' },
                            { value: 'chipLeft', label: 'icon chip · left' },
                            { value: 'bareLeft', label: 'bare · left' },
                            { value: 'gradientBar', label: 'blue gradient bar' },
                            { value: 'borderedChip', label: 'bordered + blue chip' },
                            { value: 'bareBold', label: 'bare · bold' },
                        ]}
                    />
                    <AxisRow
                        label="Close button"
                        value={config.closeButton}
                        onChange={(value) => set('closeButton', value)}
                        options={[
                            { value: 'slateSquare', label: 'slate square' },
                            { value: 'graySquare', label: 'gray square' },
                            { value: 'textX', label: 'text ✕' },
                            { value: 'ghostRound', label: 'ghost round' },
                            { value: 'whiteGhost', label: 'white ghost' },
                        ]}
                    />
                    <AxisRow
                        label="Palette"
                        value={config.palette}
                        onChange={(value) => set('palette', value)}
                        options={[
                            { value: 'slate', label: 'slate' },
                            { value: 'gray', label: 'gray' },
                            { value: 'neutral', label: 'neutral' },
                        ]}
                    />
                    <AxisRow
                        label="Controls (inputs)"
                        value={config.controls}
                        onChange={(value) => set('controls', value)}
                        options={[
                            { value: 'legacyGreen', label: 'rounded-xl · green focus' },
                            { value: 'roundedLgBlue', label: 'rounded-lg · blue focus' },
                            { value: 'roundedXlEmerald', label: 'rounded-xl · emerald focus' },
                            { value: 'rounded2xlSlate', label: 'rounded-2xl · slate focus' },
                        ]}
                    />
                    <AxisRow
                        label="Primary CTA"
                        value={config.primaryCta}
                        onChange={(value) => set('primaryCta', value)}
                        options={[
                            { value: 'greenGradient', label: 'green gradient' },
                            { value: 'green500', label: 'green-500 flat' },
                            { value: 'emerald600', label: 'emerald-600' },
                            { value: 'slate950', label: 'slate-950' },
                            { value: 'blue600', label: 'blue-600' },
                            { value: 'orange500', label: 'orange-500' },
                        ]}
                    />
                    <AxisRow
                        label="Footer"
                        value={config.footer}
                        onChange={(value) => set('footer', value)}
                        options={[
                            { value: 'inBody', label: 'buttons in body' },
                            { value: 'borderedBar', label: 'bordered bar' },
                            { value: 'tintedBar', label: 'tinted bar' },
                        ]}
                    />
                    <AxisRow
                        label="Body tint"
                        value={config.bodyTint}
                        onChange={(value) => set('bodyTint', value)}
                        options={[
                            { value: 'white', label: 'white' },
                            { value: 'soft', label: 'soft tint' },
                        ]}
                    />
                </div>

                <div className="space-y-3 xl:sticky xl:top-4">
                    <div className="relative h-[30rem] overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
                        <SamplePreview config={config} embedded />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => applyDialogStyle(config)}
                            disabled={isApplied}
                            className="flex min-h-touch-sm items-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
                        >
                            {isApplied ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                            {isApplied ? 'Applied to all dialogs' : 'Save · apply to all dialogs'}
                        </button>
                        <button
                            type="button"
                            onClick={resetDialogStyle}
                            disabled={applied === null}
                            className="flex min-h-touch-sm items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <RotateCcw className="h-4 w-4" /> Reset to original styles
                        </button>
                        <button
                            type="button"
                            onClick={() => setFullscreenOpen(true)}
                            className="flex min-h-touch-sm items-center gap-2 rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-700"
                        >
                            <Maximize2 className="h-4 w-4" /> Preview overlay
                        </button>
                        {activePreset && (
                            <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
                                = style {activePreset}
                            </span>
                        )}
                    </div>
                    <p className="text-xs leading-5 text-neutral-500">
                        {applied
                            ? 'A saved style is active: every dialog in the app renders with it. “Reset to original styles” restores each dialog’s own (mixed) design.'
                            : 'No saved style: every dialog keeps its original design. “Save” applies the composed style to all dialogs across the app (stored on this device).'}
                        {' '}The embedded preview approximates the legacy 50vw × 60vh sizing; “Preview overlay” shows exact viewport sizing.
                    </p>
                </div>
            </div>

            {fullscreenOpen && (
                <SamplePreview config={config} embedded={false} onClose={() => setFullscreenOpen(false)} />
            )}
        </>
    );
};

export default DialogLab;
