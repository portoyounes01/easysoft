import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    AlertTriangle,
    Camera,
    CheckCircle,
    FileText,
    Loader2,
    PackagePlus,
    ScanLine,
    Trash2,
    Upload,
    X,
} from 'lucide-react';

import { useProducts } from '../contexts/ProductsContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import {
    matchPurchaseLines,
    purchaseReceiptService,
} from '../services/purchaseReceiptService';
import { rawMaterialService } from '../services/rawMaterialService';
import type {
    PurchaseDocumentExtraction,
    PurchaseDocumentType,
    PurchaseReceiptDraftLine,
    PurchaseLineResolution,
} from '../types/purchaseReceipt';
import { RAW_MATERIAL_UNITS, type LocalRawMaterial, type RawMaterialUnit } from '../types/rawMaterial';

interface PurchaseReceiptImportDialogProps {
    open: boolean;
    onClose: () => void;
    onApplied: () => Promise<void> | void;
}

const fieldClass =
    'min-h-touch-xs w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500 focus:ring-4 focus:ring-slate-200';

const PurchaseReceiptImportDialog: React.FC<PurchaseReceiptImportDialogProps> = ({
    open,
    onClose,
    onApplied,
}) => {
    const { t } = useTranslation();
    const { employee } = useSupabaseAuth();
    const { products, categories } = useProducts();
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File>();
    const [previewUrl, setPreviewUrl] = useState('');
    const [documentType, setDocumentType] = useState<PurchaseDocumentType>('auto');
    const [extraction, setExtraction] = useState<PurchaseDocumentExtraction>();
    const [lines, setLines] = useState<PurchaseReceiptDraftLine[]>([]);
    const [processing, setProcessing] = useState(false);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [rawMaterials, setRawMaterials] = useState<LocalRawMaterial[]>([]);

    useEffect(() => {
        if (!open) return;
        void rawMaterialService.list().then(setRawMaterials).catch(() => setRawMaterials([]));
    }, [open]);

    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    useEffect(() => {
        if (open) return;
        setFile(undefined);
        setExtraction(undefined);
        setLines([]);
        setError('');
        setSuccess('');
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl('');
    }, [open, previewUrl]);

    const includedLines = useMemo(
        () => lines.filter(line => line.resolution !== 'ignored'),
        [lines]
    );
    const stockUnits = includedLines.reduce((total, line) => total + line.quantity, 0);
    const purchaseValue = includedLines.reduce(
        (total, line) => total + line.quantity * line.unitCost,
        0
    );

    const updateLine = (id: string, patch: Partial<PurchaseReceiptDraftLine>) => {
        setLines(current => current.map(line => {
            if (line.id !== id) return line;
            const next = { ...line, ...patch };
            return {
                ...next,
                lineTotal: Number((next.quantity * next.unitCost).toFixed(2)),
            };
        }));
    };

    const handleFile = (selected?: File) => {
        if (!selected) return;
        if (!selected.type.match(/^(image\/(jpeg|jpg|png|webp|heif|tiff)|application\/pdf)$/)) {
            setError(t('purchaseReceiptImport.invalidFileType'));
            return;
        }
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setFile(selected);
        setPreviewUrl(URL.createObjectURL(selected));
        setExtraction(undefined);
        setLines([]);
        setError('');
        setSuccess('');
    };

    const handleExtract = async () => {
        if (!file || !employee) return;
        setProcessing(true);
        setError('');
        setSuccess('');
        try {
            const result = await purchaseReceiptService.extract({
                file,
                documentType,
                employeeId: employee.id,
                employeeNumber: employee.employee_number,
            });
            setExtraction(result);
            setLines(matchPurchaseLines(result, products));
            if (result.lines.length === 0) {
                setError(t('purchaseReceiptImport.noLinesFound'));
            }
        } catch (extractError) {
            setError(extractError instanceof Error ? extractError.message : t('purchaseReceiptImport.extractError'));
        } finally {
            setProcessing(false);
        }
    };

    const addManualLine = () => {
        setLines(current => [
            ...current,
            {
                id: crypto.randomUUID(),
                description: '',
                productCode: null,
                quantity: 1,
                unitCost: 0,
                lineTotal: 0,
                confidence: 1,
                resolution: 'new_product',
                matchedProductId: null,
                newProductName: '',
                newProductSku: `IMP-${Date.now()}`,
                newProductCategoryId: categories[0]?.id ?? null,
                newProductSellingPrice: 0,
                rawMaterialId: null,
                newRawMaterialName: '',
                newRawMaterialUnit: 'pcs',
            },
        ]);
    };

    const handleApply = async () => {
        if (!file || !employee || !extraction) return;
        setApplying(true);
        setError('');
        setSuccess('');
        try {
            await purchaseReceiptService.apply({
                file,
                documentType,
                extraction,
                lines,
                employeeId: employee.id,
            });
            await onApplied();
            setSuccess(t('purchaseReceiptImport.linesApplied', { count: includedLines.length }));
        } catch (applyError) {
            setError(applyError instanceof Error ? applyError.message : t('purchaseReceiptImport.applyError'));
        } finally {
            setApplying(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-3">
            <div className="flex max-h-[96vh] w-full max-w-7xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
                <header className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                    <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                            <ScanLine className="h-7 w-7" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-semibold text-slate-950">{t('purchaseReceiptImport.title')}</h2>
                            <p className="text-sm text-slate-500">{t('purchaseReceiptImport.subtitle')}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex min-h-touch-xs min-w-[2.75rem] items-center justify-center rounded-2xl bg-slate-100"
                        aria-label={t('purchaseReceiptImport.closeAria')}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </header>

                <div className="grid min-h-0 flex-1 lg:grid-cols-[22rem_minmax(0,1fr)]">
                    <aside className="overflow-y-auto border-b border-slate-200 bg-slate-50 p-5 lg:border-b-0 lg:border-r">
                        <input
                            ref={uploadInputRef}
                            type="file"
                            className="hidden"
                            accept="image/jpeg,image/png,image/webp,image/heif,image/tiff,application/pdf"
                            onChange={event => handleFile(event.target.files?.[0])}
                        />
                        <input
                            ref={cameraInputRef}
                            type="file"
                            className="hidden"
                            accept="image/*"
                            capture="environment"
                            onChange={event => handleFile(event.target.files?.[0])}
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => cameraInputRef.current?.click()}
                                className="flex min-h-touch flex-col items-center justify-center gap-2 rounded-2xl bg-slate-950 px-3 text-sm font-semibold text-white"
                            >
                                <Camera className="h-5 w-5" /> {t('purchaseReceiptImport.scan')}
                            </button>
                            <button
                                type="button"
                                onClick={() => uploadInputRef.current?.click()}
                                className="flex min-h-touch flex-col items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
                            >
                                <Upload className="h-5 w-5" /> {t('purchaseReceiptImport.upload')}
                            </button>
                        </div>

                        <label className="mt-5 block text-sm font-semibold text-slate-700">
                            {t('purchaseReceiptImport.documentType')}
                            <select
                                value={documentType}
                                onChange={event => setDocumentType(event.target.value as PurchaseDocumentType)}
                                className={`${fieldClass} mt-2`}
                            >
                                <option value="auto">{t('purchaseReceiptImport.detectAutomatically')}</option>
                                <option value="receipt">{t('purchaseReceiptImport.receipt')}</option>
                                <option value="invoice">{t('purchaseReceiptImport.supplierInvoice')}</option>
                            </select>
                        </label>

                        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            {!file ? (
                                <div className="flex min-h-64 flex-col items-center justify-center p-5 text-center text-slate-400">
                                    <FileText className="h-12 w-12" />
                                    <p className="mt-3 text-sm">{t('purchaseReceiptImport.uploadHint')}</p>
                                </div>
                            ) : file.type === 'application/pdf' ? (
                                <object data={previewUrl} type="application/pdf" className="h-72 w-full">
                                    <div className="p-5 text-sm">{file.name}</div>
                                </object>
                            ) : (
                                <img src={previewUrl} alt={t('purchaseReceiptImport.previewAlt')} className="max-h-72 w-full object-contain" />
                            )}
                            {file && (
                                <div className="border-t border-slate-200 p-3">
                                    <p className="truncate text-sm font-semibold text-slate-800">{file.name}</p>
                                    <p className="text-xs text-slate-400">{t('purchaseReceiptImport.fileSizeKb', { size: (file.size / 1024).toFixed(0) })}</p>
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            disabled={!file || processing}
                            onClick={() => void handleExtract()}
                            className="mt-5 flex min-h-touch w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
                        >
                            {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScanLine className="h-5 w-5" />}
                            {processing ? t('purchaseReceiptImport.readingDocument') : t('purchaseReceiptImport.extractWithAzure')}
                        </button>

                        {extraction && (
                            <div className="mt-5 space-y-3 rounded-2xl bg-white p-4 text-sm">
                                <Info label={t('purchaseReceiptImport.supplier')} value={extraction.supplierName ?? t('purchaseReceiptImport.notDetected')} />
                                <Info label={t('purchaseReceiptImport.document')} value={extraction.documentNumber ?? t('purchaseReceiptImport.notDetected')} />
                                <Info label={t('purchaseReceiptImport.date')} value={extraction.purchaseDate ?? t('purchaseReceiptImport.notDetected')} />
                                <Info label={t('purchaseReceiptImport.total')} value={extraction.total === null ? t('purchaseReceiptImport.notDetected') : `${extraction.total.toFixed(2)} ${extraction.currency}`} />
                                <Info label={t('purchaseReceiptImport.model')} value={extraction.model} />
                            </div>
                        )}
                    </aside>

                    <main className="flex min-h-0 flex-col p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-xl font-semibold text-slate-950">{t('purchaseReceiptImport.purchaseLines')}</h3>
                                <p className="text-sm text-slate-500">{t('purchaseReceiptImport.purchaseLinesHint')}</p>
                            </div>
                            <button
                                type="button"
                                onClick={addManualLine}
                                disabled={!extraction}
                                className="min-h-touch-xs rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-700 disabled:opacity-40"
                            >
                                {t('purchaseReceiptImport.addManualLine')}
                            </button>
                        </div>

                        {error && (
                            <div className="mt-4 flex items-start gap-2 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /> {error}
                            </div>
                        )}
                        {success && (
                            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
                                <CheckCircle className="h-5 w-5" /> {success}
                            </div>
                        )}

                        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
                            <div className="space-y-4">
                                {lines.map((line, index) => (
                                    <PurchaseLineEditor
                                        key={line.id}
                                        index={index}
                                        line={line}
                                        products={products}
                                        categories={categories}
                                        rawMaterials={rawMaterials}
                                        onChange={patch => updateLine(line.id, patch)}
                                        onDelete={() => setLines(current => current.filter(item => item.id !== line.id))}
                                    />
                                ))}
                                {!extraction && (
                                    <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 text-center text-slate-400">
                                        <PackagePlus className="h-14 w-14" />
                                        <p className="mt-3 font-semibold">{t('purchaseReceiptImport.emptyState')}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <footer className="mt-5 flex flex-col gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-wrap gap-5 text-sm">
                                <Info label={t('purchaseReceiptImport.includedLines')} value={String(includedLines.length)} />
                                <Info label={t('purchaseReceiptImport.unitsToAdd')} value={String(stockUnits)} />
                                <Info label={t('purchaseReceiptImport.purchaseValue')} value={`€${purchaseValue.toFixed(2)}`} />
                            </div>
                            <button
                                type="button"
                                disabled={!extraction || includedLines.length === 0 || applying || Boolean(success)}
                                onClick={() => void handleApply()}
                                className="flex min-h-touch items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 font-semibold text-white disabled:bg-slate-300"
                            >
                                {applying ? <Loader2 className="h-5 w-5 animate-spin" /> : <PackagePlus className="h-5 w-5" />}
                                {applying ? t('purchaseReceiptImport.updatingStock') : t('purchaseReceiptImport.confirmAddToStock')}
                            </button>
                        </footer>
                    </main>
                </div>
            </div>
        </div>
    );
};

interface PurchaseLineEditorProps {
    index: number;
    line: PurchaseReceiptDraftLine;
    products: ReturnType<typeof useProducts>['products'];
    categories: ReturnType<typeof useProducts>['categories'];
    rawMaterials: LocalRawMaterial[];
    onChange: (patch: Partial<PurchaseReceiptDraftLine>) => void;
    onDelete: () => void;
}

const PurchaseLineEditor: React.FC<PurchaseLineEditorProps> = ({
    index,
    line,
    products,
    categories,
    rawMaterials,
    onChange,
    onDelete,
}) => {
    const { t } = useTranslation();
    const lowConfidence = line.confidence < 0.7;
    return (
        <section className={`rounded-3xl border p-4 ${lowConfidence ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
                    <div>
                        <p className="font-semibold text-slate-950">{line.description || t('purchaseReceiptImport.manualLine')}</p>
                        <p className={`text-xs ${lowConfidence ? 'text-amber-700' : 'text-slate-400'}`}>
                            {t('purchaseReceiptImport.azureConfidence', { confidence: Math.round(line.confidence * 100) })}
                        </p>
                    </div>
                </div>
                <button type="button" onClick={onDelete} className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <label className="text-xs font-semibold text-slate-500 sm:col-span-2">
                    {t('purchaseReceiptImport.receiptDescription')}
                    <input value={line.description} onChange={event => onChange({ description: event.target.value, newProductName: event.target.value })} className={`${fieldClass} mt-1`} />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                    {t('purchaseReceiptImport.quantity')}
                    <input type="number" min="0.001" step="0.001" value={line.quantity} onChange={event => onChange({ quantity: Number(event.target.value) })} className={`${fieldClass} mt-1`} />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                    {t('purchaseReceiptImport.unitCost')}
                    <input type="number" min="0" step="0.01" value={line.unitCost} onChange={event => onChange({ unitCost: Number(event.target.value) })} className={`${fieldClass} mt-1`} />
                </label>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[12rem_minmax(0,1fr)]">
                <label className="text-xs font-semibold text-slate-500">
                    {t('purchaseReceiptImport.action')}
                    <select
                        value={line.resolution}
                        onChange={event => onChange({
                            resolution: event.target.value as PurchaseLineResolution,
                            matchedProductId: event.target.value === 'matched' ? line.matchedProductId : null,
                        })}
                        className={`${fieldClass} mt-1`}
                    >
                        <option value="matched">{t('purchaseReceiptImport.addToExisting')}</option>
                        <option value="new_product">{t('purchaseReceiptImport.createNewProduct')}</option>
                        <option value="raw_material">{t('purchaseReceiptImport.addToRawMaterial')}</option>
                        <option value="ignored">{t('purchaseReceiptImport.ignoreLine')}</option>
                    </select>
                </label>

                {line.resolution === 'raw_material' && (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <label className="text-xs font-semibold text-slate-500">
                            {t('purchaseReceiptImport.rawItem')}
                            <select
                                value={line.rawMaterialId ?? ''}
                                onChange={event => onChange({ rawMaterialId: event.target.value || null })}
                                className={`${fieldClass} mt-1`}
                            >
                                <option value="">{t('purchaseReceiptImport.createNewRawItem')}</option>
                                {rawMaterials.map(material => (
                                    <option key={material.id} value={material.id}>
                                        {t('purchaseReceiptImport.rawMaterialOption', { name: material.name, unit: material.unit, stock: material.stock })}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {!line.rawMaterialId && (
                            <>
                                <label className="text-xs font-semibold text-slate-500">
                                    {t('purchaseReceiptImport.newItemName')}
                                    <input value={line.newRawMaterialName} onChange={event => onChange({ newRawMaterialName: event.target.value })} className={`${fieldClass} mt-1`} />
                                </label>
                                <label className="text-xs font-semibold text-slate-500">
                                    {t('purchaseReceiptImport.unit')}
                                    <select value={line.newRawMaterialUnit} onChange={event => onChange({ newRawMaterialUnit: event.target.value as RawMaterialUnit })} className={`${fieldClass} mt-1`}>
                                        {RAW_MATERIAL_UNITS.map(unit => (
                                            <option key={unit.value} value={unit.value}>{unit.label}</option>
                                        ))}
                                    </select>
                                </label>
                            </>
                        )}
                    </div>
                )}

                {line.resolution === 'matched' && (
                    <label className="text-xs font-semibold text-slate-500">
                        {t('purchaseReceiptImport.existingProduct')}
                        <select value={line.matchedProductId ?? ''} onChange={event => onChange({ matchedProductId: event.target.value || null })} className={`${fieldClass} mt-1`}>
                            <option value="">{t('purchaseReceiptImport.selectProduct')}</option>
                            {products.filter(product => !product.deleted_at).map(product => (
                                <option key={product.id} value={product.id}>{t('purchaseReceiptImport.productOption', { name: product.name, sku: product.sku, stock: product.stock })}</option>
                            ))}
                        </select>
                    </label>
                )}

                {line.resolution === 'new_product' && (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <label className="text-xs font-semibold text-slate-500">
                            {t('purchaseReceiptImport.productName')}
                            <input value={line.newProductName} onChange={event => onChange({ newProductName: event.target.value })} className={`${fieldClass} mt-1`} />
                        </label>
                        <label className="text-xs font-semibold text-slate-500">
                            {t('purchaseReceiptImport.sku')}
                            <input value={line.newProductSku} onChange={event => onChange({ newProductSku: event.target.value.toUpperCase() })} className={`${fieldClass} mt-1`} />
                        </label>
                        <label className="text-xs font-semibold text-slate-500">
                            {t('purchaseReceiptImport.category')}
                            <select value={line.newProductCategoryId ?? ''} onChange={event => onChange({ newProductCategoryId: event.target.value || null })} className={`${fieldClass} mt-1`}>
                                <option value="">{t('purchaseReceiptImport.selectCategory')}</option>
                                {categories.filter(category => category.is_active && !category.deleted_at).map(category => (
                                    <option key={category.id} value={category.id}>{category.name}</option>
                                ))}
                            </select>
                        </label>
                        <label className="text-xs font-semibold text-slate-500">
                            {t('purchaseReceiptImport.sellingPrice')}
                            <input type="number" min="0" step="0.01" value={line.newProductSellingPrice} onChange={event => onChange({ newProductSellingPrice: Number(event.target.value) })} className={`${fieldClass} mt-1`} />
                        </label>
                    </div>
                )}
            </div>
        </section>
    );
};

const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-1 font-semibold text-slate-950">{value}</p>
    </div>
);

export default PurchaseReceiptImportDialog;
