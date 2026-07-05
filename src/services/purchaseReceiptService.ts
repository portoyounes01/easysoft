import { supabase } from '../lib/supabase';
import { initializeLocalDatabase, localDb } from '../lib/localDatabase';
import type {
    LocalProduct,
    PendingProductOperation,
} from '../types/supabase';
import type {
    LocalPurchaseReceipt,
    LocalPurchaseReceiptLine,
    PurchaseDocumentExtraction,
    PurchaseDocumentType,
    PurchaseReceiptDraftLine,
} from '../types/purchaseReceipt';
import type { LocalRawMaterial } from '../types/rawMaterial';
import { generateUUID } from '../utils/uuid';
import { recipeService } from './recipeService';

interface ExtractRequest {
    file: File;
    documentType: PurchaseDocumentType;
    employeeId: string;
    employeeNumber: string;
}

interface ApplyRequest {
    file: File;
    documentType: PurchaseDocumentType;
    extraction: PurchaseDocumentExtraction;
    lines: PurchaseReceiptDraftLine[];
    employeeId: string;
}

const normalizeName = (value: string): string =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const fileToBase64 = async (file: File): Promise<string> => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    const chunkSize = 32_768;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
};

const makeSku = (description: string, index: number): string => {
    const stem = normalizeName(description).replace(/\s+/g, '-').slice(0, 16).toUpperCase() || 'ITEM';
    return `IMP-${stem}-${String(index + 1).padStart(2, '0')}`;
};

export const matchPurchaseLines = (
    extraction: PurchaseDocumentExtraction,
    products: LocalProduct[]
): PurchaseReceiptDraftLine[] => {
    return extraction.lines.map((line, index) => {
        const code = line.productCode?.trim().toLowerCase();
        const normalizedDescription = normalizeName(line.description);
        const exactCodeMatch = code
            ? products.find(product =>
                product.sku.toLowerCase() === code || product.barcode?.toLowerCase() === code
            )
            : undefined;
        const exactNameMatch = products.find(product => normalizeName(product.name) === normalizedDescription);
        const containsMatch = normalizedDescription.length >= 5
            ? products.find(product => {
                const productName = normalizeName(product.name);
                return productName.includes(normalizedDescription) || normalizedDescription.includes(productName);
            })
            : undefined;
        const matched = exactCodeMatch ?? exactNameMatch ?? containsMatch;

        return {
            ...line,
            id: generateUUID(),
            resolution: matched ? 'matched' : 'new_product',
            matchedProductId: matched?.id ?? null,
            newProductName: line.description,
            newProductSku: line.productCode?.trim() || makeSku(line.description, index),
            newProductCategoryId: null,
            newProductSellingPrice: line.unitCost,
            rawMaterialId: null,
            newRawMaterialName: line.description,
            newRawMaterialUnit: 'pcs',
        };
    });
};

