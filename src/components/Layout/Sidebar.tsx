import React, { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  // LayoutDashboard,
  Menu,
  ShoppingCart,
  Package,
  Users,
  Settings,
  BarChart3,
  Calculator,
  CreditCard,
  ShoppingBag,
  UserCircle,
  LogOut,
  Zap,
  Tag,
  ClipboardList,
  ListOrdered,
  Contact,
  Palette,
  Briefcase,
  Archive,
  FileCheck2,
  Boxes,
  LineChart,
  MonitorSmartphone,
} from "lucide-react";
import { useSupabaseAuth } from "../../contexts/SupabaseAuthContext";
import { useDesignSystem2Customization } from "../../contexts/DesignSystem2CustomizationContext";
import LanguageSwitcher from "../LanguageSwitcher";
import { OPEN_MY_PROFILE_EVENT } from "../HR/MyProfileDialog";
import "../../styles/design-system-2-scope.css";

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  /** Called after a nav link is chosen (e.g. close POS overlay drawer) */
  onNavigate?: () => void;
}

const sidebarNavClass = (isActive: boolean, isCollapsed: boolean): string => {
  const base =
    "group relative flex min-h-[44px] items-center gap-4 rounded-[18px] border px-4 text-sm transition-all duration-200";
  const active =
    "border-[#d6d6d6] bg-white text-[#171717] shadow-[0_1px_2px_rgba(0,0,0,0.06)] before:absolute before:left-0 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-emerald-500";
  const idle =
    "border-transparent text-[#171717] hover:border-[#d8d8d8] hover:bg-white";
  const collapsed = isCollapsed ? "justify-center" : "";
  return `${base} ${isActive ? active : idle} ${collapsed}`.trim();
};

