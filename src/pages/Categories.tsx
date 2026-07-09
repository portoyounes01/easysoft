import React, { useState } from 'react';
import { Plus, Tag, Trash2, Package, AlertTriangle, Loader2 } from 'lucide-react';
import { useProducts } from '../contexts/ProductsContext';
import { LocalCategory, LocalProduct } from '../types/supabase';
import CategoryForm from '../components/CategoryForm';
import { useTranslation } from 'react-i18next';
import { DashedCardButton } from '../components/ui/DashedCardButton';
import { AdminActionButton } from '../components/ui/AdminActionButton';
import {
    useDesignSystem2Customization,
} from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

const CategoriesInner: React.FC = () => {
    const { products, categories, isLoading, error, deleteCategory } = useProducts();
    const { visualStyle, prefs, layoutClasses } = useDesignSystem2Customization();
    const { t } = useTranslation();

    const [showCategoryForm, setShowCategoryForm] = useState(false);
    const [editingCategory, setEditingCategory] = useState<LocalCategory | null>(null);

    const headerPrimaryBtn =
        'ds2-control-radius-lg ds2-toolbar-control-h !px-4 text-sm font-semibold gap-2 shadow-none whitespace-nowrap leading-none shrink-0 [&>svg]:!h-4 [&>svg]:!w-4';

    const handleCreateCategory = () => {
        setEditingCategory(null);
        setShowCategoryForm(true);
    };

    const handleEditCategory = (category: LocalCategory) => {
        setEditingCategory(category);
        setShowCategoryForm(true);
    };

    const handleCategoryFormSuccess = () => {
        setShowCategoryForm(false);
        setEditingCategory(null);
    };

    const handleDeleteCategory = async (categoryId: string, categoryName: string) => {
        const productsInCategory = products.filter(
            (p: LocalProduct) => p.category_id === categoryId && p.is_active && !p.deleted_at
        );

        if (productsInCategory.length > 0) {
            alert(
                t('categories.confirm.cannotDeleteWithProducts', {
                    name: categoryName,
                    count: productsInCategory.length,
                })
            );
            return;
        }

        if (window.confirm(t('categories.confirm.deleteCategoryQuestion', { name: categoryName }))) {
            try {
                await deleteCategory(categoryId);
            } catch (e) {
                console.error('Failed to delete category:', e);
                alert(t('categories.confirm.failedDelete'));
            }
        }
    };

    const scopeShell = (children: React.ReactNode, extraClass = '') => (
        <div
            className={['ds2-visual-scope', extraClass].filter(Boolean).join(' ')}
            style={visualStyle}
            data-ds2-neutral={prefs.neutralFamilyId}
        >
            {children}
        </div>
    );

    if (isLoading) {
        return scopeShell(
            <div className="flex min-h-60 items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                <span className="ml-3 text-lg text-gray-600">
                    {t('common.loading', { defaultValue: 'Loading...' })}
                </span>
            </div>
        );
    }

    if (error) {
        return scopeShell(
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
                <div className="flex items-center">
                    <AlertTriangle className="mr-3 h-6 w-6 shrink-0 text-red-500" />
                    <span className="font-medium text-red-700">{error}</span>
                </div>
            </div>
        );
    }

    return (
        <div
            className="ds2-visual-scope"
            style={visualStyle}
            data-ds2-neutral={prefs.neutralFamilyId}
        >
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div
                    className={`flex flex-col gap-4 border-b border-gray-100 py-5 sm:flex-row sm:items-start sm:justify-between ${layoutClasses.contentInsetX}`}
                >
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                            {t('categories.title')}
                        </h1>
                        <p className="mt-1 text-gray-600">{t('categories.subtitle')}</p>
                    </div>
                    <AdminActionButton
                        variant="primary"
                        label={t('categories.addCategory')}
                        icon={Plus}
                        onClick={handleCreateCategory}
                        className={headerPrimaryBtn}
                    />
                </div>

                {/* <div className={layoutClasses.contentInsetX}>
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                                {[
                                    {
                                        title: t('categories.stats.totalCategories'),
                                        value: categories.filter((c) => !c.deleted_at).length.toString(),
                                        icon: Tag,
                                        color: 'bg-purple-500',
                                    },
                                    {
                                        title: t('categories.stats.activeCategories'),
                                        value: categories.filter((c) => c.is_active && !c.deleted_at).length.toString(),
                                        icon: Tag,
                                        color: 'bg-green-500',
                                    },
                                    {
                                        title: t('categories.stats.productsWithoutCategory'),
                                        value: products
                                            .filter((p) => !p.category_id && p.is_active && !p.deleted_at)
                                            .length.toString(),
                                        icon: Package,
                                        color: 'bg-orange-500',
                                    },
                                ].map((stat, idx) => {
                                    const Icon = stat.icon;
                                    return (
                                        <div
                                            key={idx}
                                            className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-2xl font-bold text-gray-800">{stat.value}</p>
                                                    <p className="text-sm text-gray-600">{stat.title}</p>
                                                </div>
                                                <div className={`rounded-lg p-3 ${stat.color}`}>
                                                    <Icon className="h-6 w-6 text-white" />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div> */}

                <div>
                    <div
                        className={`border-b border-gray-100 py-4 ${layoutClasses.contentInsetX}`}
                    >
                        <div className="flex items-center justify-between gap-4">
                            <h2 className="flex items-center space-x-2 text-xl font-semibold text-gray-800">
                                <Tag className="h-5 w-5 text-purple-600" />
                                <span>{t('categories.grid.title')}</span>
                            </h2>
                            <span className="shrink-0 text-sm text-gray-500">
                                {t('categories.grid.total', {
                                    total: categories.filter((c) => !c.deleted_at).length,
                                    active: categories.filter((c) => c.is_active && !c.deleted_at).length,
                                })}
                            </span>
                        </div>
                    </div>

                    <div className={`py-4 ${layoutClasses.contentInsetX}`}>
                        {/* Mobile: compact tap-to-edit list (the big touch-grid tiles below are for md+ / the till). */}
                        <div className="space-y-2.5 md:hidden">
                            {categories
                                .filter((category) => !category.deleted_at)
                                .sort((a, b) => a.display_order - b.display_order)
                                .map((category) => {
                                    const productCount = products.filter(
                                        (p) => p.category_id === category.id && p.is_active && !p.deleted_at
                                    ).length;
                                    return (
                                        <div
                                            key={category.id}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    handleEditCategory(category);
                                                }
                                            }}
                                            onClick={() => handleEditCategory(category)}
                                            className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 shadow-sm transition-colors ${category.is_active
                                                ? 'border-gray-200 bg-white hover:border-blue-300'
                                                : 'border-gray-300 bg-gray-100 opacity-60'
                                                }`}
                                        >
                                            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r ${category.color} ${!category.is_active ? 'opacity-70' : ''}`}>
                                                <Package className="h-5 w-5 text-white" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                                    <span className={`truncate font-semibold ${category.is_active ? 'text-gray-800' : 'text-gray-500'}`}>
                                                        {category.name}
                                                    </span>
                                                    {!category.is_active && (
                                                        <span className="rounded-full bg-gray-500 px-2 py-0.5 text-[10px] font-medium text-white">
                                                            {t('categories.grid.inactive')}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className={`truncate text-xs ${category.is_active ? 'text-gray-500' : 'text-gray-400'}`}>
                                                    {category.description || t('categories.grid.noDescription')}
                                                    <span className="mx-1.5 text-gray-300">·</span>
                                                    {t('categories.grid.productsCount', { count: productCount })}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteCategory(category.id, category.name);
                                                }}
                                                className="ds2-control-radius-lg min-h-touch-xs min-w-touch-xs shrink-0 p-2 text-red-600 transition-colors hover:bg-red-50"
                                                title={t('categories.grid.deleteCategoryTitle')}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    );
                                })}
                            <DashedCardButton
                                icon={Plus}
                                label={t('categories.addCategoryCard')}
                                onClick={handleCreateCategory}
                                className="min-h-14 w-full"
                            />
                        </div>

                        <div className="hidden gap-4 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {categories
                                .filter((category) => !category.deleted_at)
                                .sort((a, b) => a.display_order - b.display_order)
                                .map((category) => {
                                    const productCount = products.filter(
                                        (p) => p.category_id === category.id && p.is_active && !p.deleted_at
                                    ).length;

                                    return (
                                        <div
                                            key={category.id}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    handleEditCategory(category);
                                                }
                                            }}
                                            className={`group relative cursor-pointer rounded-lg border p-4 transition-all hover:shadow-md ${category.is_active
                                                ? 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50'
                                                : 'border-gray-300 bg-gray-100 opacity-60 hover:opacity-75'
                                                }`}
                                            onClick={() => handleEditCategory(category)}
                                        >
                                            {!category.is_active && (
                                                <div className="absolute left-2 top-2 rounded-full bg-gray-500 px-2 py-1 text-xs font-medium text-white">
                                                    {t('categories.grid.inactive')}
                                                </div>
                                            )}

                                            <div
                                                className={`mb-3 flex h-20 w-full items-center justify-center rounded-lg bg-gradient-to-r ${category.color} ${!category.is_active ? 'opacity-70' : ''}`}
                                            >
                                                <div className="text-2xl text-white">
                                                    {category.icon === 'coffee' && (
                                                        <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 20 20">
                                                            <path d="M7 11h1v1H7v-1zm2 0h1v1H9v-1zm-5 0h1v1H4v-1zm11.5-7C16.33 4 17 3.33 17 2.5S16.33 1 15.5 1 14 1.67 14 2.5 14.67 4 15.5 4z" />
                                                        </svg>
                                                    )}
                                                    {category.icon === 'milk' && (
                                                        <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 20 20">
                                                            <path d="M7 11h1v1H7v-1zm2 0h1v1H9v-1zm-5 0h1v1H4v-1zm11.5-7C16.33 4 17 3.33 17 2.5S16.33 1 15.5 1 14 1.67 14 2.5 14.67 4 15.5 4z" />
                                                        </svg>
                                                    )}
                                                    {category.icon === 'cake' && (
                                                        <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 20 20">
                                                            <path d="M7 11h1v1H7v-1zm2 0h1v1H9v-1zm-5 0h1v1H4v-1zm11.5-7C16.33 4 17 3.33 17 2.5S16.33 1 15.5 1 14 1.67 14 2.5 14.67 4 15.5 4z" />
                                                        </svg>
                                                    )}
                                                    {category.icon === 'candy' && (
                                                        <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 20 20">
                                                            <path d="M7 11h1v1H7v-1zm2 0h1v1H9v-1zm-5 0h1v1H4v-1zm11.5-7C16.33 4 17 3.33 17 2.5S16.33 1 15.5 1 14 1.67 14 2.5 14.67 4 15.5 4z" />
                                                        </svg>
                                                    )}
                                                    {!['coffee', 'milk', 'cake', 'candy'].includes(category.icon) && (
                                                        <Package className="h-8 w-8" />
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <h3
                                                    className={`truncate font-semibold ${category.is_active ? 'text-gray-800' : 'text-gray-500'}`}
                                                >
                                                    {category.name}
                                                </h3>
                                                <p
                                                    className={`line-clamp-2 text-sm ${category.is_active ? 'text-gray-600' : 'text-gray-400'}`}
                                                >
                                                    {category.description || t('categories.grid.noDescription')}
                                                </p>
                                                <div
                                                    className={`flex items-center justify-between text-xs ${category.is_active ? 'text-gray-500' : 'text-gray-400'}`}
                                                >
                                                    <span>
                                                        {t('categories.grid.productsCount', { count: productCount })}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteCategory(category.id, category.name);
                                                        }}
                                                        className="ds2-control-radius-lg min-h-touch-xs min-w-touch-xs p-2 text-red-600 transition-colors hover:bg-red-50"
                                                        title={t('categories.grid.deleteCategoryTitle')}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                            <DashedCardButton
                                icon={Plus}
                                label={t('categories.addCategoryCard')}
                                onClick={handleCreateCategory}
                                className="h-full min-h-35"
                            />
                        </div>
                    </div>
                </div>

                <CategoryForm
                    isOpen={showCategoryForm}
                    onClose={() => setShowCategoryForm(false)}
                    category={editingCategory}
                    onSuccess={handleCategoryFormSuccess}
                />
            </div>
        </div>
    );
};

export default CategoriesInner;
