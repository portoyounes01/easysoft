import React from 'react';
import { X, type LucideIcon } from 'lucide-react';
import {
    DIALOG_OVERLAY_BG,
    DIALOG_OVERLAY_PAD,
    DIALOG_PALETTES,
    DIALOG_PANEL_RADIUS_CLASSES,
    DialogShellStyleContext,
    type DialogStyleConfig,
} from '../../theme/dialogStyle';

interface ConfiguredDialogShellProps {
    config: DialogStyleConfig;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    /** Shown under the title (hidden by header variants without a subtitle slot). */
    subtitle?: string;
    /** Icon for chip header variants; chip variants fall back to no chip without it. */
    icon?: LucideIcon;
    /** Action row; placed in the body or a footer bar per config.footer. */
    footer?: React.ReactNode;
    /** Stacking class, e.g. "z-40" when another dialog must open on top. */
    overlayClassName?: string;
    /** Render inside a positioned canvas (Dialog lab preview) instead of fullscreen. */
    embedded?: boolean;
    /** Explicit panel size used only when config.sizing === 'vwvh'. */
    vwvhSize?: { width: string; height: string };
}

export const ConfiguredDialogShell: React.FC<ConfiguredDialogShellProps> = ({
    config,
    title,
    onClose,
    children,
    subtitle,
    icon: Icon,
    footer,
    overlayClassName = 'z-50',
    embedded = false,
    vwvhSize = { width: '50vw', height: '60vh' },
}) => {
    const p = DIALOG_PALETTES[config.palette];
    const sheet = config.centering === 'bottomSheet';
    const radius = sheet
        ? DIALOG_PANEL_RADIUS_CLASSES[config.panelRadius].sheet
        : DIALOG_PANEL_RADIUS_CLASSES[config.panelRadius].panel;

    const closeButton = (() => {
        switch (config.closeButton) {
            case 'slateSquare':
                return (
                    <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200">
                        <X className="h-5 w-5" />
                    </button>
                );
            case 'graySquare':
                return (
                    <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200">
                        <X className="h-5 w-5" />
                    </button>
                );
            case 'ghostRound':
                return (
                    <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900">
                        <X className="h-5 w-5" />
                    </button>
                );
            case 'whiteGhost':
                return (
                    <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-xl p-2 text-white hover:bg-white/20">
                        <X className="h-5 w-5" />
                    </button>
                );
            case 'textX':
                return (
                    <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-full p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700">
                        ✕
                    </button>
                );
        }
    })();

    const header = (() => {
        switch (config.header) {
            case 'grayBarCentered':
                return (
                    <div className="border-b bg-gray-200 px-4 py-3">
                        <div className="flex items-center justify-between">
                            <span className="opacity-0">✕</span>
                            <h3 className="text-center text-base font-bold text-gray-800">{title}</h3>
                            {closeButton}
                        </div>
                    </div>
                );
            case 'borderedLeft':
                return (
                    <div className={`flex items-center justify-between gap-3 border-b ${p.border} px-6 py-5`}>
                        <div className="min-w-0">
                            <h3 className={`truncate text-2xl font-semibold ${p.titleText}`}>{title}</h3>
                            {subtitle && <p className={`truncate text-sm ${p.subText}`}>{subtitle}</p>}
                        </div>
                        {closeButton}
                    </div>
                );
            case 'chipLeft':
                return (
                    <div className={`flex items-center justify-between gap-3 border-b ${p.border} px-6 py-5`}>
                        <div className="flex min-w-0 items-center gap-3">
                            {Icon && (
                                <div className="shrink-0 rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                                    <Icon className="h-6 w-6" />
                                </div>
                            )}
                            <div className="min-w-0">
                                <h3 className={`truncate text-2xl font-semibold ${p.titleText}`}>{title}</h3>
                                {subtitle && <p className={`truncate text-sm ${p.subText}`}>{subtitle}</p>}
                            </div>
                        </div>
                        {closeButton}
                    </div>
                );
            case 'bareLeft':
                return (
                    <div className="flex items-start justify-between gap-3 px-6 pb-1 pt-6">
                        <div className="min-w-0">
                            <h3 className={`truncate text-xl font-semibold ${p.titleText}`}>{title}</h3>
                            {subtitle && <p className={`truncate text-sm ${p.subText}`}>{subtitle}</p>}
                        </div>
                        {closeButton}
                    </div>
                );
            case 'gradientBar':
                return (
                    <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-6 text-white">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                                {Icon && (
                                    <div className="shrink-0 rounded-xl bg-white/20 p-2">
                                        <Icon className="h-5 w-5" />
                                    </div>
                                )}
                                <h3 className="truncate text-xl font-bold">{title}</h3>
                            </div>
                            {closeButton}
                        </div>
                    </div>
                );
            case 'borderedChip':
                return (
                    <div className={`flex items-center justify-between gap-3 border-b ${p.border} px-6 py-4`}>
                        <div className="flex min-w-0 items-center gap-3">
                            {Icon && (
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                                    <Icon className="h-5 w-5" />
                                </div>
                            )}
                            <div className="min-w-0">
                                <h3 className={`truncate text-xl font-semibold ${p.titleText}`}>{title}</h3>
                                {subtitle && <p className={`truncate text-sm ${p.subText}`}>{subtitle}</p>}
                            </div>
                        </div>
                        {closeButton}
                    </div>
                );
            case 'bareBold':
                return (
                    <div className="flex items-start justify-between gap-3 px-6 pb-1 pt-6">
                        <h3 className={`truncate text-xl font-bold ${p.titleText}`}>{title}</h3>
                        {closeButton}
                    </div>
                );
        }
    })();

    const bodyBg = config.bodyTint === 'soft' ? p.tintBg : 'bg-white';

    const panelSizing = config.sizing === 'vwvh'
        ? (embedded ? { width: '72%', height: '88%' } : { width: vwvhSize.width, height: vwvhSize.height })
        : undefined;
    const panelWidth = sheet ? 'w-full' : config.sizing === 'vwvh' ? '' : `w-full ${config.sizing}`;

    const overlayLayout = sheet
        ? 'flex items-end'
        : config.centering === 'flex'
            ? 'flex items-center justify-center'
            : '';

    return (
        <div
            className={`${embedded ? 'absolute inset-0' : 'fixed inset-0'} ${DIALOG_OVERLAY_BG[config.overlayOpacity]} ${overlayLayout} ${sheet ? '' : DIALOG_OVERLAY_PAD[config.overlayPadding]} ${overlayClassName}`}
            onClick={onClose}
            role="presentation"
        >
            <div
                className={`flex max-h-full flex-col overflow-hidden bg-white shadow-2xl ${radius} ${panelWidth} ${config.centering === 'transform' && !sheet ? 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2' : ''}`}
                style={panelSizing}
                role="dialog"
                aria-modal={!embedded || undefined}
                onClick={(event) => event.stopPropagation()}
            >
                <DialogShellStyleContext.Provider value={config}>
                    {header}
                    <div className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${bodyBg}`}>
                        {children}
                        {footer && config.footer === 'inBody' && (
                            <div className="px-6 pb-6 pt-1">{footer}</div>
                        )}
                    </div>
                    {footer && config.footer !== 'inBody' && (
                        <div className={`border-t ${p.border} px-6 py-4 ${config.footer === 'tintedBar' ? p.tintBg : 'bg-white'}`}>
                            {footer}
                        </div>
                    )}
                </DialogShellStyleContext.Provider>
            </div>
        </div>
    );
};
