import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, KeyRound, RefreshCw, Weight, X } from 'lucide-react';
import scaleService from '../services/scaleService';
import { useScaleStatus } from '../hooks/useScaleStatus';
import manualWeightAuditService from '../services/manualWeightAuditService';
import type { LocalProduct } from '../types/supabase';
import type { ScaleReading } from '../types/electron';

interface WeighDialogProps {
  product: LocalProduct | null;
  /** Remaining sellable stock in kg; undefined = no stock limit enforced. */
  maxWeightKg?: number;
  /** Cashier performing the sale (for the manual-entry audit trail). */
  cashier: { id: string; name: string } | null;
  onConfirm: (weightKg: number) => void;
  onClose: () => void;
}

/** Normalize a scale reading to kg (the CAS can be configured in grams).
 *  Any other unit (lb/oz/t or a frame without a unit) must NOT be priced as
 *  kg — return null so the Add button stays disabled. */
function readingToKg(reading: ScaleReading): number | null {
  if (reading.unit === 'kg') return reading.weight;
  if (reading.unit === 'g') return reading.weight / 1000;
  return null;
}

const fieldClass =
  'min-h-touch-sm w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-slate-400';

/**
 * Weigh-item dialog. The scale session is till-scoped (started by the POS
 * page); this dialog is a pure consumer of status + readings — it never
 * stops the session, and only calls start() defensively in case the session
 * was stopped from the diagnostics panel.
 *
 * Scale present  → live weight, Add gated on a stable positive reading.
 * Scale offline  → ONE stable panel (no flapping between "waiting" and
 *                  "unavailable" while the controller's retry loop runs):
 *                  retry hint + "Try again" + PIN-gated manual weight entry
 *                  (manager/admin PIN, audit-logged — REGISTER D-SC3).
 */
