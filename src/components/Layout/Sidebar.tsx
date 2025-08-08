import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  FileText,
  Settings,
  BarChart3,
  CreditCard,
  UserCircle,
  LogOut,
  Database,
  Zap,
  Printer
} from 'lucide-react';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';

interface SidebarProps {
  isCollapsed: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ isCollapsed }) => {
  const { employee, signOut, hasPermission } = useSupabaseAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const menuItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard', permission: 'dashboard' },
    { path: '/pos', icon: ShoppingCart, label: 'Point of Sale', permission: 'sales' },
    { path: '/products', icon: Package, label: 'Products', permission: 'inventory' },
    { path: '/employees', icon: Users, label: 'Employees', permission: 'employees' },
    { path: '/reports', icon: BarChart3, label: 'Reports', permission: 'reports' },
    { path: '/transactions', icon: CreditCard, label: 'Transactions', permission: 'transactions' },
    { path: '/settings', icon: Settings, label: 'Settings', permission: 'settings' },
    { path: '/printer-test', icon: Printer, label: 'Printer Setup', permission: 'settings' },
    { path: '/setup', icon: Database, label: 'Data Setup', permission: 'settings' },
    { path: '/cashier-testing', icon: Zap, label: 'Cashier Testing', permission: 'settings' },
    { path: '/electron-testing', icon: Zap, label: 'Electron Testing', permission: 'settings' }
  ];

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    signOut();
    setShowLogoutConfirm(false);
  };

  const cancelLogout = () => {
    setShowLogoutConfirm(false);
  };

  return (
    <>
      <div className={`bg-gradient-to-b from-slate-900 to-slate-800 text-white min-h-screen flex flex-col shadow-2xl transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'
        }`}>
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-2 rounded-lg flex-shrink-0">
              <FileText className="w-6 h-6 text-white" />
            </div>
            {!isCollapsed && (
              <div>
                <h1 className="text-xl font-bold">POS System</h1>
                <p className="text-slate-400 text-sm">Professional Edition</p>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {menuItems.map((item) => {
              if (!hasPermission(item.permission)) return null;

              const Icon = item.icon;
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      `flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 group relative ${isActive
                        ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg transform scale-105'
                        : 'text-slate-300 hover:bg-slate-700 hover:text-white hover:transform hover:scale-105'
                      } ${isCollapsed ? 'justify-center' : ''}`
                    }
                    title={isCollapsed ? item.label : undefined}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {!isCollapsed && <span className="font-medium">{item.label}</span>}

                    {/* Tooltip for collapsed state */}
                    {isCollapsed && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                        {item.label}
                      </div>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-slate-700">
          <div className={`flex items-center p-3 bg-slate-800 rounded-lg mb-3 ${isCollapsed ? 'justify-center space-x-0' : 'space-x-3'}`}>
            <div className="bg-gradient-to-r from-green-500 to-teal-500 p-2 rounded-full flex-shrink-0">
              <UserCircle className="w-5 h-5 text-white" />
            </div>
            {!isCollapsed && (
              <div className="flex-1">
                <p className="font-medium text-sm">{employee?.name}</p>
                <p className="text-slate-400 text-xs">{employee?.role.toUpperCase()}</p>
              </div>
            )}
          </div>

          <button
            onClick={handleLogout}
            className={`w-full flex items-center px-4 py-3 text-slate-300 hover:bg-red-600 hover:text-white rounded-lg transition-all duration-200 hover:transform hover:scale-105 group relative ${isCollapsed ? 'justify-center space-x-0' : 'space-x-3'
              }`}
            title={isCollapsed ? 'Logout' : undefined}
          >
            <LogOut className="w-5 h-5 group-hover:animate-pulse flex-shrink-0" />
            {!isCollapsed && <span className="font-medium">Logout</span>}

            {/* Tooltip for collapsed state */}
            {isCollapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                Logout
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 max-w-md shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-red-100 p-3 rounded-full inline-block mb-4">
                <LogOut className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Confirm Logout</h3>
              <p className="text-gray-600">Are you sure you want to logout? Any unsaved work will be lost.</p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={cancelLogout}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-3 rounded-lg font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;