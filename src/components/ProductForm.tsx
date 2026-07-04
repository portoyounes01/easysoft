import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
    AlertCircle,
    Package,
    Hash,
    Building,
    MapPin,
    ToggleLeft,
    ToggleRight
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProducts } from '../contexts/ProductsContext';
import {
    ProductFormData,
    LocalProduct,
    IVA_RATES
} from '../types/supabase';
import VirtualKeyboard from './VirtualKeyboard';
import VirtualNumpad from './VirtualNumpad';
import ImageUploader from './ImageUploader';
import { supabase } from '../lib/supabase';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { DEFAULT_GENERAL_CATEGORY_ID } from '../services/productService';
import {
    formatMoneyInputValue,
    parseMoneyInput,
    sanitizeMoneyInput,
} from '../utils/moneyInput';
import { BaseDialog } from './ui/BaseDialog';
import { ActionButton } from './ui/ActionButton';
import RecipeEditor from './RecipeEditor';

interface ProductFormProps {
    isOpen: boolean;
    onClose: () => void;
    product?: LocalProduct | null; // null for create, LocalProduct for edit
    onSuccess?: () => void;
}

interface FormErrors {
    name?: string;
    price?: string;
    cost?: string;
    iva_rate?: string;
    category_id?: string;
    sku?: string;
    stock?: string;
    min_stock?: string;
    image_url?: string;
}

type ProductFormState = Omit<ProductFormData, 'track_stock'>;

