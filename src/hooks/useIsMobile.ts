import { useEffect, useState } from 'react';

/**
 * True below the given breakpoint (default 768px = Tailwind `md`). Use to swap whole
 * layouts (e.g. dialog vs full-screen sheet) where CSS-only show/hide would duplicate
 * DOM (duplicate form ids, double-rendered inputs).
 */
export function useIsMobile(breakpointPx = 768): boolean {
    const [isMobile, setIsMobile] = useState<boolean>(
        () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${breakpointPx - 1}px)`).matches,
    );

    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
        const onChange = () => setIsMobile(mq.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, [breakpointPx]);

    return isMobile;
}
