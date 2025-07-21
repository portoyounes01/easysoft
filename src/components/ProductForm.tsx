import React, { useState, useEffect } from 'react';
import {
    X,
    Save,
    AlertCircle,
    Package,
    DollarSign,
    Hash,
    Tag,
    Image,
    Building,
    MapPin,
    ToggleLeft,
    ToggleRight,
    Loader2
} from 'lucide-react';
import { useProducts } from '../contexts/ProductsContext';
import {
    ProductFormData,
    LocalProduct,
    IVA_RATES,
    IVARate
} from '../types/supabase';
import VirtualKeyboard from './VirtualKeyboard';
import VirtualNumpad from './VirtualNumpad';

interface ProductFormProps {
    isOpen: boolean;
    onClose: () => void;
    product?: LocalProduct | null; // null for create, LocalProduct for edit
    onSuccess?: () => void;
}

interface FormErrors {
    name?: string;
    price?: string;
    iva_rate?: string;
    category_id?: string;
}

const ProductForm: React.FC<ProductFormProps> = ({
    isOpen,
    onClose,
    product = null,
    onSuccess
}) => {
    const {
        categories,
        createProduct,
        updateProduct,
        isLoading
    } = useProducts();

    const [formData, setFormData] = useState<ProductFormData>({
        name: '',
        description: '',
        sku: '',
        category_id: '',
        price: 0,
        cost: 0,
        iva_rate: 0.23, // Default to 23% (standard rate)
        stock: 0,
        min_stock: 0,
        track_stock: true,
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

    // Populate form when editing
    useEffect(() => {
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
                track_stock: product.track_stock,
                image_url: product.image_url || '',
                supplier: product.supplier || '',
                location: product.location || '',
                is_active: product.is_active
            });
        } else {
            // Reset form for new product
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
                track_stock: true,
                image_url: '',
                supplier: '',
                location: '',
                is_active: true
            });
        }
        setErrors({});
    }, [product, isOpen]);

    // Validation
    const validateForm = (): boolean => {
        const newErrors: FormErrors = {};

        if (!formData.name.trim()) {
            newErrors.name = 'Product name is required';
        }

        if (formData.price <= 0) {
            newErrors.price = 'Price must be greater than 0';
        }

        if (!formData.category_id) {
            newErrors.category_id = 'Category is required';
        }

        if (formData.iva_rate < 0 || formData.iva_rate > 1) {
            newErrors.iva_rate = 'IVA rate must be between 0% and 100%';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Handle form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) return;

        setIsSubmitting(true);
        try {
            // Add barcode field for service layer compatibility
            const productDataWithBarcode = {
                ...formData,
                barcode: product?.barcode || null // Preserve existing barcode when editing, null for new products
            };

            if (product) {
                // Update existing product
                await updateProduct(product.id, productDataWithBarcode);
            } else {
                // Create new product
                await createProduct(productDataWithBarcode);
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

    // Handle field changes
    const handleFieldChange = (field: keyof ProductFormData, value: any) => {
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
        handleFieldChange(activeField as keyof ProductFormData, value);
    };

    // Handle virtual numpad input
    const handleNumpadInput = (value: string) => {
        const numValue = parseFloat(value) || 0;
        handleFieldChange(activeField as keyof ProductFormData, numValue);
    };

    // Get active categories for dropdown
    const activeCategories = categories.filter(cat => cat.is_active && !cat.deleted_at);

    // Auto-generate SKU based on category and product name
    const generateSKU = (categoryId: string, productName: string): string => {
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
    };

    // Auto-update SKU when category or name changes
    useEffect(() => {
        if (formData.category_id && formData.name.trim()) {
            const newSKU = generateSKU(formData.category_id, formData.name);
            setFormData(prev => ({ ...prev, sku: newSKU }));
        }
    }, [formData.category_id, formData.name]);

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop - only covers part of screen */}
            <div className="fixed inset-0 bg-black bg-opacity-30 z-40" onClick={onClose} />

            {/* Side Panel */}
            <div className="fixed top-0 right-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col">
                {/* Header with Toggle */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white p-4 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center space-x-3">
                        <Package className="w-6 h-6" />
                        <h2 className="text-lg font-bold">
                            {product ? 'Edit Product' : 'Create New Product'}
                        </h2>
                    </div>
                    <div className="flex items-center space-x-2">
                        {/* Keyboard Toggle Button */}
                        <button
                            onClick={() => setShowKeyboard(!showKeyboard)}
                            className={`p-2 rounded-lg transition-colors ${showKeyboard ? 'bg-white bg-opacity-20' : 'hover:bg-white hover:bg-opacity-20'
                                }`}
                            title="Toggle virtual keyboard"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm5.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L10.586 10 8.293 7.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                        {/* Numpad Toggle Button */}
                        <button
                            onClick={() => setShowNumpad(!showNumpad)}
                            className={`p-2 rounded-lg transition-colors ${showNumpad ? 'bg-white bg-opacity-20' : 'hover:bg-white hover:bg-opacity-20'
                                }`}
                            title="Toggle virtual numpad"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M3 3a1 1 0 000 2h11a1 1 0 100-2H3zM3 7a1 1 0 000 2h7a1 1 0 100-2H3zM3 11a1 1 0 100 2h4a1 1 0 100-2H3zM13 16a1 1 0 102 0v-5.586l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 101.414 1.414L13 10.414V16z" clipRule="evenodd" />
                            </svg>
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
                            title="Close panel"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Form - Scrollable Content */}
                <div className="flex-1 overflow-y-auto">
                    <form onSubmit={handleSubmit} className="p-4 space-y-4">
                        {/* Basic Information */}
                        <div className="space-y-4">
                            {/* Product Name */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Product Name *
                                </label>
                                <div className="relative">
                                    <Package className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => handleFieldChange('name', e.target.value)}
                                        onClick={() => handleTextFieldClick('name')}
                                        className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.name ? 'border-red-500' : activeField === 'name' ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
                                            }`}
                                        placeholder="Enter product name"
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
                                    SKU (Auto-Generated)
                                </label>
                                <div className="relative">
                                    <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <div className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-mono">
                                        {formData.sku || 'Will be generated when you enter name and category'}
                                    </div>
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                    Automatically generated from category and product name
                                </p>
                            </div>

                            {/* Category */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Category *
                                </label>
                                <select
                                    value={formData.category_id}
                                    onChange={(e) => handleFieldChange('category_id', e.target.value)}
                                    className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.category_id ? 'border-red-500' : 'border-gray-300'
                                        }`}
                                >
                                    <option value="">Select a category</option>
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
                            <h3 className="text-md font-semibold text-gray-800 border-b pb-2">Pricing & Tax</h3>

                            {/* Price */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Price (€) *
                                </label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={formData.price}
                                        onChange={(e) => handleFieldChange('price', parseFloat(e.target.value) || 0)}
                                        onClick={() => handleNumberFieldClick('price')}
                                        className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.price ? 'border-red-500' : activeField === 'price' ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
                                            }`}
                                        placeholder="0.00"
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
                                    Cost (€)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={formData.cost}
                                    onChange={(e) => handleFieldChange('cost', parseFloat(e.target.value) || 0)}
                                    onClick={() => handleNumberFieldClick('cost')}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="0.00"
                                />
                            </div>

                            {/* IVA Rate */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    IVA Rate *
                                </label>
                                <select
                                    value={formData.iva_rate}
                                    onChange={(e) => handleFieldChange('iva_rate', parseFloat(e.target.value))}
                                    className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.iva_rate ? 'border-red-500' : 'border-gray-300'
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

                        {/* Inventory */}
                        <div className="space-y-4">
                            <h3 className="text-md font-semibold text-gray-800 border-b pb-2">Inventory</h3>

                            {/* Stock */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Current Stock
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formData.stock}
                                    onChange={(e) => handleFieldChange('stock', parseInt(e.target.value) || 0)}
                                    onClick={() => handleNumberFieldClick('stock')}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="0"
                                />
                            </div>

                            {/* Min Stock */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Minimum Stock
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formData.min_stock}
                                    onChange={(e) => handleFieldChange('min_stock', parseInt(e.target.value) || 0)}
                                    onClick={() => handleNumberFieldClick('min_stock')}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="0"
                                />
                            </div>

                            {/* Track Stock Toggle */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Track Inventory
                                </label>
                                <button
                                    type="button"
                                    onClick={() => handleFieldChange('track_stock', !formData.track_stock)}
                                    className={`flex items-center space-x-2 px-4 py-3 rounded-lg border transition-colors w-full ${formData.track_stock
                                        ? 'bg-green-50 border-green-200 text-green-700'
                                        : 'bg-gray-50 border-gray-300 text-gray-600'
                                        }`}
                                >
                                    {formData.track_stock ? (
                                        <ToggleRight className="w-6 h-6 text-green-600" />
                                    ) : (
                                        <ToggleLeft className="w-6 h-6 text-gray-400" />
                                    )}
                                    <span>{formData.track_stock ? 'Enabled' : 'Disabled'}</span>
                                </button>
                            </div>
                        </div>

                        {/* Additional Information */}
                        <div className="space-y-4">
                            <h3 className="text-md font-semibold text-gray-800 border-b pb-2">Additional Details</h3>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Description
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => handleFieldChange('description', e.target.value)}
                                    onClick={() => handleTextFieldClick('description')}
                                    rows={3}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                    placeholder="Enter product description"
                                />
                            </div>

                            {/* Image URL */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Image URL
                                </label>
                                <div className="relative">
                                    <Image className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
                                    <textarea
                                        value={formData.image_url}
                                        onChange={(e) => handleFieldChange('image_url', e.target.value)}
                                        onClick={() => handleTextFieldClick('image_url')}
                                        rows={3}
                                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                        placeholder="Enter image URL"
                                    />
                                </div>
                            </div>

                            {/* Supplier */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Supplier
                                </label>
                                <div className="relative">
                                    <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input
                                        type="text"
                                        value={formData.supplier}
                                        onChange={(e) => handleFieldChange('supplier', e.target.value)}
                                        onClick={() => handleTextFieldClick('supplier')}
                                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Enter supplier name"
                                    />
                                </div>
                            </div>

                            {/* Location */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Storage Location
                                </label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input
                                        type="text"
                                        value={formData.location}
                                        onChange={(e) => handleFieldChange('location', e.target.value)}
                                        onClick={() => handleTextFieldClick('location')}
                                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Enter storage location"
                                    />
                                </div>
                            </div>

                            {/* Active Status */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Product Status
                                </label>
                                <button
                                    type="button"
                                    onClick={() => handleFieldChange('is_active', !formData.is_active)}
                                    className={`flex items-center space-x-2 px-4 py-3 rounded-lg border transition-colors w-full ${formData.is_active
                                        ? 'bg-green-50 border-green-200 text-green-700'
                                        : 'bg-red-50 border-red-200 text-red-700'
                                        }`}
                                >
                                    {formData.is_active ? (
                                        <ToggleRight className="w-6 h-6 text-green-600" />
                                    ) : (
                                        <ToggleLeft className="w-6 h-6 text-red-600" />
                                    )}
                                    <span>{formData.is_active ? 'Active' : 'Inactive'}</span>
                                </button>
                            </div>
                        </div>
                    </form>
                </div>

                {/* Footer - Fixed at bottom */}
                <div className="bg-gray-50 px-4 py-3 border-t flex-shrink-0">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-gray-600">
                            * Required fields
                        </div>
                    </div>
                    <div className="flex space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || isLoading}
                            className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-lg hover:from-blue-700 hover:to-blue-600 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Saving...</span>
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4" />
                                    <span>{product ? 'Update' : 'Create'}</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Virtual Keyboard */}
                {showKeyboard && (
                    <div className="fixed top-0 h-full w-96 bg-white shadow-2xl z-45 border-r border-gray-200" style={{ right: '42rem' }}>
                        <VirtualKeyboard
                            isOpen={showKeyboard}
                            onClose={() => setShowKeyboard(false)}
                            onConfirm={handleKeyboardInput}
                            initialValue={formData[activeField as keyof ProductFormData]?.toString() || ''}
                            title={`Enter ${activeField.replace('_', ' ')}`}
                        />
                    </div>
                )}

                {/* Virtual Numpad */}
                {showNumpad && (
                    <div className="fixed top-0 h-full w-80 bg-white shadow-2xl z-45 border-r border-gray-200" style={{ right: '42rem' }}>
                        <VirtualNumpad
                            isOpen={showNumpad}
                            onClose={() => setShowNumpad(false)}
                            onConfirm={handleNumpadInput}
                            title={`Enter ${activeField.replace('_', ' ')}`}
                            initialValue={formData[activeField as keyof ProductFormData]?.toString() || '0'}
                            allowDecimal={activeField === 'price' || activeField === 'cost' || activeField === 'iva_rate'}
                        />
                    </div>
                )}
            </div>
        </>
    );
};

export default ProductForm; 