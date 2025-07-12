import React, { useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Package,
  AlertTriangle,
  Eye,
  BarChart3
} from 'lucide-react';

const Products: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const mockProducts = [
    {
      id: '1',
      name: 'Premium Coffee Beans',
      sku: 'COF001',
      category: 'Beverages',
      price: 12.50,
      cost: 8.00,
      stock: 45,
      minStock: 20,
      status: 'active',
      supplier: 'Coffee Roasters Ltd',
      lastUpdated: '2024-01-15'
    },
    {
      id: '2',
      name: 'Organic Milk',
      sku: 'MLK001',
      category: 'Dairy',
      price: 2.80,
      cost: 1.50,
      stock: 8,
      minStock: 15,
      status: 'low_stock',
      supplier: 'Organic Farms Co',
      lastUpdated: '2024-01-14'
    },
    {
      id: '3',
      name: 'Artisan Bread',
      sku: 'BRD001',
      category: 'Bakery',
      price: 4.50,
      cost: 2.00,
      stock: 12,
      minStock: 5,
      status: 'active',
      supplier: 'Local Bakery',
      lastUpdated: '2024-01-15'
    },
    {
      id: '4',
      name: 'Dark Chocolate Bar',
      sku: 'CHC001',
      category: 'Confectionery',
      price: 6.90,
      cost: 3.50,
      stock: 35,
      minStock: 25,
      status: 'active',
      supplier: 'Sweet Treats Inc',
      lastUpdated: '2024-01-13'
    }
  ];

  const categories = ['all', 'Beverages', 'Dairy', 'Bakery', 'Confectionery'];

  const filteredProducts = mockProducts.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getStatusBadge = (product: any) => {
    if (product.stock <= product.minStock) {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Product Management</h1>
          <p className="text-gray-600 mt-1">Manage your inventory and product catalog</p>
        </div>
        <button className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-6 py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-blue-600 transition-all flex items-center space-x-2 shadow-lg">
          <Plus className="w-5 h-5" />
          <span>Add Product</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { title: 'Total Products', value: '248', icon: Package, color: 'bg-blue-500' },
          { title: 'Low Stock Items', value: '12', icon: AlertTriangle, color: 'bg-red-500' },
          { title: 'Categories', value: '8', icon: Filter, color: 'bg-purple-500' },
          { title: 'Total Value', value: '€15,420', icon: BarChart3, color: 'bg-green-500' }
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
              {categories.map(category => (
                <option key={category} value={category}>
                  {category === 'all' ? 'All Categories' : category}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <button className="flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
              <Filter className="w-4 h-4" />
              <span>Filters</span>
            </button>
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
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
                    <div>
                      <div className="font-semibold text-gray-800">{product.name}</div>
                      <div className="text-sm text-gray-500">SKU: {product.sku}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">
                      {product.category}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-semibold text-gray-800">€{product.price.toFixed(2)}</div>
                      <div className="text-sm text-gray-500">Cost: €{product.cost.toFixed(2)}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-semibold text-gray-800">{product.stock} units</div>
                      <div className="text-sm text-gray-500">Min: {product.minStock}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(product)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Products;