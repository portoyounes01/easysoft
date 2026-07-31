import { useEffect, useState } from 'react';
import type { PrinterConfigSnapshot } from '../types/electron';

/** App-wide printer-config SSOT (null on browser hosts / older shells).
 *  The main-process hardware controller owns which printer holds the receipt
 *  role and over which transport; every consumer (test cards, setup dialog,
 *  status displays) reads THIS instead of keeping its own scan/connect state.
 *  Initial pull is required — the change event only fires on later updates. */
export function usePrinterConfig(): PrinterConfigSnapshot | null {
    const [config, setConfig] = useState<PrinterConfigSnapshot | null>(null);

    useEffect(() => {
        const hardware = window.electronAPI?.hardware;
        if (!hardware?.getPrinterConfig) return;
        let cancelled = false;
        void hardware.getPrinterConfig().then((res) => {
            if (!cancelled && res?.success && res.config) setConfig(res.config);
        }).catch(() => { /* older shells: leave null */ });
        const off = hardware.onPrinterConfigChanged?.((snapshot) => {
            if (!cancelled) setConfig(snapshot);
        });
        return () => {
            cancelled = true;
            off?.();
        };
    }, []);

    return config;
}
