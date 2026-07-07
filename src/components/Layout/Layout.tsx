import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import InstallBanner from "../pwa/InstallBanner";
import { isPwaHost } from "../../lib/host";
import MyProfileDialog from "../HR/MyProfileDialog";
import { useSettings } from "../../contexts/SettingsContext";
import { DesignSystem2CustomizationProvider } from "../../contexts/DesignSystem2CustomizationContext";
import { LayoutNavProvider } from "../../contexts/LayoutNavContext";
import {
  receiptProfileForDefaultDocumentType,
  isIssueDateOutsideSeriesWindow,
} from "../../fiscal/receiptSeriesProfile";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { pathname } = useLocation();
  const isPosRoute = pathname === "/pos";
  const { settings } = useSettings();
  const { t } = useTranslation();

  const seriesOutsideValidity = useMemo(() => {
    const prof = receiptProfileForDefaultDocumentType(settings.receipt);
    const today = new Date().toISOString().split("T")[0];
    return isIssueDateOutsideSeriesWindow(today, prof) !== null;
  }, [settings.receipt]);

  // Load sidebar state from localStorage, default to expanded on desktop
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    return saved ? JSON.parse(saved) : false;
  });

  // Mobile sidebar open state (separate from collapsed state)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // POS: app nav hidden until menu button opens overlay drawer
  const [isPosNavOpen, setIsPosNavOpen] = useState(false);

  useEffect(() => {
    if (isPosRoute) {
      setIsPosNavOpen(false);
    }
  }, [isPosRoute]);

  // Check if we're on mobile
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Persist sidebar state to localStorage (non-POS desktop collapse only)
  useEffect(() => {
    if (!isPosRoute) {
      localStorage.setItem(
        "sidebarCollapsed",
        JSON.stringify(isSidebarCollapsed),
      );
    }
  }, [isSidebarCollapsed, isPosRoute]);

  const toggleNavSidebar = useCallback(() => {
    if (isPosRoute) {
      setIsPosNavOpen((open) => !open);
      return;
    }
    if (isMobile) {
      setIsMobileSidebarOpen((open) => !open);
    } else {
      setIsSidebarCollapsed((collapsed: boolean) => !collapsed);
    }
  }, [isPosRoute, isMobile]);

  const closeNavSidebar = useCallback(() => {
    if (isPosRoute) {
      setIsPosNavOpen(false);
      return;
    }
    setIsMobileSidebarOpen(false);
  }, [isPosRoute]);

  const showNavBackdrop =
    (isPosRoute && isPosNavOpen) || (isMobile && isMobileSidebarOpen);

  const sidebarTranslateClass = isPosRoute
    ? isPosNavOpen
      ? "translate-x-0"
      : "-translate-x-full"
    : isMobile && !isMobileSidebarOpen
      ? "-translate-x-full"
      : "translate-x-0";

  const layoutNavValue = useMemo(
    () => ({
      toggleNavSidebar,
      closeNavSidebar,
      isPosOverlayNav: isPosRoute,
    }),
    [toggleNavSidebar, closeNavSidebar, isPosRoute],
  );

  return (
    <DesignSystem2CustomizationProvider>
      <LayoutNavProvider value={layoutNavValue}>
        <div className="flex h-screen overflow-hidden bg-[#f7f7f7]">
          {showNavBackdrop && (
            <div
              className="fixed inset-0 z-30 bg-black/50"
              onClick={closeNavSidebar}
              aria-hidden
            />
          )}

          {/* Sidebar — POS: overlay drawer; mobile: overlay; desktop: in-flow */}
          <div
            className={`
        ${isPosRoute || isMobile ? "fixed inset-y-0 left-0 z-40" : "relative"}
        ${sidebarTranslateClass}
        transition-transform duration-300 ease-in-out
      `}
          >
            <Sidebar
              isCollapsed={!isPosRoute && !isMobile && isSidebarCollapsed}
              onToggleCollapse={toggleNavSidebar}
              onNavigate={isPosRoute ? closeNavSidebar : undefined}
            />
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden relative z-10 w-full">
            {!isPosRoute && (
              <div className="h-[64px] md:h-[80px] flex-shrink-0 border-b border-[#dedede] bg-[#f7f7f7] flex items-center gap-2 px-4 md:px-6">
                {/* Mobile nav trigger: the sidebar is a drawer < md, so this is the only way
                    to open the menu. Hidden on desktop where the sidebar is in-flow. */}
                <button
                  type="button"
                  onClick={toggleNavSidebar}
                  className="md:hidden -ml-1 p-2 rounded-lg text-gray-700 hover:bg-black/5 transition-colors"
                  aria-label={t("sidebar.openMenu", { defaultValue: "Open menu" })}
                >
                  <Menu className="w-6 h-6" />
                </button>
                <div className="md:hidden flex items-center gap-2 min-w-0">
                  <span className="text-lg font-bold text-gray-900 truncate">POS System</span>
                </div>
              </div>
            )}
            <main
              className={
                isPosRoute
                  ? "flex-1 min-h-0 overflow-hidden p-0"
                  : "flex-1 overflow-y-auto bg-[#f7f7f7] p-5"
              }
            >
              {settings.fiscal.trainingMode && (
                <div
                  className="mb-4 rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-amber-950 text-center font-semibold text-lg"
                  role="status"
                >
                  FORMAÇÃO — documentos sem valor fiscal. Base de dados local de
                  treino.
                </div>
              )}
              {seriesOutsideValidity && (
                <div className="mb-4 rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-red-900 text-center font-semibold text-lg">
                  {t("settings.company.seriesOutsideValidityBanner")}
                </div>
              )}
              {isPwaHost && <InstallBanner />}
              {children}
            </main>
          </div>
          <MyProfileDialog />
        </div>
      </LayoutNavProvider>
    </DesignSystem2CustomizationProvider>
  );
};

export default Layout;
