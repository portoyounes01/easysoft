import React, { useState, useEffect } from 'react';
import {
    X,
    Save,
    AlertCircle,
    Tag,
    Palette,
    Hash,
    ToggleLeft,
    ToggleRight,
    Loader2,
    Coffee,
    Milk,
    Cake,
    Candy,
    Package,
    Utensils,
    Shirt,
    Book,
    Gift,
    Heart
} from 'lucide-react';
import { useProducts } from '../contexts/ProductsContext';
import {
    CategoryFormData,
    LocalCategory
} from '../types/supabase';
import VirtualKeyboard from './VirtualKeyboard';

interface CategoryFormProps {
    isOpen: boolean;
    onClose: () => void;
    category?: LocalCategory | null; // null for create, LocalCategory for edit
    onSuccess?: () => void;
}

interface FormErrors {
    name?: string;
    color?: string;
    icon?: string;
}

// Available icons for categories
const AVAILABLE_ICONS = [
    { name: 'coffee', icon: Coffee, label: 'Coffee' },
    { name: 'milk', icon: Milk, label: 'Dairy' },
    { name: 'cake', icon: Cake, label: 'Bakery' },
    { name: 'candy', icon: Candy, label: 'Confectionery' },
    { name: 'package', icon: Package, label: 'General' },
    { name: 'utensils', icon: Utensils, label: 'Food' },
    { name: 'shirt', icon: Shirt, label: 'Clothing' },
    { name: 'book', icon: Book, label: 'Books' },
    { name: 'gift', icon: Gift, label: 'Gifts' },
    { name: 'heart', icon: Heart, label: 'Health' }
];

// Available color gradients
const AVAILABLE_COLORS = [
    { value: 'from-amber-500 to-orange-600', label: 'Orange', preview: 'bg-gradient-to-r from-amber-500 to-orange-600' },
    { value: 'from-blue-500 to-cyan-600', label: 'Blue', preview: 'bg-gradient-to-r from-blue-500 to-cyan-600' },
    { value: 'from-yellow-500 to-amber-600', label: 'Yellow', preview: 'bg-gradient-to-r from-yellow-500 to-amber-600' },
    { value: 'from-pink-500 to-rose-600', label: 'Pink', preview: 'bg-gradient-to-r from-pink-500 to-rose-600' },
    { value: 'from-green-500 to-emerald-600', label: 'Green', preview: 'bg-gradient-to-r from-green-500 to-emerald-600' },
    { value: 'from-purple-500 to-violet-600', label: 'Purple', preview: 'bg-gradient-to-r from-purple-500 to-violet-600' },
    { value: 'from-red-500 to-pink-600', label: 'Red', preview: 'bg-gradient-to-r from-red-500 to-pink-600' },
    { value: 'from-indigo-500 to-blue-600', label: 'Indigo', preview: 'bg-gradient-to-r from-indigo-500 to-blue-600' },
    { value: 'from-teal-500 to-cyan-600', label: 'Teal', preview: 'bg-gradient-to-r from-teal-500 to-cyan-600' },
    { value: 'from-gray-500 to-gray-600', label: 'Gray', preview: 'bg-gradient-to-r from-gray-500 to-gray-600' }
];

