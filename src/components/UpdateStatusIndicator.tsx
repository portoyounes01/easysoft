import React from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadCloud } from 'lucide-react';
import { useShellUpdateStatus } from '../hooks/useShellUpdateStatus';

/** Tiny "update ready" chip for the POS status bar (mirrors ScaleStatusIndicator).
 *  Deliberately silent for every state except 'downloaded' — checking/available
 *  are background noise an operator can do nothing about; a downloaded update
 *  is actionable ("close the app when convenient and it installs"). */
export const UpdateStatusIndicator: React.FC = () => {
    const { t } = useTranslation();
    const status = useShellUpdateStatus();

    if (status?.status !== 'downloaded') return null;

    return (
        <span
            className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700"
            title={t('updateIndicator.tooltip', {
                defaultValue: 'Version {{version}} downloaded — installs when the app closes or restarts.',
                version: status.detail,
            })}
        >
            <DownloadCloud className="h-3.5 w-3.5" aria-hidden />
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden />
            {t('updateIndicator.ready', { defaultValue: 'Update ready' })}
        </span>
    );
};

export default UpdateStatusIndicator;
