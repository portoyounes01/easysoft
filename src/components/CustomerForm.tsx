import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Contact } from 'lucide-react';
import { BaseDialog } from './ui/BaseDialog';
import { ActionButton } from './ui/ActionButton';
import { LocalCustomer } from '../types/supabase';
import { customerLocalService } from '../lib/localDatabase';

interface CustomerFormProps {
  isOpen: boolean;
  onClose: () => void;
  customer?: LocalCustomer | null;
  onSuccess?: () => void;
}

interface CustomerFormFields {
  name: string;
  tax_number: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  is_active: boolean;
}

const emptyFields: CustomerFormFields = {
  name: '',
  tax_number: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  postal_code: '',
  country: 'PT',
  is_active: true,
};

function normalizeStoredTaxNumber(tax: string | null | undefined): string {
  return (tax ?? '').replace(/\s/g, '').toUpperCase();
}

function formatPtPostalInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 7);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

function getNifValidationState(nif: string): 'default' | 'valid' | 'invalid' {
  const trimmed = nif.trim();
  if (!trimmed) return 'default';
  if (trimmed.length === 9 && /^[A-Z0-9]{9}$/.test(trimmed)) return 'valid';
  return 'invalid';
}

function trimOrNull(value: string): string | null {
  const t = value.trim();
  return t.length > 0 ? t : null;
}

