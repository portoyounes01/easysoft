import React, { useState, useEffect, useMemo } from 'react';
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
  ArrowUpDown
} from 'lucide-react';
import { useProducts } from '../contexts/ProductsContext';
import { LocalProduct, calculateStockStatus } from '../types/supabase';
import ProductForm from '../components/ProductForm';
// Category management moved to Categories page
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';

const Products: React.FC = () => {
  const {
    products,
    categories,
    isLoading,
    error,
    searchProducts,
    deleteProduct
  } = useProducts();

  const { t } = useTranslation();
  const { language } = useLanguage();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [filteredProducts, setFilteredProducts] = useState<LocalProduct[]>([]);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<LocalProduct | null>(null);
  // Category form state removed (now handled in Categories page)
  const [viewingProduct, setViewingProduct] = useState<LocalProduct | null>(null);
  const [showCategoryAlert, setShowCategoryAlert] = useState(false);
  const [openMenuProductId, setOpenMenuProductId] = useState<string | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [sortOption, setSortOption] = useState<'name_asc' | 'name_desc'>('name_asc');

  // 3. Computed values
  const categoryIdToName = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach(cat => {
      if (!cat.deleted_at) {
        map.set(cat.id, cat.name);
      }
    });
    return map;
  }, [categories]);

  const getExtendedStatusBadge = (product: LocalProduct) => {
    if (!product.is_active) {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-800">
          <span>{t('products.status.inactive')}</span>
        </span>
      );
    }

    // Draft if missing key setup (no category or price is 0)
    if (!product.category_id || product.price === 0) {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
          <span>{t('products.status.draft')}</span>
        </span>
      );
    }

    const stockStatus = calculateStockStatus(product);
    if (stockStatus === 'out_of_stock') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <AlertTriangle className="w-3 h-3" />
          <span>{t('products.status.outOfStock')}</span>
        </span>
      );
    }
    if (stockStatus === 'low_stock') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
          <AlertTriangle className="w-3 h-3" />
          <span>{t('products.status.lowStock')}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">{t('products.status.inStock')}</span>
    );
  };

  // Filter products based on search and category
  useEffect(() => {
    const applyFilters = async () => {
      let result = products;

      if (searchTerm) {
        result = await searchProducts(searchTerm);
      }

      if (selectedCategory !== 'all') {
        result = result.filter(product => product.category_id === selectedCategory);
      }

      // Apply sorting
      if (sortOption === 'name_asc') {
        result = [...result].sort((a, b) => a.name.localeCompare(b.name));
      } else if (sortOption === 'name_desc') {
        result = [...result].sort((a, b) => b.name.localeCompare(a.name));
      }

      setFilteredProducts(result);
    };

    applyFilters();
  }, [products, searchTerm, selectedCategory, sortOption, searchProducts]);

  // Get category options for filter dropdown
  const categoryOptions = [
    { value: 'all', label: t('products.header.allCategories') },
    ...categories.filter(cat => cat.is_active).map(cat => ({
      value: cat.id,
      label: cat.name
    }))
  ];

  const getStatusBadge = (product: LocalProduct) => {
    const stockStatus = calculateStockStatus(product);

    if (stockStatus === 'out_of_stock') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <AlertTriangle className="w-3 h-3" />
          <span>Out of Stock</span>
        </span>
      );
    }

    if (stockStatus === 'low_stock') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
          <AlertTriangle className="w-3 h-3" />
          <span>Low Stock</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
        In Stock
      </span>
    );
  };

  // Handle delete product
  const handleDeleteProduct = async (productId: string) => {
    if (window.confirm(t('products.confirm.deleteProductMessage'))) {
      try {
        await deleteProduct(productId);
      } catch (error) {
        console.error('Failed to delete product:', error);
      }
    }
  };

  // Category delete/edit/create moved to Categories page

  // (unused helper removed)

  // Handle edit product
  const handleEditProduct = (product: LocalProduct) => {
    setEditingProduct(product);
    setShowProductForm(true);
  };

  // Handle form success
  const handleFormSuccess = () => {
    setShowProductForm(false);
    setEditingProduct(null);
    // Products will be automatically updated via context
  };

  // Category create/edit handled in Categories page

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">{t('common.loading', { defaultValue: 'Loading...' })}</span>
      </div>
    );
  }

  // Error state
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between w-full">
        {/* Left side: Search, Sort, Filter */}
        <div className="flex items-center space-x-4 flex-1">
          {/* Search */}
          <div className="flex-1 max-w-2xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder={t('products.header.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Sort */}
          <div className="relative">
            <button
              onClick={() => {
                setShowSortMenu(prev => !prev);
                setShowFilterMenu(false);
              }}
              className="min-h-[44px] flex items-center space-x-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-all font-medium"
            >
              <ArrowUpDown className="w-5 h-5" />
              <span>{t('products.header.sort')}</span>
            </button>
            {showSortMenu && (
              <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                <button
                  onClick={() => { setSortOption('name_asc'); setShowSortMenu(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${sortOption === 'name_asc' ? 'font-semibold' : ''}`}
                >
                  Name A→Z
                </button>
                <button
                  onClick={() => { setSortOption('name_desc'); setShowSortMenu(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${sortOption === 'name_desc' ? 'font-semibold' : ''}`}
                >
                  Name Z→A
                </button>
              </div>
            )}
          </div>

          {/* Filter */}
          <div className="relative">
            <button
              onClick={() => {
                setShowFilterMenu(prev => !prev);
                setShowSortMenu(false);
              }}
              className="min-h-[44px] flex items-center space-x-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-all font-medium"
            >
              <Filter className="w-5 h-5" />
              <span>{t('products.header.filter')}</span>
            </button>
            {showFilterMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-10 p-3 space-y-2">
                <label className="block text-xs font-semibold text-gray-600">{t('products.header.category')}</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {categoryOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Right side: Add Product */}
        <div className="flex items-center space-x-3">
          <div className="relative">
            <button
              onClick={() => {
                if (categories.length === 0) {
                  setShowCategoryAlert(true);
                  setTimeout(() => setShowCategoryAlert(false), 3000);
                } else {
                  setShowProductForm(true);
                }
              }}
              className={`min-h-[60px] px-8 py-4 rounded-lg font-semibold transition-all flex items-center space-x-3 shadow-lg ${categories.length === 0
                ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-700 hover:to-blue-600 hover:scale-105 active:scale-95'
                }`}
            >
              <Plus className="w-6 h-6" />
              <span>{t('products.header.addProduct')}</span>
            </button>
            {showCategoryAlert && categories.length === 0 && (
              <div className="absolute top-full right-0 mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg shadow-lg z-10 min-w-[280px] max-w-[320px]">
                <div className="flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-yellow-800 leading-relaxed">{t('products.header.createCategoryFirst')}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {[
          {
            title: t('products.stats.totalProducts'),
            value: products.filter(p => p.is_active && !p.deleted_at).length.toString(),
            icon: Package,
            color: 'bg-blue-500'
          },
          {
            title: t('products.stats.lowStockItems'),
            value: products.filter(p =>
              p.is_active &&
              !p.deleted_at &&
              p.track_stock &&
              p.stock <= p.min_stock
            ).length.toString(),
            icon: AlertTriangle,
            color: 'bg-red-500'
          },
          {
            title: t('products.stats.categories'),
            value: categories.filter(c => c.is_active && !c.deleted_at).length.toString(),
            icon: Tag,
            color: 'bg-purple-500'
          },
          {
            title: t('products.stats.totalCost'),
            value: `€${products
              .filter(p => p.is_active && !p.deleted_at)
              .reduce((sum, p) => sum + (p.cost * p.stock), 0)
              .toLocaleString(language?.startsWith('pt') ? 'pt-PT' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
            icon: DollarSign,
            color: 'bg-orange-500'
          },
          {
            title: t('products.stats.totalValue'),
            value: `€${products
              .filter(p => p.is_active && !p.deleted_at)
              .reduce((sum, p) => sum + (p.price * p.stock), 0)
              .toLocaleString(language?.startsWith('pt') ? 'pt-PT' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
            icon: TrendingUp,
            color: 'bg-green-500'
          }
        ].map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
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

      {/* Categories management moved to dedicated Categories page */}

      {/* Filters moved to header toolbar */}

      {/* Products Table */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center space-x-2">
            <Package className="w-5 h-5 text-blue-600" />
            <span>{t('products.table.title')}</span>
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('products.table.id')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('products.table.product')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('products.table.category')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('products.table.stock')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('products.table.price')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('products.table.status')}</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-600">#{product.id.slice(0, 8).toUpperCase()}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0 bg-gray-100 relative flex items-center justify-center">
                        <Package className="w-5 h-5 text-gray-400" />
                        {product.image_url && (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="absolute inset-0 w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.currentTarget as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-800">{product.name}</div>
                        {product.description && (
                          <div className="text-xs text-gray-500 line-clamp-1">{product.description}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">
                      {categoryIdToName.get(product.category_id || '') || t('products.table.noCategory')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-semibold text-gray-800">{product.stock}</div>
                      <div className="text-xs text-gray-500">{t('products.table.min')} {product.min_stock}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-semibold text-gray-800">€{product.price.toFixed(2)}</div>
                    <div className="text-xs text-gray-500">{t('products.table.vat')} {(product.iva_rate * 100).toFixed(0)}%</div>
                  </td>
                  <td className="px-6 py-4">{getExtendedStatusBadge(product)}</td>
                  <td className="px-6 py-4 text-right relative">
                    <button
                      onClick={() => setOpenMenuProductId(openMenuProductId === product.id ? null : product.id)}
                      className="min-h-[44px] min-w-[44px] p-2 hover:bg-gray-100 rounded-lg transition-colors inline-flex items-center justify-center"
                      title={t('products.table.actionsTitle')}
                    >
                      <MoreVertical className="w-5 h-5 text-gray-600" />
                    </button>
                    {openMenuProductId === product.id && (
                      <div className="absolute right-4 mt-2 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                        <button
                          onClick={() => {
                            setViewingProduct(product);
                            setOpenMenuProductId(null);
                          }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                        >
                          {t('products.table.view')}
                        </button>
                        <button
                          onClick={() => {
                            handleEditProduct(product);
                            setOpenMenuProductId(null);
                          }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                        >
                          {t('products.table.edit')}
                        </button>
                        <button
                          onClick={() => {
                            setOpenMenuProductId(null);
                            handleDeleteProduct(product.id);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
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

        {/* Product Form Modal */}
        <ProductForm
          isOpen={showProductForm}
          onClose={() => setShowProductForm(false)}
          product={editingProduct}
          onSuccess={handleFormSuccess}
        />

        {/* Category form modal moved to Categories page */}

        {/* Product View Modal */}
        {viewingProduct && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black bg-opacity-30 z-40" onClick={() => setViewingProduct(null)} />

            {/* Modal */}
            <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl z-50 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white p-6 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Package className="w-6 h-6" />
                    <h2 className="text-xl font-bold">{t('products.viewModal.title')}</h2>
                  </div>
                  <button
                    onClick={() => setViewingProduct(null)}
                    className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Product Image */}
                {viewingProduct.image_url && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('products.viewModal.productImage')}</h3>
                    <div className="max-w-sm">
                      <div className="aspect-square rounded-lg overflow-hidden border border-gray-200">
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

                {/* Basic Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('products.viewModal.basicInfo')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">{t('products.viewModal.productName')}</label>
                      <p className="text-gray-900 font-semibold">{viewingProduct.name}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">{t('products.viewModal.sku')}</label>
                      <p className="text-gray-900">{viewingProduct.sku}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">{t('products.viewModal.category')}</label>
                      <p className="text-gray-900">{categoryIdToName.get(viewingProduct.category_id || '') || t('products.table.noCategory')}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">{t('products.viewModal.status')}</label>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${viewingProduct.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                        {viewingProduct.is_active ? t('products.status.inStock') : t('products.status.inactive')}
                      </span>
                    </div>
                  </div>
                  {viewingProduct.description && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-600 mb-1">{t('products.viewModal.description')}</label>
                      <p className="text-gray-900">{viewingProduct.description}</p>
                    </div>
                  )}
                </div>

                {/* Pricing Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('products.viewModal.pricingInfo')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">{t('products.viewModal.costPrice')}</label>
                      <p className="text-gray-900 font-semibold">€{viewingProduct.cost.toFixed(2)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">{t('products.viewModal.sellingPriceInclVat')}</label>
                      <p className="text-gray-900 font-semibold">€{viewingProduct.price.toFixed(2)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">{t('products.viewModal.vatRate')}</label>
                      <p className="text-gray-900">{(viewingProduct.iva_rate * 100).toFixed(0)}%</p>
                    </div>
                  </div>
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">{t('products.viewModal.profitMargin')}</label>
                        <p className="text-gray-900 font-semibold">
                          €{(viewingProduct.price - viewingProduct.cost).toFixed(2)} ({(((viewingProduct.price - viewingProduct.cost) / viewingProduct.cost) * 100).toFixed(1)}%)
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">{t('products.viewModal.priceWithoutVat')}</label>
                        <p className="text-gray-900 font-semibold">
                          €{(viewingProduct.price / (1 + viewingProduct.iva_rate)).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stock Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('products.viewModal.stockInfo')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">{t('products.viewModal.currentStock')}</label>
                      <p className="text-gray-900 font-semibold text-2xl">{viewingProduct.stock} {t('products.viewModal.units')}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">{t('products.viewModal.minimumStock')}</label>
                      <p className="text-gray-900">{viewingProduct.min_stock} units</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">{t('products.viewModal.stockStatus')}</label>
                      {getStatusBadge(viewingProduct)}
                    </div>
                  </div>
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">{t('products.viewModal.stockValueCost')}</label>
                        <p className="text-gray-900 font-semibold">
                          €{(viewingProduct.cost * viewingProduct.stock).toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">{t('products.viewModal.stockValueSelling')}</label>
                        <p className="text-gray-900 font-semibold">
                          €{(viewingProduct.price * viewingProduct.stock).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('products.viewModal.additionalInfo')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">{t('products.viewModal.trackStock')}</label>
                      <p className="text-gray-900">{viewingProduct.track_stock ? t('products.viewModal.yes') : t('products.viewModal.no')}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">{t('products.viewModal.displayOrder')}</label>
                      <p className="text-gray-900">{viewingProduct.display_order}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 rounded-b-xl">
                <div className="flex justify-between items-center space-x-4">
                  <button
                    onClick={() => {
                      setViewingProduct(null);
                      handleEditProduct(viewingProduct);
                    }}
                    className="min-h-[50px] px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all hover:scale-105 active:scale-95 flex items-center space-x-3 font-semibold shadow-lg"
                  >
                    <Edit className="w-5 h-5" />
                    <span>{t('products.viewModal.editProduct')}</span>
                  </button>
                  <button
                    onClick={() => setViewingProduct(null)}
                    className="min-h-[50px] px-6 py-3 bg-gray-400 text-white rounded-lg hover:bg-gray-500 transition-all hover:scale-105 active:scale-95 font-semibold shadow-lg"
                  >
                    {t('products.viewModal.close')}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Products;