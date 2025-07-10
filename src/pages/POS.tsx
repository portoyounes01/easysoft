import React, { useState, useEffect } from 'react';
import {
  ShoppingCart,
  Plus,
  Minus,
  X,
  CreditCard,
  Banknote,
  User,
  Grid,
  Coffee,
  Milk,
  Cake,
  Candy,
  Percent,
  Calculator,
  LogOut,
  UserCircle,
  Search,
  Phone,
  Mail,
  Users,
  Save,
  MapPin,
  CreditCard as TaxIcon,
  Check,
  AlertCircle,
  Clock
} from 'lucide-react';
import { usePOS } from '../contexts/POSContext';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import VirtualNumpad from '../components/VirtualNumpad';
import VirtualKeyboard from '../components/VirtualKeyboard';
import { Category, Customer, Product } from '../types';
import { useTranslation } from 'react-i18next';

// Mock categories data
const mockCategories: Category[] = [
  {
    id: '1',
    name: 'Beverages',
    description: 'Coffee, tea, sodas, and other drinks',
    color: 'from-amber-500 to-orange-600',
    icon: 'coffee'
  },
  {
    id: '2',
    name: 'Dairy',
    description: 'Milk, cheese, yogurt, and dairy products',
    color: 'from-blue-500 to-cyan-600',
    icon: 'milk'
  },
  {
    id: '3',
    name: 'Bakery',
    description: 'Fresh bread, pastries, and baked goods',
    color: 'from-yellow-500 to-amber-600',
    icon: 'cake'
  },
  {
    id: '4',
    name: 'Confectionery',
    description: 'Chocolates, candies, and sweet treats',
    color: 'from-pink-500 to-rose-600',
    icon: 'candy'
  }
];

// Mock product data
const mockProducts = [
  {
    id: '1',
    name: 'Premium Coffee Beans',
    description: 'High-quality arabica coffee beans',
    sku: 'COF001',
    category: 'Beverages',
    categoryId: '1',
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
    categoryId: '2',
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
    categoryId: '3',
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
    categoryId: '4',
    price: 6.90,
    cost: 3.50,
    stock: 35,
    minStock: 25,
    imageUrl: 'https://images.pexels.com/photos/918327/pexels-photo-918327.jpeg?auto=compress&cs=tinysrgb&w=300',
    isActive: true,
    taxRate: 0.23,
  },
  {
    id: '5',
    name: 'Espresso Machine',
    description: 'Professional grade espresso machine',
    sku: 'COF002',
    category: 'Beverages',
    categoryId: '1',
    price: 299.99,
    cost: 200.00,
    stock: 0,
    minStock: 2,
    imageUrl: 'https://images.pexels.com/photos/324028/pexels-photo-324028.jpeg?auto=compress&cs=tinysrgb&w=300',
    isActive: true,
    taxRate: 0.23,
  },
  {
    id: '6',
    name: 'Greek Yogurt',
    description: 'Creamy Greek-style yogurt',
    sku: 'MLK002',
    category: 'Dairy',
    categoryId: '2',
    price: 3.20,
    cost: 2.00,
    stock: 20,
    minStock: 10,
    imageUrl: 'https://images.pexels.com/photos/1435903/pexels-photo-1435903.jpeg?auto=compress&cs=tinysrgb&w=300',
    isActive: true,
    taxRate: 0.06,
  }
];

// Mock customer data - will be moved to context/localStorage in production
let mockCustomers: Customer[] = [
  {
    id: '1',
    name: 'Maria Silva',
    email: 'maria.silva@email.com',
    phone: '+351 912 345 678',
    taxId: '123456789',
    address: 'Rua das Flores, 123',
    city: 'Lisboa',
    postalCode: '1000-001',
    country: 'Portugal',
    discountLevel: 5,
    totalPurchases: 1250.50,
    totalOrders: 12,
    lastPurchase: '2024-01-10'
  },
  {
    id: '2',
    name: 'João Santos',
    email: 'joao.santos@email.com',
    phone: '+351 923 456 789',
    taxId: '987654321',
    address: 'Av. da Liberdade, 456',
    city: 'Porto',
    postalCode: '4000-001',
    country: 'Portugal',
    discountLevel: 10,
    totalPurchases: 2890.75,
    totalOrders: 28,
    lastPurchase: '2024-01-12'
  },
  {
    id: '3',
    name: 'Ana Costa',
    email: 'ana.costa@email.com',
    phone: '+351 934 567 890',
    taxId: '456789123',
    address: 'Rua Central, 789',
    city: 'Braga',
    postalCode: '4700-001',
    country: 'Portugal',
    discountLevel: 0,
    totalPurchases: 450.25,
    totalOrders: 5,
    lastPurchase: '2024-01-08'
  },
  {
    id: '4',
    name: 'Pedro Lima',
    email: 'pedro.lima@email.com',
    phone: '+351 945 678 901',
    taxId: '789123456',
    address: 'Largo do Mercado, 12',
    city: 'Faro',
    postalCode: '8000-001',
    country: 'Portugal',
    discountLevel: 15,
    totalPurchases: 3450.00,
    totalOrders: 35,
    lastPurchase: '2024-01-14'
  },
  {
    id: '5',
    name: 'Carla Fernandes',
    email: 'carla.fernandes@email.com',
    phone: '+351 956 789 012',
    taxId: '321654987',
    address: 'Rua Nova, 34',
    city: 'Coimbra',
    postalCode: '3000-001',
    country: 'Portugal',
    discountLevel: 8,
    totalPurchases: 1890.30,
    totalOrders: 18,
    lastPurchase: '2024-01-11'
  }
];

const iconMap = {
  grid: Grid,
  coffee: Coffee,
  milk: Milk,
  cake: Cake,
  candy: Candy,
};

