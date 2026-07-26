/** ReceiptProps → ESC/POS bytes for an 80 mm thermal head.
 *
 *  Section order mirrors ThermalReceipt exactly, uses the same translation
 *  keys and the same money arithmetic (computeReceiptTotals), so the paper and
 *  the on-screen preview carry identical fiscal content. When the layout
 *  changes, change it in both — or better, change what they share.
 */
import type { ReceiptProps } from '../../components/ThermalReceipt';
import { certificationNumberForReceiptDisplay } from '../../utils/receiptCertification';
import { computeReceiptTotals, formatReceiptCurrency, round2 } from '../../utils/receiptTotals';
import { getReceiptT, normalizeReceiptLanguage, type ReceiptLanguage } from '../../utils/receiptLanguage';
import { EscPosBuilder, padEnd, padStart, wrapText, type EscPosCodePage } from './escposBuilder';

export interface BuildReceiptOptions {
    /** Defaults to the receipt's own override, then 'pt'. */
    language?: ReceiptLanguage;
    /** Printer character set. Change this first if accents print as noise. */
    codePage?: EscPosCodePage;
    columns?: number;
    /** Set false to leave the paper uncut (kitchen chaining). */
    cut?: boolean;
}

/** Item row columns for 48 characters: qty(6) unit(3) description(19) vat(5) value(11).
 *  Qty is 6 because a weighed line prints 3 decimals (e.g. "12.500") and the
 *  padding truncates from the LEFT — a narrower column silently turned 0.482
 *  into .482 on a fiscal document. */
const COL_QTY = 6;
const COL_UNIT = 3;
const COL_VAT = 5;
const COL_VALUE = 11;
/** Left gutter of the description column, for continuation lines. */
const DESC_INDENT = COL_QTY + 1 + COL_UNIT + 1;

const CASH_METHODS = ['Numerário', 'Cash', 'Dinheiro', 'Efectivo'];

export function buildReceiptEscPos(receipt: ReceiptProps, options: BuildReceiptOptions = {}): Uint8Array {
    return buildReceiptBuilder(receipt, options).build();
}

/** Same bytes, base64 — the form `hardware.printRaw` takes. */
export function buildReceiptEscPosBase64(receipt: ReceiptProps, options: BuildReceiptOptions = {}): string {
    return buildReceiptBuilder(receipt, options).toBase64();
}

