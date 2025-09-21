import React from 'react';

interface ReceiptItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  total: number;
}

interface ReceiptCompany {
  name: string;
  address: string;
  postalCode: string;
  city: string;
  taxNumber: string;
  phone?: string;
  email?: string;
}

interface ReceiptCustomer {
  taxNumber?: string;
  name?: string;
}

interface ReceiptPayment {
  method: string;
  amountGiven: number;
  change: number;
}

interface ReceiptTotals {
  subtotal: number;
  discount: number;
  discountPercentage: number;
  net: number;
  vat: number;
  total: number;
}

export interface ReceiptProps {
  documentNumber: string;
  documentType: 'FATURA' | 'FATURA_SIMPLIFICADA' | 'NOTA_CREDITO';
  date: Date;
  counter: string;
  verificationCode: string;
  company: ReceiptCompany;
  customer?: ReceiptCustomer;
  items: ReceiptItem[];
  totals: ReceiptTotals;
  payment: ReceiptPayment;
  slogan?: string;
  softwareInfo?: string;
  certificationNumber?: string;
  originalInvoice?: string; // For credit notes
  creditReason?: string; // For credit notes
  documentLabel?: string; // e.g., 'Original' (default) or 'Segunda via'
}

const ThermalReceipt: React.FC<ReceiptProps> = ({
  documentNumber,
  documentType,
  date,
  counter,
  verificationCode,
  company,
  customer,
  items,
  totals,
  payment,
  slogan,
  softwareInfo,
  certificationNumber,
  originalInvoice,
  creditReason,
  documentLabel
}) => {
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('pt-PT') + ' ' + date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  };

  const formatCurrency = (amount: number): string => {
    return amount.toFixed(2).replace('.', ',') + ' €';
  };

  // Helpers for precise totals based on discount policy (apply discount first, then split VAT)
  const round2 = (n: number): number => Math.round(n * 100) / 100;
  const discountPct = totals.discountPercentage || 0;
  const discountFactor = 1 - discountPct / 100;

  // Aggregate recomputed totals from items after discount
  const recomputed = items.reduce(
    (acc, item) => {
      const rate = (item.vatRate || 0) / 100;
      const grossAfterDiscount = item.total * discountFactor; // tax-included
      const base = grossAfterDiscount / (1 + rate);
      const vat = grossAfterDiscount - base;
      acc.gross += grossAfterDiscount;
      acc.base += base;
      acc.vat += vat;
      return acc;
    },
    { gross: 0, base: 0, vat: 0 }
  );
  const totalGross = round2(recomputed.gross);
  const totalBase = round2(recomputed.base);
  const totalVat = round2(recomputed.vat);
  const subtotalBeforeDiscount = round2(totalBase + (totals.discount || 0));

  const getDocumentTitle = (): string => {
    switch (documentType) {
      case 'FATURA':
        return 'FATURA N°';
      case 'FATURA_SIMPLIFICADA':
        return 'FATURA SIMPLIFICADA N°';
      case 'NOTA_CREDITO':
        return 'NOTA DE CRÉDITO N°';
      default:
        return 'DOCUMENTO N°';
    }
  };

  return (
    <div className="thermal-receipt">
      <style>{`
        .thermal-receipt {
          font-family: 'Courier New', monospace;
          font-size: 12px;
          line-height: 1.2;
          width: 80mm;
          margin: 0 auto;
          padding: 5mm;
          background: #ffffff;
          color: black;
          border: 1px solid #ddd;
          box-sizing: border-box;
          display: block;
          overflow: hidden; /* contain margins and ensure background covers entire content */
        }

        /* Ensure content never exceeds receipt width and wraps correctly */
        .thermal-receipt * {
          box-sizing: border-box;
          max-width: 100%;
          word-break: break-word;
        }

        @media print {
          .thermal-receipt {
            border: none;
            margin: 0;
            padding: 0;
          }
          @page {
            size: 80mm auto;
            margin: 0;
          }
        }

        .center { text-align: center; }
        .left { text-align: left; }
        .right { text-align: right; }
        .bold { font-weight: bold; }

        .separator {
          border-top: 1px dashed #333;
          margin: 5px 0;
          width: 100%;
        }

        .double-separator {
          border-top: 2px solid #333;
          margin: 8px 0;
          width: 100%;
        }

        .item-row {
          display: flex;
          justify-content: space-between;
          margin: 2px 0;
        }

        /* Grid-based alignment for items */
        .receipt-grid {
          display: grid;
          grid-template-columns: auto auto 1fr auto auto; /* avoid mm subpixel rounding */
          column-gap: 8px;
          align-items: start; /* keep IVA/Valor pinned to the top when description wraps */
          justify-items: start;
        }
        /* prevent column labels and numeric cells from wrapping, but allow description to wrap */
        .receipt-grid > span { white-space: nowrap; }
        .receipt-grid .item-desc, .receipt-grid .grid-from-desc { 
          white-space: normal; 
          overflow-wrap: anywhere; 
          word-break: break-word;
        }
        .receipt-grid > span { padding-left: 0; }
        .grid-span-all { grid-column: 1 / -1; }
        .grid-from-desc { grid-column: 3 / -1; }
        .right { text-align: right; }
        .cell-end { justify-self: end; }
        .spacer-row { grid-column: 1 / -1; height: 6px; }
        /* Default left alignment keeps content starting at column labels */

        .item-desc {
          flex: 1;
          padding-right: 5px;
        }

        .item-price {
          white-space: nowrap;
        }

        .total-row {
          display: flex;
          justify-content: space-between;
          font-weight: bold;
          margin: 3px 0;
        }

        .header-info {
          margin: 2px 0;
        }

        .small-text {
          font-size: 10px;
          line-height: 1.1;
        }

        .qr-placeholder {
          width: 60px;
          height: 60px;
          border: 1px solid #333;
          margin: 10px auto;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 8px;
        }

        .company-logo {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 10px;
        }

        .final-total {
          font-size: 14px;
          font-weight: bold;
        }

        .credit-note-info {
          background: #f5f5f5;
          padding: 5px;
          margin: 5px 0;
          border: 1px solid #ccc;
        }
      `}</style>

      {/* Logo/Header */}
      <div className="center company-logo">[LOGO]</div>

      {/* Company Info */}
      <div className="center bold">{company.name}</div>
      <div className="center small-text">{company.address}</div>
      <div className="center small-text">{company.postalCode} {company.city}</div>
      {company.phone && <div className="center small-text">Tel: {company.phone}</div>}
      {company.email && <div className="center small-text">{company.email}</div>}

      <div className="separator"></div>

      {/* Customer Info */}
      {customer?.taxNumber && (
        <>
          <div className="center">Contrib: {customer.taxNumber} (cliente)</div>
          <div className="separator"></div>
        </>
      )}

      {/* Verification Code */}
      <div className="center small-text">{verificationCode}</div>

      {/* QR Code Placeholder */}
      <div className="qr-placeholder center">QR CODE</div>

      <div className="separator"></div>

      {/* Document Header */}
      <div className="center bold">{getDocumentTitle()}</div>
      <div className="center">{documentNumber} {documentLabel || 'Original'}</div>
      <div className="center">Data: {formatDate(date)} {counter}</div>

      {/* Credit Note Specific Info */}
      {documentType === 'NOTA_CREDITO' && originalInvoice && (
        <div className="credit-note-info">
          <div className="small-text">Ref. Fatura: {originalInvoice}</div>
          {creditReason && <div className="small-text">Motivo: {creditReason}</div>}
        </div>
      )}

      <div className="separator"></div>

      {/* Items Grid: header + rows share the same grid tracks for perfect alignment */}
      <div className="receipt-grid header-info">
        <span className="small-text bold">QTD</span>
        <span className="small-text bold">UNI</span>
        <span className="small-text bold">Descrição</span>
        <span className="small-text bold">IVA</span>
        <span className="small-text bold cell-end">Valor</span>

        {items.map((item, index) => (
          <React.Fragment key={item.id || index}>
            <span>{item.quantity}</span>
            <span>Uni</span>
            <span className="item-desc">{item.description}</span>
            <span>{item.vatRate}%</span>
            <span className="cell-end">{formatCurrency(round2(item.total * discountFactor))}</span>
            <span className="small-text grid-from-desc">Preço unitário: {formatCurrency(item.unitPrice)} €/Unidade</span>
            {index < items.length - 1 && <span className="spacer-row"></span>}
          </React.Fragment>
        ))}
      </div>

      <div className="separator"></div>

      {/* VAT Info aligned with a single grid container (header + rows) to keep tracks identical */}
      <div className="center small-text">IVA Incluído à taxa indicada</div>
      <div className="receipt-grid small-text">
        <span className="bold">%</span>
        <span></span>
        <span></span>
        <span className="bold">IVA</span>
        <span className="bold cell-end">Incidência</span>

        {(() => {
          const vatGroups = items.reduce((acc, item) => {
            const key = item.vatRate;
            if (!acc[key]) {
              acc[key] = { incidence: 0, vat: 0 };
            }
            const rateFraction = (item.vatRate || 0) / 100;
            const grossAfterDiscount = item.total * discountFactor;
            const base = grossAfterDiscount / (1 + rateFraction);
            const vat = grossAfterDiscount - base;
            acc[key].incidence += base;
            acc[key].vat += vat;
            return acc;
          }, {} as Record<number, { incidence: number; vat: number }>);

          return Object.entries(vatGroups).map(([rate, amounts]) => (
            <React.Fragment key={rate}>
              <span>{rate}</span>
              <span></span>
              <span></span>
              <span>{formatCurrency(amounts.vat)}</span>
              <span className="cell-end">{formatCurrency(amounts.incidence)}</span>
            </React.Fragment>
          ));
        })()}
      </div>

      {/* Totals */}
      <div className="total-row">
        <span>ILÍQUIDO</span>
        <span>{formatCurrency(subtotalBeforeDiscount)}</span>
      </div>
      {totals.discount > 0 && (
        <div className="total-row">
          <span>DESC.{totals.discountPercentage}%</span>
          <span>{formatCurrency(totals.discount)}</span>
        </div>
      )}
      <div className="total-row">
        <span>LÍQUIDO</span>
        <span>{formatCurrency(totalBase)}</span>
      </div>
      <div className="total-row">
        <span>IVA</span>
        <span>{formatCurrency(totalVat)}</span>
      </div>

      <div className="double-separator"></div>

      {/* Final Total */}
      <div className="total-row final-total">
        <span>TOTAL</span>
        <span>{formatCurrency(totalGross)}</span>
      </div>

      <div className="separator"></div>

      {/* Slogan */}
      {slogan && (
        <>
          <div className="center bold">{slogan}</div>
          <div className="separator"></div>
        </>
      )}

      {/* Software Info */}
      {softwareInfo && <div className="center small-text">{softwareInfo}</div>}

      <div className="separator"></div>

      {/* Payment Info */}
      <div className="left">Pago em {payment.method}</div>
      {payment.method === 'Numerário' && (
        <>
          <div className="item-row">
            <span>Valor entregue:</span>
            <span>{formatCurrency(payment.amountGiven)}</span>
          </div>
          <div className="item-row">
            <span>Troco:</span>
            <span>{formatCurrency(payment.change)}</span>
          </div>
        </>
      )}

      <div className="separator"></div>

      {/* Legal Info */}
      {certificationNumber && (
        <>
          <div className="center small-text">uGSU-Processado por programa</div>
          <div className="center small-text">certificado n° {certificationNumber}</div>
        </>
      )}

      <div style={{ margin: '10px 0' }}></div>

      <div className="small-text">
        Os serviços e/ou bens foram realizados e/ou colocados à disposição do
        adquirente nesta data (Art 36 do CIVA, N°5 alínea F)
      </div>

      <div style={{ margin: '10px 0' }}></div>

      <div className="center small-text">Licenciado a: {company.name}</div>
      <div className="center small-text">Contribuinte: {company.taxNumber}</div>

      {/* Extra space for cutting */}
      <div style={{ height: '20px' }}></div>
    </div>
  );
};

export default ThermalReceipt;
