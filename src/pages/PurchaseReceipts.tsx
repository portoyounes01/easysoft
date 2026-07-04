import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileCheck2, FileText, Search } from 'lucide-react';

import { purchaseReceiptService } from '../services/purchaseReceiptService';
import type {
    LocalPurchaseReceipt,
    LocalPurchaseReceiptLine,
} from '../types/purchaseReceipt';

const PurchaseReceipts: React.FC = () => {
    const { t } = useTranslation();
    const [receipts, setReceipts] = useState<LocalPurchaseReceipt[]>([]);
    const [selectedReceipt, setSelectedReceipt] = useState<LocalPurchaseReceipt>();
    const [selectedLines, setSelectedLines] = useState<LocalPurchaseReceiptLine[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadReceipts = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setReceipts(await purchaseReceiptService.listReceipts());
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : t('purchaseReceipts.loadError'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadReceipts();
    }, [loadReceipts]);

    const openReceipt = async (receipt: LocalPurchaseReceipt) => {
        setSelectedReceipt(receipt);
        setSelectedLines(await purchaseReceiptService.getReceiptLines(receipt.id));
    };

    const filtered = receipts.filter(receipt =>
        [
            receipt.supplier_name,
            receipt.document_number,
            receipt.file_name,
            receipt.purchase_date,
        ].some(value => value?.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="mx-auto max-w-[1500px] space-y-6 pt-6">
            <header className="flex flex-col gap-4 rounded-[2rem] border border-white bg-white/85 p-6 shadow-xl sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">{t('purchaseReceipts.eyebrow')}</p>
                    <h1 className="mt-1 text-3xl font-semibold text-slate-950">{t('purchaseReceipts.pageTitle')}</h1>
                    <p className="mt-2 text-slate-500">{t('purchaseReceipts.pageSubtitle')}</p>
                </div>
                <div className="relative w-full sm:max-w-sm">
                    <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder={t('purchaseReceipts.searchPlaceholder')}
                        className="min-h-touch-sm w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 outline-none focus:ring-4 focus:ring-slate-200"
                    />
                </div>
            </header>

            {error && <div className="rounded-2xl bg-red-50 p-4 text-red-700">{error}</div>}

            <section className="overflow-hidden rounded-[2rem] border border-white bg-white/85 shadow-xl">
                {loading ? (
                    <p className="p-10 text-center text-slate-500">{t('purchaseReceipts.loading')}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-5 py-4">{t('purchaseReceipts.columnImported')}</th>
                                    <th className="px-5 py-4">{t('purchaseReceipts.columnSupplierDocument')}</th>
                                    <th className="px-5 py-4">{t('purchaseReceipts.columnPurchaseDate')}</th>
                                    <th className="px-5 py-4">{t('purchaseReceipts.columnLines')}</th>
                                    <th className="px-5 py-4">{t('purchaseReceipts.columnTotal')}</th>
                                    <th className="px-5 py-4">{t('purchaseReceipts.columnModel')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(receipt => (
                                    <tr
                                        key={receipt.id}
                                        onClick={() => void openReceipt(receipt)}
                                        className="cursor-pointer border-t border-slate-200 transition-colors hover:bg-slate-50"
                                    >
                                        <td className="whitespace-nowrap px-5 py-4">{receipt.created_at.toLocaleString()}</td>
                                        <td className="px-5 py-4">
                                            <p className="font-semibold text-slate-950">{receipt.supplier_name ?? t('purchaseReceipts.unknownSupplier')}</p>
                                            <p className="mt-1 text-xs text-slate-400">{receipt.document_number ?? receipt.file_name}</p>
                                        </td>
                                        <td className="px-5 py-4">{receipt.purchase_date ?? '—'}</td>
                                        <td className="px-5 py-4 font-semibold">{receipt.line_count}</td>
                                        <td className="px-5 py-4 font-semibold">
                                            {receipt.total === null ? '—' : `${receipt.total.toFixed(2)} ${receipt.currency}`}
                                        </td>
                                        <td className="px-5 py-4 text-xs text-slate-500">{receipt.extraction_model}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filtered.length === 0 && (
                            <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400">
                                <FileText className="h-12 w-12" />
                                <p className="mt-3">{t('purchaseReceipts.emptyState')}</p>
                            </div>
                        )}
                    </div>
                )}
            </section>

            {selectedReceipt && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4">
                    <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                                    <FileCheck2 className="h-6 w-6" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-semibold text-slate-950">{selectedReceipt.supplier_name ?? t('purchaseReceipts.detailTitleFallback')}</h2>
                                    <p className="text-sm text-slate-500">{selectedReceipt.document_number ?? selectedReceipt.file_name}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedReceipt(undefined)}
                                className="min-h-touch-xs rounded-xl bg-slate-100 px-4 font-semibold text-slate-700"
                            >
                                {t('common.close')}
                            </button>
                        </div>
                        <div className="mt-6 space-y-3">
                            {selectedLines.map(line => (
                                <div key={line.id} className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-[1fr_auto_auto]">
                                    <div>
                                        <p className="font-semibold text-slate-950">{line.description}</p>
                                        <p className="mt-1 text-xs text-slate-400">
                                            {t('purchaseReceipts.lineResolutionConfidence', {
                                                resolution: line.resolution.replace('_', ' '),
                                                confidence: Math.round(line.confidence * 100),
                                            })}
                                        </p>
                                    </div>
                                    <div className="text-sm">
                                        <p>{line.quantity} × €{line.unit_cost.toFixed(2)}</p>
                                        <p className="font-semibold">€{line.line_total.toFixed(2)}</p>
                                    </div>
                                    <div className="text-sm text-slate-500">
                                        {t('purchaseReceipts.stockChange', {
                                            before: line.stock_before ?? '—',
                                            after: line.stock_after ?? '—',
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PurchaseReceipts;