export const WeighDialog: React.FC<WeighDialogProps> = ({
  product,
  maxWeightKg,
  cashier,
  onConfirm,
  onClose,
}) => {
  const { t } = useTranslation();
  const open = product !== null;
  const status = useScaleStatus();
  const [reading, setReading] = useState<ScaleReading | null>(null);
  const [scaleDisabled, setScaleDisabled] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Manual entry state
  const [manualWeight, setManualWeight] = useState('');
  const [managerNumber, setManagerNumber] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReading(null);
    setScaleDisabled(false);
    setManualWeight('');
    setManagerNumber('');
    setManagerPin('');
    setManualError(null);

    if (!scaleService.isAvailable()) return;
    const offReading = scaleService.onReading(setReading);
    // Defensive: the till session normally already runs (started by POS);
    // if it was stopped in the diagnostics panel, restart it. Never stopped
    // here — the session belongs to the till, not this dialog.
    void scaleService.start().then((result) => {
      if (!result.success && result.error?.toLowerCase().includes('disabled')) {
        setScaleDisabled(true);
      }
    });
    return () => {
      offReading();
    };
  }, [open]);

  if (!open || !product) return null;

  const bridgeMissing = !scaleService.isAvailable();
  const connected = !bridgeMissing && !scaleDisabled && status?.state === 'connected';
  // First status snapshot is in flight (milliseconds): show the live layout,
  // not a one-frame flash of the offline panel.
  const statusPending = !bridgeMissing && !scaleDisabled && status === null;
  const scaleState = bridgeMissing
    ? 'no-bridge'
    : scaleDisabled
      ? 'disabled'
      : status?.state ?? 'unknown';

  const weightKg = connected && reading ? readingToKg(reading) : null;
  const overStock = maxWeightKg !== undefined && weightKg !== null && weightKg > maxWeightKg + 1e-9;
  const canAdd =
    connected && reading !== null && reading.stable && weightKg !== null && weightKg > 0 && !overStock;
  const lineTotal = (weightKg ?? 0) * product.price;

  const parsedManual = Number.parseFloat(manualWeight.replace(',', '.'));
  const manualKg = Number.isFinite(parsedManual) ? Number(parsedManual.toFixed(3)) : NaN;
  const manualValid =
    Number.isFinite(manualKg) &&
    manualKg > 0 &&
    (maxWeightKg === undefined || manualKg <= maxWeightKg + 1e-9);
  const canAuthorize =
    manualValid && managerNumber.trim().length > 0 && managerPin.length > 0 && !authBusy && cashier !== null;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      // stop + start forces an immediate re-detection instead of waiting for
      // the controller's next 5s retry tick.
      await scaleService.stop();
      const result = await scaleService.start();
      if (!result.success && result.error?.toLowerCase().includes('disabled')) {
        setScaleDisabled(true);
      }
    } finally {
      setRetrying(false);
    }
  };

  const handleManualAuthorize = async () => {
    if (!canAuthorize || !cashier) return;
    setAuthBusy(true);
    setManualError(null);
    try {
      const auth = await manualWeightAuditService.authorize(managerNumber, managerPin);
      if (!auth.success || !auth.authorizer) {
        setManualError(
          auth.error === 'locked'
            ? t('weighDialog.manualAuthLocked')
            : auth.error === 'not_manager'
              ? t('weighDialog.manualAuthNotManager')
              : auth.error === 'offline'
                ? t('weighDialog.manualAuthOffline')
                : t('weighDialog.manualAuthInvalid')
        );
        setManagerPin('');
        return;
      }
      await manualWeightAuditService.log({
        product: { id: product.id, name: product.name },
        weightKg: manualKg,
        cashier,
        authorizer: auth.authorizer,
        scaleState,
      });
      onConfirm(manualKg);
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
              <Weight className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{product.name}</h2>
              <p className="text-sm text-slate-500">
                {t('weighDialog.pricePerKg', { price: product.price.toFixed(2) })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {connected || statusPending ? (
          <>
            <div className="mt-6 rounded-2xl bg-slate-50 p-6 text-center">
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-6xl font-extrabold tabular-nums text-slate-900">
                  {weightKg !== null ? weightKg.toFixed(3) : '–.–––'}
                </span>
                <span className="text-2xl font-semibold text-slate-500">kg</span>
              </div>
              <div className="mt-3 flex items-center justify-center gap-2">
                {reading && weightKg !== null ? (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      reading.stable ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {reading.stable ? t('weighDialog.stable') : t('weighDialog.settling')}
                  </span>
                ) : (
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700 animate-pulse">
                    {t('weighDialog.waitingForScale')}
                  </span>
                )}
              </div>
              {overStock && (
                <p className="mt-2 text-sm font-medium text-amber-700">
                  {t('weighDialog.overStock', { max: (maxWeightKg ?? 0).toFixed(3) })}
                </p>
              )}
              <p className="mt-4 text-lg font-semibold text-slate-700">
                {t('weighDialog.lineTotal', { total: lineTotal.toFixed(2) })}
              </p>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="min-h-touch flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={!canAdd}
                onClick={() => weightKg !== null && onConfirm(Number(weightKg.toFixed(3)))}
                className="min-h-touch flex-1 rounded-2xl bg-emerald-600 px-4 py-3 font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('weighDialog.addWeight', { weight: weightKg !== null ? weightKg.toFixed(3) : '—' })}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* ONE stable offline panel: the controller's detect/wait/retry
                cycle must not flap this UI between "waiting" and "failed". */}
            <div className="mt-6 rounded-2xl bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-amber-900">
                    {scaleDisabled ? t('weighDialog.scaleDisabled') : t('weighDialog.scaleNotDetected')}
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    {bridgeMissing
                      ? t('weighDialog.noScaleBridge')
                      : scaleDisabled
                        ? t('weighDialog.scaleDisabledHint')
                        : t('weighDialog.scaleNotDetectedHint')}
                  </p>
                </div>
                {!bridgeMissing && !scaleDisabled && (
                  <button
                    type="button"
                    onClick={() => void handleRetry()}
                    disabled={retrying}
                    className="min-h-touch-sm inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-amber-800 shadow-sm transition-colors hover:bg-amber-100 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
                    {t('weighDialog.tryAgain')}
                  </button>
                )}
              </div>
            </div>

            {/* PIN-gated, audit-logged manual weight entry (D-SC3). */}
            <div className="mt-4 rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-bold text-slate-800">{t('weighDialog.manualTitle')}</h3>
              </div>
              <p className="mt-1 text-xs text-slate-500">{t('weighDialog.manualHint')}</p>

              <div className="mt-3 grid gap-3">
                <label className="block text-sm font-medium text-slate-700">
                  <span className="mb-1 block">{t('weighDialog.manualWeightLabel')}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={manualWeight}
                    onChange={(e) => setManualWeight(e.target.value)}
                    className={fieldClass}
                    placeholder="0.000"
                  />
                </label>
                {manualWeight.trim() !== '' && !manualValid && (
                  <p className="text-xs font-medium text-red-600">
                    {Number.isFinite(manualKg) && manualKg > 0 && maxWeightKg !== undefined
                      ? t('weighDialog.overStock', { max: maxWeightKg.toFixed(3) })
                      : t('weighDialog.manualWeightInvalid')}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm font-medium text-slate-700">
                    <span className="mb-1 block">{t('weighDialog.managerNumberLabel')}</span>
                    <input
                      type="text"
                      value={managerNumber}
                      onChange={(e) => setManagerNumber(e.target.value)}
                      className={fieldClass}
                      autoComplete="off"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    <span className="mb-1 block">{t('weighDialog.managerPinLabel')}</span>
                    <input
                      type="password"
                      inputMode="numeric"
                      value={managerPin}
                      onChange={(e) => setManagerPin(e.target.value)}
                      className={fieldClass}
                      autoComplete="off"
                    />
                  </label>
                </div>
                {manualError && (
                  <p className="text-xs font-medium text-red-600">{manualError}</p>
                )}
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="min-h-touch flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={!canAuthorize}
                onClick={() => void handleManualAuthorize()}
                className="min-h-touch flex-1 rounded-2xl bg-slate-800 px-4 py-3 font-bold text-white transition-colors hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {authBusy ? t('weighDialog.manualAuthorizing') : t('weighDialog.manualAuthorize')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default WeighDialog;
