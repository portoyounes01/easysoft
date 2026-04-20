import QRCode from 'qrcode';

export async function generateQRCodeImage(data: string): Promise<string> {
    try {
        const qrDataUrl = await QRCode.toDataURL(data, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            width: 200,
            margin: 1,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });
        return qrDataUrl;
    } catch (error) {
        console.error('Error generating QR code:', error);
        throw error;
    }
}

export function generateQRCodeSVG(data: string): string {
    return QRCode.toString(data, {
        errorCorrectionLevel: 'M',
        type: 'svg',
        width: 200,
        margin: 1,
        color: {
            dark: '#000000',
            light: '#ffffff'
        }
    });
}
