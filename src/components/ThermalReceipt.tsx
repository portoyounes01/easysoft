import React, { useState, useEffect, useMemo } from 'react';
import { generateQRCodeImage } from '../utils/qrCode';
import { useSettings } from '../contexts/SettingsContext';
import { getReceiptT } from '../utils/receiptLanguage';
import { computeReceiptTotals, formatReceiptCurrency, round2 } from '../utils/receiptTotals';
import {
  RECEIPT_CERTIFICATION_PLACEHOLDER,
  certificationNumberForReceiptDisplay,
} from '../utils/receiptCertification';
import type { FiscalOfficialOutput } from '../fiscal/types';

interface ReceiptItem {
  id: string;
  description: string;
  quantity: number;
  /** 'kg' = weighed line: quantity prints with 3 decimals and the unit column
   *  shows kg (unit price is €/kg). Default 'un'. */
  unit?: 'un' | 'kg';
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

/** `address` = full morada (single line), not split by postal/city. */
interface ReceiptCustomer {
  taxNumber?: string;
  name?: string;
  address?: string;
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
  /** TALAO_NAO_FISCAL is the fallback slip printed when fiscal issuance is
   *  impossible (offline / backend unreachable / no valid ATCUD+QR). It is NOT
   *  a fiscal document: it carries no ATCUD, no QR, no fatura number and no
   *  certification line — the legal invoice for that sale is the handwritten
   *  one from the AT-authorised book. See docs/fiscal-fallback-legal-brief.md. */
  documentType: 'FATURA' | 'FATURA_SIMPLIFICADA' | 'NOTA_CREDITO' | 'TALAO_NAO_FISCAL';
  date: Date;
  counter: string;
  ticketNumber?: string;
  verificationCode: string; // ATCUD body (e.g. CSDF7T5H-0001); printed as ATCUD: …  (empty for ES)
  /** Spain / Veri*factu legend (e.g. "VERI*FACTU"). When set, replaces the PT "…/AT" certified
   *  line — the QR block already renders the AEAT validation QR from qrCodeData. */
  verifactuLegend?: string;
  documentHash?: string; // Base64 RSA-SHA1 fiscal hash (optional / debug)
  /** Four signature chars (positions 1,11,21,31 of Base64 hash) */
  hashFourChars?: string;
  qrCodeData?: string; // AT QR payload
  /** Pre-rendered QR when already generated (avoids duplicate work) */
  qrCodeImage?: string;
  trainingMode?: boolean;
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
  documentLabel?: string; // e.g. Original (first issue) or 2.ª via (reprint) — use i18n keys thermalReceipt.original / secondCopy
  /** Cashier / operator name for AT evidence */
  emitterName?: string;
  /** Overrides settings receipt language when set (e.g. receipt demo). */
  receiptLanguage?: 'en' | 'pt' | 'es';
  /** Official provider-rendered output; used for Vendus during transition. */
  officialOutput?: FiscalOfficialOutput;
}

// Moved to utils/receiptCertification so the ESC/POS renderer can reuse it
// without importing this component; re-exported here for existing callers.
export { RECEIPT_CERTIFICATION_PLACEHOLDER, certificationNumberForReceiptDisplay };

const ThermalReceipt: React.FC<ReceiptProps> = ({
  documentNumber,
  documentType,
  date,
  counter,
  ticketNumber,
  verificationCode,
  verifactuLegend,
  documentHash,
  hashFourChars,
  qrCodeData,
  qrCodeImage: qrCodeImageProp,
  trainingMode,
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
  documentLabel,
  emitterName,
  receiptLanguage: receiptLanguageProp,
}) => {
  const { settings } = useSettings();
  const receiptLang = receiptLanguageProp ?? settings.receipt.receiptLanguage;
  const t = useMemo(() => getReceiptT(receiptLang), [receiptLang]);
  const dateLocale = receiptLang === 'pt' ? 'pt-PT' : receiptLang === 'es' ? 'es-ES' : 'en-GB';
  const [qrCodeImage, setQrCodeImage] = useState<string>('');
  const isCashPayment = ['Numerário', 'Cash', 'Dinheiro', 'Efectivo'].includes(payment.method);

  useEffect(() => {
    if (qrCodeImageProp) {
      setQrCodeImage(qrCodeImageProp);
      return;
    }
    if (qrCodeData) {
      generateQRCodeImage(qrCodeData)
        .then(setQrCodeImage)
        .catch(err => console.error('Failed to generate QR code:', err));
    }
  }, [qrCodeData, qrCodeImageProp]);

  const formatDate = (date: Date): string => {
    return (
      date.toLocaleDateString(dateLocale) +
      ' ' +
      date.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })
    );
  };

  const formatCurrency = formatReceiptCurrency;

  // Totals arithmetic is shared with the ESC/POS renderer (services/escpos):
  // the printed receipt and this preview must never disagree on a cent.
  const {
    discountPct,
    grossFactor,
    totalGross,
    totalBase,
    totalVat,
    subtotalBeforeDiscount,
    vatGroups,
  } = useMemo(() => computeReceiptTotals(items, totals), [items, totals]);

  // Kept in lockstep with the ESC/POS builder (services/escpos/receiptEscPos.ts):
  // the preview the operator approves and the paper the customer receives must
  // suppress exactly the same fiscal elements.
  const nonFiscal = documentType === 'TALAO_NAO_FISCAL';

  const getDocumentTitle = (): string => {
    switch (documentType) {
      case 'FATURA':
        return t('thermalReceipt.docFatura');
      case 'FATURA_SIMPLIFICADA':
        return t('thermalReceipt.docFaturaSimplificada');
      case 'NOTA_CREDITO':
        return t('thermalReceipt.docNotaCredito');
      case 'TALAO_NAO_FISCAL':
        return t('thermalReceipt.docTalaoNaoFiscal');
      default:
        return t('thermalReceipt.docGeneric');
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

        .atcud-after-separator {
          margin-top: 8px;
        }

        .receipt-qr-block {
          width: 100%;
          text-align: center;
        }

        .receipt-qr-block img,
        .receipt-qr-img {
          display: block;
          max-width: 120px;
          width: 120px;
          height: auto;
          margin-left: auto;
          margin-right: auto;
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

      {trainingMode && (
        <div className="center bold small-text" style={{ border: '2px dashed #c00', padding: '6px', marginBottom: '8px' }}>
          {t('thermalReceipt.trainingBanner')}
        </div>
      )}

      {/* Logo/Header */}
      <div className="center company-logo">{t('thermalReceipt.logoPlaceholder')}</div>

      {/* Company Info */}
      <div className="center bold">{company.name}</div>
      <div className="center small-text bold">
        {t('thermalReceipt.nifLabel')} {company.taxNumber.replace(/\s/g, '')}
      </div>
      <div className="center small-text">{company.address}</div>
      <div className="center small-text">{company.postalCode} {company.city}</div>
      {company.phone && (
        <div className="center small-text">
          {t('thermalReceipt.telLabel')} {company.phone}
        </div>
      )}
      {company.email && <div className="center small-text">{company.email}</div>}

      <div className="separator"></div>

      {/* Cliente: nome, NIF, morada (uma linha) */}
      {!nonFiscal && customer && (customer.name || customer.taxNumber || customer.address) && (
        <>
          {customer.name ? (
            <div className="left small-text">{t('thermalReceipt.clientLineName', { name: customer.name })}</div>
          ) : null}
          {customer.taxNumber ? (
            <div className="left small-text">
              {t('thermalReceipt.clientLineNif', { n: customer.taxNumber.replace(/\s/g, '') })}
            </div>
          ) : null}
          {customer.address ? (
            <div className="left small-text">
              {t('thermalReceipt.clientLineMorada', { morada: customer.address })}
            </div>
          ) : null}
          <div className="separator"></div>
        </>
      )}

      {emitterName && (
        <>
          <div className="center small-text">
            {t('thermalReceipt.operator')} {emitterName}
          </div>
          <div className="separator"></div>
        </>
      )}

      {/* Document header. The slip carries no document-type title at all: it is
          not a document type, and naming it invites the customer to read it as
          one. It goes straight to the internal ID. */}
      {!nonFiscal && <div className="center bold">{getDocumentTitle()}</div>}
      <div className="center">
        {nonFiscal
          // No fatura number: the slip must never consume one from the fiscal series.
          ? `${t('thermalReceipt.internalIdLabel')} ${documentNumber}`
          : `${documentNumber} ${documentLabel || t('thermalReceipt.original')}`}
      </div>
      <div className="center">
        {t('thermalReceipt.dateLabel')} {formatDate(date)} {counter}
      </div>

      {/* Credit Note Specific Info */}
      {documentType === 'NOTA_CREDITO' && originalInvoice && (
        <div className="credit-note-info">
          <div className="small-text">
            {t('thermalReceipt.refInvoice')} {originalInvoice}
          </div>
          {creditReason && (
            <div className="small-text">
              {t('thermalReceipt.reason')} {creditReason}
            </div>
          )}
        </div>
      )}

      <div className="separator"></div>

      {/* Items Grid: header + rows share the same grid tracks for perfect alignment */}
      <div className="receipt-grid header-info">
        <span className="small-text bold">{t('thermalReceipt.qty')}</span>
        <span className="small-text bold">{t('thermalReceipt.unitAbbr')}</span>
        <span className="small-text bold">{t('thermalReceipt.description')}</span>
        <span className="small-text bold">{t('thermalReceipt.vatPercent')}</span>
        <span className="small-text bold cell-end">{t('thermalReceipt.value')}</span>

        {items.map((item, index) => (
          <React.Fragment key={item.id || index}>
            <span>{item.unit === 'kg' ? item.quantity.toFixed(3) : item.quantity}</span>
            <span>{item.unit === 'kg' ? t('thermalReceipt.unitKg') : t('thermalReceipt.unit')}</span>
            <span className="item-desc">{item.description}</span>
            <span>{item.vatRate}%</span>
            <span className="cell-end">{formatCurrency(round2(item.total * grossFactor))}</span>
            <span className="small-text grid-from-desc">
              {t(item.unit === 'kg' ? 'thermalReceipt.unitPriceLineKg' : 'thermalReceipt.unitPriceLine', {
                price: item.unitPrice.toFixed(2).replace('.', ','),
              })}
            </span>
            {index < items.length - 1 && <span className="spacer-row"></span>}
          </React.Fragment>
        ))}
      </div>

      <div className="separator"></div>

      {/* VAT rate breakdown grid */}
      <div className="receipt-grid small-text">
        <span className="bold">%</span>
        <span></span>
        <span></span>
        <span className="bold">{t('thermalReceipt.vat')}</span>
        <span className="bold cell-end">{t('thermalReceipt.incidence')}</span>

        {vatGroups.map(group => (
          <React.Fragment key={group.rate}>
            <span>{group.rate}</span>
            <span></span>
            <span></span>
            <span>{formatCurrency(group.vat)}</span>
            <span className="cell-end">{formatCurrency(group.incidence)}</span>
          </React.Fragment>
        ))}
      </div>

      {/* Totals */}
      {totals.discount > 0 && (
        <>
          <div className="total-row">
            <span>{t('thermalReceipt.net')}</span>
            <span>{formatCurrency(subtotalBeforeDiscount)}</span>
          </div>
          <div className="total-row">
            <span>
              {discountPct > 0
                ? t('thermalReceipt.discountWithPct', { pct: discountPct })
                : t('thermalReceipt.discountLabel')}
            </span>
            <span>{formatCurrency(totals.discount)}</span>
          </div>
          <div className="total-row">
            <span>{t('thermalReceipt.gross')}</span>
            <span>{formatCurrency(totalBase)}</span>
          </div>
        </>
      )}
      <div className="total-row">
        <span>{t('thermalReceipt.vat')}</span>
        <span>{formatCurrency(totalVat)}</span>
      </div>

      <div className="center small-text" style={{ margin: '6px 0' }}>
        {t('thermalReceipt.vatIncludedFooter')}
      </div>

      <div className="double-separator"></div>

      {/* Final Total */}
      <div className="total-row final-total">
        <span>{t('thermalReceipt.total')}</span>
        <span>{formatCurrency(totalGross)}</span>
      </div>

      <div className="separator"></div>

      {/* ATCUD + QR + Q (below total, before slogan) — fiscal documents only.
          The slip gets the "this is not an invoice" notice in their place; an
          empty QR placeholder there would read as a printing fault rather than
          as a deliberate absence. */}
      <div className="atcud-after-separator">
        {nonFiscal ? (
          <div className="center small-text bold">{t('thermalReceipt.nonFiscalNotice')}</div>
        ) : (
          <>
            {verificationCode ? (
              <div className="center small-text bold">
                {t('thermalReceipt.atcudPrefix')} {verificationCode}
              </div>
            ) : null}
            <div className="receipt-qr-block">
              {qrCodeImage ? (
                <img
                  className="receipt-qr-img"
                  src={qrCodeImage}
                  alt={t('thermalReceipt.qrAlt')}
                />
              ) : (
                <div className="qr-placeholder">{t('thermalReceipt.qrPlaceholder')}</div>
              )}
            </div>
            {documentHash && !hashFourChars ? (
              <div className="center small-text" style={{ fontSize: '8px', wordBreak: 'break-all' }}>
                {t('thermalReceipt.hashLabel')} {documentHash.substring(0, 24)}…
              </div>
            ) : null}
          </>
        )}
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

      {/* Payment + legal line — fiscal documents only.

          The slip is not a receipt. Stating a tender, an amount given and change
          would present it as proof of payment, which is exactly the reading the
          "não serve como fatura" line exists to prevent — the handwritten
          invoice is what evidences this sale. Neither the AT certification
          phrase nor the Veri*factu legend may appear either, and nothing takes
          their place. */}
      {!nonFiscal && (
        <>
          <div className="left">{t('thermalReceipt.paidWith', { method: payment.method })}</div>
          {isCashPayment && (
            <>
              <div className="item-row">
                <span>{t('thermalReceipt.cashReceived')}</span>
                <span>{formatCurrency(payment.amountGiven)}</span>
              </div>
              <div className="item-row">
                <span>{t('thermalReceipt.change')}</span>
                <span>{formatCurrency(payment.change)}</span>
              </div>
            </>
          )}

          <div className="separator"></div>

          {verifactuLegend?.trim() ? (
            <div className="center small-text bold">{verifactuLegend.trim()}</div>
          ) : (
            <div className="center small-text">
              {t('thermalReceipt.certifiedLine', {
                hashPrefix: hashFourChars?.trim() ? `${hashFourChars.trim()}-` : '',
                num: certificationNumberForReceiptDisplay(certificationNumber),
              })}
            </div>
          )}
        </>
      )}

      {/* Order queue number — printed last, below a dashed separator. Only present
          on the freshly issued receipt; the back-office reprint omits it. */}
      {ticketNumber && (
        <>
          <div className="separator"></div>
          <div className="ticket-number">
            <div className="center bold">{t('thermalReceipt.orderTicketLabel')}</div>
            <div className="center bold" style={{ fontSize: '28px', lineHeight: 1.2 }}>
              {ticketNumber}
            </div>
          </div>
        </>
      )}

      {/* Extra space for cutting */}
      <div style={{ height: '20px' }}></div>
    </div>
  );
};

export default ThermalReceipt;
