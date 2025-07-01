import React, { useState } from 'react';
import { 
  ShoppingCart, 
  Search, 
  Plus, 
  Minus, 
  X, 
  CreditCard, 
  Banknote,
  User,
  Calculator
} from 'lucide-react';
import { usePOS } from '../contexts/POSContext';

// Mock product data
const mockProducts = [
  {
    id: '1',
    name: 'Premium Coffee Beans',
    description: 'High-quality arabica coffee beans',
    sku: 'COF001',
    category: 'Beverages',
    price: 12.50,
    cost: 8.00,
    stock: 45,
    minStock: 10,
    imageUrl: 'https://images.pexels.com/photos/894695/pexels-photo-894695.jpeg?auto=compress&cs=tinysrgb&w=300',
    isActive: true,
    taxRate: 0.23,
  },
  {
    id: '2',
    name: 'Organic Milk',
    description: 'Fresh organic whole milk',
    sku: 'MLK001',
    category: 'Dairy',
    price: 2.80,
    cost: 1.50,
    stock: 28,
    minStock: 15,
    imageUrl: 'https://images.pexels.com/photos/236010/pexels-photo-236010.jpeg?auto=compress&cs=tinysrgb&w=300',
    isActive: true,
    taxRate: 0.06,
  },
  {
    id: '3',
    name: 'Artisan Bread',
    description: 'Freshly baked sourdough bread',
    sku: 'BRD001',
    category: 'Bakery',
    price: 4.50,
    cost: 2.00,
    stock: 12,
    minStock: 5,
    imageUrl: 'https://images.pexels.com/photos/209206/pexels-photo-209206.jpeg?auto=compress&cs=tinysrgb&w=300',
    isActive: true,
    taxRate: 0.06,
  },
  {
    id: '4',
    name: 'Dark Chocolate Bar',
    description: '85% cocoa premium chocolate',
    sku: 'CHC001',
    category: 'Confectionery',
    price: 6.90,
    cost: 3.50,
    stock: 35,
    minStock: 25,
    imageUrl: 'https://images.pexels.com/photos/918327/pexels-photo-918327.jpeg?auto=compress&cs=tinysrgb&w=300',
    isActive: true,
    taxRate: 0.23,
  }
];

const POS: React.FC = () => {
  const { cart, addToCart, removeFromCart, updateQuantity, clearCart } = usePOS();
  const [searchTerm, setSearchTerm] = useState('');
  const [showPayment, setShowPayment] = useState(false);

  const filteredProducts = mockProducts.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const tax = cart.reduce((sum, item) => sum + (item.product.price * item.quantity * item.product.taxRate), 0);
  const total = subtotal + tax;

  const handlePayment = () => {
    setShowPayment(true);
  };

  return (
    <div className="h-full flex">
      {/* Product Grid */}
      <div className="flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Point of Sale</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search products by name or SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => addToCart(product)}
            >
              <div className="aspect-w-16 aspect-h-12">
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-full h-32 object-cover"
                />
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-gray-800 mb-1">{product.name}</h3>
                <p className="text-sm text-gray-600 mb-2">{product.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-green-600">€{product.price.toFixed(2)}</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500">Stock: {product.stock}</span>
                    <button className="bg-blue-500 hover:bg-blue-600 text-white p-1 rounded">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className="w-96 bg-white shadow-xl border-l border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800">Current Sale</h2>
            <div className="flex items-center space-x-1 bg-blue-50 px-2 py-1 rounded">
              <ShoppingCart className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-blue-600">{cart.length}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {cart.length === 0 ? (
            <div className="text-center py-8">
              <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No items in cart</p>
              <p className="text-sm text-gray-400">Start adding products to begin</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => (
                <div key={item.product.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-gray-800">{item.product.name}</h4>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        className="bg-gray-200 hover:bg-gray-300 p-1 rounded"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-center font-semibold">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        className="bg-gray-200 hover:bg-gray-300 p-1 rounded"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">€{item.product.price.toFixed(2)} each</p>
                      <p className="font-bold text-gray-800">€{(item.product.price * item.quantity).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="p-4 border-t border-gray-200 space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="text-gray-800">€{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tax:</span>
                <span className="text-gray-800">€{tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-2">
                <span>Total:</span>
                <span className="text-green-600">€{total.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={handlePayment}
                className="w-full bg-gradient-to-r from-green-600 to-green-500 text-white py-3 rounded-lg font-semibold hover:from-green-700 hover:to-green-600 transition-all flex items-center justify-center space-x-2"
              >
                <CreditCard className="w-5 h-5" />
                <span>Process Payment</span>
              </button>
              
              <div className="grid grid-cols-2 gap-2">
                <button className="bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg text-sm flex items-center justify-center space-x-1">
                  <User className="w-4 h-4" />
                  <span>Customer</span>
                </button>
                <button
                  onClick={clearCart}
                  className="bg-gray-500 hover:bg-gray-600 text-white py-2 rounded-lg text-sm"
                >
                  Clear Cart
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 max-w-md">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Process Payment</h3>
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-center text-green-600">
                  €{total.toFixed(2)}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <button className="bg-green-500 hover:bg-green-600 text-white py-3 rounded-lg flex items-center justify-center space-x-2">
                  <Banknote className="w-5 h-5" />
                  <span>Cash</span>
                </button>
                <button className="bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-lg flex items-center justify-center space-x-2">
                  <CreditCard className="w-5 h-5" />
                  <span>Card</span>
                </button>
              </div>
              
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowPayment(false)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 rounded-lg"
                >
                  Cancel
                </button>
                <button className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg">
                  Complete Sale
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default POS;