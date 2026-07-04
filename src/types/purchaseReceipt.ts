import type { RawMaterialUnit } from './rawMaterial';

export type PurchaseDocumentType = 'auto' | 'receipt' | 'invoice';
export type PurchaseReceiptStatus = 'draft' | 'applied' | 'failed';
export type PurchaseLineResolution = 'matched' | 'new_product' | 'raw_material' | 'ignored';

export interface ExtractedPurchaseLine {
    description: string;
    productCode: string | null;
    quantity: number;
    unitCost: number;
    lineTotal: number;
    confidence: number;
}

export interface PurchaseDocumentExtraction {
    provider: 'azure_document_intelligence';
    model: 'prebuilt-receipt' | 'prebuilt-invoice';
    supplierName: string | null;
    supplierTaxNumber: string | null;
    documentNumber: string | null;
    purchaseDate: string | null;
    currency: string;
    subtotal: number | null;
    tax: number | null;
    total: number | null;
    confidence: number;
    lines: ExtractedPurchaseLine[];
}

export interface PurchaseReceiptDraftLine extends ExtractedPurchaseLine {
    id: string;
    resolution: PurchaseLineResolution;
    matchedProductId: string | null;
    newProductName: string;
    newProductSku: string;
    newProductCategoryId: string | null;
    newProductSellingPrice: number;
    /** When resolution === 'raw_material': existing raw item to top up, or null to create one. */
    rawMaterialId: string | null;
    newRawMaterialName: string;
    newRawMaterialUnit: RawMaterialUnit;
}

export interface LocalPurchaseReceipt {
    id: string;
    file_name: string;
    mime_type: string;
    document_type: PurchaseDocumentType;
    extraction_model: string;
    supplier_name: string | null;
    supplier_tax_number: string | null;
    document_number: string | null;
    purchase_date: string | null;
    currency: string;
    subtotal: number | null;
    tax: number | null;
    total: number | null;
    status: PurchaseReceiptStatus;
    line_count: number;
    applied_by_employee_id: string | null;
    error_message: string | null;
    raw_extraction_json: string;
    created_at: Date;
    applied_at: Date | null;
}

export interface LocalPurchaseReceiptLine {
    id: string;
    purchase_receipt_id: string;
    description: string;
    product_code: string | null;
    quantity: number;
    unit_cost: number;
    line_total: number;
    confidence: number;
    resolution: PurchaseLineResolution;
    product_id: string | null;
    /** Set when the line stocked a raw material instead of a catalogue product. */
    raw_material_id?: string | null;
    stock_before: number | null;
    stock_after: number | null;
    created_at: Date;
}
