import React, { useEffect, useState } from 'react';
import ReceiptDemo from '../components/ReceiptDemo';
import { useLocation, useParams } from 'react-router-dom';
import type { ReceiptProps } from '../components/ThermalReceipt';
import { transactionService } from '../services/transactionService';
import { isSupabaseConfigured } from '../lib/supabase';
import { useSettings } from '../contexts/SettingsContext';

const ReceiptDemoPage: React.FC = () => {
  const location = useLocation();
  const params = useParams();
  const { settings } = useSettings();
  const state = location.state as { receiptData?: ReceiptProps } | null;
  const [initialData, setInitialData] = useState<ReceiptProps | undefined>(state?.receiptData);

  useEffect(() => {
    const loadById = async (id: string) => {
      try {
        if (!isSupabaseConfigured()) return;
        const trx = await transactionService.getTransactionById(id);
        if (!trx) return;

        // Build ReceiptProps from transaction + settings
        const date = new Date(`${trx.transaction_date}T${trx.transaction_time}`);
        const receipt: ReceiptProps = {
          documentNumber: trx.receipt_number || trx.transaction_number,
          documentType: settings.receipt.defaultDocumentType,
          date,
          counter: settings.receipt.counterLabel,
          verificationCode: `${settings.receipt.atcudPrefix}-${trx.receipt_number || trx.transaction_number}`,
          company: {
            name: settings.company.name,
            address: settings.company.address,
            postalCode: settings.company.postalCode,
            city: settings.company.city,
            taxNumber: settings.company.taxNumber,
            phone: settings.company.phone || undefined,
            email: settings.company.email || undefined,
          },
          customer: trx.customer_id ? {
            name: trx.customer_name || undefined,
          } : undefined,
          items: (trx.transaction_items || []).map((it: any) => ({
            id: it.id,
            description: it.product_name,
            quantity: it.quantity,
            unitPrice: it.unit_price,
            vatRate: Math.round((it.iva_rate || 0) * 100),
            total: it.line_total,
          })),
          totals: {
            subtotal: trx.subtotal,
            discount: trx.discount,
            discountPercentage: 0,
            net: trx.total - trx.tax,
            vat: trx.tax,
            total: trx.total,
          },
          payment: {
            method: trx.payment_method === 'cash' ? 'Numerário' : 'Multibanco',
            amountGiven: trx.amount_paid || trx.total,
            change: trx.change_given || 0,
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
      loadById(params.id);
    }
  }, [params.id, state?.receiptData]);

  return (
    <div>
      <ReceiptDemo {...(initialData ? { initialData } : {})} />
    </div>
  );
};

export default ReceiptDemoPage;
