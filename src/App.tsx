import React from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SupabaseAuthProvider, useSupabaseAuth } from './contexts/SupabaseAuthContext';
import { POSProvider } from './contexts/POSContext';
import { SettingsProvider } from './contexts/SettingsContext';
import Layout from './components/Layout/Layout';
import LoginForm2 from './components/Auth/LoginForm2';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import POS2 from './pages/POS2';
import Products from './pages/Products';
import Customers from './pages/Customers';
import Categories from './pages/Categories';
import Employees from './pages/Employees';
import Transactions from './pages/Transactions';
import DeliveryOrders from './pages/DeliveryOrders';
import Reports from './pages/Reports';
import ProfitCosts from './pages/ProfitCosts';
import Settings from './pages/Settings';
import DataSetup from './components/DataSetup';
import ReceiptDemoPage from './pages/ReceiptDemo';
import DevicePairing from './pages/DevicePairing';
import Appearances from './pages/Appearances';
import DesignSystem2 from './pages/DesignSystem2';
import FiscalAudit from './pages/FiscalAudit';
import OrderQueue from './pages/OrderQueue';
import OrderStatusDisplay from './pages/OrderStatusDisplay';
import { hasDevicePairingScope } from './utils/devicePairingStorage';
import HR from './pages/HR';
import CashDrawerAudit from './pages/CashDrawerAudit';
import PurchaseReceipts from './pages/PurchaseReceipts';
import Inventory from './pages/Inventory';
import StockProfitReport from './pages/StockProfitReport';
import Devices from './pages/Devices';

const Router = ['app:', 'file:'].includes(window.location.protocol) ? HashRouter : BrowserRouter;

// Dev-tools gate (Phase 0 hardening): dangerous/demo routes register ONLY in dev builds or when
// explicitly enabled. Keeps the mass-delete /setup UI, the unauthenticated /pos2 preview, the
// seed/cashier/electron test stubs, and the design-system out of production bundles.
// Production Electron/web builds have import.meta.env.DEV === false and leave the flag unset.
// NOTE: the /settings?hw= panels themselves are gated in Settings.tsx — App.tsx stubs alone are not enough.
const DEV_TOOLS = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DANGEROUS_DATA_TOOLS === 'true';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useSupabaseAuth();
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">{t('app.loading')}</p>
        </div>
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