const POS: React.FC = () => {
  const { t } = useTranslation();
  const { cart, addToCart, removeFromCart, updateQuantity, clearCart, selectedCustomer, selectCustomer } = usePOS();
  const { user, logout } = useAuth();
  const { settings } = useSettings();

  // Stock validation helper function
  const canAddToCart = (product: Product, requestedQuantity = 1): boolean => {
    // If negative stock is allowed, always allow
    if (settings.pos.allowNegativeStock) {
      return true;
    }

    // Find current quantity in cart
    const cartItem = cart.find(item => item.product.id === product.id);
    const currentCartQuantity = cartItem ? cartItem.quantity : 0;
    const totalRequestedQuantity = currentCartQuantity + requestedQuantity;

    // Check if total would exceed available stock
    return totalRequestedQuantity <= product.stock;
  };

  // Enhanced addToCart with stock validation
  const handleAddToCart = (product: Product, quantity = 1) => {
    // Only allow adding if stock validation passes
    // UI prevents clicks on out-of-stock items, but this is a safety check
    if (canAddToCart(product, quantity)) {
      addToCart(product, quantity);
    }
  };

  // Enhanced updateQuantity with stock validation
  const handleUpdateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      // Always allow removal
      updateQuantity(productId, newQuantity);
      return;
    }

    // Find the product and current cart item
    const cartItem = cart.find(item => item.product.id === productId);
    if (!cartItem) return;

    const product = cartItem.product;
    const currentQuantity = cartItem.quantity;
    const quantityDifference = newQuantity - currentQuantity;

    // If decreasing quantity, always allow
    if (quantityDifference <= 0) {
      updateQuantity(productId, newQuantity);
      return;
    }

    // If increasing, check stock validation
    if (settings.pos.allowNegativeStock || newQuantity <= product.stock) {
      updateQuantity(productId, newQuantity);
    } else {
      alert(`Only ${product.stock} "${product.name}" available in stock.`);
    }
  };
  const [showPayment, setShowPayment] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [discount, setDiscount] = useState({ type: 'none', value: 0 });
  const [cashReceived, setCashReceived] = useState(0);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: '',
    email: '',
    phone: '',
    taxId: '',
    address: '',
    city: '',
    postalCode: '',
    country: 'Portugal'
  });
  const [numpadConfig, setNumpadConfig] = useState({
    isOpen: false,
    title: '',
    onConfirm: (value: string) => { },
    prefix: '',
    suffix: '',
    allowDecimal: true,
    maxLength: 10
  });
  const [keyboardConfig, setKeyboardConfig] = useState({
    isOpen: false,
    title: '',
    field: '',
    onConfirm: (value: string) => { },
    maxLength: 50,
    allowNumbers: true,
    allowLetters: true
  });
  const [activeField, setActiveField] = useState<string>('');

  // Auto-logout states
  const [showAutoLogoutWarning, setShowAutoLogoutWarning] = useState(false);
  const [autoLogoutCountdown, setAutoLogoutCountdown] = useState(settings.autoLogout.warningSeconds);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  // Helper getters for auto-logout timings (milliseconds)
  const getAutoLogoutTime = () => settings.autoLogout.timeoutMinutes * 60 * 1000;
  const getWarningTime = () => settings.autoLogout.warningSeconds * 1000;
  const [timeUntilAutoLogout, setTimeUntilAutoLogout] = useState(getAutoLogoutTime());
  const [lastCartActivity, setLastCartActivity] = useState<number>(Date.now());
  const [cartClearCountdown, setCartClearCountdown] = useState<number>(0);

  // Handle focus when Add Customer modal opens
  useEffect(() => {
    if (showAddCustomerModal) {
      setTimeout(() => {
        const nifValue = newCustomerForm.taxId.trim();
        if (nifValue.length === 9 && /^[A-Z0-9]{9}$/.test(nifValue)) {
          // Focus on name field if NIF is complete
          const nameInput = document.querySelector('input[placeholder="Enter customer name"]') as HTMLInputElement;
          if (nameInput) nameInput.focus();
        } else {
          // Focus on NIF field if NIF is incomplete
          const nifInput = document.querySelector('input[placeholder="123456789 / X1234567L"]') as HTMLInputElement;
          if (nifInput) nifInput.focus();
        }
      }, 100);
    }
  }, [showAddCustomerModal, newCustomerForm.taxId]);

  // Activity tracking for auto-logout
  useEffect(() => {
    const updateActivity = () => {
      setLastActivity(Date.now());
      setLastCartActivity(Date.now()); // Reset cart activity timer too
      if (settings.autoLogout.enabled) {
        setTimeUntilAutoLogout(getAutoLogoutTime());
      }
      if (showAutoLogoutWarning) {
        setShowAutoLogoutWarning(false);
        setAutoLogoutCountdown(settings.autoLogout.warningSeconds);
      }
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    // Add event listeners for activity tracking
    events.forEach(event => {
      document.addEventListener(event, updateActivity, true);
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity, true);
      });
    };
  }, [showAutoLogoutWarning, settings.autoLogout.enabled]);

  // Auto-logout timer management
  useEffect(() => {
    // Skip auto-logout if disabled
    if (!settings.autoLogout.enabled) {
      return;
    }

    const checkAutoLogout = () => {
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivity;
      const autoLogoutTime = getAutoLogoutTime();
      const warningTime = getWarningTime();
      setTimeUntilAutoLogout(Math.max(0, autoLogoutTime - timeSinceLastActivity));

      // Check if we should show warning
      if (timeSinceLastActivity >= autoLogoutTime - warningTime && !showAutoLogoutWarning) {
        // Check cart protection setting
        const shouldProtect = settings.autoLogout.protectWhenCartHasItems && cart.length > 0;
        if (!shouldProtect) {
          setShowAutoLogoutWarning(true);
          setAutoLogoutCountdown(settings.autoLogout.warningSeconds);
        }
      }

      // Check if we should auto-logout
      if (timeSinceLastActivity >= autoLogoutTime) {
        const shouldProtect = settings.autoLogout.protectWhenCartHasItems && cart.length > 0;
        if (!shouldProtect) {
          handleAutoLogout();
        }
      }
    };

    const interval = setInterval(checkAutoLogout, 1000); // Check every second

    return () => clearInterval(interval);
  }, [lastActivity, cart.length, showAutoLogoutWarning, settings.autoLogout]);

  // Auto-logout warning countdown
  useEffect(() => {
    if (showAutoLogoutWarning && autoLogoutCountdown > 0) {
      const countdown = setTimeout(() => {
        setAutoLogoutCountdown(prev => prev - 1);
      }, 1000);

      return () => clearTimeout(countdown);
    } else if (showAutoLogoutWarning && autoLogoutCountdown === 0) {
      handleAutoLogout();
    }
  }, [showAutoLogoutWarning, autoLogoutCountdown]);

  // Auto-logout handler
  const handleAutoLogout = () => {
    const shouldProtect = settings.autoLogout.protectWhenCartHasItems && cart.length > 0;
    if (!shouldProtect) {
      setShowAutoLogoutWarning(false);
      logout();
    }
  };

  // Extend session handler
  const handleExtendSession = () => {
    setLastActivity(Date.now());
    setShowAutoLogoutWarning(false);
    setAutoLogoutCountdown(settings.autoLogout.warningSeconds);
    setTimeUntilAutoLogout(getAutoLogoutTime());
  };

  // Filter products based on category only
  const filteredProducts = selectedCategoryId ? mockProducts.filter(product =>
    product.categoryId === selectedCategoryId
  ) : [];

  // Filter customers based on search term (NIF only)
  const filteredCustomers = mockCustomers.filter(customer =>
    customer.taxId && customer.taxId.includes(customerSearchTerm)
  );

  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const discountAmount = discount.type === 'percentage'
    ? (subtotal * discount.value / 100)
    : discount.type === 'fixed'
      ? discount.value
      : 0;
  const discountedSubtotal = subtotal - discountAmount;
  const tax = cart.reduce((sum, item) => sum + (item.product.price * item.quantity * item.product.taxRate), 0);
  const total = discountedSubtotal + tax;
  const changeAmount = cashReceived > total ? cashReceived - total : 0;

  // NIF validation helper
  const getNifValidationState = (nif: string) => {
    if (!nif.trim()) return 'default'; // Empty/unfilled
    if (nif.length === 9 && /^[A-Z0-9]{9}$/.test(nif)) return 'valid'; // Valid 9 alphanumeric characters
    return 'invalid'; // Invalid/incomplete
  };

  // Get NIF field styling based on validation state
  const getNifFieldClasses = (nif: string, baseClasses: string) => {
    const state = getNifValidationState(nif);
    switch (state) {
      case 'valid':
        return `${baseClasses} border-green-500 focus:ring-green-500 focus:border-green-500`;
      case 'invalid':
        return `${baseClasses} border-red-500 focus:ring-red-500 focus:border-red-500`;
      default:
        return `${baseClasses} border-gray-300 focus:ring-blue-500 focus:border-transparent`;
    }
  };

  // Apply customer discount to total
  const customerDiscount = selectedCustomer ? selectedCustomer.discountLevel : 0;
  const customerDiscountAmount = discountedSubtotal * customerDiscount / 100;
  const finalSubtotal = discountedSubtotal - customerDiscountAmount;
  const finalTotal = finalSubtotal + tax;

  const handleCategoryClick = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
  };

  const handlePayment = () => {
    setShowPayment(true);
  };

  const handleDiscountClick = (type: 'percentage' | 'fixed') => {
    setNumpadConfig({
      isOpen: true,
      title: type === 'percentage' ? 'Enter Discount %' : 'Enter Discount Amount',
      onConfirm: (value: string) => {
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue > 0) {
          setDiscount({ type, value: numValue });
        }
      },
      prefix: type === 'fixed' ? '€' : '',
      suffix: type === 'percentage' ? '%' : '',
      allowDecimal: true,
      maxLength: 8
    });
  };

  const handleCashClick = () => {
    setNumpadConfig({
      isOpen: true,
      title: 'Cash Received',
      onConfirm: (value: string) => {
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue > 0) {
          setCashReceived(numValue);
        }
      },
      prefix: '€',
      suffix: '',
      allowDecimal: true,
      maxLength: 10
    });
  };

  const handleRemoveDiscount = () => {
    setDiscount({ type: 'none', value: 0 });
  };

  const handleLogout = () => {
    logout();
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'from-red-500 to-pink-600';
      case 'manager':
        return 'from-orange-500 to-amber-600';
      case 'cashier':
        return 'from-blue-500 to-purple-600';
      default:
        return 'from-gray-500 to-slate-600';
    }
  };

  const renderCategoryIcon = (iconName: string) => {
    const IconComponent = iconMap[iconName as keyof typeof iconMap] || Grid;
    return <IconComponent className="w-4 h-4 sm:w-5 sm:h-5" />;
  };

  const handleCustomerClick = () => {
    setCustomerSearchTerm(''); // clear previous search
    setShowCustomerModal(true);
    setNumpadConfig(prev => ({ ...prev, isOpen: false }));
  };

  const handleCustomerSelect = (customer: Customer) => {
    selectCustomer(customer);
    setShowCustomerModal(false);
    setCustomerSearchTerm('');
    // Ensure numpad/keyboard is closed
    setNumpadConfig(prev => ({ ...prev, isOpen: false }));
    setKeyboardConfig(prev => ({ ...prev, isOpen: false }));
  };

  const handleCustomerRemove = () => {
    selectCustomer(null);
  };

  const handleCustomerSearch = () => {
    // Focus on the search input
    const searchInput = document.querySelector('input[placeholder*="Search by NIF"]') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
    }
  };

  const handleAddNewCustomer = () => {
    // Prefill form based on search term
    const searchTerm = customerSearchTerm.trim().toUpperCase();
    if (searchTerm) {
      if (searchTerm.length === 9 && /^[A-Z0-9]{9}$/.test(searchTerm)) {
        // If search term is exactly 9 alphanumeric characters, prefill NIF and focus on name
        setNewCustomerForm(prev => ({ ...prev, taxId: searchTerm }));
        setActiveField('name');
        setKeyboardConfig({
          isOpen: true,
          title: '',
          field: 'name',
          onConfirm: (value: string) => {
            handleCustomerFormChange('name', value);
          },
          maxLength: 50,
          allowNumbers: false,
          allowLetters: true
        });
      } else {
        // If search term is less than 9 characters, prefill NIF and focus will be on NIF
        setNewCustomerForm(prev => ({ ...prev, taxId: searchTerm }));
        setActiveField('taxId');
        setKeyboardConfig({
          isOpen: true,
          title: '',
          field: 'taxId',
          onConfirm: (value: string) => {
            // Apply NIF validation: alphanumeric, max 9 characters, uppercase
            const validatedValue = value.replace(/[^A-Za-z0-9]/g, '').slice(0, 9).toUpperCase();
            handleCustomerFormChange('taxId', validatedValue);
          },
          maxLength: 9,
          allowNumbers: true,
          allowLetters: true
        });
      }
    } else {
      // Default to name field
      setActiveField('name');
      setKeyboardConfig({
        isOpen: true,
        title: '',
        field: 'name',
        onConfirm: (value: string) => {
          handleCustomerFormChange('name', value);
        },
        maxLength: 50,
        allowNumbers: false,
        allowLetters: true
      });
    }
    setShowAddCustomerModal(true);
  };

  const handleCustomerFormChange = (field: string, value: string | number) => {
    setNewCustomerForm(prev => ({ ...prev, [field]: value }));
  };

  const handleTextFieldClick = (field: string, allowNumbers = true, allowLetters = true, maxLength = 50) => {
    setActiveField(field);
    setKeyboardConfig({
      isOpen: true,
      title: '',
      field,
      onConfirm: (value: string) => {
        handleCustomerFormChange(field, value);
      },
      maxLength,
      allowNumbers,
      allowLetters
    });
  };

  const handleCustomerFormSubmit = () => {
    // Validate required fields
    if (!newCustomerForm.taxId.trim()) {
      alert('NIF is required');
      return;
    }

    // Validate NIF format (exactly 9 alphanumeric characters)
    const nifRegex = /^[A-Z0-9]{9}$/;
    if (!nifRegex.test(newCustomerForm.taxId.trim())) {
      alert('NIF must be exactly 9 alphanumeric characters');
      return;
    }

    // Generate new customer ID
    const newCustomerId = `${Date.now()}`;

    // Create new customer object
    const customerName = newCustomerForm.name.trim() || `Customer ${newCustomerForm.taxId.trim()}`;

    const newCustomer: Customer = {
      id: newCustomerId,
      name: customerName,
      email: newCustomerForm.email.trim() || undefined,
      phone: newCustomerForm.phone.trim() || undefined,
      taxId: newCustomerForm.taxId.trim(),
      address: newCustomerForm.address.trim() || undefined,
      city: newCustomerForm.city.trim() || undefined,
      postalCode: newCustomerForm.postalCode.trim() || undefined,
      country: newCustomerForm.country.trim() || 'Portugal',
      discountLevel: 0,
      totalPurchases: 0,
      totalOrders: 0,
      lastPurchase: undefined
    };

    // Add to mock database
    mockCustomers.push(newCustomer);

    // Auto-select the new customer
    selectCustomer(newCustomer);

    // Close modals and reset form
    setShowAddCustomerModal(false);
    setShowCustomerModal(false);
    // Ensure any open numpad/keyboard is closed
    setNumpadConfig(prev => ({ ...prev, isOpen: false }));
    setKeyboardConfig(prev => ({ ...prev, isOpen: false }));
    setActiveField('');
    setKeyboardConfig({
      isOpen: false,
      title: '',
      field: '',
      onConfirm: (value: string) => { },
      maxLength: 50,
      allowNumbers: true,
      allowLetters: true
    });
    setNewCustomerForm({
      name: '',
      email: '',
      phone: '',
      taxId: '',
      address: '',
      city: '',
      postalCode: '',
      country: 'Portugal'
    });

    // Optionally show toast here; currently no alert displayed
  };

  const handleCancelAddCustomer = () => {
    setShowAddCustomerModal(false);
    setNumpadConfig(prev => ({ ...prev, isOpen: false }));
    setActiveField('');
    setKeyboardConfig({
      isOpen: false,
      title: '',
      field: '',
      onConfirm: (value: string) => { },
      maxLength: 50,
      allowNumbers: true,
      allowLetters: true
    });
    setNewCustomerForm({
      name: '',
      email: '',
      phone: '',
      taxId: '',
      address: '',
      city: '',
      postalCode: '',
      country: 'Portugal'
    });
  };

  // Auto-clear cart timer management
  useEffect(() => {
    // Skip auto-clear if disabled or timeout is 0 (NEVER)
    if (!settings.pos.autoClearCart.enabled || settings.pos.autoClearCart.timeoutMinutes === 0 || cart.length === 0) {
      setCartClearCountdown(0);
      return;
    }

    const checkAutoClearCart = () => {
      const now = Date.now();
      const timeSinceLastCartActivity = now - lastCartActivity;
      const autoClearTime = settings.pos.autoClearCart.timeoutMinutes * 60 * 1000;

      const remainingTime = Math.max(0, autoClearTime - timeSinceLastCartActivity);
      setCartClearCountdown(remainingTime);

      // Auto-clear cart when time is up
      if (timeSinceLastCartActivity >= autoClearTime) {
        clearCart();
        setLastCartActivity(Date.now()); // Reset timer after clearing
      }
    };

    const interval = setInterval(checkAutoClearCart, 1000); // Check every second

    return () => clearInterval(interval);
  }, [lastCartActivity, cart.length, settings.pos.autoClearCart, clearCart]);

  // Track cart activity when cart is modified
  useEffect(() => {
    if (cart.length > 0) {
      setLastCartActivity(Date.now());
    }
  }, [cart]);

  return (
    <div className="h-full flex flex-col md:flex-row">
      {/* Main Content Area */}
      <div className="flex-1 p-3 sm:p-4 md:p-6 pb-8">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <div className={`flex items-center mb-3 sm:mb-4 ${selectedCategoryId ? 'justify-between' : 'justify-end'}`}>
            {/* Back to Categories Button */}
            {selectedCategoryId && (
              <button
                onClick={() => setSelectedCategoryId('')}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-3 rounded-2xl font-semibold flex items-center space-x-2 transition-colors min-h-[60px]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>{t('pos.backToCategories')}</span>
              </button>
            )}

            {/* Logout Button */}
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white p-3 rounded-2xl transition-all duration-200 flex items-center space-x-2 min-h-[60px] shadow-lg"
            >
              <LogOut className="w-5 h-5" />
              <span className="hidden sm:inline font-semibold">Logout</span>
            </button>
          </div>
        </div>

        {/* Category View */}
        {!selectedCategoryId && (
          <div className="mb-6">
            <div className="text-center mb-8">
              {/* <h2 className="text-3xl font-bold text-gray-800 mb-2">Choose a Category</h2> */}
              {/* <p className="text-lg text-gray-600">Select a product category to view available items</p> */}
            </div>
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {mockCategories.map((category) => (
                <div
                  key={category.id}
                  onClick={() => handleCategoryClick(category.id)}
                  className={`
                    bg-gradient-to-r ${category.color} text-white rounded-xl shadow-lg border border-white 
                    overflow-hidden hover:scale-105 hover:shadow-xl transition-all duration-300 cursor-pointer 
                    aspect-square flex flex-col items-center justify-center p-4 relative
                  `}
                >
                  <div className="bg-white bg-opacity-20 p-3 rounded-lg mb-3">
                    {renderCategoryIcon(category.icon)}
                  </div>

                  <h3 className="text-sm font-bold text-center">{category.name}</h3>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Products View */}
        {selectedCategoryId && (
          <div>
            {/* Category Header */}
            <div className="mb-6">
              {(() => {
                const currentCategory = mockCategories.find(c => c.id === selectedCategoryId);
                return currentCategory ? (
                  <div className={`bg-gradient-to-r ${currentCategory.color} text-white rounded-2xl p-6 mb-6`}>
                    <div className="flex items-center space-x-4">
                      <div className="bg-white bg-opacity-20 p-3 rounded-2xl">
                        {renderCategoryIcon(currentCategory.icon)}
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold">{currentCategory.name}</h2>
                        <p className="text-white text-opacity-90">{currentCategory.description}</p>
                      </div>
                    </div>
                  </div>
                ) : null;
              })()}
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 max-h-[calc(100vh-400px)] overflow-y-auto">
              {filteredProducts.map((product) => {
                const canAdd = canAddToCart(product, 1);
                const isOutOfStock = !canAdd && !settings.pos.allowNegativeStock;

                return (
                  <div
                    key={product.id}
                    className={`
                      bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden transition-all duration-300 aspect-square flex flex-col p-3 relative
                      ${canAdd
                        ? 'hover:scale-105 hover:shadow-xl cursor-pointer'
                        : 'opacity-60 cursor-not-allowed'
                      }
                    `}
                    onClick={canAdd ? () => handleAddToCart(product) : undefined}
                  >
                    {/* Image - Takes 2/3 of the card */}
                    <div className="h-2/3 w-full mb-2 rounded-lg overflow-hidden flex-shrink-0 relative">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className={`w-full h-full object-cover ${isOutOfStock ? 'grayscale' : ''}`}
                      />

                      {/* Out of Stock Overlay */}
                      {isOutOfStock && (
                        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                          <div className="bg-red-500 text-white px-2 py-1 rounded-lg text-xs font-bold transform -rotate-12">
                            {t('pos.outOfStock')}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Name - Takes 1/3 of the card */}
                    <div className="h-1/3 flex flex-col justify-center text-center">
                      <h3 className={`text-sm font-bold line-clamp-2 leading-tight ${isOutOfStock ? 'text-gray-500' : 'text-gray-800'
                        }`}>
                        {product.name}
                      </h3>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Empty State for Products */}
            {filteredProducts.length === 0 && (
              <div className="text-center py-12">
                <div className="text-gray-300 mb-4">
                  <svg className="w-16 h-16 mx-auto" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8-8zm1-13h2v6h-2zm0 8h2v2h-2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-500 mb-2">{t('pos.noProductsFoundTitle')}</h3>
                <p className="text-gray-400">
                  {t('pos.noProductsFoundMessage')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cart Sidebar */}
      <div className="w-full md:w-80 lg:w-96 bg-white shadow-xl border-l-2 border-gray-200 flex flex-col md:max-w-md h-screen pb-8">
        {/* Top Half - Cart Items */}
        <div className="h-1/2 overflow-y-auto p-4 sm:p-6 border-b-2 border-gray-200">
          {/* Customer Info */}
          {selectedCustomer && (
            <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <UserCircle className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-blue-800">{t('pos.cartCustomerHeader')}</span>
                </div>
                <button
                  onClick={handleCustomerRemove}
                  className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-1">
                {selectedCustomer.name && (
                  <p className="font-bold text-gray-800">{selectedCustomer.name}</p>
                )}
                <p className="text-sm text-gray-600">{selectedCustomer.taxId}</p>
                {selectedCustomer.discountLevel > 0 && (
                  <p className="text-sm font-semibold text-green-600">
                    {selectedCustomer.discountLevel}% Customer Discount
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Cart Items */}
          {cart.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-xl text-gray-500 mb-2">{t('pos.noCartItemsTitle')}</p>
              <p className="text-gray-400">{t('pos.noCartItemsMessage')}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {cart.map((item) => (
                <div key={item.product.id} className="flex items-center justify-between py-2 border-b border-gray-100">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-800 truncate block">{item.product.name}</span>
                  </div>

                  <div className="flex items-center space-x-2 ml-2">
                    <span className="text-xs text-gray-500">€{item.product.price.toFixed(2)}</span>

                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleUpdateQuantity(item.product.id, item.quantity - 1)}
                        className="bg-gray-200 hover:bg-gray-300 p-1 rounded transition-colors min-h-[24px] min-w-[24px] flex items-center justify-center"
                      >
                        <Minus className="w-2 h-2" />
                      </button>
                      <span className="text-sm font-semibold text-gray-800 min-w-[24px] text-center">{item.quantity}</span>
                      <button
                        onClick={() => handleUpdateQuantity(item.product.id, item.quantity + 1)}
                        className="bg-gray-200 hover:bg-gray-300 p-1 rounded transition-colors min-h-[24px] min-w-[24px] flex items-center justify-center"
                      >
                        <Plus className="w-2 h-2" />
                      </button>
                    </div>

                    <span className="text-sm font-bold text-gray-800 min-w-[60px] text-right">€{(item.product.price * item.quantity).toFixed(2)}</span>

                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Half - Payment Section */}
        <div className="h-1/2 p-4 bg-white flex flex-col">
          {/* Discount Section - 25% */}
          <div className="flex-none h-[25%] flex flex-col justify-start space-y-2 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">{t('pos.discountHeader')}</span>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleDiscountClick('percentage')}
                  className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white p-2 rounded-xl transition-colors flex items-center space-x-1"
                >
                  <Percent className="w-3 h-3" />
                  <span className="text-xs">%</span>
                </button>
                <button
                  onClick={() => handleDiscountClick('fixed')}
                  className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white p-2 rounded-xl transition-colors flex items-center space-x-1"
                >
                  <Calculator className="w-3 h-3" />
                  <span className="text-xs">€</span>
                </button>
              </div>
            </div>

            {discount.type !== 'none' && (
              <div className="flex items-center justify-between bg-purple-50 p-2 rounded-lg">
                <span className="text-purple-700 font-medium text-sm">
                  {discount.type === 'percentage' ? `${discount.value}%` : `€${discount.value.toFixed(2)}`} off
                </span>
                <button
                  onClick={handleRemoveDiscount}
                  className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {selectedCustomer && selectedCustomer.discountLevel > 0 && (
              <div className="flex items-center justify-between bg-green-50 p-2 rounded-lg">
                <span className="text-green-700 font-medium text-sm">
                  Customer: {selectedCustomer.discountLevel}% off
                </span>
                <UserCircle className="w-4 h-4 text-green-600" />
              </div>
            )}
          </div>

          {/* Totals - 35% */}
          <div className="flex-none h-[35%] flex flex-col justify-center space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{t('pos.subtotalLabel')}</span>
              <span className="text-gray-800 font-semibold">€{subtotal.toFixed(2)}</span>
            </div>
            {discount.type !== 'none' && (
              <div className="flex justify-between text-sm text-purple-600">
                <span>{t('pos.discountLabel')}</span>
                <span className="font-semibold">-€{discountAmount.toFixed(2)}</span>
              </div>
            )}
            {selectedCustomer && selectedCustomer.discountLevel > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>{t('pos.customerDiscountLabel')}</span>
                <span className="font-semibold">-€{customerDiscountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{t('pos.taxLabel')}</span>
              <span className="text-gray-800 font-semibold">€{tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-1">
              <span>{t('pos.totalLabel')}</span>
              <span className="text-green-600">€{finalTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Buttons - 40% */}
          <div className="flex-none h-[40%] flex flex-col justify-center space-y-2">
            {cart.length > 0 && (
              <>
                <button
                  onClick={handlePayment}
                  className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white py-2 rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center space-x-2 h-12"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>{t('pos.processPayment')}</span>
                </button>

                <div className="grid grid-cols-2 gap-2 h-8">
                  <button
                    onClick={handleCustomerClick}
                    className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl font-medium flex items-center justify-center space-x-1"
                  >
                    <User className="w-3 h-3" />
                    <span className="text-xs">{t('pos.customer')}</span>
                  </button>
                  <button
                    onClick={clearCart}
                    className="bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white rounded-xl font-medium text-xs"
                  >
                    {t('pos.clearCart')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Customer Selection Modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`bg-white rounded-3xl p-8 shadow-2xl flex flex-col ${numpadConfig.isOpen ? 'w-[1000px] max-w-6xl' : 'w-[600px] max-w-2xl'} h-[600px]`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-800">{t('pos.selectCustomerTitle')}</h3>
              <button
                onClick={() => {
                  setShowCustomerModal(false);
                  setCustomerSearchTerm('');
                  setNumpadConfig(prev => ({ ...prev, isOpen: false }));
                }}
                className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Main Content Area */}
            <div className={`flex-1 flex ${numpadConfig.isOpen ? 'space-x-6' : ''} overflow-hidden`}>
              {/* Customer Section */}
              <div className={`${numpadConfig.isOpen ? 'flex-1' : 'w-full'} flex flex-col`}>
                {/* Search Section */}
                <div className="mb-6 space-y-4">
                  <div className="flex space-x-3">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        placeholder={t('pos.searchByNif')}
                        value={customerSearchTerm}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 9).toUpperCase();
                          setCustomerSearchTerm(value);
                        }}
                        onClick={() => {
                          setNumpadConfig({
                            isOpen: true,
                            title: t('pos.searchByNif'),
                            onConfirm: (value: string) => {
                              const validatedValue = value.replace(/[^A-Za-z0-9]/g, '').slice(0, 9).toUpperCase();
                              setCustomerSearchTerm(validatedValue);
                            },
                            prefix: '',
                            suffix: '',
                            allowDecimal: false,
                            maxLength: 9
                          });
                        }}
                        className={`w-full pl-10 pr-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:border-transparent cursor-pointer ${numpadConfig.isOpen ? 'border-blue-500 bg-blue-50' : 'border-gray-300 focus:ring-blue-500'
                          }`}
                        maxLength={9}
                        readOnly
                      />
                    </div>
                    <button
                      onClick={() => {
                        setNumpadConfig({
                          isOpen: true,
                          title: t('pos.searchByNif'),
                          onConfirm: (value: string) => {
                            const validatedValue = value.replace(/[^A-Za-z0-9]/g, '').slice(0, 9).toUpperCase();
                            setCustomerSearchTerm(validatedValue);
                          },
                          prefix: '',
                          suffix: '',
                          allowDecimal: false,
                          maxLength: 9
                        });
                      }}
                      className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-6 py-3 rounded-2xl font-semibold transition-all duration-200 flex items-center space-x-2"
                    >
                      <Search className="w-5 h-5" />
                      <span>{t('pos.search')}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                      {filteredCustomers.length} customer{filteredCustomers.length !== 1 ? 's' : ''} found
                    </p>
                    <button
                      onClick={handleAddNewCustomer}
                      className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center space-x-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{t('pos.addNew')}</span>
                    </button>
                  </div>
                </div>

                {/* Customer List */}
                <div className="flex-1 overflow-y-auto space-y-3">
                  {filteredCustomers.map((customer) => (
                    <div
                      key={customer.id}
                      onClick={() => handleCustomerSelect(customer)}
                      className="bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-2xl p-4 cursor-pointer transition-all duration-200 hover:shadow-lg"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-2 rounded-xl">
                              <UserCircle className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <h4 className="font-bold text-gray-800">{customer.name}</h4>
                              <p className="text-sm text-gray-600">{customer.taxId}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex items-center space-x-2">
                              <span className="text-gray-600">{t('pos.totalOrders')}</span>
                              <span className="font-semibold text-gray-800">{customer.totalOrders}</span>
                            </div>
                            {customer.discountLevel > 0 && (
                              <div className="flex items-center space-x-2">
                                <Percent className="w-4 h-4 text-green-500" />
                                <span className="font-semibold text-green-600">{customer.discountLevel}% Discount</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="ml-4">
                          <button className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-200">
                            {t('common.select')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {filteredCustomers.length === 0 && (
                    <div className="text-center py-12">
                      <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-xl text-gray-500 mb-2">{t('pos.noCustomersFoundTitle')}</p>
                      <p className="text-gray-400">{t('pos.noCustomersFoundMessage')}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Numpad Section */}
              {numpadConfig.isOpen && (
                <div className="flex-1">
                  <VirtualKeyboard
                    isOpen={true}
                    onClose={() => setNumpadConfig(prev => ({ ...prev, isOpen: false }))}
                    onConfirm={(value: string) => {
                      const validatedValue = value.replace(/[^A-Za-z0-9]/g, '').slice(0, 9).toUpperCase();
                      setCustomerSearchTerm(validatedValue);
                    }}
                    title={t('pos.searchByNif')}
                    initialValue={customerSearchTerm}
                    maxLength={9}
                    allowNumbers={true}
                    allowLetters={true}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add New Customer Modal */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 w-[1000px] max-w-6xl h-[700px] shadow-2xl flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-800">Add New Customer</h3>
              <button
                onClick={handleCancelAddCustomer}
                className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Customer Form and Keyboard */}
            <div className="flex-1 flex space-x-6 overflow-hidden">
              {/* Customer Form */}
              <div className="flex-1 overflow-y-auto">
                <div className="space-y-3">
                  {/* Personal Information Section */}
                  <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Name
                        </label>
                        <input
                          type="text"
                          value={newCustomerForm.name}
                          onChange={(e) => handleCustomerFormChange('name', e.target.value)}
                          onClick={() => handleTextFieldClick('name', false, true, 50)}
                          className={`w-full px-2 py-2 border rounded-xl focus:outline-none focus:ring-1 text-sm cursor-pointer ${activeField === 'name'
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-300 focus:ring-blue-500 focus:border-transparent'
                            }`}
                          placeholder="Enter customer name"
                          readOnly
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          NIF *
                        </label>
                        <div className="relative">
                          <TaxIcon className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
                          <input
                            type="text"
                            value={newCustomerForm.taxId}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 9).toUpperCase();
                              handleCustomerFormChange('taxId', value);
                            }}
                            onClick={() => {
                              setActiveField('taxId');
                              setKeyboardConfig({
                                isOpen: true,
                                title: '',
                                field: 'taxId',
                                onConfirm: (value: string) => {
                                  // Apply NIF validation: alphanumeric, max 9 characters, uppercase
                                  const validatedValue = value.replace(/[^A-Za-z0-9]/g, '').slice(0, 9).toUpperCase();
                                  handleCustomerFormChange('taxId', validatedValue);
                                },
                                maxLength: 9,
                                allowNumbers: true,
                                allowLetters: true
                              });
                            }}
                            className={getNifFieldClasses(
                              newCustomerForm.taxId,
                              `w-full pl-6 pr-8 py-2 border rounded-xl focus:outline-none focus:ring-1 text-sm cursor-pointer ${activeField === 'taxId'
                                ? 'border-blue-500 bg-blue-50'
                                : ''
                              }`
                            )}
                            placeholder="123456789 / X1234567L"
                            maxLength={9}
                            required
                            readOnly
                          />
                          {newCustomerForm.taxId && (
                            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                              {getNifValidationState(newCustomerForm.taxId) === 'valid' ? (
                                <Check className="w-3 h-3 text-green-500" />
                              ) : (
                                <AlertCircle className="w-3 h-3 text-red-500" />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Contact Information Section */}
                  <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Phone
                        </label>
                        <div className="relative">
                          <Phone className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
                          <input
                            type="tel"
                            value={newCustomerForm.phone}
                            onChange={(e) => handleCustomerFormChange('phone', e.target.value)}
                            onClick={() => handleTextFieldClick('phone', true, false, 20)}
                            className={`w-full pl-6 pr-2 py-2 border rounded-xl focus:outline-none focus:ring-1 text-sm cursor-pointer ${activeField === 'phone'
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-300 focus:ring-blue-500 focus:border-transparent'
                              }`}
                            placeholder="+351 912 345 678"
                            readOnly
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Email
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
                          <input
                            type="email"
                            value={newCustomerForm.email}
                            onChange={(e) => handleCustomerFormChange('email', e.target.value)}
                            onClick={() => handleTextFieldClick('email', true, true, 50)}
                            className={`w-full pl-6 pr-2 py-2 border rounded-xl focus:outline-none focus:ring-1 text-sm cursor-pointer ${activeField === 'email'
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-300 focus:ring-blue-500 focus:border-transparent'
                              }`}
                            placeholder="customer@email.com"
                            readOnly
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Address Information Section */}
                  <div>
                    <div className="grid grid-cols-1 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Address
                        </label>
                        <input
                          type="text"
                          value={newCustomerForm.address}
                          onChange={(e) => handleCustomerFormChange('address', e.target.value)}
                          onClick={() => handleTextFieldClick('address', true, true, 100)}
                          className={`w-full px-2 py-2 border rounded-xl focus:outline-none focus:ring-1 text-sm cursor-pointer ${activeField === 'address'
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-300 focus:ring-blue-500 focus:border-transparent'
                            }`}
                          placeholder="Street address"
                          readOnly
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            City
                          </label>
                          <input
                            type="text"
                            value={newCustomerForm.city}
                            onChange={(e) => handleCustomerFormChange('city', e.target.value)}
                            onClick={() => handleTextFieldClick('city', false, true, 50)}
                            className={`w-full px-2 py-2 border rounded-xl focus:outline-none focus:ring-1 text-sm cursor-pointer ${activeField === 'city'
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-300 focus:ring-blue-500 focus:border-transparent'
                              }`}
                            placeholder="City"
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Postal Code
                          </label>
                          <input
                            type="text"
                            value={newCustomerForm.postalCode}
                            onChange={(e) => handleCustomerFormChange('postalCode', e.target.value)}
                            onClick={() => handleTextFieldClick('postalCode', true, false, 10)}
                            className={`w-full px-2 py-2 border rounded-xl focus:outline-none focus:ring-1 text-sm cursor-pointer ${activeField === 'postalCode'
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-300 focus:ring-blue-500 focus:border-transparent'
                              }`}
                            placeholder="1000-001"
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Country
                          </label>
                          <select
                            value={newCustomerForm.country}
                            onChange={(e) => handleCustomerFormChange('country', e.target.value)}
                            className="w-full px-2 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent text-sm"
                          >
                            <option value="Portugal">Portugal</option>
                            <option value="Spain">Spain</option>
                            <option value="France">France</option>
                            <option value="Germany">Germany</option>
                            <option value="United Kingdom">United Kingdom</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>


                </div>
              </div>

              {/* Virtual Keyboard */}
              <div className="flex-1">
                <VirtualKeyboard
                  isOpen={showAddCustomerModal}
                  onClose={() => { }}
                  onConfirm={keyboardConfig.onConfirm}
                  title=""
                  initialValue={activeField && newCustomerForm[activeField as keyof typeof newCustomerForm] ? newCustomerForm[activeField as keyof typeof newCustomerForm]?.toString() || '' : ''}
                  maxLength={keyboardConfig.maxLength}
                  allowNumbers={keyboardConfig.allowNumbers}
                  allowLetters={keyboardConfig.allowLetters}
                />
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex-none mt-6 pt-6 border-t border-gray-200">
              <div className="flex space-x-2">
                <button
                  onClick={handleCancelAddCustomer}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-2 rounded-xl min-h-[36px] transition-colors text-sm"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleCustomerFormSubmit}
                  className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-2 rounded-xl min-h-[36px] transition-colors flex items-center justify-center space-x-2 text-sm"
                >
                  <Save className="w-3 h-3" />
                  <span>Save Customer</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 w-[480px] max-w-md shadow-2xl">
            <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">{t('pos.processPayment')}</h3>
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-6 rounded-2xl">
                <div className="text-4xl font-bold text-center">
                  €{finalTotal.toFixed(2)}
                </div>
              </div>

              {/* Cash Payment Section */}
              {cashReceived > 0 && (
                <div className="space-y-3">
                  <div className="flex justify-between text-lg">
                    <span className="text-gray-600">{t('pos.cashReceived')}</span>
                    <span className="text-gray-800 font-semibold">€{cashReceived.toFixed(2)}</span>
                  </div>
                  {cashReceived > finalTotal && (
                    <div className="flex justify-between text-xl font-bold text-green-600">
                      <span>{t('pos.changeDue')}</span>
                      <span>€{(cashReceived - finalTotal).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={handleCashClick}
                  className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white py-4 rounded-2xl font-bold flex items-center justify-center space-x-3 min-h-[80px]"
                >
                  <Banknote className="w-6 h-6" />
                  <span>{t('pos.cash')}</span>
                </button>
                <button className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white py-4 rounded-2xl font-bold flex items-center justify-center space-x-3 min-h-[80px]">
                  <CreditCard className="w-6 h-6" />
                  <span>{t('pos.card')}</span>
                </button>
              </div>

              <div className="flex space-x-4">
                <button
                  onClick={() => {
                    setShowPayment(false);
                    setCashReceived(0);
                  }}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-3 rounded-2xl min-h-[60px]"
                >
                  {t('common.cancel')}
                </button>
                <button
                  className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-3 rounded-2xl min-h-[60px]"
                  disabled={cashReceived > 0 && cashReceived < finalTotal}
                >
                  {t('pos.completeSale')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 w-[400px] max-w-md shadow-2xl">
            <div className="text-center">
              <div className={`bg-gradient-to-r ${getRoleColor(user?.role || '')} p-4 rounded-full inline-block mb-6`}>
                <UserCircle className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-4">{t('pos.confirmLogoutTitle')}</h3>
              <p className="text-lg text-gray-600 mb-2">
                {t('pos.confirmLogoutQuestion')}, <strong>{user?.name}</strong>?
              </p>
              <p className="text-sm text-gray-500 mb-8">
                {t('pos.unsavedWork')}
              </p>

              <div className="flex space-x-4">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-4 rounded-2xl min-h-[60px] transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold py-4 rounded-2xl min-h-[60px] transition-colors flex items-center justify-center space-x-2"
                >
                  <LogOut className="w-5 h-5" />
                  <span>{t('common.logout')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Logout Warning Modal */}
      {showAutoLogoutWarning && settings.autoLogout.enabled && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 w-[450px] max-w-md shadow-2xl border-4 border-yellow-400">
            <div className="text-center">
              <div className="bg-gradient-to-r from-yellow-500 to-orange-500 p-4 rounded-full inline-block mb-6">
                <Clock className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-4">{t('pos.sessionTimeoutWarning')}</h3>
              <p className="text-lg text-gray-600 mb-2">
                {t('pos.autoLogoutMessage')}
              </p>
              <div className="text-4xl font-bold text-red-600 mb-6">
                {autoLogoutCountdown}s
              </div>
              <p className="text-sm text-gray-500 mb-8">
                {t('pos.securityNotice')}
              </p>

              <div className="flex space-x-4">
                <button
                  onClick={handleAutoLogout}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-4 rounded-2xl min-h-[60px] transition-colors"
                >
                  {t('pos.logoutNow')}
                </button>
                <button
                  onClick={handleExtendSession}
                  className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-4 rounded-2xl min-h-[60px] transition-colors flex items-center justify-center space-x-2"
                >
                  <UserCircle className="w-5 h-5" />
                  <span>{t('pos.stayLoggedIn')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Virtual Numpad */}
      <VirtualNumpad
        isOpen={numpadConfig.isOpen && !showCustomerModal}
        onClose={() => setNumpadConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={numpadConfig.onConfirm}
        title={numpadConfig.title}
        prefix={numpadConfig.prefix}
        suffix={numpadConfig.suffix}
        allowDecimal={numpadConfig.allowDecimal}
        maxLength={numpadConfig.maxLength}
      />

      {/* Bottom User Status Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-3 py-1 z-10">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center space-x-3">
            <p className="text-xs font-medium text-gray-800">{user?.name} • <span className="capitalize text-gray-600">{user?.role}</span></p>
            {cart.length > 0 && settings.autoLogout.protectWhenCartHasItems && (
              <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium">
                {t('pos.saleInProgress')}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-3 text-xs text-gray-500">
            {settings.autoLogout.enabled && (
              <span>
                {Math.floor(timeUntilAutoLogout / 60000)}:{String(Math.floor((timeUntilAutoLogout % 60000) / 1000)).padStart(2, '0')}
              </span>
            )}
            {settings.pos.autoClearCart.enabled && settings.pos.autoClearCart.timeoutMinutes > 0 && cart.length > 0 && (
              <span className="text-orange-600">
                Cart: {Math.floor(cartClearCountdown / 60000)}:{String(Math.floor((cartClearCountdown % 60000) / 1000)).padStart(2, '0')}
              </span>
            )}
            <span>POS Terminal • {new Date().toLocaleDateString('pt-PT')}</span>
          </div>
        </div>
      </div>

    </div>
  );
};

export default POS;