import React, { useEffect, useState } from 'react';
import ReceiptDemo from '../components/ReceiptDemo';
import { useLocation, useParams } from 'react-router-dom';
import type { ReceiptProps } from '../components/ThermalReceipt';
import { transactionService } from '../services/transactionService';
import { isSupabaseConfigured } from '../lib/supabase';
import { useSettings } from '../contexts/SettingsContext';
import { transactionLocalService } from '../lib/localDatabase';
import { generateQRCodeImage } from '../utils/qrCode';
import type { FiscalTransactionMetadata } from '../fiscal/types';

const ReceiptDemoPage: React.FC = () => {
  const location = useLocation();
  const params = useParams();
  const { settings } = useSettings();
  const state = location.state as { receiptData?: ReceiptProps } | null;
  const [initialData, setInitialData] = useState<ReceiptProps | undefined>(state?.receiptData);

  useEffect(() => {
    const parseFiscalMeta = (raw: unknown): FiscalTransactionMetadata | null => {
      if (raw == null) return null;
      if (typeof raw === 'string') {
        try {
          return JSON.parse(raw) as FiscalTransactionMetadata;
        } catch {
          return null;
        }
      }
      if (typeof raw === 'object') return raw as FiscalTransactionMetadata;
      return null;
    };

    const loadById = async (id: string) => {
      try {
        let trx: Record<string, unknown> & { transaction_items?: unknown[]; items?: unknown[] } | null = null;
        if (isSupabaseConfigured()) {
          try {
            trx = (await transactionService.getTransactionById(id)) as typeof trx;
          } catch {
            trx = null;
          }
        }
        if (!trx) {
          const local = await transactionLocalService.getTransactionById(id);
          trx = local ? ({ ...local, transaction_items: local.items } as typeof trx) : null;
        }
        if (!trx) return;

        const rawItems = (trx.transaction_items ?? trx.items ?? []) as Record<string, unknown>[];
        const fm = parseFiscalMeta(trx.fiscal_metadata_json);
        let qrCodeImage: string | undefined;
        if (fm?.qrPayload) {
          try {
            qrCodeImage = await generateQRCodeImage(fm.qrPayload);
          } catch {
            qrCodeImage = undefined;
          }
        }

        const date = new Date(`${trx.transaction_date}T${trx.transaction_time}`);
        const receipt: ReceiptProps = {
          documentNumber: trx.receipt_number || trx.transaction_number,
          documentType: settings.receipt.defaultDocumentType,
          date,
          counter: settings.receipt.counterLabel,
          verificationCode:
            fm?.atcudBody ||
            `${settings.receipt.atValidationCode}-${String(trx.receipt_number || trx.transaction_number).split('-').pop()}`,
          hashFourChars: fm?.hashFourChars,
          documentHash: fm?.hashBase64,
          qrCodeData: fm?.qrPayload,
          qrCodeImage,
          trainingMode: fm?.certificationMode === 'training',
          documentLabel: 'Duplicado',
          company: {
            name: settings.company.name,
            address: settings.company.address,
            postalCode: settings.company.postalCode,
            city: settings.company.city,
            taxNumber: settings.company.taxNumber,
            phone: settings.company.phone || undefined,
            email: settings.company.email || undefined,
          },
          customer: trx.customer_id
            ? {
                name: (trx.customer_name as string) || undefined,
              }
            : undefined,
          items: rawItems.map((it: Record<string, unknown>) => ({
            id: String(it.id),
            description: String(it.product_name),
            quantity: Number(it.quantity),
            unitPrice: Number(it.unit_price),
            vatRate: Math.round((Number(it.iva_rate) || 0) * 100),
            total: Number(it.line_total),
          })),
          totals: {
            subtotal: Number(trx.subtotal),
            discount: Number(trx.discount),
            discountPercentage: 0,
            net: Number(trx.total) - Number(trx.tax),
            vat: Number(trx.tax),
            total: Number(trx.total),
          },
          payment: {
            method: trx.payment_method === 'cash' ? 'Numerário' : 'Multibanco',
            amountGiven: (trx.amount_paid as number) || Number(trx.total),
            change: Number(trx.change_given) || 0,
          },
          slogan: settings.company.slogan || undefined,
          softwareInfo: settings.company.softwareInfo || undefined,
          certificationNumber: settings.company.certificationNumber || undefined,
        };

        setInitialData(receipt);
      } catch (e) {
        console.warn('Failed to load receipt by id; falling back to demo.', e);
      }
    };

    if (!state?.receiptData && params.id) {
      void loadById(params.id);
    }
    // Intentionally keyed by route id only — settings provide a stable snapshot for the loaded receipt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, state?.receiptData]);

  return (
    <div>
      <ReceiptDemo {...(initialData ? { initialData } : {})} />
    </div>
  );
};

export default ReceiptDemoPage;
