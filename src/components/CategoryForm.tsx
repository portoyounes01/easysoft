import React, { useCallback, useState, useEffect } from 'react';
import { WithDialogTokens, DialogToggleRow } from './ui/dialogParts';
import {
    AlertCircle,
    Tag,
    Hash,
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
import { useTranslation } from 'react-i18next';
import { useProducts } from '../contexts/ProductsContext';
import {
    CategoryFormData,
    LocalCategory
} from '../types/supabase';
import VirtualKeyboard from './VirtualKeyboard';
import { BaseDialog } from './ui/BaseDialog';
import { ActionButton } from './ui/ActionButton';

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
    { name: 'coffee', icon: Coffee, labelKey: 'categories.form.icons.coffee' },
    { name: 'milk', icon: Milk, labelKey: 'categories.form.icons.milk' },
    { name: 'cake', icon: Cake, labelKey: 'categories.form.icons.cake' },
    { name: 'candy', icon: Candy, labelKey: 'categories.form.icons.candy' },
    { name: 'package', icon: Package, labelKey: 'categories.form.icons.package' },
    { name: 'utensils', icon: Utensils, labelKey: 'categories.form.icons.utensils' },
    { name: 'shirt', icon: Shirt, labelKey: 'categories.form.icons.shirt' },
    { name: 'book', icon: Book, labelKey: 'categories.form.icons.book' },
    { name: 'gift', icon: Gift, labelKey: 'categories.form.icons.gift' },
    { name: 'heart', icon: Heart, labelKey: 'categories.form.icons.heart' }
];

