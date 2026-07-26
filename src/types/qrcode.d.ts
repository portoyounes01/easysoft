declare module 'qrcode' {
  interface ToDataUrlOptions {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  }

  export function toDataURL(value: string, options?: ToDataUrlOptions): Promise<string>;

  /** Module matrix, row-major, 1 = dark. Used to raster the QR as an ESC/POS
   *  bitmap (services/escpos) instead of trusting printer-native QR support. */
  interface QRCodeBitMatrix {
    size: number;
    data: Uint8Array;
  }

  interface CreateOptions {
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    version?: number;
  }

  export function create(value: string, options?: CreateOptions): { modules: QRCodeBitMatrix };
}
