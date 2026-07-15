import React from 'react';
import { useTranslation } from 'react-i18next';
import { Weight } from 'lucide-react';
import scaleService from '../services/scaleService';
import { useScaleStatus } from '../hooks/useScaleStatus';

/** Tiny scale-presence chip for the POS status bar (like a printer status
 *  dot). Renders nothing when the shell has no scale bridge or no session
 *  has ever produced a status. Pure consumer of the till-scoped session. */
export const ScaleStatusIndicator: React.FC = () => {
    const { t } = useTranslation();
    const status = useScaleStatus();

    if (!scaleService.isAvailable() || status === null) return null;

    const state = status.state;
    const style =
        state === 'connected'
            ? { dot: 'bg-emerald-500', text: 'text-emerald-700', label: t('scaleIndicator.connected') }
            : state === 'detecting'
                ? { dot: 'bg-blue-500 animate-pulse', text: 'text-blue-700', label: t('scaleIndicator.searching') }
                : state === 'idle'
                    ? { dot: 'bg-gray-400', text: 'text-gray-500', label: t('scaleIndicator.idle') }
                    : { dot: 'bg-red-500', text: 'text-red-700', label: t('scaleIndicator.offline') };

    return (
        <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}
            title={status.port ? `${status.port} @ ${status.baud} 8-N-1` : undefined}
        >
            <Weight className="h-3.5 w-3.5" aria-hidden />
            <span className={`inline-block h-2 w-2 rounded-full ${style.dot}`} aria-hidden />
            {style.label}
        </span>
    );
};

export default ScaleStatusIndicator;