// Permission-based route protection
const PermissionRoute: React.FC<{
  children: React.ReactNode;
  permission: string;
  fallbackPath?: string;
}> = ({ children, permission, fallbackPath = '/pos' }) => {
  const { hasPermission, employee } = useSupabaseAuth();
  const { t } = useTranslation();

  if (!hasPermission(permission)) {
    // Show access denied page for unauthorized access attempts
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-red-100 p-4 rounded-full inline-block mb-6">
            <svg className="w-16 h-16 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m9-7a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-4">{t('app.accessDenied')}</h1>
          <p className="text-gray-600 mb-6">
            {t('app.accessDeniedMessage', { name: employee?.name ?? '' })}
            <br />
            <span className="text-sm text-gray-500">
              {t('app.yourRole')} <span className="font-medium capitalize">{employee?.role}</span>
            </span>
          </p>
          <div className="space-y-3">
            <Navigate to={fallbackPath} replace />
            <p className="text-sm text-gray-500">{t('app.redirecting')}</p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

// Role-based redirect logic for security
const getRoleBasedRedirect = (role: string): string => {
  switch (role) {
    case 'admin':
      return '/pos'; // POS is the main post-login workspace
    case 'manager':
      return '/pos'; // POS is the main post-login workspace
    case 'cashier':
      return '/pos'; // Point of sale for cashiers
    default:
      return '/pos'; // Default to POS for unknown roles (safest option)
  }
};

const AppContent: React.FC = () => {
  const { isAuthenticated, employee } = useSupabaseAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated && employee ? (
            <Navigate to={getRoleBasedRedirect(employee.role)} replace />
          ) : (
            <LoginForm2 />
          )
        }
      />
      <Route
        path="/login2"
        element={
          isAuthenticated && employee ? (
            <Navigate to={getRoleBasedRedirect(employee.role)} replace />
          ) : (
            <LoginForm2 />
          )
        }
      />
      <Route
        path="/order-status"
        element={hasDevicePairingScope() ? <OrderStatusDisplay /> : <Navigate to="/pair-device" replace />}
      />

      {/* Device pairing — pre-auth: a fresh till pairs (gets a device session) before any employee login (Phase 2). */}
      <Route path="/pair-device" element={<DevicePairing />} />

      {/* Standalone UI-redesign preview — dev-only (unauthenticated); not registered in production builds */}
      {DEV_TOOLS && <Route path="/pos2" element={<POS2 />} />}

      {/* App routes — shared Layout + Sidebar (including POS) */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <POSProvider>
              <Layout>
                <Routes>
                  <Route
                    path="/pos"
                    element={
                      <PermissionRoute permission="sales">
                        <POS />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="/"
                    element={
                      <PermissionRoute permission="dashboard">
                        <Dashboard />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="/products"
                    element={
                      <PermissionRoute permission="inventory">
                        <Products />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="/purchase-receipts"
                    element={
                      <PermissionRoute permission="inventory">
                        <PurchaseReceipts />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="/inventory"
                    element={
                      <PermissionRoute permission="inventory">
                        <Inventory />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="/categories"
                    element={
                      <PermissionRoute permission="inventory">
                        <Categories />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="/customers"
                    element={
                      <PermissionRoute permission="customers">
                        <Customers />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="/employees"
                    element={
                      <PermissionRoute permission="employees">
                        <Employees />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="/hr"
                    element={
                      <PermissionRoute permission="employees">
                        <HR />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="/reports"
                    element={
                      <PermissionRoute permission="reports">
                        <Reports />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="/profit-costs"
                    element={
                      <PermissionRoute permission="profit_costs">
                        <ProfitCosts />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="/stock-profit"
                    element={
                      <PermissionRoute permission="reports">
                        <StockProfitReport />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="/transactions"
                    element={
                      <PermissionRoute permission="transactions">
                        <Transactions />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="/orders"
                    element={
                      <PermissionRoute permission="orders">
                        <DeliveryOrders />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="/queue"
                    element={
                      <PermissionRoute permission="sales">
                        <OrderQueue />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="/cash-drawer-audit"
                    element={
                      <PermissionRoute permission="transactions">
                        <CashDrawerAudit />
                      </PermissionRoute>
                    }
                  />
                  <Route path="/delivery-orders" element={<Navigate to="/orders" replace />} />
                  <Route
                    path="/fiscal-audit"
                    element={
                      <PermissionRoute permission="settings">
                        <FiscalAudit />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="/devices"
                    element={
                      <PermissionRoute permission="settings">
                        <Devices />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <PermissionRoute permission="settings">
                        <Settings />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="/appearances"
                    element={
                      <PermissionRoute permission="settings">
                        <Appearances />
                      </PermissionRoute>
                    }
                  />
                  {DEV_TOOLS && (
                    <>
                      <Route
                        path="/setup"
                        element={
                          <PermissionRoute permission="settings">
                            <DataSetup />
                          </PermissionRoute>
                        }
                      />
                      <Route path="/seed" element={<Navigate to="/settings?hw=seed" replace />} />
                      <Route
                        path="/receipt-demo"
                        element={
                          <PermissionRoute permission="sales">
                            <ReceiptDemoPage />
                          </PermissionRoute>
                        }
                      />
                      <Route
                        path="/receipt-demo/:id"
                        element={
                          <PermissionRoute permission="sales">
                            <ReceiptDemoPage />
                          </PermissionRoute>
                        }
                      />
                    </>
                  )}
                  {DEV_TOOLS && <Route path="/cashier-testing" element={<Navigate to="/settings?hw=cashier" replace />} />}
                  {DEV_TOOLS && <Route path="/electron-testing" element={<Navigate to="/settings?hw=electron" replace />} />}
                  {/* /printer-test stays available — printer setup/recovery is production functionality */}
                  <Route path="/printer-test" element={<Navigate to="/settings?hw=printer" replace />} />
                  {DEV_TOOLS && (
                    <>
                      <Route
                        path="/design-system"
                        element={
                          <PermissionRoute permission="settings">
                            <DesignSystem2 />
                          </PermissionRoute>
                        }
                      />
                      <Route path="/design-system-2" element={<Navigate to="/design-system" replace />} />
                    </>
                  )}
                </Routes>
              </Layout>
            </POSProvider>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

function App() {
  return (
    <SupabaseAuthProvider>
      <SettingsProvider>
        <Router>
          <AppContent />
        </Router>
      </SettingsProvider>
    </SupabaseAuthProvider>
  );
}

export default App;
