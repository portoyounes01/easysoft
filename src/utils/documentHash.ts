export interface DocumentLine {
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    total: number;
}

export interface DocumentData {
    documentNumber: string;
    documentDate: string; // ISO format
    documentType: 'FATURA' | 'FATURA_SIMPLIFICADA' | 'NOTA_CREDITO';
    companyTaxNumber: string;
    customerTaxNumber?: string;
    lines: DocumentLine[];
    subtotal: number;
    discount: number;
    discountPercentage: number;
    netTotal: number;
    vat6: number;
    vat13: number;
    vat23: number;
    total: number;
    paymentMethod: 'cash' | 'card' | 'mixed';
}

export async function generateDocumentHash(document: DocumentData): Promise<string> {
    const hashInput = [
        document.documentNumber,
        document.documentDate,
        document.documentType,
        document.companyTaxNumber,
        document.customerTaxNumber || '',
        document.paymentMethod,
        document.netTotal.toFixed(2),
        document.vat6.toFixed(2),
        document.vat13.toFixed(2),
        document.vat23.toFixed(2),
        document.total.toFixed(2),
        ...document.lines.map(line => [
            line.description,
            line.quantity.toFixed(2),
            line.unitPrice.toFixed(2),
            line.vatRate.toFixed(2),
            line.total.toFixed(2)
        ].join('|'))
    ].join('#');

    const encoder = new TextEncoder();
    const data = encoder.encode(hashInput);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hashHex;
}

export function generateQRCodeData(
    document: DocumentData,
    atcud: string,
    documentHash: string,
    softwareCertNumber: string
): string {
    const qrData = [
        document.companyTaxNumber,
        document.customerTaxNumber || '',
        document.documentType,
        document.documentDate,
        atcud,
        document.netTotal.toFixed(2),
        document.vat6.toFixed(2),
        document.vat13.toFixed(2),
        document.vat23.toFixed(2),
        document.total.toFixed(2),
        documentHash,
        softwareCertNumber
    ].join('|');

    return qrData;
}
