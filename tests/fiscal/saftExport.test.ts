import { describe, it, expect } from 'vitest';
import { buildSaftAuditFileXml, xmlEscape } from '../../src/fiscal/saft/exportSaft';
import type { SystemSettings } from '../../src/contexts/SettingsContext';
import type { LocalFiscalDocument, LocalTransaction, LocalTransactionItem } from '../../src/types/supabase';

const minimalSettings = {
    autoLogout: { enabled: false, timeoutMinutes: 15, warningSeconds: 30, protectWhenCartHasItems: true },
    pos: {
        currencySymbol: '€',
        taxRate: 0.23,
        allowNegativeStock: false,
        autoClearCart: { enabled: false, timeoutMinutes: 0 },
    },
    display: { itemsPerPage: 20, showEmployeePhotos: true, compactMode: false },
    company: {
        name: 'Test Lda',
        address: 'Rua 1',
        postalCode: '1000-001',
        city: 'Lisboa',
        taxNumber: '509999999',
        phone: '',
        email: '',
        slogan: '',
        softwareInfo: 'TestPOS',
        certificationNumber: '1/AT',
        softwareCertNumber: '999',
    },
    receipt: {
        series: 'S1',
        seriesPrefix: 'A',
        numericWidth: 4,
        resetPolicy: 'yearly' as const,
        lastSeriesKey: '',
        currentNumber: 1,
        defaultDocumentType: 'FATURA_SIMPLIFICADA' as const,
        counterLabel: 'B1',
        atValidationCode: 'ATCODE1',
        seriesDiscontinued: false,
    },
    fiscal: { hashControlVersion: '1', trainingMode: false },
} as unknown as SystemSettings;

