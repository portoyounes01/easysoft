import React, { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  // LayoutDashboard,
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
  Printer,
  Tag,
  ClipboardList,
  Contact,
} from 'lucide-react';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { useDesignSystem2Customization } from '../../contexts/DesignSystem2CustomizationContext';
import LanguageSwitcher from '../LanguageSwitcher';
import '../../styles/design-system-2-scope.css';

interface SidebarProps {
  isCollapsed: boolean;
}

/** Matches `TabButton` `variant="sidebar"` active / idle chrome — remapped inside `.ds2-visual-scope` to DS2 secondary + radius. */
const sidebarNavClass = (isActive: boolean, isCollapsed: boolean): string => {
  const base =
    'flex min-h-touch-sm items-center space-x-3 px-4 py-3 ds2-control-radius-lg transition-all duration-200 group relative';
  const active =
    'bg-gradient-to-r from-blue-600 to-blue-500 text-neutral-100 shadow-lg transform scale-105';
  const idle = 'text-neutral-300 hover:bg-slate-800 hover:text-yellow-400';
  const collapsed = isCollapsed ? 'justify-center' : '';
  return `${base} ${isActive ? active : idle} ${collapsed}`.trim();
};

const Sidebar: React.FC<SidebarProps> = ({ isCollapsed }) => {
  const { employee, signOut, hasPermission } = useSupabaseAuth();
  const { t } = useTranslation();
  const { visualStyle, prefs, layoutClasses } = useDesignSystem2Customization();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const menuItems = useMemo(
    () => [
      // { path: '/', icon: LayoutDashboard, labelKey: 'sidebar.menu.dashboard', permission: 'dashboard' },
      { path: '/pos', icon: ShoppingCart, labelKey: 'sidebar.menu.pos', permission: 'sales' },
      { path: '/products', icon: Package, labelKey: 'sidebar.menu.products', permission: 'inventory' },
      { path: '/categories', icon: Tag, labelKey: 'sidebar.menu.categories', permission: 'inventory' },
      { path: '/customers', icon: Contact, labelKey: 'sidebar.menu.customers', permission: 'inventory' },
      { path: '/employees', icon: Users, labelKey: 'sidebar.menu.employees', permission: 'employees' },
      { path: '/reports', icon: BarChart3, labelKey: 'sidebar.menu.reports', permission: 'reports' },
      { path: '/transactions', icon: CreditCard, labelKey: 'sidebar.menu.transactions', permission: 'transactions' },
      { path: '/fiscal-audit', icon: ClipboardList, labelKey: 'sidebar.menu.fiscalAudit', permission: 'settings' },
      { path: '/settings', icon: Settings, labelKey: 'sidebar.menu.settings', permission: 'settings' },
      { path: '/printer-test', icon: Printer, labelKey: 'sidebar.menu.printerTest', permission: 'settings' },
      { path: '/seed', icon: Database, labelKey: 'sidebar.menu.seedManagement', permission: 'settings' },
      { path: '/cashier-testing', icon: Zap, labelKey: 'sidebar.menu.cashierTesting', permission: 'settings' },
      { path: '/electron-testing', icon: Zap, labelKey: 'sidebar.menu.electronTesting', permission: 'settings' },
    ],
    []
  );

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

  const widthClass = isCollapsed ? 'w-20' : layoutClasses.sidebarW;

  return (
    <>
      <div
        className={`ds2-visual-scope flex h-screen flex-col overflow-y-auto bg-gradient-to-b from-slate-900 to-slate-800 text-white shadow-2xl transition-[width] duration-300 ${widthClass}`}
        style={visualStyle}
        data-ds2-neutral={prefs.neutralFamilyId}
      >
        <div className="border-b border-slate-700 p-6">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 p-2 ds2-control-radius-lg">
              <FileText className="h-6 w-6 text-white" />
            </div>
            {!isCollapsed && (
              <div>
                <h1 className="text-xl font-bold">{t('sidebar.brandTitle')}</h1>
                <p className="text-sm text-slate-400">{t('sidebar.brandSubtitle')}</p>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {menuItems.map((item) => {
              if (!hasPermission(item.permission)) return null;

              const Icon = item.icon;
              const label = t(item.labelKey);
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) => sidebarNavClass(isActive, isCollapsed)}
                    title={isCollapsed ? label : undefined}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {!isCollapsed && <span className="font-medium">{label}</span>}

                    {isCollapsed && (
                      <div className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-sm text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        {label}
                      </div>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-slate-700 p-4">
          <div
            className={`mb-3 flex items-center rounded-lg bg-slate-800 p-3 ds2-control-radius-lg ${isCollapsed ? 'justify-center space-x-0' : 'space-x-3'}`}
          >
            <div className="flex-shrink-0 rounded-full bg-gradient-to-r from-green-500 to-teal-500 p-2">
              <UserCircle className="h-5 w-5 text-white" />
            </div>
            {!isCollapsed && (
              <div className="flex-1">
                <p className="text-sm font-medium">{employee?.name}</p>
                <p className="text-xs text-slate-400">{employee?.role.toUpperCase()}</p>
              </div>
            )}
          </div>

          <LanguageSwitcher variant="sidebar" collapsed={isCollapsed} />

          <button
            type="button"
            onClick={handleLogout}
            className={`group relative flex min-h-touch w-full items-center rounded-lg px-4 py-3 text-slate-300 transition-all duration-200 hover:scale-105 hover:bg-red-600 hover:text-white ds2-control-radius-lg ${isCollapsed ? 'justify-center space-x-0' : 'space-x-3'}`}
            title={isCollapsed ? t('common.logout') : undefined}
          >
            <LogOut className="h-5 w-5 flex-shrink-0 group-hover:animate-pulse" />
            {!isCollapsed && <span className="font-medium">{t('common.logout')}</span>}

            {isCollapsed && (
              <div className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-sm text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                {t('common.logout')}
              </div>
            )}
          </button>
        </div>
      </div>

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-96 max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-6 text-center">
              <div className="mb-4 inline-block rounded-full bg-red-100 p-3">
                <LogOut className="h-8 w-8 text-red-600" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-gray-800">{t('sidebar.logoutConfirmTitle')}</h3>
              <p className="text-gray-600">{t('sidebar.logoutConfirmMessage')}</p>
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={cancelLogout}
                className="min-h-touch-sm flex-1 rounded-lg bg-gray-200 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-300"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={confirmLogout}
                className="flex min-h-touch-sm flex-1 items-center justify-center space-x-2 rounded-lg bg-red-600 py-3 font-semibold text-white transition-colors hover:bg-red-700"
              >
                <LogOut className="h-4 w-4" />
                <span>{t('common.logout')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
