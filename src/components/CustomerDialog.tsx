import React, { useState, useEffect, useMemo, useRef } from 'react';
import { WithDialogTokens } from './ui/dialogParts';
import { useTranslation } from 'react-i18next';
import { Search, Plus, Users, Check, AlertCircle, CreditCard as TaxIcon } from 'lucide-react';
import { BaseDialog } from './ui/BaseDialog';
import { ActionButton } from './ui/ActionButton';
import { TabToggle } from './ui/TabToggle';
import { InputField } from './ui/InputField';
import VirtualKeyboard from './VirtualKeyboard';
import SimpleNumpad from './SimpleNumpad';
import { LocalCustomer } from '../types/supabase';
import { useSettings } from '../contexts/SettingsContext';
import { getCountryProfile } from '../lib/countryProfile';

interface CustomerDialogProps {
    open: boolean;
    onClose: () => void;
    onSelect: (customer: LocalCustomer) => void;
    customers: LocalCustomer[];
    onRegisterCustomer: (
        customerData: Omit<
            LocalCustomer,
            'id' | 'created_at' | 'updated_at' | 'needs_push' | 'is_conflicted' | 'last_synced_at'
        >
    ) => Promise<void>;
}

type ViewMode = 'list' | 'add';

interface NewCustomerForm {
    name: string;
    taxId: string;
    address: string;
    city: string;
    postalCode: string;
    country: string;
}

const initialFormState: NewCustomerForm = {
    name: '',
    taxId: '',
    address: '',
    city: '',
    postalCode: '',
    country: 'PT'
};

function normalizeTaxIdInput(raw: string): string {
    return raw.replace(/[^A-Za-z0-9]/g, '').slice(0, 9).toUpperCase();
}

function normalizeStoredTaxNumber(tax: string | null | undefined): string {
    return (tax ?? '').replace(/\s/g, '').toUpperCase();
}

/** Country-aware ISO2 from a free-text country field. */
function deriveCountryIso(raw: string): string {
    const v = (raw || '').trim();
    if (v.length === 0 || v.toLowerCase() === 'portugal') return 'PT';
    if (v.toLowerCase() === 'españa' || v.toLowerCase() === 'espana' || v.toLowerCase() === 'spain') return 'ES';
    return v.slice(0, 2).toUpperCase();
}

/** Postal-code input mask by country: PT = NNNN-NNN, ES = NNNNN (5 digits, no dash). */
function formatPostalInput(raw: string, countryIso: string): string {
    const digits = raw.replace(/\D/g, '');
    if (countryIso === 'ES') return digits.slice(0, 5);
    const d = digits.slice(0, 7);
    if (d.length <= 4) return d;
    return `${d.slice(0, 4)}-${d.slice(4)}`;
}

