import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Boxes, Search, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useSettings } from '../contexts/SettingsContext';
import {
    productLedgerService,
    type ProductLedgerRow,
    type RawMaterialLedgerRow,
} from '../services/productLedgerService';

const firstOfMonth = (): string => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
};
const today = (): string => new Date().toISOString().slice(0, 10);

const StockProfitReport: React.FC = () => {
    const { t } = useTranslation();
    const { settings } = useSettings();
    const currency = settings.pos.currencySymbol;
    const money = (value: number) => `${currency}${value.toFixed(2)}`;

    const [start, setStart] = useState(firstOfMonth);
    const [end, setEnd] = useState(today);
    const [search, setSearch] = useState('');
    const [rows, setRows] = useState<ProductLedgerRow[]>([]);
    const [rawRows, setRawRows] = useState<RawMaterialLedgerRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const report = await productLedgerService.getReport(start, end);
            setRows(report.products);
            setRawRows(report.rawMaterials);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : t('stockProfit.errorLoadReport'));
        } finally {
            setLoading(false);
        }
    }, [start, end]);

    useEffect(() => {
        void load();
    }, [load]);

    const filtered = useMemo(
        () => rows.filter(row => `${row.productName} ${row.sku}`.toLowerCase().includes(search.toLowerCase())),
        [rows, search]
    );
    const filteredRaw = useMemo(
        () => rawRows.filter(row => row.name.toLowerCase().includes(search.toLowerCase())),
        [rawRows, search]
    );

    const totals = useMemo(
        () =>
            filtered.reduce(
                (acc, row) => ({
                    purchasedValue: acc.purchasedValue + row.purchasedValue,
                    soldValue: acc.soldValue + row.soldValue,
                    profit: acc.profit + row.profit,
                }),
                { purchasedValue: 0, soldValue: 0, profit: 0 }
            ),
        [filtered]
    );

    return (
        <div className="mx-auto max-w-[1500px] space-y-6 pt-6">
            <header className="flex flex-col gap-4 rounded-[2rem] border border-white bg-white/85 p-6 shadow-xl sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">{t('stockProfit.reportingEyebrow')}</p>
                    <h1 className="mt-1 text-3xl font-semibold text-slate-950">{t('stockProfit.title')}</h1>
                    <p className="mt-2 text-slate-500">{t('stockProfit.subtitle')}</p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <label className="text-xs font-semibold text-slate-500">
                        {t('stockProfit.fromLabel')}
                        <input type="date" value={start} max={end} onChange={e => setStart(e.target.value)} className={dateClass} />
                    </label>
                    <label className="text-xs font-semibold text-slate-500">
                        {t('stockProfit.toLabel')}
                        <input type="date" value={end} min={start} max={today()} onChange={e => setEnd(e.target.value)} className={dateClass} />
                    </label>
                </div>
            </header>

            {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

            <div className="grid gap-4 sm:grid-cols-3">
                <SummaryCard icon={ArrowDownCircle} label={t('stockProfit.summaryPurchased')} value={money(totals.purchasedValue)} />
                <SummaryCard icon={ArrowUpCircle} label={t('stockProfit.summarySold')} value={money(totals.soldValue)} />
                <SummaryCard icon={TrendingUp} label={t('stockProfit.summaryProfit')} value={money(totals.profit)} accent />
            </div>

            <section className="overflow-hidden rounded-[2rem] border border-white bg-white/85 shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
                    <h2 className="text-lg font-semibold text-slate-950">{t('stockProfit.finishedGoodsTitle')}</h2>
                    <div className="relative w-full max-w-xs">
                        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={t('stockProfit.searchProductsPlaceholder')}
                            className="min-h-touch-sm w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 outline-none focus:ring-4 focus:ring-slate-200"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="p-10 text-center text-slate-500">{t('common.loading')}</div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 p-10 text-center text-slate-400">
                        <Boxes className="h-10 w-10" />
                        <p>{t('stockProfit.noProductsMatch')}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-5 py-3">{t('stockProfit.columnProduct')}</th>
                                    <th className="px-5 py-3 text-right">{t('stockProfit.columnPurchased')}</th>
                                    <th className="px-5 py-3 text-right">{t('stockProfit.columnSold')}</th>
                                    <th className="px-5 py-3 text-right">{t('stockProfit.columnRemaining')}</th>
                                    <th className="px-5 py-3 text-right">{t('stockProfit.columnProfit')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtered.map(row => (
                                    <tr key={row.productId}>
                                        <td className="px-5 py-3">
                                            <div className="font-semibold text-slate-950">{row.productName}</div>
                                            <div className="text-xs text-slate-400">{row.sku}</div>
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <div className="font-semibold text-slate-950">{row.purchasedQty}</div>
                                            <div className="text-xs text-slate-400">{money(row.purchasedValue)}</div>
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <div className="font-semibold text-slate-950">{row.soldQty}</div>
                                            <div className="text-xs text-slate-400">{money(row.soldValue)}</div>
                                        </td>
                                        <td className="px-5 py-3 text-right font-semibold text-slate-700">{row.remaining}</td>
                                        <td className={`px-5 py-3 text-right font-semibold ${row.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {money(row.profit)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-slate-200 font-semibold text-slate-950">
                                    <td className="px-5 py-3">{t('stockProfit.totalRow')}</td>
                                    <td className="px-5 py-3 text-right">{money(totals.purchasedValue)}</td>
                                    <td className="px-5 py-3 text-right">{money(totals.soldValue)}</td>
                                    <td className="px-5 py-3" />
                                    <td className="px-5 py-3 text-right">{money(totals.profit)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </section>

            <section className="overflow-hidden rounded-[2rem] border border-white bg-white/85 shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-950">{t('stockProfit.rawMaterialsTitle')}</h2>
                        <p className="text-sm text-slate-500">{t('stockProfit.rawMaterialsSubtitle')}</p>
                    </div>
                </div>

                {loading ? (
                    <div className="p-10 text-center text-slate-500">{t('common.loading')}</div>
                ) : filteredRaw.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 p-10 text-center text-slate-400">
                        <Boxes className="h-10 w-10" />
                        <p>{t('stockProfit.noRawMaterials')}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-5 py-3">{t('stockProfit.columnRawItem')}</th>
                                    <th className="px-5 py-3 text-right">{t('stockProfit.columnPurchased')}</th>
                                    <th className="px-5 py-3 text-right">{t('stockProfit.columnConsumed')}</th>
                                    <th className="px-5 py-3 text-right">{t('stockProfit.columnRemaining')}</th>
                                    <th className="px-5 py-3 text-right">{t('stockProfit.columnStockValue')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredRaw.map(row => {
                                    const fmt = (n: number) => `${Number(n.toFixed(3))} ${row.unit}`;
                                    return (
                                        <tr key={row.rawMaterialId}>
                                            <td className="px-5 py-3 font-semibold text-slate-950">{row.name}</td>
                                            <td className="px-5 py-3 text-right">
                                                <div className="font-semibold text-slate-950">{fmt(row.purchasedQty)}</div>
                                                <div className="text-xs text-slate-400">{money(row.purchasedValue)}</div>
                                            </td>
                                            <td className="px-5 py-3 text-right font-semibold text-slate-700">{fmt(row.consumedQty)}</td>
                                            <td className="px-5 py-3 text-right font-semibold text-slate-700">{fmt(row.remaining)}</td>
                                            <td className="px-5 py-3 text-right text-slate-600">{money(row.stockValue)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <p className="px-1 text-xs text-slate-400">
                {t('stockProfit.footnote')}
            </p>
        </div>
    );
};

const dateClass = 'mt-1 block min-h-touch-sm rounded-2xl border border-slate-300 px-3 text-sm font-medium text-slate-900 outline-none focus:ring-4 focus:ring-slate-200';

const SummaryCard: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; value: string; accent?: boolean }> = ({ icon: Icon, label, value, accent = false }) => (
    <div className={`rounded-[2rem] border p-5 shadow-lg ${accent ? 'border-emerald-200 bg-emerald-50' : 'border-white bg-white/85'}`}>
        <Icon className={`h-6 w-6 ${accent ? 'text-emerald-600' : 'text-slate-500'}`} />
        <p className="mt-4 text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-3xl font-semibold text-slate-950">{value}</p>
    </div>
);

export default StockProfitReport;
