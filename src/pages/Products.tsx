import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Package,
  AlertTriangle,
  Eye,
  BarChart3,
  Loader2,
  Tag,
  X,
  DollarSign,
  TrendingUp
} from 'lucide-react';
import { useProducts } from '../contexts/ProductsContext';
import { LocalProduct, LocalCategory, calculateStockStatus } from '../types/supabase';
import ProductForm from '../components/ProductForm';
import CategoryForm from '../components/CategoryForm';

const Products: React.FC = () => {
  const {
    products,
    categories,
    isLoading,
    error,
    searchProducts,
    filterProducts,
    deleteProduct,
    deleteCategory
  } = useProducts();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [filteredProducts, setFilteredProducts] = useState<LocalProduct[]>([]);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<LocalProduct | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<LocalCategory | null>(null);
  const [viewingProduct, setViewingProduct] = useState<LocalProduct | null>(null);
  const [showCategoryAlert, setShowCategoryAlert] = useState(false);

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

      setFilteredProducts(result);
    };

    applyFilters();
  }, [products, searchTerm, selectedCategory, searchProducts]);

  // Get category options for filter dropdown
  const categoryOptions = [
    { value: 'all', label: 'All Categories' },
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
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await deleteProduct(productId);
      } catch (error) {
        console.error('Failed to delete product:', error);
      }
    }
  };

  // Handle delete category
  const handleDeleteCategory = async (categoryId: string, categoryName: string) => {
    // Check if category has products
    const productsInCategory = products.filter(p => p.category_id === categoryId && p.is_active && !p.deleted_at);

    if (productsInCategory.length > 0) {
      alert(`Cannot delete category "${categoryName}" because it contains ${productsInCategory.length} products. Please move or delete these products first.`);
      return;
    }

    if (window.confirm(`Are you sure you want to delete the category "${categoryName}"? This action cannot be undone.`)) {
      try {
        await deleteCategory(categoryId);
      } catch (error) {
        console.error('Failed to delete category:', error);
        alert('Failed to delete category. Please try again.');
      }
    }
  };

  // Handle create product
  const handleCreateProduct = () => {
    setEditingProduct(null);
    setShowProductForm(true);
  };

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

  // Handle create category
  const handleCreateCategory = () => {
    setEditingCategory(null);
    setShowCategoryForm(true);
  };

  // Handle edit category
  const handleEditCategory = (category: LocalCategory) => {
    setEditingCategory(category);
    setShowCategoryForm(true);
  };

  // Handle category form success
  const handleCategoryFormSuccess = () => {
    setShowCategoryForm(false);
    setEditingCategory(null);
    // Categories will be automatically updated via context
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">Loading products...</span>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Product Management</h1>
          <p className="text-gray-600 mt-1">Manage your inventory and product catalog</p>
        </div>
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
              className={`min-h-[60px] px-8 py-4 rounded-lg font-semibold transition-all flex items-center space-x-3 shadow-lg ${
                categories.length === 0
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-700 hover:to-blue-600 hover:scale-105 active:scale-95'
              }`}
            >
              <Plus className="w-6 h-6" />
              <span>Add Product</span>
            </button>
            {showCategoryAlert && categories.length === 0 && (
               <div className="absolute top-full right-0 mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg shadow-lg z-10 min-w-[280px] max-w-[320px]">
                 <div className="flex items-start space-x-2">
                   <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                   <span className="text-sm text-yellow-800 leading-relaxed">
                     Please create a category first before adding products.
                   </span>
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
            title: 'Total Products',
            value: products.filter(p => p.is_active && !p.deleted_at).length.toString(),
            icon: Package,
            color: 'bg-blue-500'
          },
          {
            title: 'Low Stock Items',
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
            title: 'Categories',
            value: categories.filter(c => c.is_active && !c.deleted_at).length.toString(),
            icon: Tag,
            color: 'bg-purple-500'
          },
          {
            title: 'Total Cost',
            value: `€${products
              .filter(p => p.is_active && !p.deleted_at)
              .reduce((sum, p) => sum + (p.cost * p.stock), 0)
              .toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
            icon: DollarSign,
            color: 'bg-orange-500'
          },
          {
            title: 'Total Value',
            value: `€${products
              .filter(p => p.is_active && !p.deleted_at)
              .reduce((sum, p) => sum + (p.price * p.stock), 0)
              .toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
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

      {/* Categories Management Section */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-800 flex items-center space-x-2">
              <Tag className="w-5 h-5 text-purple-600" />
              <span>Categories</span>
            </h2>
            <span className="text-sm text-gray-500">
              {categories.filter(c => !c.deleted_at).length} total categories ({categories.filter(c => c.is_active && !c.deleted_at).length} active)
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
                  p.category_id === category.id &&
                  p.is_active &&
                  !p.deleted_at
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
                    {/* Inactive Badge */}
                    {!category.is_active && (
                      <div className="absolute top-2 left-2 px-2 py-1 bg-gray-500 text-white text-xs rounded-full font-medium">
                        Inactive
                      </div>
                    )}

                    {/* Category Visual */}
                    <div className={`w-full h-20 rounded-lg bg-gradient-to-r ${category.color} flex items-center justify-center mb-3 ${!category.is_active ? 'opacity-70' : ''
                      }`}>
                      <div className="text-white text-2xl">
                        {category.icon === 'coffee' && <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path d="M7 11h1v1H7v-1zm2 0h1v1H9v-1zm-5 0h1v1H4v-1zm11.5-7C16.33 4 17 3.33 17 2.5S16.33 1 15.5 1 14 1.67 14 2.5 14.67 4 15.5 4z" /></svg>}
                        {category.icon === 'milk' && <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path d="M7 11h1v1H7v-1zm2 0h1v1H9v-1zm-5 0h1v1H4v-1zm11.5-7C16.33 4 17 3.33 17 2.5S16.33 1 15.5 1 14 1.67 14 2.5 14.67 4 15.5 4z" /></svg>}
                        {category.icon === 'cake' && <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path d="M7 11h1v1H7v-1zm2 0h1v1H9v-1zm-5 0h1v1H4v-1zm11.5-7C16.33 4 17 3.33 17 2.5S16.33 1 15.5 1 14 1.67 14 2.5 14.67 4 15.5 4z" /></svg>}
                        {category.icon === 'candy' && <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path d="M7 11h1v1H7v-1zm2 0h1v1H9v-1zm-5 0h1v1H4v-1zm11.5-7C16.33 4 17 3.33 17 2.5S16.33 1 15.5 1 14 1.67 14 2.5 14.67 4 15.5 4z" /></svg>}
                        {(!['coffee', 'milk', 'cake', 'candy'].includes(category.icon)) && <Package className="w-8 h-8" />}
                      </div>
                    </div>

                    {/* Category Info */}
                    <div className="space-y-2">
                      <h3 className={`font-semibold truncate ${category.is_active ? 'text-gray-800' : 'text-gray-500'
                        }`}>{category.name}</h3>
                      <p className={`text-sm line-clamp-2 ${category.is_active ? 'text-gray-600' : 'text-gray-400'
                        }`}>{category.description || 'No description'}</p>
                      <div className={`flex items-center justify-between text-xs ${category.is_active ? 'text-gray-500' : 'text-gray-400'
                        }`}>
                        <span>{productCount} products</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCategory(category.id, category.name);
                          }}
                          className="min-h-[44px] min-w-[44px] p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Category"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

            {/* Add Category Card */}
            <button
              onClick={handleCreateCategory}
              className="group border-2 border-dashed border-gray-300 rounded-lg p-6 h-full min-h-[140px] flex flex-col items-center justify-center hover:border-purple-400 hover:bg-purple-50 transition-all hover:scale-105 active:scale-95 shadow-md hover:shadow-lg"
            >
              <Plus className="w-10 h-10 text-gray-400 group-hover:text-purple-600 mb-3" />
              <span className="text-base font-semibold text-gray-600 group-hover:text-purple-600">Add Category</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {categoryOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <button className="min-h-[44px] flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all hover:scale-105 active:scale-95 font-medium">
              <Filter className="w-5 h-5" />
              <span>Filters</span>
            </button>
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center space-x-2">
            <Package className="w-5 h-5 text-blue-600" />
            <span>Products</span>
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Product</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Price</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Stock</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      {/* Product Image */}
                      <div className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback to placeholder if image fails to load
                              const target = e.target as HTMLImageElement;
                              target.src = '/placeholder-product.svg';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                            <Package className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                      </div>
                      
                      {/* Product Info */}
                      <div>
                        <div className="font-semibold text-gray-800">{product.name}</div>
                        <div className="text-sm text-gray-500">SKU: {product.sku}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">
                      {product.category_name || 'No Category'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-semibold text-gray-800">€{product.price.toFixed(2)}</div>
                      <div className="text-sm text-gray-500">Cost: €{product.cost.toFixed(2)}</div>
                      <div className="text-xs text-gray-400">IVA: {(product.iva_rate * 100).toFixed(0)}%</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-semibold text-gray-800">{product.stock} units</div>
                      <div className="text-sm text-gray-500">Min: {product.min_stock}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(product)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setViewingProduct(product)}
                        className="min-h-[44px] min-w-[44px] p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all hover:scale-105 active:scale-95 shadow-md"
                        title="View Product"
                      >
                        <Eye className="w-5 h-5 mx-auto" />
                      </button>
                      <button
                        className="min-h-[44px] min-w-[44px] p-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-all hover:scale-105 active:scale-95 shadow-md"
                        onClick={() => handleEditProduct(product)}
                        title="Edit Product"
                      >
                        <Edit className="w-5 h-5 mx-auto" />
                      </button>
                      <button
                        className="min-h-[44px] min-w-[44px] p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all hover:scale-105 active:scale-95 shadow-md"
                        onClick={() => handleDeleteProduct(product.id)}
                        title="Delete Product"
                      >
                        <Trash2 className="w-5 h-5 mx-auto" />
                      </button>
                    </div>
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

        {/* Category Form Modal */}
        <CategoryForm
          isOpen={showCategoryForm}
          onClose={() => setShowCategoryForm(false)}
          category={editingCategory}
          onSuccess={handleCategoryFormSuccess}
        />

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
                    <h2 className="text-xl font-bold">Product Details</h2>
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
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Product Image</h3>
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
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Basic Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Product Name</label>
                      <p className="text-gray-900 font-semibold">{viewingProduct.name}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">SKU</label>
                      <p className="text-gray-900">{viewingProduct.sku}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Category</label>
                      <p className="text-gray-900">{viewingProduct.category_name || 'No Category'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Status</label>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${viewingProduct.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                        {viewingProduct.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  {viewingProduct.description && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
                      <p className="text-gray-900">{viewingProduct.description}</p>
                    </div>
                  )}
                </div>

                {/* Pricing Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Pricing Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Cost Price</label>
                      <p className="text-gray-900 font-semibold">€{viewingProduct.cost.toFixed(2)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Selling Price (incl. IVA)</label>
                      <p className="text-gray-900 font-semibold">€{viewingProduct.price.toFixed(2)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">IVA Rate</label>
                      <p className="text-gray-900">{(viewingProduct.iva_rate * 100).toFixed(0)}%</p>
                    </div>
                  </div>
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Profit Margin</label>
                        <p className="text-gray-900 font-semibold">
                          €{(viewingProduct.price - viewingProduct.cost).toFixed(2)} ({(((viewingProduct.price - viewingProduct.cost) / viewingProduct.cost) * 100).toFixed(1)}%)
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Price without IVA</label>
                        <p className="text-gray-900 font-semibold">
                          €{(viewingProduct.price / (1 + viewingProduct.iva_rate)).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stock Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Stock Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Current Stock</label>
                      <p className="text-gray-900 font-semibold text-2xl">{viewingProduct.stock} units</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Minimum Stock</label>
                      <p className="text-gray-900">{viewingProduct.min_stock} units</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Stock Status</label>
                      {getStatusBadge(viewingProduct)}
                    </div>
                  </div>
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Stock Value (Cost)</label>
                        <p className="text-gray-900 font-semibold">
                          €{(viewingProduct.cost * viewingProduct.stock).toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Stock Value (Selling)</label>
                        <p className="text-gray-900 font-semibold">
                          €{(viewingProduct.price * viewingProduct.stock).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Additional Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Track Stock</label>
                      <p className="text-gray-900">{viewingProduct.track_stock ? 'Yes' : 'No'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Display Order</label>
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
                    <span>Edit Product</span>
                  </button>
                  <button
                    onClick={() => setViewingProduct(null)}
                    className="min-h-[50px] px-6 py-3 bg-gray-400 text-white rounded-lg hover:bg-gray-500 transition-all hover:scale-105 active:scale-95 font-semibold shadow-lg"
                  >
                    Close
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