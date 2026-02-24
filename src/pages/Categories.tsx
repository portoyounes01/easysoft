import React, { useState } from 'react';
import { Plus, Tag, Trash2, Package, AlertTriangle, Loader2 } from 'lucide-react';
import { useProducts } from '../contexts/ProductsContext';
import { LocalCategory, LocalProduct } from '../types/supabase';
import CategoryForm from '../components/CategoryForm';
import { useTranslation } from 'react-i18next';
import { DashedCardButton } from '../components/ui/DashedCardButton';
import { AdminActionButton } from '../components/ui/AdminActionButton';

const Categories: React.FC = () => {
    // 1. Hooks (useState, useEffect, useContext)
    const {
        products,
        categories,
        isLoading,
        error,
        deleteCategory
    } = useProducts();
    const { t } = useTranslation();

    const [showCategoryForm, setShowCategoryForm] = useState(false);
    const [editingCategory, setEditingCategory] = useState<LocalCategory | null>(null);

    // 2. Event handlers
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
                t('categories.confirm.cannotDeleteWithProducts', { name: categoryName, count: productsInCategory.length })
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

    // 4. Effects - none

    // Loading/Error states
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <span className="ml-2 text-gray-600">{t('common.loading', { defaultValue: 'Loading...' })}</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                    <AlertTriangle className="w-5 h-5 text-red-500 mr-2" />
                    <span className="text-red-700">{error}</span>
                </div>
            </div>
        );
    }

    // 5. Render
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">{t('categories.title')}</h1>
                    <p className="text-gray-600 mt-1">{t('categories.subtitle')}</p>
                </div>
                <AdminActionButton
                    variant="primary"
                    label={t('categories.addCategory')}
                    icon={Plus}
                    onClick={handleCreateCategory}
                />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[{
                    title: t('categories.stats.totalCategories'),
                    value: categories.filter(c => !c.deleted_at).length.toString(),
                    icon: Tag,
                    color: 'bg-purple-500'
                }, {
                    title: t('categories.stats.activeCategories'),
                    value: categories.filter(c => c.is_active && !c.deleted_at).length.toString(),
                    icon: Tag,
                    color: 'bg-green-500'
                }, {
                    title: t('categories.stats.productsWithoutCategory'),
                    value: products.filter(p => !p.category_id && p.is_active && !p.deleted_at).length.toString(),
                    icon: Package,
                    color: 'bg-orange-500'
                }].map((stat, idx) => {
                    const Icon = stat.icon;
                    return (
                        <div key={idx} className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-2xl font-bold text-gray-800">{stat.value}</p>
                                    <p className="text-gray-600 text-sm">{stat.title}</p>
                                </div>
                                <div className={`p-3 rounded-lg ${stat.color}`}>
                                    <Icon className="w-6 h-6 text-white" />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Categories Grid */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-gray-800 flex items-center space-x-2">
                            <Tag className="w-5 h-5 text-purple-600" />
                            <span>{t('categories.grid.title')}</span>
                        </h2>
                        <span className="text-sm text-gray-500">
                            {t('categories.grid.total', { total: categories.filter(c => !c.deleted_at).length, active: categories.filter(c => c.is_active && !c.deleted_at).length })}
                        </span>
                    </div>
                </div>

                <div className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {categories
                            .filter(category => !category.deleted_at)
                            .sort((a, b) => a.display_order - b.display_order)
                            .map((category) => {
                                const productCount = products.filter(p =>
                                    p.category_id === category.id && p.is_active && !p.deleted_at
                                ).length;

                                return (
                                    <div
                                        key={category.id}
                                        className={`relative group border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer ${category.is_active
                                            ? 'bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                                            : 'bg-gray-100 border-gray-300 opacity-60 hover:opacity-75'
                                            }`}
                                        onClick={() => handleEditCategory(category)}
                                    >
                                        {!category.is_active && (
                                            <div className="absolute top-2 left-2 px-2 py-1 bg-gray-500 text-white text-xs rounded-full font-medium">
                                                {t('categories.grid.inactive')}
                                            </div>
                                        )}

                                        <div className={`w-full h-20 rounded-lg bg-gradient-to-r ${category.color} flex items-center justify-center mb-3 ${!category.is_active ? 'opacity-70' : ''}`}>
                                            <div className="text-white text-2xl">
                                                {category.icon === 'coffee' && <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path d="M7 11h1v1H7v-1zm2 0h1v1H9v-1zm-5 0h1v1H4v-1zm11.5-7C16.33 4 17 3.33 17 2.5S16.33 1 15.5 1 14 1.67 14 2.5 14.67 4 15.5 4z" /></svg>}
                                                {category.icon === 'milk' && <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path d="M7 11h1v1H7v-1zm2 0h1v1H9v-1zm-5 0h1v1H4v-1zm11.5-7C16.33 4 17 3.33 17 2.5S16.33 1 15.5 1 14 1.67 14 2.5 14.67 4 15.5 4z" /></svg>}
                                                {category.icon === 'cake' && <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path d="M7 11h1v1H7v-1zm2 0h1v1H9v-1zm-5 0h1v1H4v-1zm11.5-7C16.33 4 17 3.33 17 2.5S16.33 1 15.5 1 14 1.67 14 2.5 14.67 4 15.5 4z" /></svg>}
                                                {category.icon === 'candy' && <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path d="M7 11h1v1H7v-1zm2 0h1v1H9v-1zm-5 0h1v1H4v-1zm11.5-7C16.33 4 17 3.33 17 2.5S16.33 1 15.5 1 14 1.67 14 2.5 14.67 4 15.5 4z" /></svg>}
                                                {(!['coffee', 'milk', 'cake', 'candy'].includes(category.icon)) && <Package className="w-8 h-8" />}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <h3 className={`font-semibold truncate ${category.is_active ? 'text-gray-800' : 'text-gray-500'}`}>{category.name}</h3>
                                            <p className={`text-sm line-clamp-2 ${category.is_active ? 'text-gray-600' : 'text-gray-400'}`}>{category.description || t('categories.grid.noDescription')}</p>
                                            <div className={`flex items-center justify-between text-xs ${category.is_active ? 'text-gray-500' : 'text-gray-400'}`}>
                                                <span>{t('categories.grid.productsCount', { count: productCount })}</span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteCategory(category.id, category.name);
                                                    }}
                                                    className="min-h-[44px] min-w-[44px] p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title={t('categories.grid.deleteCategoryTitle')}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                        {/* Add Category Card */}
                        <DashedCardButton
                            icon={Plus}
                            label={t('categories.addCategoryCard')}
                            onClick={handleCreateCategory}
                            className="h-full min-h-[140px]"
                        />
                    </div>
                </div>
            </div>

            {/* Category Form Modal */}
            <CategoryForm
                isOpen={showCategoryForm}
                onClose={() => setShowCategoryForm(false)}
                category={editingCategory}
                onSuccess={handleCategoryFormSuccess}
            />
        </div>
    );
};

export default Categories;


