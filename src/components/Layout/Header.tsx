import React, { useState } from 'react';
import { Bell, Search, Clock, DollarSign, LogOut, User, Menu } from 'lucide-react';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import LanguageSwitcher from '../LanguageSwitcher';
import { useTranslation } from 'react-i18next';

interface HeaderProps {
  onToggleSidebar: () => void;
  isSidebarCollapsed: boolean;
}

const Header: React.FC<HeaderProps> = ({ onToggleSidebar, isSidebarCollapsed }) => {
  const { employee, signOut } = useSupabaseAuth();
  const { t } = useTranslation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const currentTime = new Date().toLocaleString('pt-PT', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const handleLogout = () => {
    setShowLogoutConfirm(true);
    setShowUserMenu(false);
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
      <header className="bg-white shadow-lg border-b border-gray-200">
        <div className="px-3 sm:px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2 sm:gap-3 md:gap-4">
            {/* Left Section: Toggle + Date/Time + Till Status */}
            <div className="flex items-center gap-2 sm:gap-3 md:gap-6 flex-shrink min-w-0">
              {/* Sidebar Toggle Button */}
              <button
                onClick={onToggleSidebar}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
              >
                <Menu className="w-5 h-5 text-gray-600" />
              </button>

              {/* Date/Time - Progressive hiding on smaller screens */}
              <div className="hidden lg:flex items-center gap-2 text-gray-600 flex-shrink-0">
                <Clock className="w-5 h-5" />
                <span className="text-sm font-medium whitespace-nowrap">{currentTime}</span>
              </div>

              {/* Short date for tablets */}
              <div className="hidden md:flex lg:hidden items-center gap-2 text-gray-600 flex-shrink-0">
                <Clock className="w-5 h-5" />
                <span className="text-sm font-medium whitespace-nowrap">
                  {new Date().toLocaleString('pt-PT', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>

              {/* Till Status - hidden on mobile */}
              <div className="hidden sm:flex items-center gap-2 bg-green-50 px-2 sm:px-3 py-1 rounded-full flex-shrink-0">
                <DollarSign className="w-4 h-4 text-green-600" />
                <span className="text-xs sm:text-sm font-semibold text-green-700 whitespace-nowrap">{t('common.tillOpen')}</span>
              </div>
            </div>

            {/* Right Section: Language + Search + Notifications + User */}
            <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0">
              {/* Language Switcher - hidden on small mobile */}
              <div className="hidden sm:block">
                <LanguageSwitcher />
              </div>

              {/* Search Bar - progressively shown */}
              <div className="relative hidden lg:block">
                <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('common.searchPlaceholder')}
                  className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-48 xl:w-64"
                />
              </div>

              {/* Notifications - hidden on mobile */}
              <button className="hidden md:block relative p-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0">
                <Bell className="w-5 h-5 text-gray-600" />
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  3
                </span>
              </button>

              {/* User Profile - Responsive */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 sm:gap-3 bg-gradient-to-r from-blue-50 to-purple-50 px-2 sm:px-3 md:px-4 py-2 rounded-lg hover:from-blue-100 hover:to-purple-100 transition-all"
                >
                  <div className="w-7 sm:w-8 h-7 sm:h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs sm:text-sm font-bold">
                      {employee?.name.split(' ').map((n: string) => n[0]).join('')}
                    </span>
                  </div>
                  {/* User info - hidden on small screens */}
                  <div className="hidden md:block">
                    <p className="text-sm font-semibold text-gray-800 text-left whitespace-nowrap">{employee?.name}</p>
                    <p className="text-xs text-gray-500 text-left">{employee?.employee_number}</p>
                  </div>
                </button>

                {/* User Dropdown Menu */}
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                    <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2">
                      <User className="w-4 h-4" />
                      <span>{t('common.profile')}</span>
                    </button>
                    <hr className="my-1" />
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>{t('common.logout')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 max-w-md shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-red-100 p-3 rounded-full inline-block mb-4">
                <LogOut className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">{t('pos.confirmLogoutTitle')}</h3>
              <p className="text-gray-600">{t('pos.confirmLogoutQuestion')} {t('pos.unsavedWork')}</p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={cancelLogout}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-3 rounded-lg font-semibold transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmLogout}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2"
              >
                <LogOut className="w-4 h-4" />
                <span>{t('common.logout')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backdrop to close user menu */}
      {showUserMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowUserMenu(false)}
        />
      )}
    </>
  );
};

export default Header;