export const CustomerDialog: React.FC<CustomerDialogProps> = ({
    open,
    onClose,
    onSelect,
    customers,
    onRegisterCustomer
}) => {
    const { t } = useTranslation();
    const { settings } = useSettings();
    const opCountry = settings.operatingCountry;
    const countryProfile = getCountryProfile(opCountry);
    const [view, setView] = useState<ViewMode>('list');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<LocalCustomer | null>(null);
    const [newCustomerForm, setNewCustomerForm] = useState<NewCustomerForm>(initialFormState);
    const [formError, setFormError] = useState<string | null>(null);

    // Virtual Keyboard State
    const [activeField, setActiveField] = useState<string>('');
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [keyboardConfig, setKeyboardConfig] = useState<{
        isOpen: boolean;
        title: string;
        field: string;
        onConfirm: (value: string) => void;
        maxLength: number;
        allowNumbers: boolean;
        allowLetters: boolean;
    }>({
        isOpen: false,
        title: '',
        field: '',
        onConfirm: () => {
            /* initial noop; overridden by handleTextFieldClick */
        },
        maxLength: 50,
        allowNumbers: true,
        allowLetters: true
    });

    // Reset state when dialog opens/closes
    useEffect(() => {
        if (open) {
            setView('list');
            setSearchTerm('');
            setNewCustomerForm({ ...initialFormState, country: opCountry });
            setFormError(null);
            setActiveField(''); // Reset active field to hide keyboard
        }
    }, [open]);

    // Reset active field when switching views
    const handleViewChange = (newView: ViewMode) => {
        setActiveField(''); // Hide keyboard when switching views
        setView(newView);
    };

    // Filter customers
    const filteredCustomers = useMemo(() => {
        if (!searchTerm) return customers;
        const searchLower = searchTerm.toLowerCase();
        return customers.filter(c =>
            c.name.toLowerCase().includes(searchLower) ||
            (c.tax_number && c.tax_number.toLowerCase().includes(searchLower)) ||
            c.email?.toLowerCase().includes(searchLower) ||
            c.phone?.toLowerCase().includes(searchLower)
        );
    }, [customers, searchTerm]);

    // NIF Validation Helpers
    const getNifValidationState = (nif: string) => {
        if (!nif.trim()) return 'default';
        if (nif.length === 9 && /^[A-Z0-9]{9}$/.test(nif)) return 'valid';
        return 'invalid';
    };

    const handleFormChange = (field: string, value: string) => {
        setFormError(null);
        const next =
            field === 'postalCode' ? formatPostalInput(value, deriveCountryIso(newCustomerForm.country)) : value;
        setNewCustomerForm(prev => ({ ...prev, [field]: next }));
    };

    const handleTextFieldClick = (field: string, allowNumbers = true, allowLetters = true, maxLength = 50) => {
        setActiveField(field);
        setKeyboardConfig({
            isOpen: true,
            title: '',
            field,
            onConfirm: (value: string) => {
                let finalValue = value;
                if (field === 'taxId') {
                    finalValue = value.replace(/[^A-Za-z0-9]/g, '').slice(0, 9).toUpperCase();
                } else if (field === 'postalCode') {
                    finalValue = formatPostalInput(value, deriveCountryIso(newCustomerForm.country));
                }
                handleFormChange(field, finalValue);
            },
            maxLength,
            allowNumbers,
            allowLetters
        });
    };

    const handleSubmit = async () => {
        setFormError(null);
        if (!newCustomerForm.taxId.trim()) {
            return;
        }

        const nifRegex = /^[A-Z0-9]{9}$/;
        const taxNormalized = newCustomerForm.taxId.trim().toUpperCase();
        if (!nifRegex.test(taxNormalized)) {
            return;
        }

        const duplicate = customers.some(
            (c) =>
                c.deleted_at == null &&
                normalizeStoredTaxNumber(c.tax_number) === taxNormalized
        );
        if (duplicate) {
            setFormError(t('pos.customerForm.duplicateTaxNumber'));
            return;
        }

        const addr = newCustomerForm.address.trim();
        const city = newCustomerForm.city.trim();
        const postal = newCustomerForm.postalCode.trim();
        const countryIso = deriveCountryIso(newCustomerForm.country);

        if (countryIso === 'PT' && postal.length > 0 && !/^\d{4}-\d{3}$/.test(postal)) {
            setFormError(t('pos.customerForm.invalidPostalPt'));
            return;
        }
        if (countryIso === 'ES' && postal.length > 0 && !/^\d{5}$/.test(postal)) {
            setFormError(t('pos.customerForm.invalidPostalEs', { defaultValue: 'Código postal no válido (5 dígitos).' }));
            return;
        }

        const customerData: Omit<
            LocalCustomer,
            'id' | 'created_at' | 'updated_at' | 'needs_push' | 'is_conflicted' | 'last_synced_at'
        > = {
            name: newCustomerForm.name.trim() || `Cliente ${taxNormalized}`,
            tax_number: taxNormalized,
            country: countryIso,
            email: null,
            phone: null,
            address: addr.length > 0 ? addr : null,
            city: city.length > 0 ? city : null,
            postal_code: postal.length > 0 ? postal : null,
            total_spent: 0,
            transaction_count: 0,
            loyalty_points: 0,
            is_active: true,
            preferred_payment_method: null,
            deleted_at: null,
        };

        try {
            await onRegisterCustomer(customerData);
            handleViewChange('list');
        } catch (err) {
            const message = err instanceof Error ? err.message : '';
            if (message === 'DUPLICATE_TAX_NUMBER') {
                setFormError(t('pos.customerForm.duplicateTaxNumber'));
            }
        }
    };

    const newCustomerFormValid = getNifValidationState(newCustomerForm.taxId) === 'valid';

    return (
        <BaseDialog
            open={open}
            onClose={onClose}
            title={t('pos.selectCustomerTitle')}
            icon={Users}
            width="55vw"
            height="80vh"
            footer={
                view === 'list' ? (
                    <div className="flex space-x-4">
                        <ActionButton
                            onClick={onClose}
                            label={t('common.cancel') || 'Cancel'}
                            variant="secondary"
                            className="flex-1"
                            style={{ height: '5vh', fontSize: '1.6vh' }}
                        />
                        <ActionButton
                            onClick={() => {
                                if (selectedCustomer) {
                                    onSelect(selectedCustomer);
                                }
                            }}
                            label={t('common.select') || 'Select'}
                            disabled={!selectedCustomer}
                            className={`flex-1 ${!selectedCustomer ? 'bg-gray-300 cursor-not-allowed' : ''}`}
                            style={{ height: '5vh', fontSize: '1.6vh' }}
                        />
                    </div>
                ) : view === 'add' ? (
                    <div className="flex space-x-4">
                        <ActionButton
                            onClick={() => handleViewChange('list')}
                            label={t('common.cancel') || 'Cancel'}
                            variant="secondary"
                            className="flex-1"
                            style={{ height: '5vh', fontSize: '1.6vh' }}
                        />
                        <ActionButton
                            onClick={handleSubmit}
                            label={t('pos.customerForm.save')}
                            className="flex-1"
                            disabled={!newCustomerFormValid}
                            style={{ height: '5vh', fontSize: '1.6vh' }}
                        />
                    </div>
                ) : undefined
            }
        >
            <WithDialogTokens>{tk => (
            <div className="flex flex-col h-full">
                {/* View Toggle */}
                <div className="px-6 pt-6 pb-4">
                    <TabToggle
                        value={view}
                        onChange={(val) => handleViewChange(val as ViewMode)}
                        options={[
                            { value: 'list', label: t('pos.existingCustomer'), icon: Users },
                            { value: 'add', label: t('pos.newCustomer'), icon: Plus }
                        ]}
                    />
                </div>

                {view === 'list' ? (
                    <div className="flex-1 flex space-x-6 px-6 pb-6 overflow-hidden">
                        {/* Left: Search + Numpad - Always visible */}
                        <div className="flex-1 flex flex-col min-w-0">
                            {/* Search Bar */}
                            <div className="mb-4 pt-1">
                                <InputField
                                    ref={searchInputRef}
                                    icon={Search}
                                    placeholder={t('pos.searchByNif')}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="rounded-2xl"
                                />
                            </div>

                            {/* Numpad */}
                            <div className="flex-1 min-h-0 py-1">
                                <SimpleNumpad
                                    value={searchTerm}
                                    onChange={setSearchTerm}
                                    onButtonClick={() => searchInputRef.current?.focus()}
                                    className="h-full"
                                />
                            </div>
                        </div>

                        {/* Right: Customer List or Empty State - Always visible */}
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {searchTerm.trim().length > 0 && filteredCustomers.length > 0 ? (
                                <div className="flex-1 overflow-y-auto">
                                    <ul className="space-y-2">
                                        {filteredCustomers.map((customer, index) => (
                                            <li
                                                key={customer.id}
                                                onClick={() => setSelectedCustomer(customer)}
                                                className={`cursor-pointer rounded-[10px] border transition-all ${selectedCustomer?.id === customer.id ? 'bg-green-50 border-green-500' : 'bg-white border-gray-200 hover:bg-gray-50'
                                                    }`}
                                                style={{ paddingTop: index === 0 ? '2vh' : '1.5vh', paddingBottom: '1vh' }}
                                            >
                                                <div className="flex items-center justify-between px-2">
                                                    <p className={`font-semibold ${tk.p.titleText} truncate`} style={{ fontSize: '1.7vh', paddingRight: '1vh' }}>
                                                        {customer.tax_number || 'N/A'}
                                                    </p>
                                                    <p className={`font-semibold ${tk.p.titleText}`} style={{ fontSize: '1.5vh' }}>
                                                        €{(customer.total_spent || 0).toFixed(2)}
                                                    </p>
                                                </div>
                                                <div className={`flex items-center space-x-3 ${tk.p.subText} px-2`} style={{ marginTop: index === 0 ? '0.2vh' : '0.8vh', paddingLeft: '1vh' }}>
                                                    <span className="font-medium truncate" style={{ fontSize: '1.3vh' }}>{customer.name}</span>
                                                    <span style={{ fontSize: '1.3vh' }}>•</span>
                                                    <span style={{ fontSize: '1.3vh' }}>{customer.transaction_count || 0} orders</span>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
                                    <Users className="w-16 h-16 text-gray-300 mb-4" />
                                    <p className={`text-xl font-semibold ${tk.p.titleText} mb-2`}>
                                        {searchTerm.trim().length === 0
                                            ? t('pos.startSearchTitle')
                                            : t('pos.noCustomersFoundTitle')}
                                    </p>
                                    <p className={`${tk.p.subText} mb-6`}>
                                        {searchTerm.trim().length === 0
                                            ? t('pos.startSearchMessage')
                                            : t('pos.noCustomersFoundMessage')}
                                    </p>
                                    {searchTerm.trim().length > 0 && (
                                        <ActionButton
                                            onClick={() => {
                                                const fromSearch = normalizeTaxIdInput(searchTerm);
                                                setNewCustomerForm({ ...initialFormState, taxId: fromSearch });
                                                setFormError(null);
                                                handleViewChange('add');
                                            }}
                                            label={t('pos.addNewCustomer')}
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col overflow-hidden px-6 pb-6">
                        {/* Form */}
                        <div className="space-y-4">
                            {formError && (
                                <div
                                    className="flex items-center gap-2 rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-red-800"
                                    style={{ fontSize: '1.5vh' }}
                                    role="alert"
                                >
                                    <AlertCircle className="shrink-0" style={{ width: '2vh', height: '2vh' }} />
                                    <span>{formError}</span>
                                </div>
                            )}
                            {/* Personal Info */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <InputField
                                    label="Name"
                                    value={newCustomerForm.name}
                                    onChange={(e) => handleFormChange('name', e.target.value)}
                                    onClick={() => handleTextFieldClick('name', true, true, 50)}
                                    className={activeField === 'name' ? 'bg-blue-50 border-blue-500' : ''}
                                    placeholder={t('forms.customerNamePlaceholder')}
                                />
                                <div className="relative">
                                    <InputField
                                        label={`${countryProfile.taxId.label} *`}
                                        icon={TaxIcon}
                                        value={newCustomerForm.taxId}
                                        onChange={(e) => handleFormChange('taxId', e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 9).toUpperCase())}
                                        onClick={() => handleTextFieldClick('taxId', true, true, 9)}
                                        className={activeField === 'taxId' ? 'bg-blue-50' : ''}
                                        placeholder={countryProfile.taxId.placeholder}
                                        error={newCustomerForm.taxId && getNifValidationState(newCustomerForm.taxId) !== 'valid' ? t('customers.form.errors.taxInvalid', { defaultValue: `Invalid ${countryProfile.taxId.label}` }) : undefined}
                                        rightIcon={newCustomerForm.taxId && getNifValidationState(newCustomerForm.taxId) === 'valid' ? Check : undefined}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <InputField
                                        label={t('pos.customerForm.address')}
                                        value={newCustomerForm.address}
                                        onChange={(e) => handleFormChange('address', e.target.value)}
                                        onClick={() => handleTextFieldClick('address', true, true, 120)}
                                        className={activeField === 'address' ? 'bg-blue-50 border-blue-500' : ''}
                                        placeholder={t('pos.customerForm.addressPlaceholder')}
                                    />
                                </div>
                                <InputField
                                    label={t('pos.customerForm.city')}
                                    value={newCustomerForm.city}
                                    onChange={(e) => handleFormChange('city', e.target.value)}
                                    onClick={() => handleTextFieldClick('city', true, true, 80)}
                                    className={activeField === 'city' ? 'bg-blue-50 border-blue-500' : ''}
                                    placeholder={t('pos.customerForm.cityPlaceholder')}
                                />
                                <InputField
                                    label={t('pos.customerForm.postalCode')}
                                    value={newCustomerForm.postalCode}
                                    onChange={(e) => handleFormChange('postalCode', e.target.value)}
                                    onClick={() => handleTextFieldClick('postalCode', true, false, 8)}
                                    className={activeField === 'postalCode' ? 'bg-blue-50 border-blue-500' : ''}
                                    placeholder={t('pos.customerForm.postalPlaceholder')}
                                />
                                <div className="md:col-span-2">
                                    <InputField
                                        label={t('pos.customerForm.country')}
                                        value={newCustomerForm.country}
                                        onChange={(e) => handleFormChange('country', e.target.value)}
                                        onClick={() => handleTextFieldClick('country', true, true, 30)}
                                        className={activeField === 'country' ? 'bg-blue-50 border-blue-500' : ''}
                                        placeholder={t('forms.countryCodePlaceholder')}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Keyboard - Below the form, only visible when activeField is set */}
                        {activeField && (
                            <div className="flex-1 mt-4 min-h-0">
                                <VirtualKeyboard
                                    isOpen={true}
                                    onClose={() => setActiveField('')}
                                    onConfirm={keyboardConfig.onConfirm}
                                    title=""
                                    initialValue={activeField && newCustomerForm[activeField as keyof NewCustomerForm] ? newCustomerForm[activeField as keyof NewCustomerForm] : ''}
                                    maxLength={keyboardConfig.maxLength}
                                    allowNumbers={keyboardConfig.allowNumbers}
                                    allowLetters={keyboardConfig.allowLetters}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>
            )}</WithDialogTokens>
        </BaseDialog>
    );
};