const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, onToggleCollapse, onNavigate }) => {
  const { employee, signOut, hasPermission } = useSupabaseAuth();
  const { t } = useTranslation();
  const { visualStyle, prefs } = useDesignSystem2Customization();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const menuItems = useMemo(
    () => [
      // { path: '/', icon: LayoutDashboard, labelKey: 'sidebar.menu.dashboard', permission: 'dashboard' },
      {
        path: "/pos",
        icon: ShoppingCart,
        labelKey: "sidebar.menu.pos",
        permission: "sales",
      },
      {
        path: "/products",
        icon: Package,
        labelKey: "sidebar.menu.products",
        permission: "inventory",
      },
      {
        path: "/purchase-receipts",
        icon: FileCheck2,
        labelKey: "sidebar.menu.purchaseReceipts",
        permission: "inventory",
      },
      {
        path: "/inventory",
        icon: Boxes,
        labelKey: "sidebar.menu.inventory",
        permission: "inventory",
      },
      {
        path: "/categories",
        icon: Tag,
        labelKey: "sidebar.menu.categories",
        permission: "inventory",
      },
      {
        path: "/customers",
        icon: Contact,
        labelKey: "sidebar.menu.customers",
        permission: "customers",
      },
      {
        path: "/employees",
        icon: Users,
        labelKey: "sidebar.menu.employees",
        permission: "employees",
      },
      {
        path: "/hr",
        icon: Briefcase,
        labelKey: "sidebar.menu.hr",
        permission: "employees",
      },
      {
        path: "/reports",
        icon: BarChart3,
        labelKey: "sidebar.menu.reports",
        permission: "reports",
      },
      {
        path: "/profit-costs",
        icon: Calculator,
        labelKey: "sidebar.menu.profitCosts",
        permission: "profit_costs",
      },
      {
        path: "/stock-profit",
        icon: LineChart,
        labelKey: "sidebar.menu.stockProfit",
        permission: "reports",
      },
      {
        path: "/transactions",
        icon: CreditCard,
        labelKey: "sidebar.menu.transactions",
        permission: "transactions",
      },
      {
        path: "/orders",
        icon: ShoppingBag,
        labelKey: "sidebar.menu.orders",
        permission: "orders",
      },
      {
        path: "/queue",
        icon: ListOrdered,
        labelKey: "sidebar.menu.queue",
        permission: "sales",
      },
      {
        path: "/cash-drawer-audit",
        icon: Archive,
        labelKey: "sidebar.menu.cashDrawerAudit",
        permission: "transactions",
      },
      {
        path: "/fiscal-audit",
        icon: ClipboardList,
        labelKey: "sidebar.menu.fiscalAudit",
        permission: "settings",
      },
      {
        path: "/devices",
        icon: MonitorSmartphone,
        labelKey: "sidebar.menu.devices",
        permission: "settings",
      },
      {
        path: "/settings",
        icon: Settings,
        labelKey: "sidebar.menu.settings",
        permission: "settings",
      },
      {
        path: "/appearances",
        icon: Palette,
        labelKey: "sidebar.menu.appearances",
        permission: "settings",
      },
    ],
    [],
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

  const widthClass = isCollapsed ? "w-20" : "w-[320px]";

  return (
    <>
      <div
        className={`ds2-visual-scope flex h-screen flex-col overflow-hidden bg-[#f7f7f7] text-[#171717] transition-[width] duration-300 ${widthClass}`}
        style={visualStyle}
        data-ds2-neutral={prefs.neutralFamilyId}
      >
        <div className={`flex flex-shrink-0 items-center border-b border-[#dedede] ${isCollapsed ? "justify-center px-2" : "px-5"}`} style={{ height: 80 }}>
          <div className={`flex min-w-0 items-center ${isCollapsed ? "justify-center" : "gap-5"}`}>
            <button
              type="button"
              onClick={onToggleCollapse}
              className="flex min-h-touch-xs min-w-[2.75rem] items-center justify-center rounded-xl text-[#727272] transition-colors duration-200 hover:bg-white hover:text-[#171717]"
              aria-label={isCollapsed ? t("sidebar.expand", { defaultValue: "Expand sidebar" }) : t("sidebar.collapse", { defaultValue: "Collapse sidebar" })}
              aria-expanded={!isCollapsed}
            >
              <Menu className="h-[20px] w-[20px] flex-shrink-0" />
            </button>
            {!isCollapsed && (
              <div className="flex min-w-0 items-center gap-2.5">
                <Zap className="h-[32px] w-[32px] flex-shrink-0 fill-emerald-500 text-emerald-500" />
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-semibold leading-none text-[#4b4b4b]">
                    {t("sidebar.brandTitle")}
                  </h1>
                </div>
              </div>
            )}
          </div>
        </div>

        <nav className={`min-h-0 flex-1 overflow-y-auto py-5 ${isCollapsed ? "px-3" : "px-6"}`}>
          <ul className="space-y-4">
            {menuItems.map((item) => {
              if (!hasPermission(item.permission)) return null;

              const Icon = item.icon;
              const label = t(item.labelKey, {
                defaultValue:
                  item.labelKey === "sidebar.menu.hr"
                    ? "HR & Attendance"
                    : item.labelKey === "sidebar.menu.cashDrawerAudit"
                      ? "Cash Drawer Audit"
                      : item.labelKey === "sidebar.menu.purchaseReceipts"
                        ? "Purchase Imports"
                      : item.labelKey === "sidebar.menu.inventory"
                        ? "Inventory"
                      : item.labelKey === "sidebar.menu.stockProfit"
                        ? "Stock & Profit"
                      : item.labelKey === "sidebar.menu.devices"
                        ? "Tills"
                      : item.labelKey,
              });
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === "/"}
                    className={({ isActive }) =>
                      sidebarNavClass(isActive, isCollapsed)
                    }
                    title={isCollapsed ? label : undefined}
                    onClick={() => onNavigate?.()}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0 stroke-[2]" />
                    {!isCollapsed && (
                      <span className="truncate font-normal tracking-normal">
                        {label}
                      </span>
                    )}

                    {isCollapsed && (
                      <div className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-900 opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100">
                        {label}
                      </div>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex-shrink-0 p-3">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_MY_PROFILE_EVENT))}
            className={`mb-2 flex min-h-touch-xs w-full items-center rounded-md px-2.5 py-2 text-left transition-colors hover:bg-white ${isCollapsed ? "justify-center space-x-0" : "space-x-2.5"}`}
            title={isCollapsed ? "My Profile" : undefined}
          >
            <div className="flex-shrink-0 rounded-full bg-gray-100 p-1.5">
              <UserCircle className="h-4 w-4 text-gray-500" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-gray-950">
                  {employee?.name}
                </p>
                <p className="truncate text-[11px] font-medium text-gray-400">
                  {employee?.role.toUpperCase()}
                </p>
              </div>
            )}
          </button>

          <LanguageSwitcher variant="sidebar" collapsed={isCollapsed} />

          <button
            type="button"
            onClick={handleLogout}
            className={`group relative flex min-h-touch-xs w-full items-center rounded-md border border-gray-200 bg-white px-2.5 py-2 text-gray-900 transition-all duration-200 hover:border-red-100 hover:bg-red-50 hover:text-red-600 ${isCollapsed ? "justify-center space-x-0" : "space-x-2.5"}`}
            title={isCollapsed ? t("common.logout") : undefined}
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            {!isCollapsed && (
              <span className="text-xs font-medium">{t("common.logout")}</span>
            )}

            {isCollapsed && (
              <div className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-900 opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100">
                {t("common.logout")}
              </div>
            )}
          </button>
        </div>
      </div>

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-96 max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-6 text-center">
              <div className="mb-4 inline-block rounded-full bg-red-100 p-3">
                <LogOut className="h-8 w-8 text-red-600" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-gray-800">
                {t("sidebar.logoutConfirmTitle")}
              </h3>
              <p className="text-gray-600">
                {t("sidebar.logoutConfirmMessage")}
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={cancelLogout}
                className="min-h-touch-sm flex-1 rounded-lg bg-gray-200 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-300"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={confirmLogout}
                className="flex min-h-touch-sm flex-1 items-center justify-center space-x-2 rounded-lg bg-red-600 py-3 font-semibold text-white transition-colors hover:bg-red-700"
              >
                <LogOut className="h-4 w-4" />
                <span>{t("common.logout")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
