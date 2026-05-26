import { describe, it, expect } from 'vitest';
import { buildAtQrPayloadString } from '../../src/fiscal/qrPayload';

describe('buildAtQrPayloadString', () => {
    it('builds AT QR segments A…R joined by *', () => {
        const s = buildAtQrPayloadString({
            emitterTaxNumber: '514524391',
            customerTaxNumber: null,
            customerCountry: 'PT',
            invoiceType: 'FS',
            invoiceDateYmd: '2026-03-30',
            invoiceNo: 'FS A/1',
            atcudBody: 'CSDF7T5H-00001',
            netTotal: 100,
            taxTotal: 23,
            hashFourChars: 'abcd',
            softwareCertificateNumber: '1234',
        });
        expect(s).toBe(
            'A:514524391*B:999999990*C:PT*D:FS*E:N*F:20260330*G:FS A/1*H:ATCUD:CSDF7T5H-00001*I1:PT*N:23.00*O:100.00*Q:abcd*R:1234'
        );
    });

    it('uses customer country code in segment C', () => {
        const s = buildAtQrPayloadString({
            emitterTaxNumber: '514524391',
            customerTaxNumber: null,
            customerCountry: 'ES',
            invoiceType: 'FS',
            invoiceDateYmd: '2026-03-30',
            invoiceNo: 'FS A/1',
            atcudBody: 'CSDF7T5H-00001',
            netTotal: 100,
            taxTotal: 23,
            hashFourChars: 'abcd',
            softwareCertificateNumber: '1234',
        });
        expect(s).toContain('*C:ES*');
    });

    it('formats positive net and tax totals for credit notes (two decimals)', () => {
        const s = buildAtQrPayloadString({
            emitterTaxNumber: '514524391',
            customerTaxNumber: null,
            customerCountry: 'PT',
            invoiceType: 'NC',
            invoiceDateYmd: '2026-04-10',
            invoiceNo: 'NC A/0002',
            atcudBody: 'CSDF7T5H-00002',
            netTotal: 10,
            taxTotal: 2.3,
            hashFourChars: 'abcd',
            softwareCertificateNumber: '1234',
        });
        expect(s).toContain('*N:2.30*');
        expect(s).toContain('*O:10.00*');
    });
});
