export interface ATCUDResult {
    atcud: string;
    seriesKey: string;
    documentNumber: string;
    sequentialNumber: string;
}

export function generateATCUD(
    atValidationCode: string,
    seriesKey: string,
    sequentialNumber: number,
    numericWidth: number = 4
): ATCUDResult {
    const paddedNumber = sequentialNumber.toString().padStart(numericWidth, '0');
    
    const atcud = `${atValidationCode}-${paddedNumber}`;

    return {
        atcud,
        seriesKey,
        documentNumber: `${seriesKey}-${paddedNumber}`,
        sequentialNumber: paddedNumber
    };
}

export function validateATCUDFormat(atcud: string): boolean {
    const pattern = /^[A-Z0-9]{2,10}-\d+$/;
    return pattern.test(atcud);
}
