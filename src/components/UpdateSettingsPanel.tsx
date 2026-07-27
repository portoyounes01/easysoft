import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadCloud, RefreshCw } from 'lucide-react';
import { AdminActionButton } from './ui/AdminActionButton';
import { useShellUpdateStatus } from '../hooks/useShellUpdateStatus';

const cardClass = 'rounded-2xl border border-slate-200 bg-white/85 p-5';

const STATUS_TONE: Record<string, string> = {
  downloaded: 'bg-amber-100 text-amber-800 border-amber-200',
  available: 'bg-blue-100 text-blue-800 border-blue-200',
  checking: 'bg-blue-100 text-blue-800 border-blue-200',
  'up-to-date': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  idle: 'bg-slate-100 text-slate-700 border-slate-200',
  error: 'bg-red-100 text-red-800 border-red-200',
  disabled: 'bg-slate-100 text-slate-500 border-slate-200',
};

interface UpdateSettingsPanelProps {
  /** When true, omit full-page chrome (used inside Settings). */
  embedded?: boolean;
}

/** Software-update surface for the till shell (D-U5 "UI nudge"). Pure consumer of
 *  shell.getUpdateStatus/onUpdateStatus; the only action is the operator-initiated
 *  restart, which routes through the updater's race-safe exit path. */
export const UpdateSettingsPanel: React.FC<UpdateSettingsPanelProps> = ({ embedded: _embedded = false }) => {
  const { t } = useTranslation();
  const status = useShellUpdateStatus();
  const shell = window.electronAPI?.shell;
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  if (!shell?.getUpdateStatus) {
    return (
      <div className={cardClass}>
        <p className="text-sm font-medium text-slate-600">
          {t('updateSettings.unavailable', {
            defaultValue: 'Software updates are managed by the till shell — nothing to configure in the browser.',
          })}
        </p>
      </div>
    );
  }

  const statusKey = status?.status ?? 'idle';
  const statusLabel = t(`updateSettings.status.${statusKey}`, {
    defaultValue:
      statusKey === 'downloaded' ? 'Update ready to install'
      : statusKey === 'available' ? 'Downloading update…'
      : statusKey === 'checking' ? 'Checking for updates…'
      : statusKey === 'up-to-date' ? 'Up to date'
      : statusKey === 'error' ? 'Update error'
      : statusKey === 'disabled' ? 'Updates disabled'
      : 'Waiting for first check',
  });

  const handleRestart = async () => {
    setRestartError(null);
    setRestarting(true);
    try {
      const result = await shell.restartToInstall?.();
      // Success normally never returns (the process exits); a response means refusal.
      if (result && result.ok === false) {
        setRestartError(result.error ?? t('updateSettings.restartRefused'));
        setRestarting(false);
      }
    } catch (e) {
      setRestartError(e instanceof Error ? e.message : t('updateSettings.restartFailed'));
      setRestarting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <DownloadCloud className="h-6 w-6 text-blue-600" />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {t('updateSettings.shellVersion', { defaultValue: 'Till software (shell)' })}
              </p>
              <p className="text-xs text-slate-500">
                {t('updateSettings.installedVersion', { defaultValue: 'Installed version' })}: {shell.version ?? '—'}
              </p>
            </div>
          </div>
          <span className={`rounded-full border px-3 py-1 text-sm font-bold ${STATUS_TONE[statusKey] ?? STATUS_TONE.idle}`}>
            {statusLabel}
          </span>
        </div>

        <div className="mt-4 space-y-1 text-sm text-slate-600">
          {status?.detail && (
            <p>
              {statusKey === 'downloaded' || statusKey === 'available'
                ? `${t('updateSettings.newVersion', { defaultValue: 'New version' })}: ${status.detail}`
                : status.detail}
            </p>
          )}
          {status?.at && (
            <p className="text-xs text-slate-400">
              {t('updateSettings.lastChange', { defaultValue: 'Last status change' })}: {new Date(status.at).toLocaleString()}
            </p>
          )}
          {statusKey === 'disabled' && (
            <p className="text-xs text-slate-400">
              {t('updateSettings.disabledHint', {
                defaultValue: 'Set update_feed_url in the till’s config.json to enable the update channel.',
              })}
            </p>
          )}
        </div>

        {statusKey === 'downloaded' && (
          <div className="mt-4">
            {shell.restartToInstall ? (
              <AdminActionButton
                icon={RefreshCw}
                isLoading={restarting}
                label={restarting
                  ? t('updateSettings.restarting', { defaultValue: 'Restarting…' })
                  : t('updateSettings.restartNow', { defaultValue: 'Restart and install now' })}
                onClick={() => void handleRestart()}
                disabled={restarting}
              />
            ) : (
              <p className="text-sm font-medium text-amber-700">
                {t('updateSettings.installsOnQuit', {
                  defaultValue: 'The update installs automatically the next time the app closes or restarts.',
                })}
              </p>
            )}
            {restartError && <p className="mt-2 text-sm font-medium text-red-600">{restartError}</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default UpdateSettingsPanel;
