import React, { useEffect, useRef } from 'react';
import ThermalReceipt, { ReceiptProps } from './ThermalReceipt';

interface ReceiptPdfRendererProps {
    receipt: ReceiptProps;
    /** Download filename, e.g. "FT-FAT2026-0012.pdf". */
    filename: string;
    /** Called once the PDF is saved (or generation failed) — unmount the renderer here. */
    onDone: (ok: boolean) => void;
}

/**
 * Renders a ThermalReceipt off-screen (inside the normal provider tree, so useSettings etc.
 * keep working), rasterizes it with html2canvas and saves it as an 80mm-wide PDF via jsPDF.
 * Both libs are dynamically imported so they stay out of the main bundle.
 *
 * Mount it conditionally with the receipt to download; it fires once and reports via onDone.
 * Pass `qrCodeImage` pre-generated in the receipt props when possible — the fallback wait
 * below covers the async in-component QR generation, but pre-generation is deterministic.
 */
const ReceiptPdfRenderer: React.FC<ReceiptPdfRendererProps> = ({ receipt, filename, onDone }) => {
    const hostRef = useRef<HTMLDivElement>(null);
    const startedRef = useRef(false);

    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        let cancelled = false;

        (async () => {
            try {
                // Let the receipt (and its async QR effect, if any) settle.
                await new Promise((r) => setTimeout(r, 400));
                const el = hostRef.current;
                if (!el) throw new Error('receipt host not mounted');
                const imgs = Array.from(el.querySelectorAll('img'));
                await Promise.all(
                    imgs.map((img) =>
                        typeof img.decode === 'function' ? img.decode().catch(() => undefined) : Promise.resolve(undefined),
                    ),
                );

                const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
                    import('html2canvas'),
                    import('jspdf'),
                ]);
                const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false });
                const widthMm = 80; // thermal paper width — matches ThermalReceipt's CSS
                const heightMm = Math.max(30, (canvas.height / canvas.width) * widthMm);
                const pdf = new jsPDF({ unit: 'mm', format: [widthMm, heightMm], orientation: 'portrait' });
                pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, widthMm, heightMm);
                pdf.save(filename);
                if (!cancelled) onDone(true);
            } catch (e) {
                console.error('Receipt PDF generation failed:', e);
                if (!cancelled) onDone(false);
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div aria-hidden style={{ position: 'fixed', left: '-10000px', top: 0, zIndex: -1, background: '#ffffff' }}>
            <div ref={hostRef} style={{ background: '#ffffff', width: 'fit-content' }}>
                <ThermalReceipt {...receipt} />
            </div>
        </div>
    );
};

export default ReceiptPdfRenderer;
