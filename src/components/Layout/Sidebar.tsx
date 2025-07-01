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
  LogOut
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const Sidebar: React.FC = () => {
  const { user, logout, hasPermission } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const menuItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard', permission: 'dashboard' },
    { path: '/pos', icon: ShoppingCart, label: 'Point of Sale', permission: 'sales' },
    { path: '/products', icon: Package, label: 'Products', permission: 'inventory' },
    { path: '/employees', icon: Users, label: 'Employees', permission: 'employees' },
    { path: '/reports', icon: BarChart3, label: 'Reports', permission: 'reports' },
    { path: '/transactions', icon: CreditCard, label: 'Transactions', permission: 'sales' },
    { path: '/settings', icon: Settings, label: 'Settings', permission: 'settings' }
  ];

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    logout();
    setShowLogoutConfirm(false);
  };

  const cancelLogout = () => {
    setShowLogoutConfirm(false);
  };

  return (
    <>
      <div className="bg-gradient-to-b from-slate-900 to-slate-800 text-white w-64 min-h-screen flex flex-col shadow-2xl">
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-2 rounded-lg">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">POS System</h1>
              <p className="text-slate-400 text-sm">Professional Edition</p>
            </div>
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
                      `flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                        isActive
                          ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg transform scale-105'
                          : 'text-slate-300 hover:bg-slate-700 hover:text-white hover:transform hover:scale-105'
                      }`
                    }
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center space-x-3 p-3 bg-slate-800 rounded-lg mb-3">
            <div className="bg-gradient-to-r from-green-500 to-teal-500 p-2 rounded-full">
              <UserCircle className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">{user?.name}</p>
              <p className="text-slate-400 text-xs">{user?.role.toUpperCase()}</p>
            </div>
          </div>
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 text-slate-300 hover:bg-red-600 hover:text-white rounded-lg transition-all duration-200 hover:transform hover:scale-105 group"
          >
            <LogOut className="w-5 h-5 group-hover:animate-pulse" />
            <span className="font-medium">Logout</span>
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