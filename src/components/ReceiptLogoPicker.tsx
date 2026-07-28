import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { prepareReceiptLogo, receiptLogoDataUrl, type ReceiptLogo } from '../utils/receiptLogo';
import { saveTenantReceiptLogo } from '../services/receiptBrandingService';

interface ReceiptLogoPickerProps {
    value?: ReceiptLogo;
    onChange: (logo: ReceiptLogo | undefined) => void;
    /** False when the signed-in human may not publish tenant branding. */
    canPublish?: boolean;
}

/**
 * Picks the logo printed at the top of every receipt.
 *
 * Deliberately NOT the shared `ImageUploader`: that posts to the `upload-image`
 * edge function and hands back a URL, which the till would have to fetch at
 * print time — and a till prints when it is offline. This reads the file
 * locally, renders it to the exact 1-bit bitmap the thermal head takes, and
 * stores that. Nothing is uploaded and nothing is fetched to print.
 *
 * The preview is the dithered result rather than the chosen file, because on a
 * 1-bit head a photo or a gradient looks nothing like its original — better the
 * operator sees that here than discovers it on the first customer's receipt.
 */
export const ReceiptLogoPicker: React.FC<ReceiptLogoPickerProps> = ({
    value,
    onChange,
    canPublish = true,
}) => {
    const { t } = useTranslation();
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    // Rendered from the stored bits, so this preview IS the printed image.
    const preview = useMemo(() => receiptLogoDataUrl(value), [value]);
    const [error, setError] = useState<string | null>(null);

    /**
     * Apply locally, then publish to the tenant so every till receives it.
     *
     * Local first on purpose: a publish that fails (offline, or a human without
     * the role) still leaves this till printing the logo the operator just
     * chose, and says plainly that the fleet has not got it yet.
     */
    const apply = async (logo: ReceiptLogo | undefined) => {
        onChange(logo);
        if (!canPublish) {
            setError(t('settings.receiptLogo.notPublished'));
            return;
        }
        try {
            await saveTenantReceiptLogo(logo);
            setError(null);
        } catch {
            setError(t('settings.receiptLogo.publishFailed'));
        }
    };

    const pick = async (file: File | undefined) => {
        if (!file) return;
        setBusy(true);
        setError(null);
        try {
            await apply(await prepareReceiptLogo(file));
        } catch (e) {
            setError(e instanceof Error ? e.message : t('settings.receiptLogo.failed'));
        } finally {
            setBusy(false);
            // Allow re-picking the same file after a failure.
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
                {t('settings.receiptLogo.label')}
            </label>

            <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 p-4">
                <div className="flex h-24 w-48 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white">
                    {preview ? (
                        <img
                            src={preview}
                            alt=""
                            className="max-h-full max-w-full"
                            style={{ imageRendering: 'pixelated' }}
                        />
                    ) : (
                        <span className="text-sm text-slate-400">{t('settings.receiptLogo.none')}</span>
                    )}
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-sm text-slate-600">{t('settings.receiptLogo.help')}</p>
                    {value && (
                        <p className="font-mono text-xs text-slate-500">
                            {value.widthDots} × {value.heightDots} {t('settings.receiptLogo.dots')}
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            disabled={busy}
                            data-testid="receipt-logo-choose"
                            className="min-h-touch-sm inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
                        >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                            {value ? t('settings.receiptLogo.replace') : t('settings.receiptLogo.choose')}
                        </button>
                        {value && (
                            <button
                                type="button"
                                onClick={() => void apply(undefined)}
                                disabled={busy}
                                data-testid="receipt-logo-remove"
                                className="min-h-touch-sm inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                            >
                                <Trash2 className="h-4 w-4" />
                                {t('settings.receiptLogo.remove')}
                            </button>
                        )}
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
            </div>

            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={event => void pick(event.target.files?.[0])}
            />
        </div>
    );
};

export default ReceiptLogoPicker;
