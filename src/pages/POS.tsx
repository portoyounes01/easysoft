import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { NavLink } from 'react-router-dom';
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
  LogOut,
  UserCircle,
  Search,
  Phone,
  Mail,
  Users,
  Save,
  CreditCard as TaxIcon,
  Check,
  AlertCircle,
  Clock,
  Loader2,
  Package,
  RefreshCw,
  Menu,
  LayoutDashboard,
  BarChart3,
  Settings,
  FileText
} from 'lucide-react';
import { usePOS } from '../contexts/POSContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useProducts } from '../contexts/ProductsContext';
import VirtualNumpad from '../components/VirtualNumpad';
import VirtualKeyboard from '../components/VirtualKeyboard';
import { Customer } from '../types';
import { LocalProduct } from '../types/supabase';
import { useTranslation } from 'react-i18next';
import { transactionService } from '../services/transactionService';
import { isSupabaseConfigured, checkSupabaseConnection } from '../lib/supabase';

// Icon mapping for categories
const iconMap = {
  grid: Grid,
  coffee: Coffee,
  milk: Milk,
  cake: Cake,
  candy: Candy,
};

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

const POS: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { cart, addToCart, removeFromCart, updateQuantity, clearCart, selectedCustomer, selectCustomer } = usePOS();
  const { employee, signOut } = useSupabaseAuth();
  const { settings, updateSettings } = useSettings();
  const {
    categories: allCategories,
    getProductsByCategory,
    getActiveProducts,
    isLoading,
    error,
    syncData,
    refreshData
  } = useProducts();

  // Stock validation helper function
  const canAddToCart = (product: LocalProduct, requestedQuantity = 1): boolean => {
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
  const handleAddToCart = (product: LocalProduct, quantity = 1) => {
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
  // POS uses a temporary navigation overlay instead of a persistent sidebar
  const [showNavigation, setShowNavigation] = useState(false);
  const [discount, setDiscount] = useState({ type: 'none', value: 0 });

  // Toggle sidebar and persist state
  // Collapsed state preserved; toggled via showNavigation overlay only in POS

  // Toggle navigation overlay
  const toggleNavigation = () => {
    setShowNavigation(!showNavigation);
  };

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
    onConfirm: (_value: string) => { },
    prefix: '',
    suffix: '',
    placeholder: '0.00',
    allowDecimal: true,
    maxLength: 10
  });
  const [keyboardConfig, setKeyboardConfig] = useState({
    isOpen: false,
    title: '',
    field: '',
    onConfirm: (_value: string) => { },
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
      signOut();
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
  const filteredProducts = selectedCategoryId ? getProductsByCategory(selectedCategoryId) : [];

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

  // Calculate tax extracted from tax-inclusive prices (European style)
  const tax = cart.reduce((sum, item) => {
    const itemTotal = item.product.price * item.quantity;
    const taxAmount = itemTotal - (itemTotal / (1 + item.product.iva_rate));
    return sum + taxAmount;
  }, 0);

  // Apply discount to tax as well (proportionally)
  const discountedTax = tax * (discountedSubtotal / subtotal);
  const finalTaxAfterDiscount = isNaN(discountedTax) ? 0 : discountedTax;

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

  // In European style, total = subtotal (since tax is already included in prices)
  // But we need to adjust tax proportionally with discounts
  const finalTax = finalTaxAfterDiscount * (finalSubtotal / discountedSubtotal);
  const adjustedFinalTax = isNaN(finalTax) ? 0 : finalTax;
  const finalTotal = finalSubtotal;
  const changeAmount = cashReceived > finalTotal ? cashReceived - finalTotal : 0;

  // (category selection handled inline where used)

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
      placeholder: type === 'percentage' ? '%0.00' : '€0.00',
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
      placeholder: '€0.00',
      allowDecimal: true,
      maxLength: 10
    });
  };

  const handleRemoveDiscount = () => {
    setDiscount({ type: 'none', value: 0 });
  };

  const handleLogout = () => {
    signOut();
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
    return <IconComponent className="w-4 h-4" />;
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

  // Removed unused handleCustomerSearch helper

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
      onConfirm: (_value: string) => { },
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
      onConfirm: (_value: string) => { },
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

  // Handle retry/refresh data
  const handleRetryData = async () => {
    try {
      await refreshData();
    } catch (error) {
      console.error('Failed to refresh data:', error);
    }
  };

  // Handle sync data
  const handleSyncData = async () => {
    try {
      await syncData();
    } catch (error) {
      console.error('Failed to sync data:', error);
    }
  };

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Main Content Area - takes most space */}
      <div className="flex-1 flex flex-col">
        {/* Top Header - only over left sidebar + center, not cart */}
        <div className="flex-none bg-white shadow-sm border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Left - Hamburger Menu only */}
            <div className="flex items-center">
              <button
                onClick={toggleNavigation}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Toggle Navigation"
              >
                <Menu className="w-6 h-6 text-gray-600" />
              </button>
            </div>

            {/* Center - Search Bar */}
            <div className="flex-1 max-w-md mx-8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search Product..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Right - Action Buttons */}
            <div className="flex items-center space-x-3">
              <button
                onClick={handleCustomerClick}
                className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-lg transition-colors"
                title="Customer"
              >
                <User className="w-5 h-5" />
              </button>
              <button className="bg-gray-200 hover:bg-gray-300 text-gray-700 p-2 rounded-lg transition-colors">
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Overlay */}
        {showNavigation && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black bg-opacity-30 z-40"
              onClick={() => setShowNavigation(false)}
            />

            {/* Navigation Sidebar */}
            <div className="fixed top-0 left-0 h-full w-80 bg-gradient-to-b from-slate-900 to-slate-800 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col">
              <div className="p-6 border-b border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-2 rounded-lg flex-shrink-0">
                      <FileText className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h1 className="text-xl font-bold">POS System</h1>
                      <p className="text-slate-400 text-sm">Professional Edition</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowNavigation(false)}
                    className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <nav className="flex-1 p-4">
                <ul className="space-y-2">
                  {[
                    { path: '/', icon: LayoutDashboard, label: 'Dashboard', permission: 'dashboard' },
                    { path: '/pos', icon: ShoppingCart, label: 'Point of Sale', permission: 'sales' },
                    { path: '/products', icon: Package, label: 'Products', permission: 'inventory' },
                    { path: '/employees', icon: Users, label: 'Employees', permission: 'employees' },
                    { path: '/reports', icon: BarChart3, label: 'Reports', permission: 'reports' },
                    { path: '/transactions', icon: CreditCard, label: 'Transactions', permission: 'transactions' },
                    { path: '/settings', icon: Settings, label: 'Settings', permission: 'settings' }
                  ].map((item) => {
                    if (!employee) return null;
                    if (employee.role !== 'admin' && !employee.access_levels.includes(item.permission) && !employee.access_levels.includes('all')) return null;

                    const Icon = item.icon;
                    return (
                      <li key={item.path}>
                        <NavLink
                          to={item.path}
                          onClick={() => setShowNavigation(false)}
                          className={({ isActive }) =>
                            `flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 group relative ${isActive
                              ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg transform scale-105'
                              : 'text-slate-300 hover:bg-slate-700 hover:text-white hover:transform hover:scale-105'
                            }`
                          }
                        >
                          <Icon className="w-5 h-5 flex-shrink-0" />
                          <span className="font-medium">{item.label}</span>
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              <div className="p-4 border-t border-slate-700">
                <div className="flex items-center p-3 bg-slate-800 rounded-lg mb-3 space-x-3">
                  <div className={`bg-gradient-to-r ${getRoleColor(employee?.role || '')} p-2 rounded-full flex-shrink-0`}>
                    <UserCircle className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{employee?.name}</p>
                    <p className="text-slate-400 text-xs">{employee?.role.toUpperCase()}</p>
                  </div>
                </div>

                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className="w-full flex items-center px-4 py-3 text-slate-300 hover:bg-red-600 hover:text-white rounded-lg transition-all duration-200 hover:transform hover:scale-105 space-x-3"
                >
                  <LogOut className="w-5 h-5 group-hover:animate-pulse flex-shrink-0" />
                  <span className="font-medium">Logout</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* Content Area - Left sidebar + Center products */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Categories Sidebar */}
          <div className="w-24 bg-gray-100 flex flex-col py-2">
            {/* All Menu Option */}
            <div className="px-3 mb-2">
              <button
                onClick={() => setSelectedCategoryId('')}
                className={`w-full aspect-square flex flex-col items-center justify-center p-1 rounded transition-all duration-200 relative ${!selectedCategoryId
                  ? 'bg-white shadow-sm'
                  : 'bg-gray-200 hover:bg-gray-50'
                  }`}
              >
                {/* Left indicator for selected state */}
                {!selectedCategoryId && (
                  <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-full"></div>
                )}

                <div className={`w-6 h-6 flex items-center justify-center mb-1 ${!selectedCategoryId ? 'text-blue-500' : 'text-gray-500'
                  }`}>
                  <Grid className="w-4 h-4" />
                </div>
                <div className={`text-[10px] font-medium text-center leading-tight px-1 w-full max-w-full ${!selectedCategoryId ? 'text-gray-900' : 'text-gray-500'}`}>{/* category label */}
                  {'All Menu'.split(' ').length > 1 ? (
                    <div className="line-clamp-2 break-words">All Menu</div>
                  ) : (
                    <div className="truncate w-full max-w-full overflow-hidden">All Menu</div>
                  )}
                </div>
              </button>
            </div>

            {/* Category Options */}
            <div className="flex-1 overflow-y-auto px-3 space-y-2">
              {allCategories.map((category) => {
                const isSelected = selectedCategoryId === category.id;
                return (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategoryId(category.id)}
                    className={`w-full aspect-square flex flex-col items-center justify-center p-1 rounded transition-all duration-200 relative ${isSelected
                      ? 'bg-white shadow-sm'
                      : 'bg-gray-200 hover:bg-gray-50'
                      }`}
                  >
                    {/* Left indicator for selected state */}
                    {isSelected && (
                      <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-full"></div>
                    )}

                    <div className={`w-6 h-6 flex items-center justify-center mb-1 text-gray-500`}>
                      {renderCategoryIcon(category.icon)}
                    </div>
                    <div className={`text-[10px] font-medium text-center leading-tight px-1 w-full max-w-full ${isSelected ? 'text-gray-900' : 'text-gray-500'}`}>{/* category label */}
                      {category.name.split(' ').length > 1 ? (
                        <div className="line-clamp-2 break-words">{category.name}</div>
                      ) : (
                        <div className="truncate w-full max-w-full overflow-hidden">{category.name}</div>
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Show empty state if no categories */}
              {allCategories.length === 0 && (
                <div className="text-center py-8">
                  <Grid className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">No categories available</p>
                </div>
              )}
            </div>
          </div>

          {/* Center Products Area */}
          <div className="flex-1 bg-gray-50 overflow-hidden">
            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">Loading Products...</h2>
                  <p className="text-gray-600">Please wait while we load your product catalog</p>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && !isLoading && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">{t('pos.errorLoadingData')}</h2>
                  <p className="text-gray-600 mb-6">{error}</p>
                  <div className="flex space-x-3 justify-center">
                    <button
                      onClick={handleRetryData}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-2xl font-semibold flex items-center space-x-2 transition-colors"
                    >
                      <RefreshCw className="w-5 h-5" />
                      <span>{t('pos.retry')}</span>
                    </button>
                    <button
                      onClick={handleSyncData}
                      className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-2xl font-semibold flex items-center space-x-2 transition-colors"
                    >
                      <RefreshCw className="w-5 h-5" />
                      <span>{t('pos.syncData')}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Products Content */}
            {!isLoading && !error && (
              <div className="h-full overflow-y-auto p-6">
                {/* Show products for selected category OR all products if no category selected */}
                {(() => {
                  const productsToShow = selectedCategoryId ? filteredProducts : getActiveProducts();

                  return (
                    <>
                      {/* Products Grid */}
                      {productsToShow.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                          {productsToShow.map((product) => {
                            const canAdd = canAddToCart(product, 1);
                            const isOutOfStock = !canAdd && !settings.pos.allowNegativeStock;
                            const cartItem = cart.find(item => item.product.id === product.id);
                            const cartQuantity = cartItem ? cartItem.quantity : 0;
                            const remainingStock = product.stock - cartQuantity;

                            return (
                              <div
                                key={product.id}
                                className={`
                                  bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden transition-all duration-200 cursor-pointer relative
                                  ${canAdd
                                    ? 'hover:shadow-lg hover:scale-105'
                                    : 'opacity-60 cursor-not-allowed'
                                  }
                                `}
                                onClick={canAdd ? () => handleAddToCart(product) : undefined}
                              >
                                {/* Cart Quantity Badge */}
                                {cartQuantity > 0 && (
                                  <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold z-10">
                                    {cartQuantity}
                                  </div>
                                )}

                                {/* Product Image */}
                                <div className="aspect-square relative">
                                  <img
                                    src={product.image_url || '/placeholder-product.svg'}
                                    alt={product.name}
                                    className={`w-full h-full object-cover ${isOutOfStock ? 'grayscale' : ''}`}
                                  />

                                  {/* Out of Stock Overlay */}
                                  {isOutOfStock && (
                                    <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                                      <div className="bg-red-500 text-white px-3 py-1 rounded-lg text-sm font-bold">
                                        {t('pos.outOfStock')}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Product Info */}
                                <div className="p-3 flex flex-col h-20">
                                  <h3 className="font-semibold text-gray-800 text-sm truncate flex-1" title={product.name}>{product.name}</h3>

                                  {/* Price and Stock at bottom */}
                                  <div className="flex items-center justify-between mt-auto pt-2">
                                    <span className="text-sm font-bold text-gray-900">€{product.price.toFixed(2)}</span>
                                    <span className="text-xs text-gray-500">Stock: {remainingStock}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        /* Empty Products State */
                        <div className="text-center py-20">
                          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                          <h3 className="text-xl font-semibold text-gray-500 mb-2">
                            {selectedCategoryId ? t('pos.noProductsFoundTitle') : 'No Products Available'}
                          </h3>
                          <p className="text-gray-400">
                            {selectedCategoryId ? t('pos.noProductsFoundMessage') : 'No products found in your catalog'}
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Cart Sidebar - Full Height */}
      <div className="w-96 bg-white shadow-xl border-l border-gray-200 flex flex-col h-screen">
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
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleUpdateQuantity(item.product.id, item.quantity - 1)}
                        className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white p-2 rounded-xl transition-all duration-200 min-h-[20px] min-w-[20px] flex items-center justify-center shadow-lg hover:shadow-xl"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="text-sm font-semibold text-gray-800 min-w-[20px] text-center">{item.quantity}</span>
                      <button
                        onClick={() => handleUpdateQuantity(item.product.id, item.quantity + 1)}
                        className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white p-2 rounded-xl transition-all duration-200 min-h-[20px] min-w-[20px] flex items-center justify-center shadow-lg hover:shadow-xl"
                      >
                        <Plus className="w-4 h-4" />
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
            <div className="flex items-center justify-end">
              <div className="flex space-x-2 w-full">
                <button
                  onClick={() => handleDiscountClick('percentage')}
                  className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white px-3 py-2 rounded-xl transition-colors flex items-center justify-center flex-1 min-w-0"
                >
                  <span className="text-sm font-medium truncate">{t('pos.discountPercentage')}</span>
                </button>
                <button
                  onClick={() => handleDiscountClick('fixed')}
                  className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white px-3 py-2 rounded-xl transition-colors flex items-center justify-center flex-1 min-w-0"
                >
                  <span className="text-sm font-medium truncate">{t('pos.discountFixed')}</span>
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
              <span className="text-gray-800 font-semibold">€{adjustedFinalTax.toFixed(2)}</span>
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
                            placeholder: '123456789',
                            allowDecimal: false,
                            maxLength: 9
                          });
                        }}
                        className={`w-full pl-10 pr-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:border-transparent cursor-pointer ${numpadConfig.isOpen ? 'border-blue-500 bg-blue-50' : 'border-gray-300 focus:ring-blue-500'
                          }`}
                        maxLength={9}
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
                          placeholder: '123456789',
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
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Location Information Section */}
                  <div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          City
                        </label>
                        <input
                          type="text"
                          value={newCustomerForm.city}
                          onChange={(e) => handleCustomerFormChange('city', e.target.value)}
                          onClick={() => handleTextFieldClick('city', false, true, 30)}
                          className={`w-full px-2 py-2 border rounded-xl focus:outline-none focus:ring-1 text-sm cursor-pointer ${activeField === 'city'
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-300 focus:ring-blue-500 focus:border-transparent'
                            }`}
                          placeholder="Lisbon"
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
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Country
                        </label>
                        <input
                          type="text"
                          value={newCustomerForm.country}
                          onChange={(e) => handleCustomerFormChange('country', e.target.value)}
                          onClick={() => handleTextFieldClick('country', false, true, 30)}
                          className={`w-full px-2 py-2 border rounded-xl focus:outline-none focus:ring-1 text-sm cursor-pointer ${activeField === 'country'
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-300 focus:ring-blue-500 focus:border-transparent'
                            }`}
                          placeholder="Portugal"
                        />
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
                  onClick={async () => {
                    // Build receipt data
                    // Build series key per settings (monthly/yearly)
                    const now = new Date();
                    const y = now.getFullYear();
                    const m = String(now.getMonth() + 1).padStart(2, '0');
                    const seriesKey = settings.receipt.resetPolicy === 'monthly'
                      ? `${settings.receipt.seriesPrefix}-${y}${m}`
                      : `${settings.receipt.seriesPrefix}-${y}`;

                    // Compute next number (starting from 1000 via currentNumber default 999)
                    let nextNumber = settings.receipt.currentNumber;
                    let lastSeriesKey = settings.receipt.lastSeriesKey;
                    if (lastSeriesKey !== seriesKey) {
                      nextNumber = 999; // reset so first becomes 1000
                      lastSeriesKey = seriesKey;
                    }
                    nextNumber += 1;

                    const padded = String(nextNumber).padStart(settings.receipt.numericWidth, '0');
                    const documentNumber = `${seriesKey}-${padded}`; // reserved for future persistence in transaction

                    // Persist updated counter using settings updater
                    updateSettings({
                      receipt: {
                        lastSeriesKey,
                        currentNumber: nextNumber,
                      }
                    });

                    const receiptData = {
                      documentType: settings.receipt.defaultDocumentType as 'FATURA' | 'FATURA_SIMPLIFICADA',
                      date: new Date(),
                      counter: settings.receipt.counterLabel,
                      verificationCode: `${settings.receipt.atcudPrefix}-${seriesKey}-${padded}`,
                      // Replace FS placeholder number with our generated document number
                      // Downstream receipt component prints documentNumber value
                      documentNumber: documentNumber,
                      company: {
                        name: settings.company.name,
                        address: settings.company.address,
                        postalCode: settings.company.postalCode,
                        city: settings.company.city,
                        taxNumber: settings.company.taxNumber,
                        phone: settings.company.phone || undefined,
                        email: settings.company.email || undefined,
                      },
                      customer: selectedCustomer ? {
                        taxNumber: selectedCustomer.taxId,
                        name: selectedCustomer.name
                      } : undefined,
                      items: cart.map(ci => ({
                        id: ci.product.id,
                        description: ci.product.name,
                        quantity: ci.quantity,
                        unitPrice: ci.product.price,
                        vatRate: Math.round((ci.product.iva_rate || 0) * 100),
                        // price is tax-included already; total line value equals unit*qty
                        total: Number((ci.product.price * ci.quantity).toFixed(2))
                      })),
                      totals: {
                        subtotal: Number(subtotal.toFixed(2)),
                        discount: Number((discountAmount + customerDiscountAmount).toFixed(2)),
                        discountPercentage: discount.type === 'percentage' ? discount.value : 0,
                        net: Number(finalSubtotal.toFixed(2)),
                        vat: Number(adjustedFinalTax.toFixed(2)),
                        total: Number(finalTotal.toFixed(2))
                      },
                      payment: {
                        method: cashReceived > 0 ? 'Numerário' : 'Multibanco',
                        amountGiven: Number(cashReceived.toFixed(2)),
                        change: Number(changeAmount.toFixed(2))
                      },
                      slogan: settings.company.slogan || undefined,
                      softwareInfo: settings.company.softwareInfo || undefined,
                      certificationNumber: settings.company.certificationNumber || undefined,
                    };

                    // Try to persist transaction to Supabase
                    let navigated = false;
                    try {
                      if (isSupabaseConfigured() && await checkSupabaseConnection()) {
                        const employeeId = employee?.id || 'unknown-employee';
                        const employeeName = employee?.name || 'Employee';
                        const transactionDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
                        const transactionTime = now.toTimeString().slice(0, 8); // HH:MM:SS

                        const paymentMethod = cashReceived > 0 ? 'cash' : 'card' as const;

                        const transactionInsert = {
                          employee_id: employeeId,
                          employee_name: employeeName,
                          customer_id: selectedCustomer?.id || null,
                          customer_name: selectedCustomer?.name || null,
                          transaction_date: transactionDate,
                          transaction_time: transactionTime,
                          subtotal: Number(subtotal.toFixed(2)),
                          discount: Number((discountAmount + customerDiscountAmount).toFixed(2)),
                          tax: Number(adjustedFinalTax.toFixed(2)),
                          total: Number(finalTotal.toFixed(2)),
                          payment_method: paymentMethod,
                          amount_paid: cashReceived > 0 ? Number(cashReceived.toFixed(2)) : Number(finalTotal.toFixed(2)),
                          change_given: Number(changeAmount.toFixed(2)),
                          status: 'completed' as const,
                          notes: null,
                          receipt_number: documentNumber,
                        };

                        const itemsInsert = cart.map(ci => {
                          const lineTotal = Number((ci.product.price * ci.quantity).toFixed(2));
                          const taxAmount = Number((lineTotal - (lineTotal / (1 + (ci.product.iva_rate || 0)))).toFixed(2));
                          return {
                            transaction_id: 'placeholder', // will be set by service
                            product_id: ci.product.id,
                            product_name: ci.product.name,
                            product_sku: ci.product.sku,
                            category_id: ci.product.category_id || null,
                            category_name: ci.product.category_name || null,
                            quantity: ci.quantity,
                            unit_price: ci.product.price,
                            unit_cost: ci.product.cost || 0,
                            iva_rate: ci.product.iva_rate || 0,
                            line_total: lineTotal,
                            tax_amount: taxAmount,
                            profit_amount: 0,
                            discount_amount: 0,
                            discount_percentage: 0,
                          };
                        });

                        const result = await transactionService.createTransaction(transactionInsert as any, itemsInsert as any);
                        if (result?.transaction?.id) {
                          setShowPayment(false);
                          clearCart();
                          navigate(`/receipt-demo/${result.transaction.id}`);
                          navigated = true;
                        }
                      }
                    } catch (e) {
                      console.warn('Transaction persistence failed, falling back to local receipt view.', e);
                    }

                    // Fallback: navigate with state if not navigated via DB id
                    if (!navigated) {
                      setShowPayment(false);
                      clearCart();
                      navigate('/receipt-demo', { state: { receiptData } });
                    }
                  }}
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
              <div className={`bg-gradient-to-r ${getRoleColor(employee?.role || '')} p-4 rounded-full inline-block mb-6`}>
                <UserCircle className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-4">{t('pos.confirmLogoutTitle')}</h3>
              <p className="text-lg text-gray-600 mb-2">
                {t('pos.confirmLogoutQuestion')}, <strong>{employee?.name}</strong>?
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
        placeholder={numpadConfig.placeholder}
        allowDecimal={numpadConfig.allowDecimal}
        maxLength={numpadConfig.maxLength}
      />

      {/* Bottom User Status Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-3 py-1 z-10">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center space-x-3">
            <p className="text-xs font-medium text-gray-800">{employee?.name} • <span className="capitalize text-gray-600">{employee?.role}</span></p>
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