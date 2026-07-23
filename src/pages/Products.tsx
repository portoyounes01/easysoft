import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  Filter,
  Edit,
  Package,
  AlertTriangle,
  Loader2,
  X,
  MoreVertical,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ScanLine,
} from 'lucide-react';
import { useProducts } from '../contexts/ProductsContext';
import { LocalProduct, calculateStockStatus } from '../types/supabase';
// import { readPosTrackInventoryFromStorage } from '../utils/posSettingsStorage'; // AGENTS: do not delete — used with stock UI when re-enabled
import ProductWizard from '../components/ProductWizard';
import PurchaseReceiptImportDialog from '../components/PurchaseReceiptImportDialog';
import { useTranslation } from 'react-i18next';
import { AdminActionButton } from '../components/ui/AdminActionButton';
import { TableActionButton } from '../components/ui/TableActionButton';
import { MenuRow } from '../components/ui/MenuRow';
import { ConfiguredDialogShell } from '../components/ui/ConfiguredDialogShell';
import { dialogButtonClasses, useAppliedDialogStyle } from '../theme/dialogStyle';
import { DialogInfoCard, DialogSectionTitle } from '../components/ui/dialogParts';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { rawMaterialService } from '../services/rawMaterialService';
import { useDesignSystem2Customization } from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

