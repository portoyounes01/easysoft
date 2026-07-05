declare module 'qrcode' {
  interface ToDataUrlOptions {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  }

  export function toDataURL(value: string, options?: ToDataUrlOptions): Promise<string>;
}