const ProductForm: React.FC<ProductFormProps> = ({
    isOpen,
    onClose,
    product = null,
    onSuccess
}) => {
    const { t } = useTranslation();
    const {
        categories,
        createProduct,
        updateProduct,
        isLoading
    } = useProducts();

    const [formData, setFormData] = useState<ProductFormState>({
        name: '',
        description: '',
        sku: '',
        category_id: '',
        price: 0,
        cost: 0,
        iva_rate: 0.23, // Default to 23% (standard rate)
        stock: 0,
        min_stock: 0,
        image_url: '',
        supplier: '',
        location: '',
        is_active: true
    });

    const [errors, setErrors] = useState<FormErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showKeyboard, setShowKeyboard] = useState(false);
    const [showNumpad, setShowNumpad] = useState(false);
    const [activeField, setActiveField] = useState<string>('');
    const [priceInput, setPriceInput] = useState('');
    const [costInput, setCostInput] = useState('');
    const [pendingUploadPaths, setPendingUploadPaths] = useState<string[]>([]);
    const [pendingDeletes, setPendingDeletes] = useState<string[]>([]);
    const { employee, credentialHash } = useSupabaseAuth();
    const { settings } = useSettings();
    const currencySymbol = settings.pos.currencySymbol;

    const activeCategories = useMemo(
        () => categories.filter(cat => cat.is_active && !cat.deleted_at),
        [categories]
    );

    const defaultCategoryIdForNewProduct = useMemo(() => {
        const preferred = activeCategories.find((c) => c.id === DEFAULT_GENERAL_CATEGORY_ID);
        return preferred?.id ?? activeCategories[0]?.id ?? '';
    }, [activeCategories]);

    // Populate form when dialog opens or edited product changes
    useEffect(() => {
        if (!isOpen) {
            return;
        }
        if (product) {
            setFormData({
                name: product.name,
                description: product.description || '',
                sku: product.sku,
                category_id: product.category_id || '',
                price: product.price,
                cost: product.cost,
                iva_rate: product.iva_rate,
                stock: product.stock,
                min_stock: product.min_stock,
                image_url: product.image_url || '',
                supplier: product.supplier || '',
                location: product.location || '',
                is_active: product.is_active
            });
            setPriceInput(formatMoneyInputValue(product.price));
            setCostInput(formatMoneyInputValue(product.cost));
        } else {
            setFormData({
                name: '',
                description: '',
                sku: '',
                category_id: '',
                price: 0,
                cost: 0,
                iva_rate: 0.23,
                stock: 0,
                min_stock: 0,
                image_url: '',
                supplier: '',
                location: '',
                is_active: true
            });
            setPriceInput('');
            setCostInput('');
        }
        setErrors({});
    }, [product, isOpen]);

    // When creating a product, fill default category once it exists (e.g. after async catalog load)
    useEffect(() => {
        if (!isOpen || product) {
            return;
        }
        setFormData((prev) => {
            if (prev.category_id || !defaultCategoryIdForNewProduct) {
                return prev;
            }
            return { ...prev, category_id: defaultCategoryIdForNewProduct };
        });
    }, [isOpen, product, defaultCategoryIdForNewProduct]);

    // Validation
    const validateForm = (): boolean => {
        const newErrors: FormErrors = {};

        if (!formData.name.trim()) {
            newErrors.name = 'Product name is required';
        }

        const parsedPrice = parseMoneyInput(priceInput);
        if (parsedPrice <= 0) {
            newErrors.price = 'Price must be greater than 0';
        }

        if (!formData.category_id) {
            newErrors.category_id = 'Category is required';
        } else {
            // Check if the selected category actually exists
            const selectedCategory = activeCategories.find(cat => cat.id === formData.category_id);
            if (!selectedCategory) {
                newErrors.category_id = 'Selected category not found';
                console.warn('ProductForm: Selected category_id not found in active categories:', formData.category_id);
            }
        }

        if (formData.iva_rate < 0 || formData.iva_rate > 1) {
            newErrors.iva_rate = 'IVA rate must be between 0% and 100%';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Handle form submission
    const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
        e?.preventDefault();

        if (!validateForm()) return;

        setIsSubmitting(true);
        try {
            const productFormPayload: ProductFormData = {
                ...formData,
                price: parseMoneyInput(priceInput),
                cost: parseMoneyInput(costInput),
                track_stock: settings.pos.trackInventory
            };
            const productDataWithBarcode = {
                ...productFormPayload,
                barcode: product?.barcode || null
            };

            if (product) {
                // Update existing product
                await updateProduct(product.id, productDataWithBarcode);
                // Process pending deletes after successful update
                if (pendingDeletes.length > 0) {
                    const { data: { session } } = await supabase.auth.getSession();
                    const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-image`;
                    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
                    await Promise.all(pendingDeletes.map(async (path) => {
                        await fetch(fnUrl, {
                            method: 'DELETE',
                            headers,
                            body: JSON.stringify({
                                path,
                                employee_id: employee?.id || undefined,
                                employee_number: employee?.employee_number || undefined,
                                proof_hash: credentialHash || undefined,
                            })
                        });
                    }));
                }
            } else {
                // Create new product
                console.log('ProductForm: Creating product with category_id:', productFormPayload.category_id);
                await createProduct(productFormPayload);
                // Process pending deletes after successful create
                if (pendingDeletes.length > 0) {
                    const { data: { session } } = await supabase.auth.getSession();
                    const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-image`;
                    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
                    await Promise.all(pendingDeletes.map(async (path) => {
                        await fetch(fnUrl, {
                            method: 'DELETE',
                            headers,
                            body: JSON.stringify({
                                path,
                                employee_id: employee?.id || undefined,
                                employee_number: employee?.employee_number || undefined,
                                proof_hash: credentialHash || undefined,
                            })
                        });
                    }));
                }
            }

            onSuccess?.();
            onClose();
        } catch (error) {
            console.error('Failed to save product:', error);
            // Handle error (could show toast notification)
        } finally {
            setIsSubmitting(false);
        }
    };

    // Delete any pending uploaded images that weren't saved
    const handleCancel = async () => {
        try {
            if (pendingUploadPaths.length > 0) {
                // Call edge function to delete each path
                const { data: { session } } = await supabase.auth.getSession();
                const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-image`;
                const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

                await Promise.all(pendingUploadPaths.map(async (path) => {
                    const resp = await fetch(fnUrl, {
                        method: 'DELETE',
                        headers,
                        body: JSON.stringify({
                            path,
                            employee_id: employee?.id || undefined,
                            employee_number: employee?.employee_number || undefined,
                            proof_hash: credentialHash || undefined,
                        })
                    });
                    // Ignore errors on cleanup
                    void resp;
                }));
            }
        } catch {
            // ignore cleanup errors
        } finally {
            onClose();
        }
    };

    // Handle field changes
    const handleFieldChange = (field: keyof ProductFormState, value: ProductFormState[keyof ProductFormState]) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));

        // Clear error for this field
        if (errors[field as keyof FormErrors]) {
            setErrors(prev => ({
                ...prev,
                [field]: undefined
            }));
        }
    };

    // Handle text field clicks (for virtual keyboard)
    const handleTextFieldClick = (field: string) => {
        setActiveField(field);
        // Don't auto-show keyboard, let user use toggle button
        setShowNumpad(false);
    };

    // Handle number field clicks (for virtual numpad)
    const handleNumberFieldClick = (field: string) => {
        setActiveField(field);
        // Don't auto-show numpad, let user use toggle button
        setShowKeyboard(false);
    };

    // Handle virtual keyboard input
    const handleKeyboardInput = (value: string) => {
        handleFieldChange(activeField as keyof ProductFormState, value);
    };

    const handleMoneyInputChange = (field: 'price' | 'cost', raw: string) => {
        const sanitized = sanitizeMoneyInput(raw);
        if (field === 'price') {
            setPriceInput(sanitized);
        } else {
            setCostInput(sanitized);
        }
        handleFieldChange(field, parseMoneyInput(sanitized));
    };

    const getNumpadInitialValue = (): string => {
        if (activeField === 'price') return priceInput;
        if (activeField === 'cost') return costInput;
        const current = formData[activeField as keyof ProductFormState];
        if (current === undefined || current === null) return '';
        return String(current);
    };

    // Handle virtual numpad input
    const handleNumpadInput = (value: string) => {
        const field = activeField as keyof ProductFormState;
        if (field === 'price' || field === 'cost') {
            if (field === 'price') {
                setPriceInput(value);
            } else {
                setCostInput(value);
            }
            handleFieldChange(field, parseMoneyInput(value));
            return;
        }
        const numValue = parseFloat(value.replace(',', '.')) || 0;
        handleFieldChange(field, numValue);
    };

    // Auto-generate SKU based on category and product name
    const generateSKU = useCallback((categoryId: string, productName: string): string => {
        // Find category name
        const category = activeCategories.find(cat => cat.id === categoryId);
        const categoryAbbr = category ? category.name.substring(0, 3).toUpperCase() : 'GEN';

        // Generate product abbreviation from name
        const words = productName.trim().split(' ').filter(word => word.length > 0);
        let productAbbr = '';

        if (words.length === 0) {
            productAbbr = 'NEW';
        } else if (words.length === 1) {
            productAbbr = words[0].substring(0, 3).toUpperCase();
        } else {
            // Take first letter of each word, max 3 words
            productAbbr = words.slice(0, 3).map(word => word[0].toUpperCase()).join('');
        }

        // Generate incremental number (in real implementation, this would check existing SKUs)
        const incrementalNumber = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');

        return `${categoryAbbr}-${productAbbr}-${incrementalNumber}`;
    }, [activeCategories]);

    // Auto-update SKU when category or name changes
    useEffect(() => {
        if (formData.category_id && formData.name.trim()) {
            const newSKU = generateSKU(formData.category_id, formData.name);
            setFormData(prev => ({ ...prev, sku: newSKU }));
        }
    }, [formData.category_id, formData.name, generateSKU]);

    if (!isOpen) return null;

    return (
        <BaseDialog
            open={isOpen}
            onClose={handleCancel}
            title={product ? t('products.form.editTitle') : t('products.form.createTitle')}
            width="55vw"
            height="85vh"
            footer={
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-600">
                            {t('products.form.requiredFieldsNote')}
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setShowKeyboard(!showKeyboard)}
                                className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${showKeyboard ? 'bg-gray-300 text-gray-900' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                                title={t('forms.toggleKeyboard')}
                            >
                                {t('forms.keyboard')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowNumpad(!showNumpad)}
                                className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${showNumpad ? 'bg-gray-300 text-gray-900' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                                title={t('forms.toggleNumpad')}
                            >
                                {t('forms.numpad')}
                            </button>
                        </div>
                    </div>
                    <div className="flex space-x-4">
                        <ActionButton
                            type="button"
                            onClick={handleCancel}
                            label={t('products.form.cancel')}
                            variant="secondary"
                            className="flex-1"
                            style={{ height: '5vh', fontSize: '1.6vh' }}
                        />
                        <ActionButton
                            type="button"
                            onClick={handleSubmit}
                            disabled={isSubmitting || isLoading}
                            label={isSubmitting ? t('common.saving') : product ? t('products.form.update') : t('products.form.create')}
                            className="flex-1"
                            style={{ height: '5vh', fontSize: '1.6vh' }}
                        />
                    </div>
                </div>
            }
        >
            <div className="flex h-full flex-col">
                <div className="flex items-center gap-3 px-6 pt-5 text-gray-700">
                    <Package className="h-5 w-5 text-gray-500" />
                    <span className="text-sm font-medium">{product ? product.name : t('products.pageTitle')}</span>
                </div>

                {/* Form - Scrollable Content */}
                <div className="flex-1 overflow-y-auto">
                    <form onSubmit={handleSubmit} className="p-4 space-y-4">
                        {/* Basic Information */}
                        <div className="space-y-4">
                            {/* Product Name */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    {t('products.form.productNameLabel')}
                                </label>
                                <div className="relative">
                                    <Package className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => handleFieldChange('name', e.target.value)}
                                        onClick={() => handleTextFieldClick('name')}
                                        className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${errors.name ? 'border-red-500' : activeField === 'name' ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
                                            }`}
                                        placeholder={t('forms.productNamePlaceholder')}
                                    />
                                </div>
                                {errors.name && (
                                    <p className="mt-1 text-sm text-red-600 flex items-center">
                                        <AlertCircle className="w-4 h-4 mr-1" />
                                        {errors.name}
                                    </p>
                                )}
                            </div>

                            {/* SKU */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    {t('products.form.skuLabel')}
                                </label>
                                <div className="relative">
                                    <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <div className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-mono">
                                        {formData.sku || t('products.form.skuPending')}
                                    </div>
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                    {t('products.form.skuAutoHint')}
                                </p>
                            </div>

                            {/* Category */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    {t('products.form.categoryRequired')}
                                </label>
                                <select
                                    value={formData.category_id}
                                    onChange={(e) => handleFieldChange('category_id', e.target.value)}
                                    className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${errors.category_id ? 'border-red-500' : 'border-gray-300'
                                        }`}
                                >
                                    <option value="">{t('products.form.selectCategory')}</option>
                                    {activeCategories.map(category => (
                                        <option key={category.id} value={category.id}>
                                            {category.name}
                                        </option>
                                    ))}
                                </select>
                                {errors.category_id && (
                                    <p className="mt-1 text-sm text-red-600 flex items-center">
                                        <AlertCircle className="w-4 h-4 mr-1" />
                                        {errors.category_id}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Pricing and Tax */}
                        <div className="space-y-4">
                            <h3 className="text-md font-semibold text-gray-800 border-b pb-2">{t('products.form.pricingTax')}</h3>

                            {/* Price */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    {t('products.form.priceInclVat')}
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-500">
                                        {currencySymbol}
                                    </span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={priceInput}
                                        onChange={(e) => handleMoneyInputChange('price', e.target.value)}
                                        onClick={() => handleNumberFieldClick('price')}
                                        className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${errors.price ? 'border-red-500' : activeField === 'price' ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
                                            }`}
                                        placeholder={t('forms.decimalPlaceholder')}
                                    />
                                </div>
                                {errors.price && (
                                    <p className="mt-1 text-sm text-red-600 flex items-center">
                                        <AlertCircle className="w-4 h-4 mr-1" />
                                        {errors.price}
                                    </p>
                                )}
                            </div>

                            {/* Cost */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    {t('products.form.cost')}
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-500">
                                        {currencySymbol}
                                    </span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={costInput}
                                        onChange={(e) => handleMoneyInputChange('cost', e.target.value)}
                                        onClick={() => handleNumberFieldClick('cost')}
                                        className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${activeField === 'cost' ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
                                            }`}
                                        placeholder={t('forms.decimalPlaceholder')}
                                    />
                                </div>
                            </div>

                            {/* IVA Rate */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    {t('products.form.ivaRate')}
                                </label>
                                <select
                                    value={formData.iva_rate}
                                    onChange={(e) => handleFieldChange('iva_rate', parseFloat(e.target.value))}
                                    className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${errors.iva_rate ? 'border-red-500' : 'border-gray-300'
                                        }`}
                                >
                                    {IVA_RATES.map(rate => (
                                        <option key={rate.value} value={rate.value}>
                                            {rate.label}
                                        </option>
                                    ))}
                                </select>
                                {errors.iva_rate && (
                                    <p className="mt-1 text-sm text-red-600 flex items-center">
                                        <AlertCircle className="w-4 h-4 mr-1" />
                                        {errors.iva_rate}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Recipe / Fiche technique */}
                        <div className="space-y-4">
                            <h3 className="text-md font-semibold text-gray-800 border-b pb-2">{t('products.recipe.title')}</h3>
                            <RecipeEditor productId={product?.id ?? null} />
                        </div>

                        {/* AGENTS: Do not delete the block below (false && …) — stock/inventory form fields preserved for re-enable. Remove only if explicitly requested by a human. */}
                        {false && (
                        <div className="space-y-4">
                            <h3 className="text-md font-semibold text-gray-800 border-b pb-2">{t('products.form.inventory')}</h3>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    {t('products.form.currentStock')}
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formData.stock}
                                    onChange={(e) => handleFieldChange('stock', parseInt(e.target.value) || 0)}
                                    onClick={() => handleNumberFieldClick('stock')}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    placeholder={t('forms.intPlaceholder')}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    {t('products.form.minimumStock')}
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formData.min_stock}
                                    onChange={(e) => handleFieldChange('min_stock', parseInt(e.target.value) || 0)}
                                    onClick={() => handleNumberFieldClick('min_stock')}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    placeholder={t('forms.intPlaceholder')}
                                />
                            </div>
                        </div>
                        )}

                        {/* Additional Information */}
                        <div className="space-y-4">
                            <h3 className="text-md font-semibold text-gray-800 border-b pb-2">{t('products.form.additionalDetails')}</h3>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    {t('products.form.description')}
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => handleFieldChange('description', e.target.value)}
                                    onClick={() => handleTextFieldClick('description')}
                                    rows={3}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
                                    placeholder={t('forms.productDescriptionPlaceholder')}
                                />
                            </div>

                            {/* Image */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    {t('products.form.productImage')}
                                </label>
                                <ImageUploader
                                    value={formData.image_url}
                                    onChange={(url: string) => handleFieldChange('image_url', url)}
                                    onError={(error: string) => setErrors(prev => ({ ...prev, image_url: error }))}
                                    onUploadMeta={({ path }) => {
                                        // Track path as pending only if form is not yet saved
                                        setPendingUploadPaths(prev => [...prev, path]);
                                    }}
                                    onRequestDelete={({ path, isSupabase }) => {
                                        if (isSupabase && path) {
                                            setPendingDeletes(prev => Array.from(new Set([...prev, path!])));
                                        }
                                    }}
                                />
                                {errors.image_url && (
                                    <p className="text-red-500 text-xs mt-1">{errors.image_url}</p>
                                )}
                            </div>

                            {/* Supplier */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    {t('products.form.supplier')}
                                </label>
                                <div className="relative">
                                    <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input
                                        type="text"
                                        value={formData.supplier}
                                        onChange={(e) => handleFieldChange('supplier', e.target.value)}
                                        onClick={() => handleTextFieldClick('supplier')}
                                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                        placeholder={t('forms.supplierPlaceholder')}
                                    />
                                </div>
                            </div>

                            {/* Location */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    {t('products.form.storageLocation')}
                                </label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input
                                        type="text"
                                        value={formData.location}
                                        onChange={(e) => handleFieldChange('location', e.target.value)}
                                        onClick={() => handleTextFieldClick('location')}
                                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                        placeholder={t('forms.storagePlaceholder')}
                                    />
                                </div>
                            </div>

                            {/* Active Status */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    {t('products.form.productStatus')}
                                </label>
                                <button
                                    type="button"
                                    onClick={() => handleFieldChange('is_active', !formData.is_active)}
                                    className={`flex items-center space-x-2 px-4 py-3 min-h-touch rounded-[10px] border transition-colors w-full ${formData.is_active ? 'ds2-product-status-on' : 'ds2-product-status-off'
                                        }`}
                                >
                                    {formData.is_active ? (
                                        <ToggleRight className="w-6 h-6 shrink-0" />
                                    ) : (
                                        <ToggleLeft className="w-6 h-6 shrink-0" />
                                    )}
                                    <span>{formData.is_active ? t('common.active') : t('common.inactive')}</span>
                                </button>
                            </div>
                        </div>
                    </form>
                </div>

                {/* Virtual Keyboard */}
                {showKeyboard && (
                    <div className="border-t border-gray-200 bg-white">
                        <VirtualKeyboard
                            isOpen={showKeyboard}
                            onClose={() => setShowKeyboard(false)}
                            onConfirm={handleKeyboardInput}
                            initialValue={formData[activeField as keyof ProductFormState]?.toString() || ''}
                            title={t('forms.enterField', { field: activeField.replace('_', ' ') })}
                        />
                    </div>
                )}

                {/* Virtual Numpad */}
                {showNumpad && (
                    <div className="border-t border-gray-200 bg-white">
                        <VirtualNumpad
                            isOpen={showNumpad}
                            onClose={() => setShowNumpad(false)}
                            onConfirm={handleNumpadInput}
                            title={t('forms.enterField', { field: activeField.replace('_', ' ') })}
                            initialValue={getNumpadInitialValue()}
                            allowDecimal={activeField === 'price' || activeField === 'cost' || activeField === 'iva_rate'}
                        />
                    </div>
                )}
            </div>
        </BaseDialog>
    );
};

export default ProductForm; 