import React, { useCallback, useEffect, useRef } from 'react';

export interface ScrollAreaProps {
    children: React.ReactNode;
    /** Outer wrapper classes — size/flex placement (e.g. 'flex-1 min-h-0'). */
    className?: string;
    style?: React.CSSProperties;
    /** Layout classes/styles for the scrollable content wrapper (flex/gap/padding of children). */
    contentClassName?: string;
    contentStyle?: React.CSSProperties;
    /** CSS length reserved between the content and the track (e.g. '2vh').
     *  Omit to overlay the track on the content's right edge. */
    gutter?: string;
}

/**
 * Vertical scroll container with the POS custom scrollbar: the native scrollbar is
 * hidden (Windows renders hard-cornered gray bars) and replaced by a rounded
 * indicator track/thumb that only appears when the content actually overflows.
 * Indicator only — dragging the thumb is not supported; users scroll the content.
 */
export const ScrollArea: React.FC<ScrollAreaProps> = ({
    children,
    className = '',
    style,
    contentClassName = '',
    contentStyle,
    gutter
}) => {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const trackRef = useRef<HTMLDivElement | null>(null);
    const thumbRef = useRef<HTMLDivElement | null>(null);

    const updateScrollbar = useCallback(() => {
        const container = scrollRef.current;
        const track = trackRef.current;
        const thumb = thumbRef.current;
        if (!container || !track || !thumb) return;

        const isScrollable = container.scrollHeight > container.clientHeight + 1;
        track.style.opacity = isScrollable ? '1' : '0';
        if (!isScrollable) return;

        const ratio = container.scrollTop / (container.scrollHeight - container.clientHeight || 1);
        const trackHeight = track.clientHeight; // use actual track height, not container height
        const bottomInsetPx = 4; // leave a small safe zone to avoid clipping at the bottom
        const effectiveTrack = Math.max(0, trackHeight - bottomInsetPx);
        const thumbHeight = Math.max(30, (container.clientHeight / container.scrollHeight) * effectiveTrack);
        const top = ratio * (effectiveTrack - thumbHeight);
        thumb.style.height = `${thumbHeight}px`;
        thumb.style.transform = `translateY(${top}px)`;
    }, []);

    useEffect(() => {
        updateScrollbar();
        // Observing both boxes covers every resize source: viewport changes shrink the
        // container, content changes (items added/removed) grow the scroll height.
        // Guarded: jsdom has no ResizeObserver.
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(() => updateScrollbar());
        if (scrollRef.current) observer.observe(scrollRef.current);
        if (contentRef.current) observer.observe(contentRef.current);
        return () => observer.disconnect();
    }, [updateScrollbar]);

    return (
        <div className={`relative ${className}`} style={style}>
            <div
                ref={scrollRef}
                className="h-full overflow-y-auto overscroll-contain hide-native-scrollbar"
                style={gutter ? { paddingRight: gutter } : undefined}
                onScroll={updateScrollbar}
                onMouseEnter={updateScrollbar}
            >
                <div ref={contentRef} className={contentClassName} style={contentStyle}>
                    {children}
                </div>
            </div>

            {/* Custom scrollbar track */}
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-2 flex">
                <div ref={trackRef} className="scroll-indicator-track w-full bg-[#F7F7F7] rounded-full relative my-2 transition-opacity duration-200 opacity-0">
                    <div ref={thumbRef} className="scroll-indicator-thumb absolute left-0 right-0 bg-[#D7D7D7] rounded-full" style={{ top: 0, height: 40 }} />
                </div>
            </div>
        </div>
    );
};
