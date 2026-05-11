import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Sidebar from './Sidebar';
import Header from './Header';
import { useSettings } from '../../contexts/SettingsContext';
import { DesignSystem2CustomizationProvider } from '../../contexts/DesignSystem2CustomizationContext';
import { receiptProfileForDefaultDocumentType, isIssueDateOutsideSeriesWindow } from '../../fiscal/receiptSeriesProfile';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { settings } = useSettings();
  const { t } = useTranslation();

  const seriesOutsideValidity = useMemo(() => {
    const prof = receiptProfileForDefaultDocumentType(settings.receipt);
    const today = new Date().toISOString().split('T')[0];
    return isIssueDateOutsideSeriesWindow(today, prof) !== null;
  }, [settings.receipt]);

  // Load sidebar state from localStorage, default to expanded on desktop
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  // Mobile sidebar open state (separate from collapsed state)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Check if we're on mobile
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Persist sidebar state to localStorage
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  const toggleSidebar = () => {
    if (isMobile) {
      setIsMobileSidebarOpen(!isMobileSidebarOpen);
    } else {
      setIsSidebarCollapsed(!isSidebarCollapsed);
    }
  };

  const closeMobileSidebar = () => {
    setIsMobileSidebarOpen(false);
  };

  return (
    <DesignSystem2CustomizationProvider>
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Backdrop for mobile sidebar */}
      {isMobile && isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={closeMobileSidebar}
        />
      )}

      {/* Sidebar - Overlay on mobile, fixed on desktop */}
      <div className={`
        ${isMobile ? 'fixed inset-y-0 left-0 z-40' : 'relative'}
        ${isMobile && !isMobileSidebarOpen ? '-translate-x-full' : 'translate-x-0'}
        transition-transform duration-300 ease-in-out
      `}>
        <Sidebar isCollapsed={!isMobile && isSidebarCollapsed} />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10 w-full">
        {/* <Header onToggleSidebar={toggleSidebar} isSidebarCollapsed={isSidebarCollapsed} /> */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          {settings.fiscal.trainingMode && (
            <div
              className="mb-4 rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-amber-950 text-center font-semibold text-lg"
              role="status"
            >
              FORMAÇÃO — documentos sem valor fiscal. Base de dados local de treino.
            </div>
          )}
          {import.meta.env.DEV && (
            <div className="mb-4 rounded-2xl border border-violet-300 bg-violet-50 px-4 py-2 text-violet-900 text-center text-base">
              Debug build – HashControl fiscal e definições extra são visíveis.
            </div>
          )}
          {receiptProfileForDefaultDocumentType(settings.receipt).seriesDiscontinued && (
            <div className="mb-4 rounded-2xl border-2 border-orange-400 bg-orange-50 px-4 py-3 text-orange-950 text-center font-semibold text-lg">
              Série fiscal marcada como descontinuada — confirme a série junto da AT antes de continuar a faturar.
            </div>
          )}
          {seriesOutsideValidity && (
            <div className="mb-4 rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-red-900 text-center font-semibold text-lg">
              {t('settings.company.seriesOutsideValidityBanner')}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
    </DesignSystem2CustomizationProvider>
  );
};

export default Layout;