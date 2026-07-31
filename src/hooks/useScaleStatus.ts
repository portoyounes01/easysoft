import { useEffect, useState } from 'react';
import scaleService from '../services/scaleService';
import type { ScaleStatusInfo } from '../types/electron';

/** Live scale status (null until the first snapshot, or when the shell has
 *  no scale bridge). Pure consumer: never starts or stops the session. */
export function useScaleStatus(): ScaleStatusInfo | null {
    const [status, setStatus] = useState<ScaleStatusInfo | null>(null);

    useEffect(() => {
        if (!scaleService.isAvailable()) return;
        let cancelled = false;
        void scaleService.getStatus().then((r) => {
            if (!cancelled && r.success && r.status) setStatus(r.status);
        });
        const off = scaleService.onStatusChange((s) => {
            if (!cancelled) setStatus(s);
        });
        return () => {
            cancelled = true;
            off();
        };
    }, []);

    return status;
}
