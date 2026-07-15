import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Loader2, RefreshCw, Search, Weight } from 'lucide-react';
import scaleService from '../services/scaleService';
import type {
  ScaleConfig,
  ScalePortInfo,
  ScaleProbeResult,
  ScaleReading,
  ScaleStatusInfo,
} from '../types/electron';

const BAUD_OPTIONS = [9600, 4800, 2400, 19200, 1200];

const cardClass = 'rounded-2xl border border-slate-200 bg-white/85 p-5';
const buttonClass =
  'min-h-touch-sm inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const primaryButton = `${buttonClass} bg-blue-600 text-white hover:bg-blue-700`;
const secondaryButton = `${buttonClass} bg-slate-100 text-slate-700 hover:bg-slate-200`;
const fieldClass =
  'min-h-touch-sm w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-slate-400';

interface ScaleSettingsPanelProps {
  /** When true, omit full-page chrome (used inside Settings). */
  embedded?: boolean;
}

export const ScaleSettingsPanel: React.FC<ScaleSettingsPanelProps> = ({ embedded = false }) => {
  const { t } = useTranslation();
  const available = scaleService.isAvailable();

  const [status, setStatus] = useState<ScaleStatusInfo | null>(null);
  const [config, setConfig] = useState<ScaleConfig | null>(null);
  const [ports, setPorts] = useState<ScalePortInfo[]>([]);
  const [reading, setReading] = useState<ScaleReading | null>(null);
  const [live, setLive] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectResults, setDetectResults] = useState<ScaleProbeResult[] | null>(null);
  const [detectSummary, setDetectSummary] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [actionError, setActionError] = useState<string | null>(null);
  const startedHereRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    const result = await scaleService.getStatus();
    if (result.success && result.status) {
      setStatus(result.status);
      // Main process owns the truth about polling (survives panel remounts
      // and renderer reloads); local clicks only anticipate it.
      setLive(result.status.polling);
      if (result.status.lastReading) setReading(result.status.lastReading);
    }
  }, []);

  useEffect(() => {
    if (!available) return;
    void refreshStatus();
    void scaleService.getConfig().then((r) => r.success && r.config && setConfig(r.config));
    void scaleService.listPorts().then((r) => setPorts(r.ports));
    const offReading = scaleService.onReading(setReading);
    const offStatus = scaleService.onStatusChange((s) => {
      setStatus(s);
      setLive(s.polling);
    });
    return () => {
      offReading();
      offStatus();
      if (startedHereRef.current) void scaleService.stop();
    };
  }, [available, refreshStatus]);

  const handleStartStop = async () => {
    setActionError(null);
    if (live) {
      await scaleService.stop();
      startedHereRef.current = false;
      setLive(false);
    } else {
      const result = await scaleService.start();
      if (result.success) {
        // alreadyRunning = the till-scoped session (started by POS) was live
        // before this panel touched it — leaving Settings must not stop it.
        startedHereRef.current = !result.alreadyRunning;
        setLive(true);
      } else {
        setActionError(result.error ?? t('scaleSettings.startFailed'));
      }
    }
    void refreshStatus();
  };

  const handleReadOnce = async () => {
    setActionError(null);
    const result = await scaleService.readOnce();
    if (result.success && result.reading) {
      setReading(result.reading);
    } else {
      setActionError(result.error ?? t('scaleSettings.readFailed'));
    }
    void refreshStatus();
  };

  const handleDetect = async () => {
    setActionError(null);
    setDetecting(true);
    setDetectResults(null);
    setDetectSummary(null);
    try {
      const result = await scaleService.detect();
      setDetectResults(result.results);
      if (result.success && result.found) {
        setDetectSummary(
          t('scaleSettings.detectFound', { port: result.port, baud: result.baud })
        );
        void scaleService.getConfig().then((r) => r.success && r.config && setConfig(r.config));
      } else if (result.success) {
        setDetectSummary(t('scaleSettings.detectNotFound'));
      } else {
        setActionError(result.error ?? t('scaleSettings.detectFailed'));
      }
    } finally {
      setDetecting(false);
      void refreshStatus();
    }
  };

  const handleConfigSave = async (patch: Partial<Pick<ScaleConfig, 'enabled' | 'port' | 'baud'>>) => {
    setSaveState('idle');
    const result = await scaleService.setConfig(patch);
    if (result.success && result.config) {
      setConfig(result.config);
      setSaveState('saved');
    } else {
      setSaveState('error');
      setActionError(result.error ?? t('scaleSettings.saveFailed'));
    }
    // A config change may stop or reconnect a live session in the main process.
    void refreshStatus();
  };

  if (!available) {
    return (
      <div className={cardClass}>
        <div className="flex items-center gap-3 text-slate-600">
          <Weight className="h-6 w-6" />
          <div>
            <p className="font-semibold text-slate-800">{t('scaleSettings.title')}</p>
            <p className="text-sm">{t('scaleSettings.notAvailable')}</p>
          </div>
        </div>
      </div>
    );
  }

  const state = status?.state ?? 'idle';
  const stateStyles: Record<string, string> = {
    connected: 'bg-emerald-100 text-emerald-700',
    detecting: 'bg-blue-100 text-blue-700 animate-pulse',
    disconnected: 'bg-amber-100 text-amber-700',
    error: 'bg-red-100 text-red-700',
    idle: 'bg-slate-100 text-slate-600',
  };
  const outcomeStyles: Record<ScaleProbeResult['outcome'], string> = {
    answered: 'bg-emerald-100 text-emerald-700',
    silent: 'bg-slate-100 text-slate-500',
    busy: 'bg-amber-100 text-amber-700',
    error: 'bg-red-100 text-red-700',
  };

  return (
    <div className={embedded ? 'space-y-4' : 'mx-auto max-w-3xl space-y-4 p-6'}>
      {/* Status */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Weight className="h-6 w-6 text-slate-600" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">{t('scaleSettings.title')}</h3>
              <p className="text-sm text-slate-500">{t('scaleSettings.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status?.mock && (
              <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
                {t('scaleSettings.mockBadge')}
              </span>
            )}
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${stateStyles[state]}`}>
              {t(`scaleSettings.state.${state}`)}
            </span>
          </div>
        </div>
        <div className="mt-3 text-sm text-slate-600">
          {status?.port ? (
            <span>
              {t('scaleSettings.portLabel')}: <strong>{status.port}</strong>
              {status.baud ? ` @ ${status.baud} 8-N-1` : ''}
            </span>
          ) : (
            <span>{t('scaleSettings.noPort')}</span>
          )}
          {status?.lastError && state !== 'connected' && (
            <p className="mt-1 text-amber-700">{status.lastError}</p>
          )}
        </div>
      </div>

      {/* Live reading */}
      <div className={cardClass}>
        <h4 className="text-sm font-semibold text-slate-900">{t('scaleSettings.liveTitle')}</h4>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-extrabold tabular-nums text-slate-900">
              {reading ? reading.weight.toFixed(3) : '–.–––'}
            </span>
            <span className="text-xl font-semibold text-slate-500">{reading?.unit ?? 'kg'}</span>
            {reading && (
              <span
                className={`ml-2 rounded-full px-3 py-1 text-xs font-semibold ${
                  reading.stable ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {reading.stable ? t('scaleSettings.stable') : t('scaleSettings.unstable')}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className={secondaryButton} onClick={handleReadOnce} disabled={detecting}>
              <RefreshCw className="h-4 w-4" />
              {t('scaleSettings.readOnce')}
            </button>
            <button type="button" className={primaryButton} onClick={handleStartStop} disabled={detecting}>
              {live ? t('scaleSettings.stop') : t('scaleSettings.start')}
            </button>
          </div>
        </div>
        {reading && (
          <p className="mt-2 text-xs text-slate-400">
            {t('scaleSettings.rawFrame')}: <code>{reading.raw}</code> · {reading.timestamp}
          </p>
        )}
      </div>

      {/* Detection */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-slate-900">{t('scaleSettings.detectTitle')}</h4>
          <button type="button" className={primaryButton} onClick={handleDetect} disabled={detecting || live}>
            {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {detecting ? t('scaleSettings.detecting') : t('scaleSettings.detect')}
          </button>
        </div>
        {live && <p className="mt-2 text-xs text-slate-400">{t('scaleSettings.detectWhileLive')}</p>}
        {detectSummary && (
          <p className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-700">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            {detectSummary}
          </p>
        )}
        {detectResults && detectResults.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4">{t('scaleSettings.resultsPort')}</th>
                  <th className="py-2 pr-4">{t('scaleSettings.resultsBaud')}</th>
                  <th className="py-2 pr-4">{t('scaleSettings.resultsOutcome')}</th>
                  <th className="py-2">{t('scaleSettings.resultsDetail')}</th>
                </tr>
              </thead>
              <tbody>
                {detectResults.map((result, index) => (
                  <tr key={`${result.port}-${result.baud}-${index}`} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium text-slate-800">{result.port}</td>
                    <td className="py-2 pr-4 text-slate-600">{result.baud}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${outcomeStyles[result.outcome]}`}
                      >
                        {t(`scaleSettings.outcome.${result.outcome}`)}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-slate-500">{result.reply ?? result.detail ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Configuration */}
      {config && (
        <div className={cardClass}>
          <h4 className="text-sm font-semibold text-slate-900">{t('scaleSettings.configTitle')}</h4>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-slate-300"
                checked={config.enabled}
                onChange={(event) => void handleConfigSave({ enabled: event.target.checked })}
              />
              {t('scaleSettings.enabledLabel')}
            </label>
            <label className="block text-sm font-medium text-slate-700">
              <span className="mb-1 block">{t('scaleSettings.portLabel')}</span>
              <select
                className={fieldClass}
                value={config.port}
                onChange={(event) => void handleConfigSave({ port: event.target.value })}
              >
                <option value="auto">{t('scaleSettings.portAuto')}</option>
                {ports
                  .map((p) => p.path)
                  .concat(config.port !== 'auto' && !ports.some((p) => p.path === config.port) ? [config.port] : [])
                  .map((path) => (
                    <option key={path} value={path}>
                      {path}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              <span className="mb-1 block">{t('scaleSettings.baudLabel')}</span>
              <select
                className={fieldClass}
                value={config.baud}
                onChange={(event) => void handleConfigSave({ baud: Number(event.target.value) })}
              >
                {BAUD_OPTIONS.map((baud) => (
                  <option key={baud} value={baud}>
                    {baud}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-400">{t('scaleSettings.configHint')}</p>
          {saveState === 'saved' && (
            <p className="mt-1 text-xs font-medium text-emerald-600">{t('scaleSettings.saved')}</p>
          )}
        </div>
      )}

      {actionError && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{actionError}</div>
      )}
    </div>
  );
};

export default ScaleSettingsPanel;