// Available color gradients
const AVAILABLE_COLORS = [
    { value: 'from-amber-500 to-orange-600', labelKey: 'categories.form.colors.orange', preview: 'bg-gradient-to-r from-amber-500 to-orange-600' },
    { value: 'from-blue-500 to-cyan-600', labelKey: 'categories.form.colors.blue', preview: 'bg-gradient-to-r from-blue-500 to-cyan-600' },
    { value: 'from-yellow-500 to-amber-600', labelKey: 'categories.form.colors.yellow', preview: 'bg-gradient-to-r from-yellow-500 to-amber-600' },
    { value: 'from-pink-500 to-rose-600', labelKey: 'categories.form.colors.pink', preview: 'bg-gradient-to-r from-pink-500 to-rose-600' },
    { value: 'from-green-500 to-emerald-600', labelKey: 'categories.form.colors.green', preview: 'bg-gradient-to-r from-green-500 to-emerald-600' },
    { value: 'from-purple-500 to-violet-600', labelKey: 'categories.form.colors.purple', preview: 'bg-gradient-to-r from-purple-500 to-violet-600' },
    { value: 'from-red-500 to-pink-600', labelKey: 'categories.form.colors.red', preview: 'bg-gradient-to-r from-red-500 to-pink-600' },
    { value: 'from-indigo-500 to-blue-600', labelKey: 'categories.form.colors.indigo', preview: 'bg-gradient-to-r from-indigo-500 to-blue-600' },
    { value: 'from-teal-500 to-cyan-600', labelKey: 'categories.form.colors.teal', preview: 'bg-gradient-to-r from-teal-500 to-cyan-600' },
    { value: 'from-gray-500 to-gray-600', labelKey: 'categories.form.colors.gray', preview: 'bg-gradient-to-r from-gray-500 to-gray-600' }
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

    const { t } = useTranslation();

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
    const getNextDisplayOrder = useCallback((): number => {
        if (categories.length === 0) return 1;
        return Math.max(...categories.map(cat => cat.display_order)) + 1;
    }, [categories]);

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
    }, [category, isOpen, categories, getNextDisplayOrder]);

    // Validation
    const validateForm = (): boolean => {
        const newErrors: FormErrors = {};

        if (!formData.name.trim()) {
            newErrors.name = t('categories.form.errors.nameRequired');
        }

        // Check for duplicate names (excluding current category when editing)
        const duplicateName = categories.find(cat =>
            cat.name.toLowerCase() === formData.name.toLowerCase() &&
            cat.id !== category?.id &&
            !cat.deleted_at
        );
        if (duplicateName) {
            newErrors.name = t('categories.form.errors.nameExists');
        }

        if (!formData.color) {
            newErrors.color = t('categories.form.errors.colorRequired');
        }

        if (!formData.icon) {
            newErrors.icon = t('categories.form.errors.iconRequired');
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
    const handleFieldChange = (field: keyof CategoryFormData, value: CategoryFormData[keyof CategoryFormData]) => {
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
        <BaseDialog
            open={isOpen}
            onClose={onClose}
            title={category ? t('categories.form.editTitle') : t('categories.form.createTitle')}
            width="50vw"
            height="82vh"
            footer={
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-600">
                            {t('categories.form.requiredFieldsNote')}
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowKeyboard(!showKeyboard)}
                            className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${showKeyboard ? 'bg-gray-300 text-gray-900' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                            title={t('forms.toggleKeyboard')}
                        >
                            {t('forms.keyboard')}
                        </button>
                    </div>
                    <div className="flex space-x-4">
                        <ActionButton
                            type="button"
                            onClick={onClose}
                            label={t('categories.form.cancel')}
                            variant="secondary"
                            className="flex-1"
                            style={{ height: '5vh', fontSize: '1.6vh' }}
                        />
                        <ActionButton
                            type="button"
                            onClick={handleSubmit}
                            disabled={isSubmitting || isLoading}
                            label={isSubmitting ? t('categories.form.saving') : category ? t('categories.form.update') : t('categories.form.create')}
                            className="flex-1"
                            style={{ height: '5vh', fontSize: '1.6vh' }}
                        />
                    </div>
                </div>
            }
        >
            <div className="flex h-full flex-col">
                <div className="flex items-center gap-3 px-6 pt-5 text-gray-700">
                    <Tag className="h-5 w-5 text-gray-500" />
                    <span className="text-sm font-medium">{formData.name || t('categories.addCategory')}</span>
                </div>

                {/* Form - Scrollable Content */}
                <div className="flex-1 overflow-y-auto">
                    <form onSubmit={handleSubmit} className="p-4 space-y-4">
                <WithDialogTokens>{tk => (<>

                        {/* Basic Information */}
                        <div className="space-y-4">
                            {/* Category Name */}
                            <div>
                                <label className={`block text-sm font-semibold ${tk.p.titleText} mb-2`}>
                                    {t('categories.form.nameLabel')}
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
                                        placeholder={t('forms.categoryNamePlaceholder')}
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
                                <label className={`block text-sm font-semibold ${tk.p.titleText} mb-2`}>
                                    {t('categories.form.description')}
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => handleFieldChange('description', e.target.value)}
                                    onClick={() => handleTextFieldClick('description')}
                                    rows={3}
                                    className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${activeField === 'description' ? 'border-blue-400 bg-blue-50' : ''
                                        }`}
                                    placeholder={t('forms.categoryDescriptionPlaceholder')}
                                />
                            </div>
                        </div>

                        {/* Visual Appearance */}
                        <div className="space-y-4">
                            <h3 className={`text-md font-semibold ${tk.p.titleText} border-b ${tk.p.border} pb-2`}>{t('categories.form.visualAppearance')}</h3>

                            {/* Color Selection */}
                            <div>
                                <label className={`block text-sm font-semibold ${tk.p.titleText} mb-2`}>
                                    {t('categories.form.colorGradient')}
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {AVAILABLE_COLORS.map((colorOption) => (
                                        <button
                                            key={colorOption.value}
                                            type="button"
                                            onClick={() => handleFieldChange('color', colorOption.value)}
                                            className={`p-3 rounded-[10px] border transition-all ${formData.color === colorOption.value
                                                    ? 'bg-green-50 border-green-500'
                                                    : 'bg-white border-gray-200 hover:bg-gray-50'
                                                }`}
                                        >
                                            <div className={`w-full h-6 rounded ${colorOption.preview} mb-2`}></div>
                                            <span className="text-xs font-medium text-gray-700">{t(colorOption.labelKey)}</span>
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
                                <label className={`block text-sm font-semibold ${tk.p.titleText} mb-2`}>
                                    {t('categories.form.categoryIcon')}
                                </label>
                                <div className="grid grid-cols-5 gap-2">
                                    {AVAILABLE_ICONS.map((iconOption) => {
                                        const IconComponent = iconOption.icon;
                                        return (
                                            <button
                                                key={iconOption.name}
                                                type="button"
                                                onClick={() => handleFieldChange('icon', iconOption.name)}
                                                className={`p-3 rounded-[10px] border transition-all flex flex-col items-center space-y-1 ${formData.icon === iconOption.name
                                                        ? 'bg-green-50 border-green-500 text-green-600'
                                                        : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-600'
                                                    }`}
                                                title={t(iconOption.labelKey)}
                                            >
                                                <IconComponent className="w-6 h-6" />
                                                <span className="text-xs font-medium">{t(iconOption.labelKey)}</span>
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
                                <label className={`block text-sm font-semibold ${tk.p.titleText} mb-2`}>
                                    {t('categories.form.preview')}
                                </label>
                                <div className={`w-full p-4 rounded-lg bg-gradient-to-r ${formData.color} text-white flex items-center space-x-3`}>
                                    {React.createElement(getSelectedIcon(), { className: "w-8 h-8" })}
                                    <div>
                                        <h4 className="font-semibold text-lg">{formData.name || t('categories.form.previewName')}</h4>
                                        <p className="text-sm opacity-90">{formData.description || t('categories.form.previewDescription')}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Settings */}
                        <div className="space-y-4">
                            <h3 className={`text-md font-semibold ${tk.p.titleText} border-b ${tk.p.border} pb-2`}>{t('categories.form.settingsHeading')}</h3>

                            {/* Display Order */}
                            <div>
                                <label className={`block text-sm font-semibold ${tk.p.titleText} mb-2`}>
                                    {t('categories.form.displayOrder')}
                                </label>
                                <div className="relative">
                                    <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input
                                        type="number"
                                        min="1"
                                        value={formData.display_order}
                                        onChange={(e) => handleFieldChange('display_order', parseInt(e.target.value) || 1)}
                                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder={t('forms.displayOrderPlaceholder')}
                                    />
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                    {t('categories.form.displayOrderHint')}
                                </p>
                            </div>

                            {/* Active Status */}
                            <div>
                                <label className={`block text-sm font-semibold ${tk.p.titleText} mb-2`}>
                                    {t('categories.form.statusLabel')}
                                </label>
                                <DialogToggleRow
                                    title={formData.is_active ? t('common.active') : t('common.inactive')}
                                    checked={formData.is_active}
                                    onChange={() => handleFieldChange('is_active', !formData.is_active)}
                                />
                            </div>
                        </div>
                    </>)}</WithDialogTokens>
                </form>
                </div>

                {/* Virtual Keyboard */}
                {showKeyboard && (
                    <div className="border-t border-gray-200 bg-white">
                        <VirtualKeyboard
                            isOpen={showKeyboard}
                            onClose={() => setShowKeyboard(false)}
                            onConfirm={handleKeyboardInput}
                            initialValue={formData[activeField as keyof CategoryFormData]?.toString() || ''}
                            title={t('forms.enterField', { field: activeField.replace('_', ' ') })}
                        />
                    </div>
                )}
            </div>
        </BaseDialog>
    );
};

export default CategoryForm; 