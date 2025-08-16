import React, { useState, useEffect, useMemo } from 'react';
import { Package, Search, X, ChevronDown, ChevronRight, Check, Minus } from 'lucide-react';
import { PrinterStation } from '../types/printerWorkflow';
import { printerWorkflowService } from '../services/printerWorkflowService';
import { useProducts } from '../contexts/ProductsContext';

interface ProductAssignmentManagerProps {
  station: PrinterStation;
  onStationUpdate: (station: PrinterStation) => void;
}

interface CategoryWithProducts {
  id: string;
  name: string;
  products: Array<{
    id: string;
    name: string;
    sku: string;
    price: number;
    isAssigned: boolean;
  }>;
  isExpanded: boolean;
  assignedCount: number;
  totalCount: number;
}

const ProductAssignmentManager: React.FC<ProductAssignmentManagerProps> = ({ 
  station, 
  onStationUpdate 
}) => {
  const { products, categories } = useProducts();
  const [productIds, setProductIds] = useState<string[]>(station.productIds || []);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    setProductIds(station.productIds || []);
  }, [station.productIds]);

  // Group products by category with search filtering
  const categorizedProducts = useMemo(() => {
    const grouped: CategoryWithProducts[] = [];
    
    // Get all categories, including a default one for products without category
    const allCategories = [
      ...categories,
      { id: 'uncategorized', name: 'Uncategorized', display_order: 999 }
    ];

    allCategories.forEach(category => {
      const categoryProducts = products
        .filter(product => 
          product.is_active && 
          (product.category_id === category.id || 
           (category.id === 'uncategorized' && !product.category_id))
        )
        .filter(product => 
          !searchTerm || 
          product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.sku.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .map(product => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          price: product.price,
          isAssigned: productIds.includes(product.id)
        }));

      if (categoryProducts.length > 0) {
        const assignedCount = categoryProducts.filter(p => p.isAssigned).length;
        
        grouped.push({
          id: category.id,
          name: category.name,
          products: categoryProducts,
          isExpanded: expandedCategories.has(category.id) || !!searchTerm,
          assignedCount,
          totalCount: categoryProducts.length
        });
      }
    });

    return grouped.sort((a, b) => a.name.localeCompare(b.name));
  }, [products, categories, productIds, searchTerm, expandedCategories]);

  const updateProductAssignment = (newProductIds: string[]) => {
    setProductIds(newProductIds);
    
    const updatedStation = { ...station, productIds: newProductIds };
    printerWorkflowService.saveStation(updatedStation);
    onStationUpdate(updatedStation);
  };

  const handleProductToggle = (productId: string) => {
    const newProductIds = productIds.includes(productId)
      ? productIds.filter(id => id !== productId)
      : [...productIds, productId];
    
    updateProductAssignment(newProductIds);
  };

  const handleCategoryToggle = (category: CategoryWithProducts) => {
    const categoryProductIds = category.products.map(p => p.id);
    const allAssigned = categoryProductIds.every(id => productIds.includes(id));
    
    let newProductIds: string[];
    if (allAssigned) {
      // Remove all products from this category
      newProductIds = productIds.filter(id => !categoryProductIds.includes(id));
    } else {
      // Add all products from this category
      newProductIds = [...new Set([...productIds, ...categoryProductIds])];
    }
    
    updateProductAssignment(newProductIds);
  };

  const toggleCategoryExpansion = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const getCategoryCheckboxState = (category: CategoryWithProducts) => {
    const { assignedCount, totalCount } = category;
    if (assignedCount === 0) return 'none';
    if (assignedCount === totalCount) return 'all';
    return 'partial';
  };

  const totalAssignedProducts = productIds.length;
  const totalAvailableProducts = products.filter(p => p.is_active).length;

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium text-gray-900 mb-2">Product Assignment</h4>
        <p className="text-sm text-gray-600 mb-3">
          {station.categoryId === 'receipt' 
            ? 'Receipt printers automatically print for all orders.'
            : 'Select products that should print to this station by category.'
          }
        </p>
      </div>

      {station.categoryId !== 'receipt' && (
        <>
          {/* Summary Stats */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-900 font-medium">
                {totalAssignedProducts} of {totalAvailableProducts} products assigned
              </span>
              {totalAssignedProducts > 0 && (
                <button
                  onClick={() => updateProductAssignment([])}
                  className="text-blue-700 hover:text-blue-900 underline"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search products..."
              className="w-full px-3 py-2 pl-9 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1"
              >
                <X className="h-3 w-3 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>

          {/* Categories and Products Tree */}
          <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
            {categorizedProducts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>{searchTerm ? 'No products found' : 'No products available'}</p>
              </div>
            ) : (
              categorizedProducts.map((category) => {
                const checkboxState = getCategoryCheckboxState(category);
                
                return (
                  <div key={category.id} className="border-b border-gray-100 last:border-b-0">
                    {/* Category Header */}
                    <div className="flex items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100">
                      <button
                        onClick={() => toggleCategoryExpansion(category.id)}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        {category.isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-600" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-600" />
                        )}
                      </button>
                      
                      <button
                        onClick={() => handleCategoryToggle(category)}
                        className="flex items-center gap-2 flex-1 text-left"
                      >
                        <div className={`w-4 h-4 border rounded flex items-center justify-center ${
                          checkboxState === 'all' 
                            ? 'bg-blue-600 border-blue-600 text-white' 
                            : checkboxState === 'partial'
                            ? 'bg-blue-100 border-blue-400'
                            : 'border-gray-300'
                        }`}>
                          {checkboxState === 'all' && <Check className="h-3 w-3" />}
                          {checkboxState === 'partial' && <Minus className="h-3 w-3 text-blue-600" />}
                        </div>
                        
                        <span className="font-medium text-gray-900">{category.name}</span>
                        <span className="text-sm text-gray-500">
                          ({category.assignedCount}/{category.totalCount})
                        </span>
                      </button>
                    </div>

                    {/* Products List */}
                    {category.isExpanded && (
                      <div className="bg-white">
                        {category.products.map((product) => (
                          <div
                            key={product.id}
                            className="flex items-center gap-3 p-3 pl-8 hover:bg-gray-50 border-b border-gray-50 last:border-b-0"
                          >
                            <button
                              onClick={() => handleProductToggle(product.id)}
                              className="flex items-center gap-3 flex-1 text-left"
                            >
                              <div className={`w-4 h-4 border rounded flex items-center justify-center ${
                                product.isAssigned 
                                  ? 'bg-blue-600 border-blue-600 text-white' 
                                  : 'border-gray-300'
                              }`}>
                                {product.isAssigned && <Check className="h-3 w-3" />}
                              </div>
                              
                              <Package className="h-4 w-4 text-gray-400" />
                              
                              <div className="flex-1">
                                <div className="font-medium text-gray-900">{product.name}</div>
                                <div className="text-sm text-gray-500">SKU: {product.sku}</div>
                              </div>
                              
                              <div className="text-sm text-gray-700 font-medium">
                                €{product.price.toFixed(2)}
                              </div>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Bulk Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                const allProductIds = categorizedProducts
                  .flatMap(cat => cat.products.map(p => p.id));
                updateProductAssignment(allProductIds);
              }}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              Select All {searchTerm ? 'Filtered' : ''} Products
            </button>
            <button
              onClick={() => updateProductAssignment([])}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              Clear All Selections
            </button>
          </div>
        </>
      )}

      {/* Info Box */}
      
    </div>
  );
};

export default ProductAssignmentManager;
