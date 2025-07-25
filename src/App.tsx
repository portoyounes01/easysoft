import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { SupabaseAuthProvider, useSupabaseAuth } from './contexts/SupabaseAuthContext';
import { POSProvider } from './contexts/POSContext';
import { SettingsProvider } from './contexts/SettingsContext';
import Layout from './components/Layout/Layout';
import LoginForm from './components/Auth/LoginForm';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Products from './pages/Products';
import Employees from './pages/Employees';
import Transactions from './pages/Transactions';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import DataSetup from './components/DataSetup';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useSupabaseAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
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
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-6">
            Sorry <strong>{employee?.name}</strong>, you don't have permission to access this page.
            <br />
            <span className="text-sm text-gray-500">
              Your role: <span className="font-medium capitalize">{employee?.role}</span>
            </span>
          </p>
          <div className="space-y-3">
            <Navigate to={fallbackPath} replace />
            <p className="text-sm text-gray-500">Redirecting to your allowed area...</p>
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
      return '/'; // Dashboard - full overview for admins
    case 'manager':
      return '/reports'; // Business intelligence for managers
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
            <LoginForm />
          )
        }
      />

      {/* POS Route - Full Screen without Sidebar */}
      <Route
        path="/pos"
        element={
          <ProtectedRoute>
            <POSProvider>
              <PermissionRoute permission="sales">
                <div className="min-h-screen bg-gray-50">
                  <POS />
                </div>
              </PermissionRoute>
            </POSProvider>
          </ProtectedRoute>
        }
      />

      {/* All Other Routes - With Layout and Sidebar */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <POSProvider>
              <Layout>
                <Routes>
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
                    path="/employees"
                    element={
                      <PermissionRoute permission="employees">
                        <Employees />
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
                    path="/transactions"
                    element={
                      <PermissionRoute permission="transactions">
                        <Transactions />
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
                    path="/setup"
                    element={
                      <PermissionRoute permission="settings">
                        <DataSetup />
                      </PermissionRoute>
                    }
                  />
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