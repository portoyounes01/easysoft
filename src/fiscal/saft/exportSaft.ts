import type { SystemSettings } from '../../contexts/SettingsContext';
import type { LocalFiscalDocument, LocalTransaction, LocalTransactionItem } from '../../types/supabase';
import { customerLocalService } from '../../lib/localDatabase';
import { CONSUMER_FINAL_CUSTOMER_TAX_ID, isSaftPaymentReceiptType } from '../spec';

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
 *
 * Real POS extract (FT-only, 1.04_01): `certification requirements/SAFT-517404419-2026-02-01-2026-02-28.xml`
 * — restaurant retail lines, `InvoiceType` FT, `CreditAmount` lines, optional `Period`; that file has no `Payments` block.
 * **RG/RC** (tabela 4.4) are emitted under `<Payments>` — not in `<SalesInvoices>` (`InvoiceType` has no RG in 4.1).
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

    const customerById = new Map<string, Awaited<ReturnType<typeof customerLocalService.getCustomerById>>>();
    const uniqueCustomerIds = [...new Set(loaded.map(l => l.tx.customer_id).filter((id): id is string => Boolean(id)))];
    for (const cid of uniqueCustomerIds) {
        const row = await customerLocalService.getCustomerById(cid);
        if (row) customerById.set(cid, row);
    }

    type SaftCustomerRow = {
        taxId: string;
        name: string;
        addressDetail: string;
        city: string;
        postalCode: string;
        country: string;
    };

    const customers = new Map<string, SaftCustomerRow>();

    const placeholderBilling: Omit<SaftCustomerRow, 'taxId' | 'name'> = {
        addressDetail: 'Desconhecido',
        city: 'Desconhecido',
        postalCode: '0000-000',
        country: 'PT',
    };

    for (const { fiscal, tx } of loaded) {
        const taxId = fiscal.customer_tax_id?.replace(/\s/g, '') || CONSUMER_FINAL_CUSTOMER_TAX_ID;
        const custName =
            taxId === CONSUMER_FINAL_CUSTOMER_TAX_ID
                ? 'Consumidor final'
                : tx.customer_name?.trim() || 'Cliente';

        const linked = tx.customer_id ? customerById.get(tx.customer_id) : undefined;
        const billing: Omit<SaftCustomerRow, 'taxId' | 'name'> = linked
            ? {
                  addressDetail: (linked.address ?? '').trim() || placeholderBilling.addressDetail,
                  city: (linked.city ?? '').trim() || placeholderBilling.city,
                  postalCode: (linked.postal_code ?? '').trim() || placeholderBilling.postalCode,
                  country: (linked.country ?? 'PT').trim().slice(0, 2).toUpperCase() || 'PT',
              }
            : placeholderBilling;

        customers.set(taxId, { taxId, name: custName, ...billing });

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
            ...placeholderBilling,
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
        .map(([, c]) => {
            const cid = `C${c.taxId}`;
            return `
    <Customer>
      <CustomerID>${xmlEscape(cid)}</CustomerID>
      <AccountID>Desconhecido</AccountID>
      <CustomerTaxID>${xmlEscape(c.taxId)}</CustomerTaxID>
      <CompanyName>${xmlEscape(c.name)}</CompanyName>
      <BillingAddress>
        <AddressDetail>${xmlEscape(c.addressDetail)}</AddressDetail>
        <City>${xmlEscape(c.city)}</City>
        <PostalCode>${xmlEscape(c.postalCode)}</PostalCode>
        <Country>${xmlEscape(c.country)}</Country>
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

    const invoiceLoaded = loaded.filter(l => !isSaftPaymentReceiptType(l.fiscal.invoice_type));
    const paymentLoaded = loaded.filter(l => isSaftPaymentReceiptType(l.fiscal.invoice_type));

    let totalDebit = 0;
    let totalCredit = 0;
    const invoiceBlocks: string[] = [];

    for (const { fiscal, tx } of invoiceLoaded) {
        const taxId = fiscal.customer_tax_id?.replace(/\s/g, '') || CONSUMER_FINAL_CUSTOMER_TAX_ID;
        const customerId = `C${taxId}`;
        const gross = fiscal.gross_total;
        if (fiscal.invoice_type === 'NC') {
            totalCredit += Math.abs(gross);
        } else {
            totalDebit += Math.abs(gross);
        }

        const ncSettledNo = fiscal.invoice_type === 'NC' ? (fiscal.settled_invoice_no?.trim() ?? '') : '';
        const ncSettledDate = fiscal.invoice_type === 'NC' ? (fiscal.settled_invoice_date?.trim() ?? '') : '';
        const ncSourceDocBlock =
            ncSettledNo && ncSettledDate
                ? `
          <SourceDocumentID>
            <OriginatingON>${xmlEscape(ncSettledNo)}</OriginatingON>
            <InvoiceDate>${xmlEscape(ncSettledDate)}</InvoiceDate>
          </SourceDocumentID>`
                : '';

        const lines = tx.items
            .map((it, idx) => {
                const code = it.product_sku || it.product_id;
                const lineGross = it.line_total;
                const taxCode = mapIvaDecimalToSaftTaxCode(it.iva_rate);
                const taxPct = fmtDec(Math.round(it.iva_rate * 10000) / 100);
                const unitGross = it.quantity > 0 ? lineGross / it.quantity : lineGross;
                return `
        <Line>
          <LineNumber>${idx + 1}</LineNumber>${ncSourceDocBlock}
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

        const isCancelled = Boolean(fiscal.cancelled_at);
        const invoiceStatus = isCancelled ? 'A' : 'N';
        const invoiceStatusDate = isCancelled
            ? (fiscal.cancelled_at as string).replace(/\.\d{3}Z$/, '').replace('Z', '')
            : fiscal.system_entry_date;

        invoiceBlocks.push(`
      <Invoice>
        <InvoiceNo>${xmlEscape(fiscal.invoice_no)}</InvoiceNo>
        <ATCUD>${xmlEscape(fiscal.atcud_body)}</ATCUD>
        <DocumentStatus>
          <InvoiceStatus>${invoiceStatus}</InvoiceStatus>
          <InvoiceStatusDate>${xmlEscape(invoiceStatusDate)}</InvoiceStatusDate>
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

    let payTotalDebit = 0;
    let payTotalCredit = 0;
    const paymentBlocks: string[] = [];

    for (const { fiscal, tx } of paymentLoaded) {
        const taxId = fiscal.customer_tax_id?.replace(/\s/g, '') || CONSUMER_FINAL_CUSTOMER_TAX_ID;
        const customerId = `C${taxId}`;
        payTotalCredit += Math.abs(fiscal.gross_total);

        const settledNo = fiscal.settled_invoice_no?.trim() ?? '';
        const settledDate = fiscal.settled_invoice_date?.trim() ?? '';

        const payLines = tx.items
            .map((it, idx) => {
                const lineGross = Math.abs(it.line_total);
                const taxCode = mapIvaDecimalToSaftTaxCode(it.iva_rate);
                const taxPct = fmtDec(Math.round(it.iva_rate * 10000) / 100);
                return `
        <Line>
          <LineNumber>${idx + 1}</LineNumber>
          <SourceDocumentID>
            <OriginatingON>${xmlEscape(settledNo)}</OriginatingON>
            <InvoiceDate>${xmlEscape(settledDate)}</InvoiceDate>
          </SourceDocumentID>
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

        const isPayCancelled = Boolean(fiscal.cancelled_at);
        const payStatus = isPayCancelled ? 'A' : 'N';
        const payStatusDate = isPayCancelled
            ? (fiscal.cancelled_at as string).replace(/\.\d{3}Z$/, '').replace('Z', '')
            : fiscal.system_entry_date;

        paymentBlocks.push(`
      <Payment>
        <PaymentRefNo>${xmlEscape(fiscal.invoice_no)}</PaymentRefNo>
        <ATCUD>${xmlEscape(fiscal.atcud_body)}</ATCUD>
        <TransactionDate>${xmlEscape(fiscal.invoice_date)}</TransactionDate>
        <PaymentType>${xmlEscape(fiscal.invoice_type)}</PaymentType>
        <DocumentStatus>
          <PaymentStatus>${payStatus}</PaymentStatus>
          <PaymentStatusDate>${xmlEscape(payStatusDate)}</PaymentStatusDate>
          <SourceID>${xmlEscape(fiscal.source_id)}</SourceID>
          <SourcePayment>P</SourcePayment>
        </DocumentStatus>
        <SourceID>${xmlEscape(fiscal.source_id)}</SourceID>
        <SystemEntryDate>${xmlEscape(fiscal.system_entry_date)}</SystemEntryDate>
        <CustomerID>${xmlEscape(customerId)}</CustomerID>
${payLines}
        <DocumentTotals>
          <TaxPayable>${fmtDec(fiscal.tax_total)}</TaxPayable>
          <NetTotal>${fmtDec(fiscal.net_total)}</NetTotal>
          <GrossTotal>${fmtDec(fiscal.gross_total)}</GrossTotal>
        </DocumentTotals>
      </Payment>`);
    }

    const generalLedgerEntries = `
  <GeneralLedgerEntries>
    <NumberOfEntries>0</NumberOfEntries>
    <TotalDebit>0.00</TotalDebit>
    <TotalCredit>0.00</TotalCredit>
  </GeneralLedgerEntries>`;

    const paymentsSection =
        paymentLoaded.length > 0
            ? `
    <Payments>
      <NumberOfEntries>${paymentLoaded.length}</NumberOfEntries>
      <TotalDebit>${fmtDec(payTotalDebit)}</TotalDebit>
      <TotalCredit>${fmtDec(payTotalCredit)}</TotalCredit>
${paymentBlocks.join('\n')}
    </Payments>`
            : '';

    const salesInvoices = `
  <SourceDocuments>
    <SalesInvoices>
      <NumberOfEntries>${invoiceLoaded.length}</NumberOfEntries>
      <TotalDebit>${fmtDec(totalDebit)}</TotalDebit>
      <TotalCredit>${fmtDec(totalCredit)}</TotalCredit>
${invoiceBlocks.join('\n')}
    </SalesInvoices>${paymentsSection}
  </SourceDocuments>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="${NS}">
${header}
${masterFiles}
${generalLedgerEntries}
${salesInvoices}
</AuditFile>`;
}