describe('SAF-T export', () => {
    it('xmlEscape escapes markup-sensitive characters', () => {
        expect(xmlEscape('A & B < C > "D"')).toBe('A &amp; B &lt; C &gt; &quot;D&quot;');
    });

    it('buildSaftAuditFileXml produces well-formed AuditFile XML', async () => {
        const fiscal: LocalFiscalDocument = {
            id: 'fid-1',
            transaction_id: 'tid-1',
            chain_scope: 'ATCODE1::k',
            series_key: 'k',
            at_validation_code: 'ATCODE1',
            sequential_number: 1,
            invoice_no: 'FS A/0001',
            invoice_type: 'FS',
            invoice_date: '2026-04-10',
            system_entry_date: '2026-04-10T12:00:00',
            gross_total: 12.3,
            net_total: 10,
            tax_total: 2.3,
            hash_base64: 'QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQQ==',
            hash_control: '1',
            hash_plaintext: 'x',
            previous_hash_base64: '',
            qr_payload: 'Q',
            source_id: 'u1',
            certification_mode: 'production',
            customer_tax_id: '999999990',
            payment_method: 'cash',
            created_at: '2026-04-10T12:00:00.000Z',
            atcud_body: 'ATCODE1-0001',
            hash_four_chars: 'a-b-c-d',
            needs_push: false,
        };

        const item: LocalTransactionItem = {
            id: 'i1',
            transaction_id: 'tid-1',
            product_id: 'p1',
            product_name: 'Item',
            product_sku: 'SKU1',
            category_id: 'c1',
            category_name: 'Cat',
            quantity: 1,
            unit_price: 12.3,
            unit_cost: 5,
            iva_rate: 0.23,
            line_total: 12.3,
            tax_amount: 2.3,
            profit_amount: 0,
            discount_amount: 0,
            discount_percentage: 0,
            created_at: new Date(),
            updated_at: new Date(),
            needs_push: false,
            is_conflicted: false,
            last_synced_at: null,
            deleted_at: null,
        };

        const tx: LocalTransaction & { items: LocalTransactionItem[] } = {
            id: 'tid-1',
            transaction_number: 'FS A/0001',
            employee_id: 'e1',
            employee_name: 'Emp',
            customer_id: null,
            customer_name: null,
            transaction_date: '2026-04-10',
            transaction_time: '12:00:00',
            subtotal: 12.3,
            discount: 0,
            tax: 2.3,
            total: 12.3,
            payment_method: 'cash',
            amount_paid: 20,
            change_given: 7.7,
            status: 'completed',
            notes: null,
            receipt_number: 'FS A/0001',
            fiscal_document_id: 'fid-1',
            fiscal_metadata_json: '{}',
            created_at: new Date(),
            updated_at: new Date(),
            needs_push: false,
            is_conflicted: false,
            last_synced_at: null,
            deleted_at: null,
            items: [item],
        };

        const xml = await buildSaftAuditFileXml({
            settings: minimalSettings,
            startDateYmd: '2026-04-01',
            endDateYmd: '2026-04-30',
            fiscalDocuments: [fiscal],
            loadTransaction: async id => (id === 'tid-1' ? tx : undefined),
            productVersion: '0.1.0',
        });

        expect(xml).toContain('urn:OECD:StandardAuditFile-Tax:PT_1.04_01');
        expect(xml).toContain('<InvoiceNo>FS A/0001</InvoiceNo>');
        expect(xml).toContain('<GeneralLedgerEntries>');
        const masterEnd = xml.indexOf('</MasterFiles>');
        const gle = xml.indexOf('<GeneralLedgerEntries>');
        const src = xml.indexOf('<SourceDocuments>');
        expect(gle).toBeGreaterThan(masterEnd);
        expect(src).toBeGreaterThan(gle);
        expect(xml).toContain('<NumberOfEntries>1</NumberOfEntries>');
        expect(xml.startsWith('<?xml')).toBe(true);
        expect(xml.trim().endsWith('</AuditFile>')).toBe(true);
    });

    it('emits RG under Payments, not SalesInvoices', async () => {
        const rgFiscal: LocalFiscalDocument = {
            id: 'fid-rg',
            transaction_id: 'tid-rg',
            chain_scope: 'ATCODE1::k',
            series_key: 'k',
            at_validation_code: 'ATCODE1',
            sequential_number: 2,
            invoice_no: 'RG A/0002',
            invoice_type: 'RG',
            settled_invoice_no: 'FS A/0001',
            settled_invoice_date: '2026-04-10',
            invoice_date: '2026-04-11',
            system_entry_date: '2026-04-11T10:00:00',
            gross_total: 12.3,
            net_total: 10,
            tax_total: 2.3,
            hash_base64: 'QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQQ==',
            hash_control: '1',
            hash_plaintext: 'x',
            previous_hash_base64: 'p',
            qr_payload: 'Q',
            source_id: 'u1',
            certification_mode: 'production',
            customer_tax_id: '999999990',
            payment_method: 'cash',
            created_at: '2026-04-11T10:00:00.000Z',
            atcud_body: 'ATCODE1-0002',
            hash_four_chars: 'a-b-c-d',
            needs_push: false,
        };

        const item: LocalTransactionItem = {
            id: 'i1',
            transaction_id: 'tid-rg',
            product_id: 'p1',
            product_name: 'Item',
            product_sku: 'SKU1',
            category_id: 'c1',
            category_name: 'Cat',
            quantity: 1,
            unit_price: 12.3,
            unit_cost: 5,
            iva_rate: 0.23,
            line_total: 12.3,
            tax_amount: 2.3,
            profit_amount: 0,
            discount_amount: 0,
            discount_percentage: 0,
            created_at: new Date(),
            updated_at: new Date(),
            needs_push: false,
            is_conflicted: false,
            last_synced_at: null,
            deleted_at: null,
        };

        const txRg: LocalTransaction & { items: LocalTransactionItem[] } = {
            id: 'tid-rg',
            transaction_number: 'RG A/0002',
            employee_id: 'e1',
            employee_name: 'Emp',
            customer_id: null,
            customer_name: null,
            transaction_date: '2026-04-11',
            transaction_time: '10:00:00',
            subtotal: 12.3,
            discount: 0,
            tax: 2.3,
            total: 12.3,
            payment_method: 'cash',
            amount_paid: null,
            change_given: 0,
            status: 'completed',
            notes: 'Recibo referente FS A/0001',
            receipt_number: 'RG A/0002',
            fiscal_document_id: 'fid-rg',
            fiscal_metadata_json: '{}',
            created_at: new Date(),
            updated_at: new Date(),
            needs_push: false,
            is_conflicted: false,
            last_synced_at: null,
            deleted_at: null,
            items: [item],
        };

        const xml = await buildSaftAuditFileXml({
            settings: minimalSettings,
            startDateYmd: '2026-04-01',
            endDateYmd: '2026-04-30',
            fiscalDocuments: [rgFiscal],
            loadTransaction: async id => (id === 'tid-rg' ? txRg : undefined),
            productVersion: '0.1.0',
        });

        expect(xml).toContain('<Payments>');
        expect(xml).toContain('<PaymentType>RG</PaymentType>');
        expect(xml).toContain('<OriginatingON>FS A/0001</OriginatingON>');
        expect(xml).toContain('<SalesInvoices>');
        expect(xml).toMatch(/<SalesInvoices>[\s\S]*?<NumberOfEntries>0<\/NumberOfEntries>/);
        const si = xml.indexOf('<SalesInvoices>');
        const pay = xml.indexOf('<Payments>');
        expect(pay).toBeGreaterThan(si);
    });
});