const CustomerForm: React.FC<CustomerFormProps> = ({
  isOpen,
  onClose,
  customer = null,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [fields, setFields] = useState<CustomerFormFields>(emptyFields);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (customer) {
      setFields({
        name: customer.name,
        tax_number: normalizeStoredTaxNumber(customer.tax_number),
        email: customer.email ?? '',
        phone: customer.phone ?? '',
        address: customer.address ?? '',
        city: customer.city ?? '',
        postal_code: customer.postal_code ?? '',
        country: customer.country ?? 'PT',
        is_active: customer.is_active,
      });
    } else {
      setFields(emptyFields);
    }
    setFormError(null);
  }, [isOpen, customer]);

  const handleCancel = useCallback(() => {
    setFormError(null);
    onClose();
  }, [onClose]);

  const handleField =
    (key: keyof CustomerFormFields) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setFormError(null);
      if (key === 'tax_number') {
        setFields((prev) => ({
          ...prev,
          tax_number: value.replace(/[^A-Za-z0-9]/g, '').slice(0, 9).toUpperCase(),
        }));
        return;
      }
      if (key === 'postal_code') {
        setFields((prev) => ({ ...prev, postal_code: formatPtPostalInput(value) }));
        return;
      }
      if (key === 'is_active') {
        setFields((prev) => ({ ...prev, is_active: e.target.checked }));
        return;
      }
      setFields((prev) => ({ ...prev, [key]: value }));
    };

  const handleSubmit = async () => {
    setFormError(null);
    const taxNormalized = fields.tax_number.trim().toUpperCase();
    if (!taxNormalized || getNifValidationState(taxNormalized) !== 'valid') {
      setFormError(t('customers.form.errors.taxInvalid'));
      return;
    }

    const addr = fields.address.trim();
    const city = fields.city.trim();
    const postal = fields.postal_code.trim();
    const rawCountry = fields.country.trim();
    const countryIso =
      rawCountry.length === 0 || rawCountry.toLowerCase() === 'portugal'
        ? 'PT'
        : rawCountry.slice(0, 2).toUpperCase();

    if (countryIso === 'PT' && postal.length > 0 && !/^\d{4}-\d{3}$/.test(postal)) {
      setFormError(t('pos.customerForm.invalidPostalPt'));
      return;
    }

    const all = await customerLocalService.getAllCustomers();
    const dup = all.some(
      (c) =>
        c.id !== customer?.id && normalizeStoredTaxNumber(c.tax_number) === taxNormalized
    );
    if (dup) {
      setFormError(t('pos.customerForm.duplicateTaxNumber'));
      return;
    }

    setIsSubmitting(true);
    try {
      if (customer) {
        await customerLocalService.updateCustomer(customer.id, {
          name: fields.name.trim() || `Cliente ${taxNormalized}`,
          tax_number: taxNormalized,
          country: countryIso,
          email: trimOrNull(fields.email),
          phone: trimOrNull(fields.phone),
          address: trimOrNull(addr),
          city: trimOrNull(city),
          postal_code: trimOrNull(postal),
          is_active: fields.is_active,
        });
      } else {
        await customerLocalService.createCustomer({
          name: fields.name.trim() || `Cliente ${taxNormalized}`,
          tax_number: taxNormalized,
          country: countryIso,
          email: trimOrNull(fields.email),
          phone: trimOrNull(fields.phone),
          address: trimOrNull(addr),
          city: trimOrNull(city),
          postal_code: trimOrNull(postal),
          total_spent: 0,
          transaction_count: 0,
          loyalty_points: 0,
          is_active: fields.is_active,
          preferred_payment_method: null,
          deleted_at: null,
        });
      }
      onSuccess?.();
      handleCancel();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'DUPLICATE_TAX_NUMBER') {
        setFormError(t('pos.customerForm.duplicateTaxNumber'));
      } else {
        setFormError(t('customers.form.errors.saveFailed'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <BaseDialog
      open={isOpen}
      onClose={handleCancel}
      title={customer ? t('customers.form.editTitle') : t('customers.form.createTitle')}
      width="min(640px, 92vw)"
      height="min(720px, 90vh)"
      footer={
        <div className="flex flex-col gap-3">
          <p className="text-xs text-gray-600">{t('customers.form.requiredNote')}</p>
          <div className="flex gap-4">
            <ActionButton
              type="button"
              onClick={handleCancel}
              label={t('customers.form.cancel')}
              variant="secondary"
              className="flex-1 min-h-touch-sm"
            />
            <ActionButton
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting}
              label={
                isSubmitting
                  ? t('common.saving')
                  : customer
                    ? t('customers.form.update')
                    : t('customers.form.create')
              }
              className="flex-1 min-h-touch-sm"
            />
          </div>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-4 text-gray-700">
          <Contact className="h-5 w-5 text-gray-500" />
          <span className="text-sm font-medium">
            {customer ? customer.name : t('customers.pageTitle')}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 p-4">
          {formError && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <span className="text-sm font-medium">{formError}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="cust-name">
                {t('customers.form.nameLabel')}
              </label>
              <input
                id="cust-name"
                type="text"
                value={fields.name}
                onChange={handleField('name')}
                className="ds2-control-radius-lg box-border min-h-touch-sm w-full border border-gray-300 px-4 py-3 text-base text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="cust-tax">
                {t('customers.form.taxLabel')}
              </label>
              <input
                id="cust-tax"
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                value={fields.tax_number}
                onChange={handleField('tax_number')}
                className={`ds2-control-radius-lg box-border min-h-touch-sm w-full border px-4 py-3 font-mono text-base focus:outline-none focus:ring-2 ${
                  fields.tax_number && getNifValidationState(fields.tax_number) !== 'valid'
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:border-green-500 focus:ring-green-500'
                }`}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="cust-email">
                  {t('customers.form.emailLabel')}
                </label>
                <input
                  id="cust-email"
                  type="email"
                  value={fields.email}
                  onChange={handleField('email')}
                  className="ds2-control-radius-lg box-border min-h-touch-sm w-full border border-gray-300 px-4 py-3 text-base focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="cust-phone">
                  {t('customers.form.phoneLabel')}
                </label>
                <input
                  id="cust-phone"
                  type="tel"
                  value={fields.phone}
                  onChange={handleField('phone')}
                  className="ds2-control-radius-lg box-border min-h-touch-sm w-full border border-gray-300 px-4 py-3 text-base focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="cust-address">
                {t('customers.form.addressLabel')}
              </label>
              <input
                id="cust-address"
                type="text"
                value={fields.address}
                onChange={handleField('address')}
                className="ds2-control-radius-lg box-border min-h-touch-sm w-full border border-gray-300 px-4 py-3 text-base focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="cust-city">
                  {t('customers.form.cityLabel')}
                </label>
                <input
                  id="cust-city"
                  type="text"
                  value={fields.city}
                  onChange={handleField('city')}
                  className="ds2-control-radius-lg box-border min-h-touch-sm w-full border border-gray-300 px-4 py-3 text-base focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="cust-postal">
                  {t('customers.form.postalLabel')}
                </label>
                <input
                  id="cust-postal"
                  type="text"
                  value={fields.postal_code}
                  onChange={handleField('postal_code')}
                  className="ds2-control-radius-lg box-border min-h-touch-sm w-full border border-gray-300 px-4 py-3 font-mono text-base focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="cust-country">
                  {t('customers.form.countryLabel')}
                </label>
                <input
                  id="cust-country"
                  type="text"
                  value={fields.country}
                  onChange={handleField('country')}
                  className="ds2-control-radius-lg box-border min-h-touch-sm w-full border border-gray-300 px-4 py-3 text-base focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            <label className="flex min-h-touch-sm cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
              <input
                type="checkbox"
                checked={fields.is_active}
                onChange={handleField('is_active')}
                className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span className="text-sm font-medium text-gray-800">{t('customers.form.activeLabel')}</span>
            </label>
          </div>
        </div>
      </div>
    </BaseDialog>
  );
};

export default CustomerForm;
