import type { SystemSettings } from '../../contexts/SettingsContext';
import type { LocalFiscalDocument, LocalTransaction, LocalTransactionItem } from '../../types/supabase';
import { CONSUMER_FINAL_CUSTOMER_TAX_ID } from '../spec';

const NS = 'urn:OECD:StandardAuditFile-Tax:PT_1.04_01';

export function xmlEscape(raw: string): string {
    return raw
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fmtDec(n: number): string {
    return Number(n).toFixed(2);
}

/** SAFT-PT TaxTable TaxCode for common mainland rates (incidence as decimal e.g. 0.23). */
export function mapIvaDecimalToSaftTaxCode(ivaRate: number): string {
    const pct = Math.round(ivaRate * 100);
    if (pct === 23) return 'NOR';
    if (pct === 13) return 'INT';
    if (pct === 6) return 'RED';
    if (pct === 0) return 'ISE';
    return 'NOR';
}

function taxDescriptionForCode(code: string, pct: number): string {
    if (code === 'ISE') return 'IVA isento';
    return `IVA ${pct.toFixed(0)}%`;
}

export interface BuildSaftAuditFileParams {
    settings: SystemSettings;
    /** Inclusive YYYY-MM-DD on `invoice_date`. */
    startDateYmd: string;
    endDateYmd: string;
    fiscalDocuments: LocalFiscalDocument[];
    loadTransaction: (
        transactionId: string
    ) => Promise<(LocalTransaction & { items: LocalTransactionItem[] }) | undefined>;
    productVersion: string;
}

/**
 * Builds a SAF-T (PT) 1.04_01 `AuditFile` XML string from persisted fiscal rows and local transactions.
 * Aligns namespace and header shape with `certification requirements/exemplo-xml.xml`.
 */
export async function buildSaftAuditFileXml(params: BuildSaftAuditFileParams): Promise<string> {
    const { settings, startDateYmd, endDateYmd, fiscalDocuments, loadTransaction, productVersion } = params;

    const docs = fiscalDocuments
        .filter(d => d.invoice_date >= startDateYmd && d.invoice_date <= endDateYmd)
        .sort((a, b) => {
            const c = a.invoice_date.localeCompare(b.invoice_date);
            return c !== 0 ? c : a.sequential_number - b.sequential_number;
        });

    const loaded: {
        fiscal: LocalFiscalDocument;
        tx: LocalTransaction & { items: LocalTransactionItem[] };
    }[] = [];

    for (const fiscal of docs) {
        if (!fiscal.transaction_id) continue;
        const tx = await loadTransaction(fiscal.transaction_id);
        if (tx) loaded.push({ fiscal, tx });
    }

    const taxEntries = new Map<string, { code: string; pct: number }>();
    const products = new Map<string, LocalTransactionItem>();
    const customers = new Map<string, { taxId: string; name: string }>();

    for (const { fiscal, tx } of loaded) {
        const taxId = fiscal.customer_tax_id?.replace(/\s/g, '') || CONSUMER_FINAL_CUSTOMER_TAX_ID;
        const custName =
            taxId === CONSUMER_FINAL_CUSTOMER_TAX_ID
                ? 'Consumidor final'
                : tx.customer_name?.trim() || 'Cliente';
        customers.set(taxId, { taxId, name: custName });

        for (const line of tx.items) {
            const code = mapIvaDecimalToSaftTaxCode(line.iva_rate);
            const pct = Math.round(line.iva_rate * 10000) / 100;
            taxEntries.set(`${code}-${pct}`, { code, pct });
            const pkey = line.product_sku || line.product_id;
            if (!products.has(pkey)) products.set(pkey, line);
        }
    }

    if (customers.size === 0) {
        customers.set(CONSUMER_FINAL_CUSTOMER_TAX_ID, {
            taxId: CONSUMER_FINAL_CUSTOMER_TAX_ID,
            name: 'Consumidor final',
        });
    }
    if (taxEntries.size === 0) {
        taxEntries.set('NOR-23', { code: 'NOR', pct: 23 });
    }

    const fiscalYear = endDateYmd.slice(0, 4);
    const dateCreated = new Date().toISOString().split('T')[0];
    const company = settings.company;
    const swCert = (company.softwareCertNumber || '0').replace(/\s/g, '');
    const productId = (company.softwareInfo || 'POS').split('-')[0].trim().slice(0, 32) || 'POS';

    const header = `
  <Header>
    <AuditFileVersion>1.04_01</AuditFileVersion>
    <CompanyID>${xmlEscape(company.taxNumber.replace(/\s/g, ''))}</CompanyID>
    <TaxRegistrationNumber>${xmlEscape(company.taxNumber.replace(/\s/g, ''))}</TaxRegistrationNumber>
    <TaxAccountingBasis>F</TaxAccountingBasis>
    <CompanyName>${xmlEscape(company.name)}</CompanyName>
    <CompanyAddress>
      <AddressDetail>${xmlEscape(company.address)}</AddressDetail>
      <City>${xmlEscape(company.city)}</City>
      <PostalCode>${xmlEscape(company.postalCode)}</PostalCode>
      <Country>PT</Country>
    </CompanyAddress>
    <FiscalYear>${xmlEscape(fiscalYear)}</FiscalYear>
    <StartDate>${xmlEscape(startDateYmd)}</StartDate>
    <EndDate>${xmlEscape(endDateYmd)}</EndDate>
    <CurrencyCode>EUR</CurrencyCode>
    <DateCreated>${xmlEscape(dateCreated)}</DateCreated>
    <TaxEntity>Global</TaxEntity>
    <ProductCompanyTaxID>${xmlEscape(company.taxNumber.replace(/\s/g, ''))}</ProductCompanyTaxID>
    <SoftwareCertificateNumber>${xmlEscape(swCert)}</SoftwareCertificateNumber>
    <ProductID>${xmlEscape(productId)}</ProductID>
    <ProductVersion>${xmlEscape(productVersion)}</ProductVersion>
  </Header>`;

    const customerXml = [...customers.entries()]
        .map(([taxId, c]) => {
            const cid = `C${taxId}`;
            return `
    <Customer>
      <CustomerID>${xmlEscape(cid)}</CustomerID>
      <AccountID>Desconhecido</AccountID>
      <CustomerTaxID>${xmlEscape(c.taxId)}</CustomerTaxID>
      <CompanyName>${xmlEscape(c.name)}</CompanyName>
      <BillingAddress>
        <AddressDetail>${xmlEscape(company.address)}</AddressDetail>
        <City>${xmlEscape(company.city)}</City>
        <PostalCode>${xmlEscape(company.postalCode)}</PostalCode>
        <Country>PT</Country>
      </BillingAddress>
      <SelfBillingIndicator>0</SelfBillingIndicator>
    </Customer>`;
        })
        .join('');

    const productXml = [...products.values()]
        .map(it => {
            const code = it.product_sku || it.product_id;
            return `
    <Product>
      <ProductType>P</ProductType>
      <ProductCode>${xmlEscape(code)}</ProductCode>
      <ProductDescription>${xmlEscape(it.product_name)}</ProductDescription>
      <ProductNumberCode>${xmlEscape(code)}</ProductNumberCode>
    </Product>`;
        })
        .join('');

    const taxTableXml = [...taxEntries.values()]
        .map(
            t => `
    <TaxTableEntry>
      <TaxType>IVA</TaxType>
      <TaxCountryRegion>PT</TaxCountryRegion>
      <TaxCode>${xmlEscape(t.code)}</TaxCode>
      <Description>${xmlEscape(taxDescriptionForCode(t.code, t.pct))}</Description>
      <TaxPercentage>${fmtDec(t.pct)}</TaxPercentage>
    </TaxTableEntry>`
        )
        .join('');

    const masterFiles = `
  <MasterFiles>${customerXml}
${productXml}
    <TaxTable>${taxTableXml}
    </TaxTable>
  </MasterFiles>`;

    let totalDebit = 0;
    let totalCredit = 0;
    const invoiceBlocks: string[] = [];

    for (const { fiscal, tx } of loaded) {
        const taxId = fiscal.customer_tax_id?.replace(/\s/g, '') || CONSUMER_FINAL_CUSTOMER_TAX_ID;
        const customerId = `C${taxId}`;
        const gross = fiscal.gross_total;
        if (fiscal.invoice_type === 'NC') {
            totalCredit += Math.abs(gross);
        } else {
            totalDebit += Math.abs(gross);
        }

        const lines = tx.items
            .map((it, idx) => {
                const code = it.product_sku || it.product_id;
                const lineGross = it.line_total;
                const taxCode = mapIvaDecimalToSaftTaxCode(it.iva_rate);
                const taxPct = fmtDec(Math.round(it.iva_rate * 10000) / 100);
                const unitGross = it.quantity > 0 ? lineGross / it.quantity : lineGross;
                return `
        <Line>
          <LineNumber>${idx + 1}</LineNumber>
          <ProductCode>${xmlEscape(code)}</ProductCode>
          <ProductDescription>${xmlEscape(it.product_name)}</ProductDescription>
          <Quantity>${fmtDec(it.quantity)}</Quantity>
          <UnitOfMeasure>UN</UnitOfMeasure>
          <UnitPrice>${fmtDec(unitGross)}</UnitPrice>
          <TaxPointDate>${xmlEscape(fiscal.invoice_date)}</TaxPointDate>
          <Description>${xmlEscape(it.product_name)}</Description>
          <CreditAmount>${fmtDec(lineGross)}</CreditAmount>
          <Tax>
            <TaxType>IVA</TaxType>
            <TaxCountryRegion>PT</TaxCountryRegion>
            <TaxCode>${xmlEscape(taxCode)}</TaxCode>
            <TaxPercentage>${taxPct}</TaxPercentage>
          </Tax>
        </Line>`;
            })
            .join('');

        invoiceBlocks.push(`
      <Invoice>
        <InvoiceNo>${xmlEscape(fiscal.invoice_no)}</InvoiceNo>
        <ATCUD>${xmlEscape(fiscal.atcud_body)}</ATCUD>
        <DocumentStatus>
          <InvoiceStatus>N</InvoiceStatus>
          <InvoiceStatusDate>${xmlEscape(fiscal.system_entry_date)}</InvoiceStatusDate>
          <SourceID>${xmlEscape(fiscal.source_id)}</SourceID>
          <SourceBilling>P</SourceBilling>
        </DocumentStatus>
        <Hash>${xmlEscape(fiscal.hash_base64)}</Hash>
        <HashControl>${xmlEscape(fiscal.hash_control)}</HashControl>
        <InvoiceDate>${xmlEscape(fiscal.invoice_date)}</InvoiceDate>
        <InvoiceType>${xmlEscape(fiscal.invoice_type)}</InvoiceType>
        <SpecialRegimes>
          <SelfBillingIndicator>0</SelfBillingIndicator>
          <CashVATSchemeIndicator>0</CashVATSchemeIndicator>
          <ThirdPartiesBillingIndicator>0</ThirdPartiesBillingIndicator>
        </SpecialRegimes>
        <SourceID>${xmlEscape(fiscal.source_id)}</SourceID>
        <SystemEntryDate>${xmlEscape(fiscal.system_entry_date)}</SystemEntryDate>
        <CustomerID>${xmlEscape(customerId)}</CustomerID>
        ${lines}
        <DocumentTotals>
          <TaxPayable>${fmtDec(fiscal.tax_total)}</TaxPayable>
          <NetTotal>${fmtDec(fiscal.net_total)}</NetTotal>
          <GrossTotal>${fmtDec(fiscal.gross_total)}</GrossTotal>
        </DocumentTotals>
      </Invoice>`);
    }

    const generalLedgerEntries = `
  <GeneralLedgerEntries>
    <NumberOfEntries>0</NumberOfEntries>
    <TotalDebit>0.00</TotalDebit>
    <TotalCredit>0.00</TotalCredit>
  </GeneralLedgerEntries>`;

    const salesInvoices = `
  <SourceDocuments>
    <SalesInvoices>
      <NumberOfEntries>${loaded.length}</NumberOfEntries>
      <TotalDebit>${fmtDec(totalDebit)}</TotalDebit>
      <TotalCredit>${fmtDec(totalCredit)}</TotalCredit>
${invoiceBlocks.join('\n')}
    </SalesInvoices>
  </SourceDocuments>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="${NS}">
${header}
${masterFiles}
${generalLedgerEntries}
${salesInvoices}
</AuditFile>`;
}