const CategoryForm: React.FC<CategoryFormProps> = ({
    isOpen,
    onClose,
    category = null,
    onSuccess
}) => {
    const {
        categories,
        createCategory,
        updateCategory,
        isLoading
    } = useProducts();

    const [formData, setFormData] = useState<CategoryFormData>({
        name: '',
        description: '',
        color: 'from-gray-500 to-gray-600',
        icon: 'package',
        display_order: 0,
        is_active: true
    });

    const [errors, setErrors] = useState<FormErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showKeyboard, setShowKeyboard] = useState(false);
    const [activeField, setActiveField] = useState<string>('');

    // Get next display order for new categories
    const getNextDisplayOrder = (): number => {
        if (categories.length === 0) return 1;
        return Math.max(...categories.map(cat => cat.display_order)) + 1;
    };

    // Populate form when editing
    useEffect(() => {
        if (category) {
            setFormData({
                name: category.name,
                description: category.description || '',
                color: category.color,
                icon: category.icon,
                display_order: category.display_order,
                is_active: category.is_active
            });
        } else {
            // Reset form for new category
            setFormData({
                name: '',
                description: '',
                color: 'from-gray-500 to-gray-600',
                icon: 'package',
                display_order: getNextDisplayOrder(),
                is_active: true
            });
        }
        setErrors({});
    }, [category, isOpen, categories]);

    // Validation
    const validateForm = (): boolean => {
        const newErrors: FormErrors = {};

        if (!formData.name.trim()) {
            newErrors.name = 'Category name is required';
        }

        // Check for duplicate names (excluding current category when editing)
        const duplicateName = categories.find(cat =>
            cat.name.toLowerCase() === formData.name.toLowerCase() &&
            cat.id !== category?.id &&
            !cat.deleted_at
        );
        if (duplicateName) {
            newErrors.name = 'Category name already exists';
        }

        if (!formData.color) {
            newErrors.color = 'Color is required';
        }

        if (!formData.icon) {
            newErrors.icon = 'Icon is required';
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
            if (category) {
                // Update existing category
                await updateCategory(category.id, formData);
            } else {
                // Create new category
                await createCategory(formData);
            }

            onSuccess?.();
            onClose();
        } catch (error) {
            console.error('Failed to save category:', error);
            // Handle error (could show toast notification)
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handle field changes
    const handleFieldChange = (field: keyof CategoryFormData, value: any) => {
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
    };

    // Handle virtual keyboard input
    const handleKeyboardInput = (value: string) => {
        handleFieldChange(activeField as keyof CategoryFormData, value);
    };

    // Get selected icon component
    const getSelectedIcon = () => {
        const iconData = AVAILABLE_ICONS.find(icon => icon.name === formData.icon);
        return iconData ? iconData.icon : Package;
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black bg-opacity-30 z-40" onClick={onClose} />

            {/* Side Panel */}
            <div className="fixed top-0 right-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white p-4 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center space-x-3">
                        <Tag className="w-6 h-6" />
                        <h2 className="text-lg font-bold">
                            {category ? 'Edit Category' : 'Create New Category'}
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
                            {/* Category Name */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Category Name *
                                </label>
                                <div className="relative">
                                    <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => handleFieldChange('name', e.target.value)}
                                        onClick={() => handleTextFieldClick('name')}
                                        className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.name ? 'border-red-500' : activeField === 'name' ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
                                            }`}
                                        placeholder="Enter category name"
                                    />
                                </div>
                                {errors.name && (
                                    <p className="mt-1 text-sm text-red-600 flex items-center">
                                        <AlertCircle className="w-4 h-4 mr-1" />
                                        {errors.name}
                                    </p>
                                )}
                            </div>

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
                                    className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${activeField === 'description' ? 'border-blue-400 bg-blue-50' : ''
                                        }`}
                                    placeholder="Enter category description"
                                />
                            </div>
                        </div>

                        {/* Visual Appearance */}
                        <div className="space-y-4">
                            <h3 className="text-md font-semibold text-gray-800 border-b pb-2">Visual Appearance</h3>

                            {/* Color Selection */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Color Gradient *
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {AVAILABLE_COLORS.map((colorOption) => (
                                        <button
                                            key={colorOption.value}
                                            type="button"
                                            onClick={() => handleFieldChange('color', colorOption.value)}
                                            className={`p-3 rounded-lg border-2 transition-all ${formData.color === colorOption.value
                                                    ? 'border-blue-500 ring-2 ring-blue-200'
                                                    : 'border-gray-300 hover:border-gray-400'
                                                }`}
                                        >
                                            <div className={`w-full h-6 rounded ${colorOption.preview} mb-2`}></div>
                                            <span className="text-xs font-medium text-gray-700">{colorOption.label}</span>
                                        </button>
                                    ))}
                                </div>
                                {errors.color && (
                                    <p className="mt-1 text-sm text-red-600 flex items-center">
                                        <AlertCircle className="w-4 h-4 mr-1" />
                                        {errors.color}
                                    </p>
                                )}
                            </div>

                            {/* Icon Selection */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Category Icon *
                                </label>
                                <div className="grid grid-cols-5 gap-2">
                                    {AVAILABLE_ICONS.map((iconOption) => {
                                        const IconComponent = iconOption.icon;
                                        return (
                                            <button
                                                key={iconOption.name}
                                                type="button"
                                                onClick={() => handleFieldChange('icon', iconOption.name)}
                                                className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center space-y-1 ${formData.icon === iconOption.name
                                                        ? 'border-blue-500 bg-blue-50 text-blue-600'
                                                        : 'border-gray-300 hover:border-gray-400 text-gray-600'
                                                    }`}
                                                title={iconOption.label}
                                            >
                                                <IconComponent className="w-6 h-6" />
                                                <span className="text-xs font-medium">{iconOption.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                {errors.icon && (
                                    <p className="mt-1 text-sm text-red-600 flex items-center">
                                        <AlertCircle className="w-4 h-4 mr-1" />
                                        {errors.icon}
                                    </p>
                                )}
                            </div>

                            {/* Preview */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Preview
                                </label>
                                <div className={`w-full p-4 rounded-lg bg-gradient-to-r ${formData.color} text-white flex items-center space-x-3`}>
                                    {React.createElement(getSelectedIcon(), { className: "w-8 h-8" })}
                                    <div>
                                        <h4 className="font-semibold text-lg">{formData.name || 'Category Name'}</h4>
                                        <p className="text-sm opacity-90">{formData.description || 'Category description'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Settings */}
                        <div className="space-y-4">
                            <h3 className="text-md font-semibold text-gray-800 border-b pb-2">Settings</h3>

                            {/* Display Order */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Display Order
                                </label>
                                <div className="relative">
                                    <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input
                                        type="number"
                                        min="1"
                                        value={formData.display_order}
                                        onChange={(e) => handleFieldChange('display_order', parseInt(e.target.value) || 1)}
                                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="1"
                                    />
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                    Lower numbers appear first in category lists
                                </p>
                            </div>

                            {/* Active Status */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Category Status
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

                {/* Footer */}
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
                                    <span>{category ? 'Update' : 'Create'}</span>
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
                            initialValue={formData[activeField as keyof CategoryFormData]?.toString() || ''}
                            title={`Enter ${activeField.replace('_', ' ')}`}
                        />
                    </div>
                )}
            </div>
        </>
    );
};

export default CategoryForm; 