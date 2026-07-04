import { initializeLocalDatabase, localDb, transactionLocalService } from '../lib/localDatabase';
import type { RawMaterialUnit } from '../types/rawMaterial';

export interface ProductLedgerRow {
    productId: string;
    productName: string;
    sku: string;
    /** comprada — quantity & value received via purchase receipts in the period. */
    purchasedQty: number;
    purchasedValue: number;
    /** vendida — quantity & gross value sold in the period. */
    soldQty: number;
    soldValue: number;
    /** Current on-hand stock (point-in-time, not period-scoped). */
    remaining: number;
    /** Profit booked on the period's sales. */
    profit: number;
}

export interface RawMaterialLedgerRow {
    rawMaterialId: string;
    name: string;
    unit: RawMaterialUnit;
    /** comprada — quantity & value received via purchase receipts in the period. */
    purchasedQty: number;
    purchasedValue: number;
    /** Quantity consumed by the period's sales, via product recipes. */
    consumedQty: number;
    /** Current on-hand stock and its value at cost. */
    remaining: number;
    stockValue: number;
}

export interface StockProfitReport {
    products: ProductLedgerRow[];
    rawMaterials: RawMaterialLedgerRow[];
}

const toDateKey = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Stock & profit report for a hybrid shop that both resells finished goods and
 * cooks dishes from raw materials. Two grains, computed from one sale set:
 *  - products: comprada (purchase receipts) / vendida / remaining / profit.
 *  - raw materials: comprada / consumed (sales × recipes) / remaining.
 * Resold goods populate all product columns; dishes show vendida + profit while
 * their real purchasing/stock surfaces in the raw-materials table.
 */
class ProductLedgerService {
    async getReport(startDate: string, endDate: string): Promise<StockProfitReport> {
        await initializeLocalDatabase();

        const products = (await localDb.products.toArray()).filter(product => !product.deleted_at);
        const rawMats = await localDb.rawMaterials.toArray();

        // --- Sales (vendida + profit), excluding credit notes / recibos ---
        const sold = new Map<string, { qty: number; value: number; profit: number }>();
        const completed = (await transactionLocalService.getTransactionsByDateRange(startDate, endDate))
            .filter(tx => tx.status === 'completed' && tx.deleted_at == null);

        // Credit notes / recibos are their own completed transactions with positive
        // line items, so counting them would double the sale they reverse.
        const fiscalIds = completed.map(tx => tx.fiscal_document_id).filter((id): id is string => Boolean(id));
        const fiscalDocs = fiscalIds.length
            ? await localDb.fiscalDocuments.where('id').anyOf(fiscalIds).toArray()
            : [];
        const invoiceTypeById = new Map(fiscalDocs.map(doc => [doc.id, doc.invoice_type]));
        const isCreditOrRecibo = (txNumber: string) => /^(NC|RG|RC)\b/i.test(txNumber.trim());
        const transactions = completed.filter(tx => {
            if (isCreditOrRecibo(tx.transaction_number ?? '')) return false;
            if (!tx.fiscal_document_id) return true; // legacy / offline non-fiscal sale
            const type = invoiceTypeById.get(tx.fiscal_document_id);
            return type === undefined || type === 'FT' || type === 'FS';
        });

        if (transactions.length > 0) {
            const items = await localDb.transactionItems
                .where('transaction_id')
                .anyOf(transactions.map(tx => tx.id))
                .toArray();
            for (const item of items) {
                if (item.deleted_at) continue;
                const entry = sold.get(item.product_id) ?? { qty: 0, value: 0, profit: 0 };
                entry.qty += item.quantity;
                entry.value += item.line_total;
                entry.profit += item.profit_amount ?? 0;
                sold.set(item.product_id, entry);
            }
        }

        // --- Purchases (comprada) — split into product vs raw-material lines ---
        const purchasedProduct = new Map<string, { qty: number; value: number }>();
        const purchasedRaw = new Map<string, { qty: number; value: number }>();
        const receipts = (await localDb.purchaseReceipts.toArray()).filter(receipt => {
            if (receipt.status !== 'applied') return false;
            const key = receipt.purchase_date?.trim() || toDateKey(receipt.created_at);
            return key >= startDate && key <= endDate;
        });
        if (receipts.length > 0) {
            const lines = await localDb.purchaseReceiptLines
                .where('purchase_receipt_id')
                .anyOf(receipts.map(receipt => receipt.id))
                .toArray();
            for (const line of lines) {
                if (line.product_id) {
                    const entry = purchasedProduct.get(line.product_id) ?? { qty: 0, value: 0 };
                    entry.qty += line.quantity;
                    entry.value += line.line_total;
                    purchasedProduct.set(line.product_id, entry);
                } else if (line.raw_material_id) {
                    const entry = purchasedRaw.get(line.raw_material_id) ?? { qty: 0, value: 0 };
                    entry.qty += line.quantity;
                    entry.value += line.line_total;
                    purchasedRaw.set(line.raw_material_id, entry);
                }
            }
        }

        // --- Raw-material consumption: sold qty × recipe quantity per unit ---
        const consumed = new Map<string, number>();
        if (sold.size > 0) {
            const recipeLines = await localDb.recipeLines.toArray();
            const linesByProduct = new Map<string, typeof recipeLines>();
            for (const line of recipeLines) {
                const list = linesByProduct.get(line.product_id) ?? [];
                list.push(line);
                linesByProduct.set(line.product_id, list);
            }
            for (const [productId, sale] of sold) {
                for (const line of linesByProduct.get(productId) ?? []) {
                    consumed.set(
                        line.raw_material_id,
                        (consumed.get(line.raw_material_id) ?? 0) + line.quantity_per_unit * sale.qty
                    );
                }
            }
        }

        const productRows: ProductLedgerRow[] = products.map(product => {
            const s = sold.get(product.id);
            const p = purchasedProduct.get(product.id);
            return {
                productId: product.id,
                productName: product.name,
                sku: product.sku,
                purchasedQty: p?.qty ?? 0,
                purchasedValue: p?.value ?? 0,
                soldQty: s?.qty ?? 0,
                soldValue: s?.value ?? 0,
                remaining: product.stock,
                profit: s?.profit ?? 0,
            };
        }).sort((a, b) => {
            const activeA = a.soldQty + a.purchasedQty > 0 ? 1 : 0;
            const activeB = b.soldQty + b.purchasedQty > 0 ? 1 : 0;
            if (activeA !== activeB) return activeB - activeA;
            return b.soldValue - a.soldValue;
        });

        const rawRows: RawMaterialLedgerRow[] = rawMats.map(material => {
            const p = purchasedRaw.get(material.id);
            return {
                rawMaterialId: material.id,
                name: material.name,
                unit: material.unit,
                purchasedQty: p?.qty ?? 0,
                purchasedValue: p?.value ?? 0,
                consumedQty: consumed.get(material.id) ?? 0,
                remaining: material.stock,
                stockValue: material.stock * material.cost,
            };
        }).sort((a, b) => {
            const activeA = a.purchasedQty + a.consumedQty > 0 ? 1 : 0;
            const activeB = b.purchasedQty + b.consumedQty > 0 ? 1 : 0;
            if (activeA !== activeB) return activeB - activeA;
            return a.name.localeCompare(b.name);
        });

        return { products: productRows, rawMaterials: rawRows };
    }

    /** Back-compat: product-grain rows only. */
    async getLedger(startDate: string, endDate: string): Promise<ProductLedgerRow[]> {
        return (await this.getReport(startDate, endDate)).products;
    }
}

export const productLedgerService = new ProductLedgerService();