const ProductsInner: React.FC = () => {
  const { products, categories, isLoading, error, searchProducts, deleteProduct, refreshData } = useProducts();
  // AGENTS: Do not delete — stock catalog flag preserved for re-enable with stock table column.
  // const catalogTracksInventory = readPosTrackInventoryFromStorage();
  const { visualStyle, prefs, layoutClasses } = useDesignSystem2Customization();
  const appliedDialogStyle = useAppliedDialogStyle();

  const { t } = useTranslation();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [filteredProducts, setFilteredProducts] = useState<LocalProduct[]>([]);
  // Products auto-managed by sale-enabled inventory items: sold in the POS grid
  // but kept out of this catalog page (managed from the Inventory page instead).
  const [linkedProductIds, setLinkedProductIds] = useState<Set<string>>(new Set());
  const [showProductWizard, setShowProductWizard] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<LocalProduct | null>(null);
  const [viewingProduct, setViewingProduct] = useState<LocalProduct | null>(null);
  const [showCategoryAlert, setShowCategoryAlert] = useState(false);
  const [openMenuProductId, setOpenMenuProductId] = useState<string | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [sortOption, setSortOption] = useState<'name_asc' | 'name_desc'>('name_asc');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [showPurchaseImport, setShowPurchaseImport] = useState(false);

  const categoryIdToName = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((cat) => {
      if (!cat.deleted_at) {
        map.set(cat.id, cat.name);
      }
    });
    return map;
  }, [categories]);

  const getExtendedStatusBadge = (product: LocalProduct) => {
    const pill = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold';

    if (!product.is_active) {
      return (
        <span className={`${pill} bg-neutral-100 text-neutral-600`}>
          <span>{t('products.status.inactive')}</span>
        </span>
      );
    }

    if (!product.category_id || product.price === 0) {
      return (
        <span className={`${pill} bg-sky-50 text-sky-800`}>
          <span>{t('products.status.draft')}</span>
        </span>
      );
    }

    const stockStatus = calculateStockStatus(product);
    if (stockStatus === 'out_of_stock') {
      return (
        <span className={`${pill} bg-red-50 text-red-700`}>
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>{t('products.status.outOfStock')}</span>
        </span>
      );
    }
    if (stockStatus === 'low_stock') {
      return (
        <span className={`${pill} bg-amber-50 text-amber-800`}>
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>{t('products.status.lowStock')}</span>
        </span>
      );
    }
    return (
      <span className={`${pill} bg-emerald-50 text-emerald-800`}>
        {t('products.status.inStock')}
      </span>
    );
  };

  useEffect(() => {
    let cancelled = false;
    void rawMaterialService.linkedProductIds().then(ids => {
      if (!cancelled) setLinkedProductIds(ids);
    });
    return () => { cancelled = true; };
  }, [products]);

  useEffect(() => {
    const applyFilters = async () => {
      let result = products;

      if (searchTerm) {
        result = await searchProducts(searchTerm);
      }

      if (linkedProductIds.size > 0) {
        result = result.filter((product) => !linkedProductIds.has(product.id));
      }

      if (selectedCategory !== 'all') {
        result = result.filter((product) => product.category_id === selectedCategory);
      }

      if (sortOption === 'name_asc') {
        result = [...result].sort((a, b) => a.name.localeCompare(b.name));
      } else if (sortOption === 'name_desc') {
        result = [...result].sort((a, b) => b.name.localeCompare(a.name));
      }

      setFilteredProducts(result);
    };

    applyFilters();
  }, [products, searchTerm, selectedCategory, sortOption, searchProducts, linkedProductIds]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, sortOption]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  const pageNumbers = useMemo(() => {
    const maxButtons = 5;
    if (totalPages <= maxButtons) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [totalPages, currentPage]);

  const categoryOptions = [
    { value: 'all', label: t('products.header.allCategories') },
    ...categories.filter((cat) => cat.is_active).map((cat) => ({
      value: cat.id,
      label: cat.name,
    })),
  ];

  /* AGENTS: Do not delete — stock status badge helper preserved for view-modal stock section when re-enabled.
  const getStatusBadge = (product: LocalProduct) => {
    const stockStatus = calculateStockStatus(product);

    if (stockStatus === 'out_of_stock') {
      return (
        <span className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
          <AlertTriangle className="w-3 h-3" />
          <span>{t('products.status.outOfStock')}</span>
        </span>
      );
    }

    if (stockStatus === 'low_stock') {
      return (
        <span className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
          <AlertTriangle className="w-3 h-3" />
          <span>{t('products.status.lowStock')}</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        {t('products.status.inStock')}
      </span>
    );
  };
  */

  const handleDeleteProduct = (productId: string) => {
    setDeletingProductId(productId);
  };

  const confirmDeleteProduct = async () => {
    if (!deletingProductId) return;
    try {
      await deleteProduct(deletingProductId);
    } catch (deleteError) {
      console.error('Failed to delete product:', deleteError);
    } finally {
      setDeletingProductId(null);
    }
  };

  const handleEditProduct = (product: LocalProduct) => {
    setEditingProduct(product);
    setShowProductWizard(true);
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
      <div className="flex items-center justify-center min-h-60">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
        <span className="ml-3 text-gray-600 text-lg">{t('common.loading', { defaultValue: 'Loading...' })}</span>
      </div>
    );
  }

  if (error) {
    return scopeShell(
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
        <div className="flex items-center">
          <AlertTriangle className="w-6 h-6 text-red-500 mr-3 shrink-0" />
          <span className="text-red-700 font-medium">{error}</span>
        </div>
      </div>
    );
  }

  const toolbarBtn =
    'ds2-control-radius-lg ds2-toolbar-control-h !px-3 text-sm font-medium gap-2 shadow-none whitespace-nowrap leading-none shrink-0 [&>svg]:!h-4 [&>svg]:!w-4';

  return (
    <div
      className="ds2-visual-scope"
      style={visualStyle}
      data-ds2-neutral={prefs.neutralFamilyId}
    >
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div
          className={`flex flex-col gap-4 border-b border-gray-100 py-4 lg:flex-row lg:items-center lg:gap-6 ${layoutClasses.contentInsetX}`}
        >
          <h1 className="shrink-0 text-2xl font-bold tracking-tight text-gray-900">
            {t('products.pageTitle')}
          </h1>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={t('products.header.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ds2-control-radius-lg ds2-toolbar-control-h box-border w-full border border-gray-200 bg-white pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              aria-label={t('products.header.searchPlaceholder')}
            />
          </div>
          {/* Mobile: 2×2 action grid (equal touch targets); sm: restores the desktop flex row. */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:flex-wrap sm:items-center">
            <AdminActionButton
              variant="outline"
              type="button"
              icon={ScanLine}
              label={t('products.importPurchase')}
              onClick={() => setShowPurchaseImport(true)}
              className={`${toolbarBtn} w-full sm:w-auto`}
            />
            <div className="relative w-full sm:w-auto">
              <AdminActionButton
                variant="outline"
                type="button"
                icon={ArrowUpDown}
                label={t('products.header.sort')}
                onClick={() => {
                  setShowSortMenu((prev) => !prev);
                  setShowFilterMenu(false);
                }}
                className={`${toolbarBtn} w-full sm:w-auto`}
              />
              {showSortMenu && (
                <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                  <MenuRow
                    label={t('products.header.nameAsc')}
                    selected={sortOption === 'name_asc'}
                    showCheck
                    onClick={() => {
                      setSortOption('name_asc');
                      setShowSortMenu(false);
                    }}
                  />
                  <MenuRow
                    label={t('products.header.nameDesc')}
                    selected={sortOption === 'name_desc'}
                    showCheck
                    onClick={() => {
                      setSortOption('name_desc');
                      setShowSortMenu(false);
                    }}
                  />
                </div>
              )}
            </div>

            <div className="relative w-full sm:w-auto">
              <AdminActionButton
                variant="outline"
                type="button"
                icon={Filter}
                label={t('products.header.filter')}
                onClick={() => {
                  setShowFilterMenu((prev) => !prev);
                  setShowSortMenu(false);
                }}
                className={`${toolbarBtn} w-full sm:w-auto`}
              />
              {showFilterMenu && (
                <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
                  <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="products-filter-category">
                    {t('products.header.category')}
                  </label>
                  <select
                    id="products-filter-category"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="ds2-control-radius-lg ds2-toolbar-control-h box-border w-full border border-gray-200 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {categoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="relative w-full sm:ml-0 sm:w-auto">
              <AdminActionButton
                variant="primary"
                type="button"
                icon={Plus}
                label={t('products.header.addProduct')}
                disabled={categories.length === 0}
                onClick={() => {
                  if (categories.length === 0) {
                    setShowCategoryAlert(true);
                    setTimeout(() => setShowCategoryAlert(false), 3000);
                  } else {
                    setEditingProduct(null);
                    setShowProductWizard(true);
                  }
                }}
                className={`${toolbarBtn} w-full sm:w-auto !px-4`}
              />
              {showCategoryAlert && categories.length === 0 && (
                <div className="absolute right-0 top-full z-20 mt-2 min-w-popover rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <span className="text-sm text-amber-800">{t('products.header.createCategoryFirst')}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`hidden overflow-x-auto md:block ${layoutClasses.contentInsetX}`}>
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="border-r border-gray-200 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {t('products.table.id')}
                </th>
                <th className="border-r border-gray-200 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {t('products.table.productNameColumn')}
                </th>
                <th className="border-r border-gray-200 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {t('products.table.category')}
                </th>
                {/*
                  AGENTS: Do not delete — stock table column preserved for re-enable. Remove only if explicitly requested by a human.
                <th className="border-r border-gray-200 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {t('products.table.stock')}
                </th>
                */}
                <th className="border-r border-gray-200 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {t('products.table.price')}
                </th>
                <th className="border-r border-gray-200 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {t('products.table.status')}
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {' '}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {paginatedProducts.map((product) => (
                <tr key={product.id} className="transition-colors hover:bg-gray-50/80">
                  <td className="border-r border-gray-100 px-4 py-4 font-mono text-xs text-gray-500">
                    #{String(product.sku || product.id.slice(0, 8)).toUpperCase()}
                  </td>
                  <td className="border-r border-gray-100 px-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                        <Package className="h-4 w-4 text-gray-300" />
                        {product.image_url && (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="absolute inset-0 h-full w-full object-cover"
                            onError={(e) => {
                              const target = e.currentTarget as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-gray-900">{product.name}</div>
                        {product.description ? (
                          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-gray-500">
                            {product.description}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-xs text-gray-400">&nbsp;</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-4 py-4 text-gray-700">
                    {categoryIdToName.get(product.category_id || '') || t('products.table.noCategory')}
                  </td>
                  {/*
                    AGENTS: Do not delete — stock table cell preserved for re-enable. Remove only if explicitly requested by a human.
                  <td className="border-r border-gray-100 px-4 py-4 text-gray-900">
                    {catalogTracksInventory && product.track_stock ? (
                      <span className="font-medium tabular-nums">{product.stock}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  */}
                  <td className="border-r border-gray-100 px-4 py-4 font-semibold tabular-nums text-gray-900">
                    €{product.price.toFixed(2)}
                  </td>
                  <td className="border-r border-gray-100 px-4 py-4">{getExtendedStatusBadge(product)}</td>
                  <td className="relative px-4 py-4 text-right">
                    <TableActionButton
                      variant="icon"
                      icon={MoreVertical}
                      type="button"
                      onClick={() =>
                        setOpenMenuProductId(openMenuProductId === product.id ? null : product.id)
                      }
                      title={t('products.table.actionsTitle')}
                      aria-expanded={openMenuProductId === product.id}
                      aria-haspopup="menu"
                    />
                    {openMenuProductId === product.id && (
                      <div
                        className="absolute right-4 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
                        role="menu"
                      >
                        <MenuRow
                          label={t('products.table.view')}
                          onClick={() => {
                            setViewingProduct(product);
                            setOpenMenuProductId(null);
                          }}
                        />
                        <MenuRow
                          label={t('products.table.edit')}
                          onClick={() => {
                            handleEditProduct(product);
                            setOpenMenuProductId(null);
                          }}
                        />
                        <MenuRow
                          variant="danger"
                          label={t('products.table.delete')}
                          onClick={() => {
                            setOpenMenuProductId(null);
                            handleDeleteProduct(product.id);
                          }}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: table reflowed to a card list (desktop <table> above is hidden < md) */}
        <div className={`space-y-2.5 pb-1 md:hidden ${layoutClasses.contentInsetX}`}>
          {paginatedProducts.map((product) => (
            <div key={product.id} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                  <Package className="h-4 w-4 text-gray-300" />
                  {product.image_url && (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setViewingProduct(product)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-gray-900">{product.name}</span>
                    {getExtendedStatusBadge(product)}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-gray-400">
                    #{String(product.sku || product.id.slice(0, 8)).toUpperCase()}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {categoryIdToName.get(product.category_id || '') || t('products.table.noCategory')}
                  </div>
                </button>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="font-semibold tabular-nums text-gray-900">€{product.price.toFixed(2)}</span>
                  <div className="relative">
                    <TableActionButton
                      variant="icon"
                      icon={MoreVertical}
                      type="button"
                      onClick={() => setOpenMenuProductId(openMenuProductId === product.id ? null : product.id)}
                      aria-haspopup="menu"
                      aria-expanded={openMenuProductId === product.id}
                      title={t('products.table.actionsTitle')}
                    />
                    {openMenuProductId === product.id && (
                      <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg" role="menu">
                        <MenuRow
                          label={t('products.table.view')}
                          onClick={() => {
                            setViewingProduct(product);
                            setOpenMenuProductId(null);
                          }}
                        />
                        <MenuRow
                          label={t('products.table.edit')}
                          onClick={() => {
                            handleEditProduct(product);
                            setOpenMenuProductId(null);
                          }}
                        />
                        <MenuRow
                          variant="danger"
                          label={t('products.table.delete')}
                          onClick={() => {
                            setOpenMenuProductId(null);
                            handleDeleteProduct(product.id);
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          className={`flex flex-col items-stretch justify-between gap-4 border-t border-gray-100 py-3 sm:flex-row sm:items-center ${layoutClasses.contentInsetX}`}
        >
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
            <label htmlFor="products-page-size" className="whitespace-nowrap">
              {t('products.table.rowsPerPage')}
            </label>
            <select
              id="products-page-size"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="ds2-control-radius-lg box-border h-9 border border-gray-200 bg-white px-2 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {[10, 25, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-center gap-1 sm:justify-end">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="flex h-9 w-9 items-center justify-center rounded-2xl text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t('products.table.prevPage')}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            {pageNumbers.map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setCurrentPage(num)}
                className={`flex min-h-9 min-w-9 items-center justify-center px-2 text-sm transition-colors ${
                  num === currentPage
                    ? 'rounded-lg border border-green-500 bg-green-50 font-semibold text-green-700'
                    : 'rounded-md font-medium text-gray-500 hover:bg-gray-100'
                }`}
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="flex h-9 w-9 items-center justify-center rounded-2xl text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t('products.table.nextPage')}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <PurchaseReceiptImportDialog
        open={showPurchaseImport}
        onClose={() => setShowPurchaseImport(false)}
        onApplied={refreshData}
      />

      {deletingProductId && (
        <ConfirmDialog
          tone="danger"
          title={t('products.confirm.deleteTitle')}
          message={t('products.confirm.deleteProductMessage')}
          cancelLabel={t('common.cancel')}
          confirmLabel={t('products.confirm.deleteCta')}
          onCancel={() => setDeletingProductId(null)}
          onConfirm={() => void confirmDeleteProduct()}
        />
      )}

      <ProductWizard
        isOpen={showProductWizard}
        onClose={() => { setShowProductWizard(false); setEditingProduct(null); }}
        product={editingProduct}
        onSuccess={() => { setShowProductWizard(false); setEditingProduct(null); void refreshData(); }}
      />

      {viewingProduct && (() => {
        const productBody = (
              <div className="overflow-y-auto flex-1 min-h-0 p-6 space-y-6">
                {viewingProduct.image_url && (
                  <div>
                    <DialogSectionTitle className="mb-4 text-lg">
                      {t('products.viewModal.productImage')}
                    </DialogSectionTitle>
                    <div className="max-w-sm">
                      <div className="aspect-square rounded-2xl overflow-hidden border border-gray-200">
                        <img
                          src={viewingProduct.image_url}
                          alt={viewingProduct.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <DialogSectionTitle className="mb-4 text-lg">{t('products.viewModal.basicInfo')}</DialogSectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <DialogInfoCard label={t('products.viewModal.productName')} value={viewingProduct.name} />
                    <DialogInfoCard label={t('products.viewModal.sku')} value={<span className="font-mono">{viewingProduct.sku}</span>} />
                    <DialogInfoCard
                      label={t('products.viewModal.category')}
                      value={categoryIdToName.get(viewingProduct.category_id || '') || t('products.table.noCategory')}
                    />
                    <DialogInfoCard
                      label={t('products.viewModal.status')}
                      value={
                        <span
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${viewingProduct.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
                        >
                          {viewingProduct.is_active
                            ? t('products.status.inStock')
                            : t('products.status.inactive')}
                        </span>
                      }
                    />
                  </div>
                  {viewingProduct.description && (
                    <div className="mt-4">
                      <DialogInfoCard
                        label={t('products.viewModal.description')}
                        value={<span className="font-normal">{viewingProduct.description}</span>}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <DialogSectionTitle className="mb-4 text-lg">{t('products.viewModal.pricingInfo')}</DialogSectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <DialogInfoCard label={t('products.viewModal.costPrice')} value={<span className="text-xl">€{viewingProduct.cost.toFixed(2)}</span>} />
                    <DialogInfoCard label={t('products.viewModal.sellingPriceInclVat')} value={<span className="text-xl">€{viewingProduct.price.toFixed(2)}</span>} />
                    <DialogInfoCard label={t('products.viewModal.vatRate')} value={<span className="text-xl">{(viewingProduct.iva_rate * 100).toFixed(0)}%</span>} />
                  </div>
                  <div className="mt-4 p-4 bg-green-50 rounded-xl border border-green-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <span className="block text-sm font-medium text-green-700 mb-1">
                          {t('products.viewModal.profitMargin')}
                        </span>
                        <p className="text-green-900 font-bold">
                          €{(viewingProduct.price - viewingProduct.cost).toFixed(2)} (
                          {viewingProduct.cost > 0
                            ? (
                              ((viewingProduct.price - viewingProduct.cost) / viewingProduct.cost) *
                              100
                            ).toFixed(1)
                            : '0.0'}
                          %)
                        </p>
                      </div>
                      <div>
                        <span className="block text-sm font-medium text-green-700 mb-1">
                          {t('products.viewModal.priceWithoutVat')}
                        </span>
                        <p className="text-green-900 font-bold">
                          €{(viewingProduct.price / (1 + viewingProduct.iva_rate)).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/*
                  AGENTS: Do not delete — stock info view-modal section preserved for re-enable. Remove only if explicitly requested by a human.
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-4">{t('products.viewModal.stockInfo')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-neutral-50 rounded-xl p-4">
                      <span className="block text-sm font-medium text-gray-500 mb-1">
                        {t('products.viewModal.currentStock')}
                      </span>
                      <p className="text-gray-900 font-bold text-2xl">
                        {viewingProduct.stock}{' '}
                        <span className="text-base font-normal text-gray-500">
                          {t('products.viewModal.units')}
                        </span>
                      </p>
                    </div>
                    <div className="bg-neutral-50 rounded-xl p-4">
                      <span className="block text-sm font-medium text-gray-500 mb-1">
                        {t('products.viewModal.minimumStock')}
                      </span>
                      <p className="text-gray-900 font-bold">
                        {viewingProduct.min_stock} {t('products.viewModal.units')}
                      </p>
                    </div>
                    <div className="bg-neutral-50 rounded-xl p-4">
                      <span className="block text-sm font-medium text-gray-500 mb-1">
                        {t('products.viewModal.stockStatus')}
                      </span>
                      {getStatusBadge(viewingProduct)}
                    </div>
                  </div>
                  <div className="mt-4 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <span className="block text-sm font-medium text-emerald-700 mb-1">
                          {t('products.viewModal.stockValueCost')}
                        </span>
                        <p className="text-emerald-900 font-bold">
                          €{(viewingProduct.cost * viewingProduct.stock).toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <span className="block text-sm font-medium text-emerald-700 mb-1">
                          {t('products.viewModal.stockValueSelling')}
                        </span>
                        <p className="text-emerald-900 font-bold">
                          €{(viewingProduct.price * viewingProduct.stock).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                */}

                <div>
                  <DialogSectionTitle className="mb-4 text-lg">
                    {t('products.viewModal.additionalInfo')}
                  </DialogSectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/*
                      AGENTS: Do not delete — track-inventory view field preserved for re-enable. Remove only if explicitly requested by a human.
                    <div className="bg-neutral-50 rounded-xl p-4">
                      <span className="block text-sm font-medium text-gray-500 mb-1">
                        {t('settings.pos.trackInventory')}
                      </span>
                      <p className="text-gray-900 font-semibold">
                        {catalogTracksInventory ? t('products.viewModal.yes') : t('products.viewModal.no')}
                      </p>
                    </div>
                    */}
                    <DialogInfoCard label={t('products.viewModal.displayOrder')} value={viewingProduct.display_order} />
                  </div>
                </div>
              </div>
        );

        const editButton = (
          <AdminActionButton
            variant="primary"
            type="button"
            icon={Edit}
            label={t('products.viewModal.editProduct')}
            onClick={() => {
              setViewingProduct(null);
              handleEditProduct(viewingProduct);
            }}
            className="min-h-touch ds2-modal-primary-action shadow-lg"
          />
        );

        if (appliedDialogStyle) {
          const buttons = dialogButtonClasses(appliedDialogStyle);
          return (
            <ConfiguredDialogShell
              config={appliedDialogStyle}
              title={t('products.viewModal.title')}
              icon={Package}
              onClose={() => setViewingProduct(null)}
              footer={
                <div className={buttons.container}>
                  {editButton}
                  <button type="button" onClick={() => setViewingProduct(null)} className={buttons.secondary}>
                    {t('products.viewModal.close')}
                  </button>
                </div>
              }
            >
              {productBody}
            </ConfiguredDialogShell>
          );
        }

        return (
          <>
            <div
              className="fixed inset-0 bg-black/40 z-40"
              aria-hidden
              onClick={() => setViewingProduct(null)}
            />

            <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl z-50 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white p-6 rounded-t-2xl shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-white/20 rounded-xl">
                      <Package className="w-6 h-6" />
                    </div>
                    <h2 className="text-xl font-bold">{t('products.viewModal.title')}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewingProduct(null)}
                    className="min-h-touch-sm min-w-touch-sm p-2 hover:bg-white/20 rounded-xl transition-colors flex items-center justify-center"
                    aria-label={t('common.close')}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {productBody}

              <div className="bg-neutral-50 px-6 py-4 rounded-b-2xl border-t border-gray-100 shrink-0">
                <div className="flex justify-between items-center gap-4 flex-wrap">
                  {editButton}
                  <button
                    type="button"
                    onClick={() => setViewingProduct(null)}
                    className="min-h-touch px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-all font-semibold"
                  >
                    {t('products.viewModal.close')}
                  </button>
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
};

export default ProductsInner;