function buildReceiptBuilder(receipt: ReceiptProps, options: BuildReceiptOptions): EscPosBuilder {
    const language = normalizeReceiptLanguage(options.language ?? receipt.receiptLanguage);
    const t = getReceiptT(language);
    const dateLocale = language === 'pt' ? 'pt-PT' : language === 'es' ? 'es-ES' : 'en-GB';
    const money = formatReceiptCurrency;

    const b = new EscPosBuilder({ codePage: options.codePage, columns: options.columns });
    const width = b.columns;
    const descWidth = Math.max(8, width - DESC_INDENT - 1 - COL_VAT - 1 - COL_VALUE);

    const { discountPct, grossFactor, totalGross, totalBase, totalVat, subtotalBeforeDiscount, vatGroups } =
        computeReceiptTotals(receipt.items, receipt.totals);

    const centered = (value: string, bold = false) => {
        b.align('center');
        if (bold) b.bold(true);
        b.line(value);
        if (bold) b.bold(false);
        b.align('left');
    };

    b.init();

    // Training banner
    if (receipt.trainingMode) {
        centered('*'.repeat(width), true);
        centered(t('thermalReceipt.trainingBanner'), true);
        centered('*'.repeat(width), true);
        b.feed(1);
    }

    // Logo placeholder + company block
    b.align('center').bold(true).size(1, 2).line(t('thermalReceipt.logoPlaceholder')).size(1, 1);
    b.line(receipt.company.name);
    b.line(`${t('thermalReceipt.nifLabel')} ${receipt.company.taxNumber.replace(/\s/g, '')}`);
    b.bold(false);
    b.line(receipt.company.address);
    b.line(`${receipt.company.postalCode} ${receipt.company.city}`);
    if (receipt.company.phone) b.line(`${t('thermalReceipt.telLabel')} ${receipt.company.phone}`);
    if (receipt.company.email) b.line(receipt.company.email);
    b.align('left');
    b.rule();

    // Customer
    const customer = receipt.customer;
    if (customer && (customer.name || customer.taxNumber || customer.address)) {
        if (customer.name) b.line(t('thermalReceipt.clientLineName', { name: customer.name }));
        if (customer.taxNumber) {
            b.line(t('thermalReceipt.clientLineNif', { n: customer.taxNumber.replace(/\s/g, '') }));
        }
        if (customer.address) b.line(t('thermalReceipt.clientLineMorada', { morada: customer.address }));
        b.rule();
    }

    if (receipt.emitterName) {
        centered(`${t('thermalReceipt.operator')} ${receipt.emitterName}`);
        b.rule();
    }

    // Document header
    centered(documentTitle(receipt.documentType, t), true);
    centered(`${receipt.documentNumber} ${receipt.documentLabel || t('thermalReceipt.original')}`);
    centered(`${t('thermalReceipt.dateLabel')} ${formatReceiptDate(receipt.date, dateLocale)} ${receipt.counter}`);

    if (receipt.documentType === 'NOTA_CREDITO' && receipt.originalInvoice) {
        b.line(`${t('thermalReceipt.refInvoice')} ${receipt.originalInvoice}`);
        if (receipt.creditReason) b.line(`${t('thermalReceipt.reason')} ${receipt.creditReason}`);
    }

    b.rule();

    // Items
    b.bold(true).fixed(
        padStart(t('thermalReceipt.qty'), COL_QTY) + ' ' +
        padEnd(t('thermalReceipt.unitAbbr'), COL_UNIT) + ' ' +
        padEnd(t('thermalReceipt.description'), descWidth) + ' ' +
        padStart(t('thermalReceipt.vatPercent'), COL_VAT) + ' ' +
        padStart(t('thermalReceipt.value'), COL_VALUE)
    ).bold(false);

    for (const item of receipt.items) {
        const isWeighed = item.unit === 'kg';
        const quantity = isWeighed ? item.quantity.toFixed(3) : String(item.quantity);
        const unitLabel = isWeighed ? t('thermalReceipt.unitKg') : t('thermalReceipt.unit');
        const descriptionLines = wrapText(item.description, descWidth);

        b.fixed(
            padStart(quantity, COL_QTY) + ' ' +
            padEnd(unitLabel, COL_UNIT) + ' ' +
            padEnd(descriptionLines[0] ?? '', descWidth) + ' ' +
            padStart(`${item.vatRate}%`, COL_VAT) + ' ' +
            padStart(money(round2(item.total * grossFactor)), COL_VALUE)
        );
        for (const continuation of descriptionLines.slice(1)) {
            b.fixed(' '.repeat(DESC_INDENT) + continuation);
        }
        b.fixed(
            ' '.repeat(DESC_INDENT) +
            t(isWeighed ? 'thermalReceipt.unitPriceLineKg' : 'thermalReceipt.unitPriceLine', {
                price: item.unitPrice.toFixed(2).replace('.', ','),
            })
        );
    }

    b.rule();

    // VAT breakdown
    b.bold(true).triple('%', t('thermalReceipt.vat'), t('thermalReceipt.incidence'), 14, 14).bold(false);
    for (const group of vatGroups) {
        b.triple(group.rate, money(group.vat), money(group.incidence), 14, 14);
    }

    // Totals
    if (receipt.totals.discount > 0) {
        b.pair(t('thermalReceipt.net'), money(subtotalBeforeDiscount));
        b.pair(
            discountPct > 0
                ? t('thermalReceipt.discountWithPct', { pct: discountPct })
                : t('thermalReceipt.discountLabel'),
            money(receipt.totals.discount)
        );
        b.pair(t('thermalReceipt.gross'), money(totalBase));
    }
    b.pair(t('thermalReceipt.vat'), money(totalVat));

    centered(t('thermalReceipt.vatIncludedFooter'));
    b.rule('=');

    // Final total — double height only: double width would halve the columns
    // and break every padded row above.
    b.bold(true).size(1, 2).pair(t('thermalReceipt.total'), money(totalGross)).size(1, 1).bold(false);
    b.rule();

    // ATCUD + QR + hash
    if (receipt.verificationCode) {
        centered(`${t('thermalReceipt.atcudPrefix')} ${receipt.verificationCode}`, true);
    }
    if (receipt.qrCodeData) {
        b.feed(1).qr(receipt.qrCodeData).feed(1);
    }
    if (receipt.documentHash && !receipt.hashFourChars) {
        centered(`${t('thermalReceipt.hashLabel')} ${receipt.documentHash.substring(0, 24)}...`);
    }

    b.rule();

    if (receipt.slogan) {
        centered(receipt.slogan, true);
        b.rule();
    }
    if (receipt.softwareInfo) centered(receipt.softwareInfo);
    b.rule();

    // Payment
    b.line(t('thermalReceipt.paidWith', { method: receipt.payment.method }));
    if (CASH_METHODS.includes(receipt.payment.method)) {
        b.pair(t('thermalReceipt.cashReceived'), money(receipt.payment.amountGiven));
        b.pair(t('thermalReceipt.change'), money(receipt.payment.change));
    }

    b.rule();

    // Legal line — ES: Veri*factu legend; PT: hash chars + certification phrase
    if (receipt.verifactuLegend?.trim()) {
        centered(receipt.verifactuLegend.trim(), true);
    } else {
        centered(
            t('thermalReceipt.certifiedLine', {
                hashPrefix: receipt.hashFourChars?.trim() ? `${receipt.hashFourChars.trim()}-` : '',
                num: certificationNumberForReceiptDisplay(receipt.certificationNumber),
            })
        );
    }

    // Order queue number, last (freshly issued receipts only)
    if (receipt.ticketNumber) {
        b.rule();
        centered('PEDIDO / ORDER', true);
        b.align('center').bold(true).size(2, 2).line(receipt.ticketNumber).size(1, 1).bold(false).align('left');
    }

    if (options.cut === false) {
        b.feed(4);
    } else {
        b.cut();
    }
    return b;
}

function formatReceiptDate(date: Date, locale: string): string {
    return (
        date.toLocaleDateString(locale) +
        ' ' +
        date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    );
}

function documentTitle(
    documentType: ReceiptProps['documentType'],
    t: ReturnType<typeof getReceiptT>
): string {
    switch (documentType) {
        case 'FATURA':
            return t('thermalReceipt.docFatura');
        case 'FATURA_SIMPLIFICADA':
            return t('thermalReceipt.docFaturaSimplificada');
        case 'NOTA_CREDITO':
            return t('thermalReceipt.docNotaCredito');
        default:
            return t('thermalReceipt.docGeneric');
    }
}