class PurchaseReceiptService {
    async extract(request: ExtractRequest): Promise<PurchaseDocumentExtraction> {
        if (request.file.size > 10 * 1024 * 1024) {
            throw new Error('The document is larger than 10 MB. Compress or split it before uploading.');
        }

        const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-purchase-document`;
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session?.access_token) {
            throw new Error('Your device session has expired. Pair or sign in again.');
        }
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: import.meta.env.VITE_SUPABASE_ANON ?? '',
                Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: JSON.stringify({
                employee_id: request.employeeId,
                employee_number: request.employeeNumber,
                file_name: request.file.name,
                mime_type: request.file.type,
                document_type: request.documentType,
                base64_source: await fileToBase64(request.file),
            }),
        });
        const payload = await response.json() as PurchaseDocumentExtraction & { error?: string };
        if (!response.ok) throw new Error(payload.error || 'Azure could not extract this purchase document.');
        return payload;
    }

    async apply(request: ApplyRequest): Promise<string> {
        await initializeLocalDatabase();
        const activeLines = request.lines.filter(line => line.resolution !== 'ignored');
        if (activeLines.length === 0) throw new Error('Select at least one line to add to stock.');
        if (activeLines.some(line => line.quantity <= 0 || line.unitCost < 0)) {
            throw new Error('Every included line needs a valid quantity and unit cost.');
        }
        if (activeLines.some(line => line.resolution === 'matched' && !line.matchedProductId)) {
            throw new Error('Every matched line must have a product selected.');
        }
        if (activeLines.some(line =>
            line.resolution === 'new_product' &&
            (!line.newProductName.trim() || !line.newProductSku.trim() || !line.newProductCategoryId)
        )) {
            throw new Error('New products require a name, SKU, and category.');
        }
        if (activeLines.some(line =>
            line.resolution === 'raw_material' && !line.rawMaterialId && !line.newRawMaterialName.trim()
        )) {
            throw new Error('New raw materials require a name.');
        }

        const receiptId = generateUUID();
        const now = new Date();
        const receipt: LocalPurchaseReceipt = {
            id: receiptId,
            file_name: request.file.name,
            mime_type: request.file.type,
            document_type: request.documentType,
            extraction_model: request.extraction.model,
            supplier_name: request.extraction.supplierName,
            supplier_tax_number: request.extraction.supplierTaxNumber,
            document_number: request.extraction.documentNumber,
            purchase_date: request.extraction.purchaseDate,
            currency: request.extraction.currency,
            subtotal: request.extraction.subtotal,
            tax: request.extraction.tax,
            total: request.extraction.total,
            status: 'applied',
            line_count: activeLines.length,
            applied_by_employee_id: request.employeeId,
            error_message: null,
            raw_extraction_json: JSON.stringify(request.extraction),
            created_at: now,
            applied_at: now,
        };

        const touchedRawMaterialIds = new Set<string>();

        await localDb.transaction(
            'rw',
            [
                localDb.products,
                localDb.categories,
                localDb.productSyncQueue,
                localDb.purchaseReceipts,
                localDb.purchaseReceiptLines,
                localDb.rawMaterials,
            ],
            async () => {
                await localDb.purchaseReceipts.add(receipt);

                for (const [index, line] of activeLines.entries()) {
                    // Raw material lines stock the inventory table, not the catalogue.
                    if (line.resolution === 'raw_material') {
                        let material = line.rawMaterialId
                            ? await localDb.rawMaterials.get(line.rawMaterialId)
                            : undefined;
                        const stockBefore = material?.stock ?? 0;
                        const stockAfter = stockBefore + line.quantity;
                        if (material) {
                            await localDb.rawMaterials.update(material.id, {
                                stock: stockAfter,
                                cost: line.unitCost,
                                supplier: request.extraction.supplierName ?? material.supplier,
                                updated_at: now,
                            });
                        } else {
                            material = {
                                id: generateUUID(),
                                name: line.newRawMaterialName.trim(),
                                unit: line.newRawMaterialUnit,
                                stock: line.quantity,
                                cost: line.unitCost,
                                min_stock: 0,
                                supplier: request.extraction.supplierName ?? null,
                                is_active: true,
                                created_at: now,
                                updated_at: now,
                            } satisfies LocalRawMaterial;
                            await localDb.rawMaterials.add(material);
                        }
                        const rawLine: LocalPurchaseReceiptLine = {
                            id: generateUUID(),
                            purchase_receipt_id: receiptId,
                            description: line.description,
                            product_code: line.productCode,
                            quantity: line.quantity,
                            unit_cost: line.unitCost,
                            line_total: line.lineTotal,
                            confidence: line.confidence,
                            resolution: line.resolution,
                            product_id: null,
                            raw_material_id: material.id,
                            stock_before: stockBefore,
                            stock_after: stockAfter,
                            created_at: new Date(now.getTime() + index),
                        };
                        await localDb.purchaseReceiptLines.add(rawLine);
                        touchedRawMaterialIds.add(material.id);
                        continue;
                    }

                    let product: LocalProduct | undefined;
                    if (line.resolution === 'matched' && line.matchedProductId) {
                        product = await localDb.products.get(line.matchedProductId);
                        if (!product) throw new Error(`Matched product no longer exists: ${line.description}`);
                    } else {
                        const category = await localDb.categories.get(line.newProductCategoryId ?? '');
                        if (!category) throw new Error(`Category is required for ${line.description}`);
                        const duplicateSku = await localDb.products.where('sku').equals(line.newProductSku.trim()).first();
                        if (duplicateSku) throw new Error(`SKU already exists: ${line.newProductSku}`);

                        const productId = generateUUID();
                        product = {
                            id: productId,
                            name: line.newProductName.trim(),
                            description: `Created from purchase document ${request.extraction.documentNumber ?? request.file.name}`,
                            sku: line.newProductSku.trim(),
                            barcode: line.productCode,
                            category_id: category.id,
                            category_name: category.name,
                            price: Math.max(0, line.newProductSellingPrice),
                            cost: line.unitCost,
                            iva_rate: 0.23,
                            stock: 0,
                            min_stock: 0,
                            track_stock: true,
                            image_url: null,
                            supplier: request.extraction.supplierName,
                            location: null,
                            is_active: true,
                            display_order: 0,
                            created_at: now,
                            updated_at: now,
                            last_synced_at: null,
                            deleted_at: null,
                            needs_push: true,
                            is_conflicted: false,
                        };
                        await localDb.products.add(product);
                        const createOperation: PendingProductOperation = {
                            id: generateUUID(),
                            type: 'CREATE',
                            productId,
                            data: product,
                            timestamp: now.toISOString(),
                            retryCount: 0,
                        };
                        await localDb.productSyncQueue.add(createOperation);
                    }

                    const stockBefore = product.stock;
                    const stockAfter = stockBefore + line.quantity;
                    await localDb.products.update(product.id, {
                        stock: stockAfter,
                        cost: line.unitCost,
                        supplier: request.extraction.supplierName ?? product.supplier,
                        track_stock: true,
                        updated_at: now,
                        needs_push: true,
                    });
                    const updateOperation: PendingProductOperation = {
                        id: generateUUID(),
                        type: 'UPDATE',
                        productId: product.id,
                        data: {
                            stock: stockAfter,
                            cost: line.unitCost,
                            supplier: request.extraction.supplierName ?? product.supplier,
                            track_stock: true,
                            updated_at: now.toISOString(),
                        },
                        timestamp: now.toISOString(),
                        retryCount: 0,
                    };
                    await localDb.productSyncQueue.add(updateOperation);

                    const storedLine: LocalPurchaseReceiptLine = {
                        id: generateUUID(),
                        purchase_receipt_id: receiptId,
                        description: line.description,
                        product_code: line.productCode,
                        quantity: line.quantity,
                        unit_cost: line.unitCost,
                        line_total: line.lineTotal,
                        confidence: line.confidence,
                        resolution: line.resolution,
                        product_id: product.id,
                        stock_before: stockBefore,
                        stock_after: stockAfter,
                        created_at: new Date(now.getTime() + index),
                    };
                    await localDb.purchaseReceiptLines.add(storedLine);
                }
            }
        );

        // A new delivery price flows to future sales of dishes using these items.
        // Done after commit so the recipe/product reads use the persisted costs.
        for (const rawMaterialId of touchedRawMaterialIds) {
            await recipeService.syncDishesUsingMaterial(rawMaterialId);
        }

        return receiptId;
    }

    async listReceipts(): Promise<LocalPurchaseReceipt[]> {
        await initializeLocalDatabase();
        return localDb.purchaseReceipts.orderBy('created_at').reverse().toArray();
    }

    async getReceiptLines(receiptId: string): Promise<LocalPurchaseReceiptLine[]> {
        await initializeLocalDatabase();
        return localDb.purchaseReceiptLines.where('purchase_receipt_id').equals(receiptId).toArray();
    }
}

export const purchaseReceiptService = new PurchaseReceiptService();
