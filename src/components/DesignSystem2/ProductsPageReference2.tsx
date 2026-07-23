import React, { useState, useCallback, useMemo } from 'react';
import {
    Plus,
    Search,
    Filter,
    Edit,
    Package,
    AlertTriangle,
    Loader2,
    Tag,
    X,
    DollarSign,
    TrendingUp,
    MoreVertical,
    ArrowUpDown,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AdminActionButton } from '../ui/AdminActionButton';
import { TableActionButton } from '../ui/TableActionButton';

type SortOption = 'name_asc' | 'name_desc';

interface DemoRow {
    id: string;
    name: string;
    description: string;
    categoryLabel: string;
    stock: number;
    minStock: number;
    price: string;
    vatPct: string;
    badge: 'inactive' | 'draft' | 'out' | 'low' | 'ok';
}

const ProductsPageReference2: React.FC = () => {
    const { t } = useTranslation();
    const [searchTerm, setSearchTerm] = useState('');
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [sortOption, setSortOption] = useState<SortOption>('name_asc');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [openMenuRowId, setOpenMenuRowId] = useState<string | null>(null);
    const [showViewModal, setShowViewModal] = useState(false);

    const pr = useCallback(
        (key: string, options?: Record<string, string | number>) =>
            t(`designSystemPage.productsReference.${key}`, options),
        [t]
    );

    const demoRows: DemoRow[] = useMemo(
        () => [
            {
                id: 'a1b2c3d4',
                name: 'Espresso Blend 1kg',
                description: 'Whole beans, medium roast',
                categoryLabel: 'Beverages',
                stock: 24,
                minStock: 5,
                price: '18.90',
                vatPct: '23',
                badge: 'ok',
            },
            {
                id: 'e5f67890',
                name: 'Paper cups 12oz',
                description: '',
                categoryLabel: 'Supplies',
                stock: 2,
                minStock: 10,
                price: '4.50',
                vatPct: '23',
                badge: 'low',
            },
            {
                id: 'deadbeef',
                name: 'Legacy SKU',
                description: 'Awaiting category',
                categoryLabel: t('products.table.noCategory'),
                stock: 0,
                minStock: 0,
                price: '0.00',
                vatPct: '23',
                badge: 'draft',
            },
        ],
        [t]
    );

    const renderStatusBadge = (badge: DemoRow['badge']) => {
        switch (badge) {
            case 'inactive':
                return (
                    <span className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700">
                        <span>{t('products.status.inactive')}</span>
                    </span>
                );
            case 'draft':
                return (
                    <span className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        <span>{t('products.status.draft')}</span>
                    </span>
                );
            case 'out':
                return (
                    <span className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                        <AlertTriangle className="w-3 h-3" />
                        <span>{t('products.status.outOfStock')}</span>
                    </span>
                );
            case 'low':
                return (
                    <span className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                        <AlertTriangle className="w-3 h-3" />
                        <span>{t('products.status.lowStock')}</span>
                    </span>
                );
            case 'ok':
            default:
                return (
                    <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {t('products.status.inStock')}
                    </span>
                );
        }
    };

    const handleToggleSortMenu = useCallback(() => {
        setShowSortMenu((prev) => !prev);
        setShowFilterMenu(false);
    }, []);

    const handleToggleFilterMenu = useCallback(() => {
        setShowFilterMenu((prev) => !prev);
        setShowSortMenu(false);
    }, []);

    const statsCards = useMemo(
        () => [
            {
                title: t('products.stats.totalProducts'),
                value: '128',
                icon: Package,
                gradient: 'from-blue-500 to-blue-600',
            },
            {
                title: t('products.stats.lowStockItems'),
                value: '3',
                icon: AlertTriangle,
                gradient: 'from-red-500 to-rose-600',
            },
            {
                title: t('products.stats.categories'),
                value: '12',
                icon: Tag,
                gradient: 'from-purple-500 to-violet-600',
            },
            {
                title: t('products.stats.totalCost'),
                value: '€4,250',
                icon: DollarSign,
                gradient: 'from-orange-500 to-amber-600',
            },
            {
                title: t('products.stats.totalValue'),
                value: '€9,180',
                icon: TrendingUp,
                gradient: 'from-emerald-500 to-green-600',
            },
        ],
        [t]
    );

    return (
        <section className="space-y-12">
            <div>
                <h3 className="text-lg font-semibold text-neutral-900 mb-2 border-b pb-4">{pr('title')}</h3>
                <p className="text-sm text-neutral-600 max-w-3xl">{pr('blurb')}</p>
            </div>

            {/* Toolbar — matches Products.tsx */}
            <div>
                <h4 className="text-sm font-semibold text-neutral-700 mb-4">{pr('sectionToolbar')}</h4>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="w-full md:flex-1 md:max-w-2xl relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                            type="text"
                            placeholder={t('products.header.searchPlaceholder')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full min-h-touch pl-12 pr-4 py-3.5 bg-neutral-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-base"
                            aria-label={t('products.header.searchPlaceholder')}
                        />
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="relative">
                            <button
                                type="button"
                                onClick={handleToggleSortMenu}
                                className="min-h-touch flex items-center gap-2 px-5 py-3 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-all font-medium text-gray-900 shadow-sm"
                            >
                                <ArrowUpDown className="w-5 h-5" />
                                <span className="hidden sm:inline">{t('products.header.sort')}</span>
                            </button>
                            {showSortMenu && (
                                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-2xl shadow-xl z-20 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSortOption('name_asc');
                                            setShowSortMenu(false);
                                        }}
                                        className={`min-h-10 w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 transition-colors ${sortOption === 'name_asc' ? 'font-semibold bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                                    >
                                        {t('products.header.nameAsc')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSortOption('name_desc');
                                            setShowSortMenu(false);
                                        }}
                                        className={`min-h-10 w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 transition-colors ${sortOption === 'name_desc' ? 'font-semibold bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                                    >
                                        {t('products.header.nameDesc')}
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="relative">
                            <button
                                type="button"
                                onClick={handleToggleFilterMenu}
                                className="min-h-touch flex items-center gap-2 px-5 py-3 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-all font-medium text-gray-900 shadow-sm"
                            >
                                <Filter className="w-5 h-5" />
                                <span className="hidden sm:inline">{t('products.header.filter')}</span>
                            </button>
                            {showFilterMenu && (
                                <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-2xl shadow-xl z-20 p-4 space-y-3">
                                    <label className="block text-sm font-semibold text-gray-700">
                                        {t('products.header.category')}
                                    </label>
                                    <select
                                        value={selectedCategory}
                                        onChange={(e) => setSelectedCategory(e.target.value)}
                                        className="w-full min-h-touch-sm px-4 py-3 bg-neutral-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                                    >
                                        <option value="all">{t('products.header.allCategories')}</option>
                                        <option value="bev">{pr('demoFilterOptionBeverages')}</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        <AdminActionButton
                            variant="primary"
                            label={t('products.header.addProduct')}
                            icon={Plus}
                            type="button"
                            className="min-h-touch !px-6 !py-3 rounded-2xl font-semibold shadow-lg"
                        />
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div>
                <h4 className="text-sm font-semibold text-neutral-700 mb-4">{pr('sectionStats')}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                    {statsCards.map((stat, index) => {
                        const Icon = stat.icon;
                        return (
                            <div
                                key={index}
                                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                                        <p className="text-gray-500 text-sm mt-1">{stat.title}</p>
                                    </div>
                                    <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.gradient}`}>
                                        <Icon className="w-6 h-6 text-white" />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Badge legend */}
            <div>
                <h4 className="text-sm font-semibold text-neutral-700 mb-4">{pr('sectionBadges')}</h4>
                <div className="flex flex-wrap gap-3 items-center">
                    {renderStatusBadge('inactive')}
                    {renderStatusBadge('draft')}
                    {renderStatusBadge('out')}
                    {renderStatusBadge('low')}
                    {renderStatusBadge('ok')}
                </div>
            </div>

            {/* Table */}
            <div>
                <h4 className="text-sm font-semibold text-neutral-700 mb-4">{pr('sectionTable')}</h4>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100">
                        <h2 className="text-xl font-bold text-gray-900 flex items-center space-x-3 flex-wrap gap-2">
                            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
                                <Package className="w-5 h-5 text-white" />
                            </div>
                            <span>{t('products.table.title')}</span>
                            <span className="ml-auto text-sm font-normal text-gray-400">
                                {pr('tableCountLabel', { count: demoRows.length })}
                            </span>
                        </h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-neutral-50 border-b border-gray-100">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        {t('products.table.id')}
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        {t('products.table.product')}
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        {t('products.table.category')}
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        {t('products.table.stock')}
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        {t('products.table.price')}
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        {t('products.table.status')}
                                    </th>
                                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        {t('products.table.actions')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {demoRows.map((product) => (
                                    <tr key={product.id} className="hover:bg-neutral-50/50 transition-colors">
                                        <td className="px-6 py-4 text-sm text-gray-500 font-mono">
                                            #{product.id.toUpperCase()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center space-x-4">
                                                <div className="w-12 h-12 rounded-xl overflow-hidden border border-gray-100 flex-shrink-0 bg-neutral-50 flex items-center justify-center">
                                                    <Package className="w-5 h-5 text-gray-300" />
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-gray-900">{product.name}</div>
                                                    {product.description ? (
                                                        <div className="text-sm text-gray-500 line-clamp-1">
                                                            {product.description}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-3 py-1.5 text-xs font-semibold bg-neutral-100 text-gray-700 rounded-lg">
                                                {product.categoryLabel}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div>
                                                <div className="font-bold text-gray-900">{product.stock}</div>
                                                <div className="text-xs text-gray-500">
                                                    {t('products.table.min')} {product.minStock}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-gray-900">€{product.price}</div>
                                            <div className="text-xs text-gray-500">
                                                {t('products.table.vat')} {product.vatPct}%
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">{renderStatusBadge(product.badge)}</td>
                                        <td className="px-6 py-4 text-right relative">
                                            <TableActionButton
                                                variant="icon"
                                                icon={MoreVertical}
                                                type="button"
                                                onClick={() =>
                                                    setOpenMenuRowId(openMenuRowId === product.id ? null : product.id)
                                                }
                                                title={t('products.table.actionsTitle')}
                                                aria-expanded={openMenuRowId === product.id}
                                                aria-haspopup="menu"
                                            />
                                            {openMenuRowId === product.id && (
                                                <div
                                                    className="absolute right-4 mt-2 w-44 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden"
                                                    role="menu"
                                                >
                                                    <button
                                                        type="button"
                                                        role="menuitem"
                                                        className="min-h-10 w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                                        onClick={() => setOpenMenuRowId(null)}
                                                    >
                                                        {t('products.table.view')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        role="menuitem"
                                                        className="min-h-10 w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                                        onClick={() => setOpenMenuRowId(null)}
                                                    >
                                                        {t('products.table.edit')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        role="menuitem"
                                                        className="min-h-10 w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
                                                        onClick={() => setOpenMenuRowId(null)}
                                                    >
                                                        {t('products.table.delete')}
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Page states */}
            <div>
                <h4 className="text-sm font-semibold text-neutral-700 mb-4">{pr('sectionPageStates')}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="rounded-2xl border border-dashed border-gray-300 p-4 bg-neutral-50/50">
                        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">
                            {pr('loadingLabel')}
                        </p>
                        <div className="flex items-center justify-center min-h-30">
                            <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
                            <span className="ml-3 text-gray-600 text-lg">{t('common.loading')}</span>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-dashed border-gray-300 p-4 bg-neutral-50/50">
                        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">
                            {pr('errorLabel')}
                        </p>
                        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
                            <div className="flex items-center">
                                <AlertTriangle className="w-6 h-6 text-red-500 mr-3 shrink-0" />
                                <span className="text-red-700 font-medium">{pr('errorDemoMessage')}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* View modal sample */}
            <div>
                <h4 className="text-sm font-semibold text-neutral-700 mb-4">{pr('sectionModal')}</h4>
                <AdminActionButton
                    variant="outline"
                    label={pr('openViewModal')}
                    icon={Package}
                    type="button"
                    onClick={() => setShowViewModal(true)}
                    className="min-h-touch"
                />
            </div>

            {showViewModal && (
                <>
                    <div
                        className="fixed inset-0 bg-black/40 z-[100]"
                        aria-hidden
                        onClick={() => setShowViewModal(false)}
                    />
                    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl z-[110] w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white p-6 rounded-t-2xl">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className="p-2 bg-white/20 rounded-xl">
                                        <Package className="w-6 h-6" />
                                    </div>
                                    <h2 className="text-xl font-bold">{t('products.viewModal.title')}</h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowViewModal(false)}
                                    className="min-h-touch-sm min-w-touch-sm p-2 hover:bg-white/20 rounded-xl transition-colors flex items-center justify-center"
                                    aria-label={t('common.close')}
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="p-6 space-y-6">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 mb-4">
                                    {t('products.viewModal.basicInfo')}
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-neutral-50 rounded-xl p-4">
                                        <span className="block text-sm font-medium text-gray-500 mb-1">
                                            {t('products.viewModal.productName')}
                                        </span>
                                        <p className="text-gray-900 font-semibold">{pr('demoProductName')}</p>
                                    </div>
                                    <div className="bg-neutral-50 rounded-xl p-4">
                                        <span className="block text-sm font-medium text-gray-500 mb-1">
                                            {t('products.viewModal.sku')}
                                        </span>
                                        <p className="text-gray-900 font-mono">{pr('demoSku')}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <span className="block text-sm font-medium text-blue-700 mb-1">
                                            {t('products.viewModal.profitMargin')}
                                        </span>
                                        <p className="text-blue-900 font-bold">€6.40 (51.2%)</p>
                                    </div>
                                    <div>
                                        <span className="block text-sm font-medium text-blue-700 mb-1">
                                            {t('products.viewModal.priceWithoutVat')}
                                        </span>
                                        <p className="text-blue-900 font-bold">€15.37</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-neutral-50 px-6 py-4 rounded-b-2xl border-t border-gray-100">
                            <div className="flex justify-between items-center gap-4 flex-wrap">
                                <AdminActionButton
                                    variant="primary"
                                    label={t('products.viewModal.editProduct')}
                                    icon={Edit}
                                    type="button"
                                    className="min-h-touch"
                                    onClick={() => setShowViewModal(false)}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowViewModal(false)}
                                    className="min-h-touch px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl transition-all font-semibold"
                                >
                                    {t('products.viewModal.close')}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </section>
    );
};

export default ProductsPageReference2;
