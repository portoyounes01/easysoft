import { useEffect, useState } from 'react';
import type { ShellUpdateStatus } from '../types/electron';

/** Live shell auto-update status (null on the PWA host / pre-Stage-3 shells).
 *  Initial pull is REQUIRED: 'disabled' and the boot 'idle' are never pushed —
 *  only later transitions arrive over onUpdateStatus. */
export function useShellUpdateStatus(): ShellUpdateStatus | null {
    const [status, setStatus] = useState<ShellUpdateStatus | null>(null);

    useEffect(() => {
        const shell = window.electronAPI?.shell;
        if (!shell?.getUpdateStatus) return;
        let cancelled = false;
        void shell.getUpdateStatus().then((s) => {
            if (!cancelled && s) setStatus(s);
        }).catch(() => { /* pre-update shells: leave null */ });
        const off = shell.onUpdateStatus?.((s) => {
            if (!cancelled) setStatus(s);
        });
        return () => {
            cancelled = true;
            off?.();
        };
    }, []);

    return status;
}
