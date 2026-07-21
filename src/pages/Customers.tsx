import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Edit,
  Filter,
  Loader2,
  MoreVertical,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CustomerForm from '../components/CustomerForm';
import { AdminActionButton } from '../components/ui/AdminActionButton';
import { ConfiguredDialogShell } from '../components/ui/ConfiguredDialogShell';
import { dialogButtonClasses, useAppliedDialogStyle } from '../theme/dialogStyle';
import { useDesignSystem2Customization } from '../contexts/DesignSystem2CustomizationContext';
import {
  customerLocalService,
  initializeLocalDatabase,
  transactionLocalService,
} from '../lib/localDatabase';
import type { LocalCustomer } from '../types/supabase';
import '../styles/design-system-2-scope.css';

const CustomersInner: React.FC = () => {
  const { visualStyle, prefs, layoutClasses } = useDesignSystem2Customization();
  const { t } = useTranslation();
  const appliedDialogStyle = useAppliedDialogStyle();
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [latestPurchases, setLatestPurchases] = useState<Record<string, Date>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState<'name_asc' | 'name_desc'>('name_asc');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<LocalCustomer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<LocalCustomer | null>(null);
  const [openMenuCustomerId, setOpenMenuCustomerId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const reloadCustomers = useCallback(async () => {
    const [list, purchases] = await Promise.all([
      customerLocalService.getAllCustomers(),
      transactionLocalService.getLatestPurchaseDatesByCustomer(),
    ]);
    setCustomers(list);
    setLatestPurchases(purchases);
  }, []);

  const formatDate = useCallback((date: Date) => {
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }, []);

  const formatLastPurchase = useCallback((date?: Date) => {
    if (!date) return '—';
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }, []);

  const filteredCustomers = useMemo(() => {
    let result = customers;
    const query = searchTerm.trim().toLowerCase();
    if (query) {
      result = result.filter(
        customer =>
          customer.name.toLowerCase().includes(query) ||
          (customer.tax_number ?? '').toLowerCase().includes(query) ||
          (customer.email ?? '').toLowerCase().includes(query) ||
          (customer.phone ?? '').toLowerCase().includes(query) ||
          (customer.city ?? '').toLowerCase().includes(query)
      );
    }
    if (statusFilter === 'active') result = result.filter(customer => customer.is_active);
    if (statusFilter === 'inactive') result = result.filter(customer => !customer.is_active);
    return [...result].sort((a, b) =>
      sortOption === 'name_asc'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name)
    );
  }, [customers, searchTerm, sortOption, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [currentPage, filteredCustomers, pageSize]);
  const pageNumbers = useMemo(() => {
    const maxButtons = 5;
    const initialStart = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, initialStart + maxButtons - 1);
    const start = Math.max(1, end - maxButtons + 1);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [currentPage, totalPages]);

  const handleDeleteCustomer = async (customerId: string) => {
    if (!window.confirm(t('customers.confirm.deleteMessage'))) return;
    try {
      await customerLocalService.deleteCustomer(customerId);
      await reloadCustomers();
    } catch (error) {
      console.error('Failed to delete customer:', error);
    }
  };

  const handleEditCustomer = (customer: LocalCustomer) => {
    setEditingCustomer(customer);
    setShowCustomerForm(true);
  };

  const handleFormSuccess = () => {
    void reloadCustomers();
    setShowCustomerForm(false);
    setEditingCustomer(null);
  };

  const statusBadge = (customer: LocalCustomer) => {
    const pill = 'inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold';
    return customer.is_active ? (
      <span className={`${pill} bg-emerald-50 text-emerald-800`}>{t('common.active')}</span>
    ) : (
      <span className={`${pill} bg-neutral-100 text-neutral-600`}>{t('common.inactive')}</span>
    );
  };

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        await initializeLocalDatabase();
        await reloadCustomers();
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : t('customers.loadError'));
        setCustomers([]);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [reloadCustomers, t]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortOption, statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const toolbarButton =
    'ds2-control-radius-lg ds2-toolbar-control-h !px-3 text-sm font-medium gap-2 shadow-none whitespace-nowrap leading-none shrink-0 [&>svg]:!h-4 [&>svg]:!w-4';

  if (isLoading) {
    return (
      <div className="ds2-visual-scope flex min-h-60 items-center justify-center" style={visualStyle}>
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
        <span className="ml-3 text-lg text-gray-600">{t('common.loading')}</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="ds2-visual-scope rounded-2xl border border-red-200 bg-red-50 p-6" style={visualStyle}>
        <div className="flex items-center">
          <AlertTriangle className="mr-3 h-6 w-6 text-red-500" />
          <span className="font-medium text-red-700">{loadError}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ds2-visual-scope" style={visualStyle} data-ds2-neutral={prefs.neutralFamilyId}>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className={`flex flex-col gap-4 border-b border-gray-100 py-4 lg:flex-row lg:items-center lg:gap-6 ${layoutClasses.contentInsetX}`}>
          <h1 className="shrink-0 text-2xl font-bold tracking-tight text-gray-900">
            {t('customers.pageTitle')}
          </h1>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={t('customers.header.searchPlaceholder')}
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              className="ds2-control-radius-lg ds2-toolbar-control-h box-border w-full border border-gray-200 bg-white pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="relative">
              <AdminActionButton
                variant="outline"
                type="button"
                icon={ArrowUpDown}
                label={t('customers.header.sort')}
                className={toolbarButton}
                onClick={() => {
                  setShowSortMenu(previous => !previous);
                  setShowFilterMenu(false);
                }}
              />
              {showSortMenu && (
                <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                  {(['name_asc', 'name_desc'] as const).map(option => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setSortOption(option);
                        setShowSortMenu(false);
                      }}
                      className="min-h-10 w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {t(option === 'name_asc' ? 'customers.header.nameAsc' : 'customers.header.nameDesc')}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <AdminActionButton
                variant="outline"
                type="button"
                icon={Filter}
                label={t('customers.header.filter')}
                className={toolbarButton}
                onClick={() => {
                  setShowFilterMenu(previous => !previous);
                  setShowSortMenu(false);
                }}
              />
              {showFilterMenu && (
                <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
                  <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="customers-filter-status">
                    {t('customers.header.status')}
                  </label>
                  <select
                    id="customers-filter-status"
                    value={statusFilter}
                    onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}
                    className="ds2-control-radius-lg ds2-toolbar-control-h w-full border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="all">{t('customers.header.allStatuses')}</option>
                    <option value="active">{t('customers.header.activeOnly')}</option>
                    <option value="inactive">{t('customers.header.inactiveOnly')}</option>
                  </select>
                </div>
              )}
            </div>
            <AdminActionButton
              variant="primary"
              type="button"
              icon={Plus}
              label={t('customers.header.addCustomer')}
              className={`${toolbarButton} w-full !px-4 sm:w-auto`}
              onClick={() => {
                setEditingCustomer(null);
                setShowCustomerForm(true);
              }}
            />
          </div>
        </div>

        <div className={`hidden overflow-x-auto md:block ${layoutClasses.contentInsetX}`}>
          <table className="w-full min-w-[1280px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {[
                  'id',
                  'name',
                  'taxId',
                  'email',
                  'phone',
                  'city',
                  'status',
                  'points',
                  'enrolled',
                  'lastPurchase',
                ].map(column => (
                  <th key={column} className="border-r border-gray-200 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {t(`customers.table.${column}`)}
                  </th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {paginatedCustomers.map(customer => (
                <tr key={customer.id} className="transition-colors hover:bg-gray-50/80">
                  <td className="border-r border-gray-100 px-4 py-4 font-mono text-xs text-gray-500">
                    #{customer.id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="border-r border-gray-100 px-4 py-4">
                    <div className="font-semibold text-gray-900">{customer.name}</div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{customer.address || '\u00a0'}</p>
                  </td>
                  <td className="border-r border-gray-100 px-4 py-4 font-mono text-gray-800">{customer.tax_number ?? '—'}</td>
                  <td className="border-r border-gray-100 px-4 py-4 text-gray-700">{customer.email ?? '—'}</td>
                  <td className="border-r border-gray-100 px-4 py-4 text-gray-700">{customer.phone ?? '—'}</td>
                  <td className="border-r border-gray-100 px-4 py-4 text-gray-700">{customer.city ?? '—'}</td>
                  <td className="border-r border-gray-100 px-4 py-4">{statusBadge(customer)}</td>
                  <td className="border-r border-gray-100 px-4 py-4">
                    <span className="inline-flex rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-emerald-800">
                      {customer.loyalty_points.toLocaleString()} pts
                    </span>
                  </td>
                  <td className="whitespace-nowrap border-r border-gray-100 px-4 py-4 text-gray-700">
                    {formatDate(customer.created_at)}
                  </td>
                  <td className="whitespace-nowrap border-r border-gray-100 px-4 py-4 text-gray-700">
                    {formatLastPurchase(latestPurchases[customer.id])}
                  </td>
                  <td className="relative px-4 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => setOpenMenuCustomerId(openMenuCustomerId === customer.id ? null : customer.id)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                      aria-haspopup="menu"
                    >
                      <MoreVertical className="h-5 w-5" />
                    </button>
                    {openMenuCustomerId === customer.id && (
                      <div className="absolute right-4 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg" role="menu">
                        <button type="button" className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50" onClick={() => { setViewingCustomer(customer); setOpenMenuCustomerId(null); }}>
                          {t('customers.table.view')}
                        </button>
                        <button type="button" className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50" onClick={() => { handleEditCustomer(customer); setOpenMenuCustomerId(null); }}>
                          {t('customers.table.edit')}
                        </button>
                        <button type="button" className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50" onClick={() => { setOpenMenuCustomerId(null); void handleDeleteCustomer(customer.id); }}>
                          {t('customers.table.delete')}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: table reflowed to a card list (desktop <table> above is hidden < md) */}
        <div className={`space-y-2.5 pb-1 md:hidden ${layoutClasses.contentInsetX}`}>
          {paginatedCustomers.map(customer => (
            <div key={customer.id} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setViewingCustomer(customer)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-gray-900">{customer.name}</span>
                    {statusBadge(customer)}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-gray-500">{customer.tax_number ?? '—'}</div>
                  {customer.email && <div className="mt-1 truncate text-xs text-gray-600">{customer.email}</div>}
                  {customer.phone && <div className="text-xs text-gray-600">{customer.phone}</div>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    {customer.city && <span>{customer.city}</span>}
                    <span className="inline-flex rounded-md bg-emerald-50 px-2 py-0.5 font-semibold tabular-nums text-emerald-800">
                      {customer.loyalty_points.toLocaleString()} pts
                    </span>
                  </div>
                </button>
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setOpenMenuCustomerId(openMenuCustomerId === customer.id ? null : customer.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                    aria-haspopup="menu"
                    aria-expanded={openMenuCustomerId === customer.id}
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>
                  {openMenuCustomerId === customer.id && (
                    <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg" role="menu">
                      <button type="button" className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50" onClick={() => { setViewingCustomer(customer); setOpenMenuCustomerId(null); }}>
                        {t('customers.table.view')}
                      </button>
                      <button type="button" className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50" onClick={() => { handleEditCustomer(customer); setOpenMenuCustomerId(null); }}>
                        {t('customers.table.edit')}
                      </button>
                      <button type="button" className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50" onClick={() => { setOpenMenuCustomerId(null); void handleDeleteCustomer(customer.id); }}>
                        {t('customers.table.delete')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className={`flex flex-col justify-between gap-4 border-t border-gray-100 py-3 sm:flex-row sm:items-center ${layoutClasses.contentInsetX}`}>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <label htmlFor="customers-page-size">{t('customers.table.rowsPerPage')}</label>
            <select id="customers-page-size" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setCurrentPage(1); }} className="h-9 rounded-lg border border-gray-200 bg-white px-2">
              {[10, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-center gap-1">
            <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage(page => Math.max(1, page - 1))} className="flex h-9 w-9 items-center justify-center rounded-lg disabled:opacity-40">
              <ChevronLeft className="h-5 w-5" />
            </button>
            {pageNumbers.map(page => (
              <button key={page} type="button" onClick={() => setCurrentPage(page)} className={`flex min-h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm font-medium ${page === currentPage ? 'bg-green-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                {page}
              </button>
            ))}
            <button type="button" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))} className="flex h-9 w-9 items-center justify-center rounded-lg disabled:opacity-40">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <CustomerForm
        isOpen={showCustomerForm}
        onClose={() => {
          setShowCustomerForm(false);
          setEditingCustomer(null);
        }}
        customer={editingCustomer}
        onSuccess={handleFormSuccess}
      />

      {viewingCustomer && (() => {
        const infoCards = [
          [t('customers.viewModal.name'), viewingCustomer.name],
          [t('customers.viewModal.taxId'), viewingCustomer.tax_number ?? '—'],
          [t('customers.viewModal.email'), viewingCustomer.email ?? '—'],
          [t('customers.viewModal.phone'), viewingCustomer.phone ?? '—'],
          [t('customers.viewModal.city'), viewingCustomer.city ?? '—'],
          [t('customers.table.points'), `${viewingCustomer.loyalty_points.toLocaleString()} pts`],
          [t('customers.table.enrolled'), formatDate(viewingCustomer.created_at)],
          [t('customers.table.lastPurchase'), formatLastPurchase(latestPurchases[viewingCustomer.id])],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-neutral-50 p-4">
            <span className="mb-1 block text-sm font-medium text-gray-500">{label}</span>
            <p className="font-semibold text-gray-900">{value}</p>
          </div>
        ));

        const editButton = (
          <AdminActionButton
            variant="primary"
            type="button"
            icon={Edit}
            label={t('customers.viewModal.editCustomer')}
            onClick={() => {
              const customer = viewingCustomer;
              setViewingCustomer(null);
              handleEditCustomer(customer);
            }}
            className="min-h-touch"
          />
        );

        if (appliedDialogStyle) {
          const buttons = dialogButtonClasses(appliedDialogStyle);
          return (
            <ConfiguredDialogShell
              config={appliedDialogStyle}
              title={t('customers.viewModal.title')}
              icon={Edit}
              onClose={() => setViewingCustomer(null)}
              footer={
                <div className="flex justify-between">
                  {editButton}
                  <button type="button" onClick={() => setViewingCustomer(null)} className={buttons.secondary}>
                    {t('customers.viewModal.close')}
                  </button>
                </div>
              }
            >
              <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">{infoCards}</div>
            </ConfiguredDialogShell>
          );
        }

        return (
          <>
            <div className="fixed inset-0 z-40 bg-black/40" aria-hidden onClick={() => setViewingCustomer(null)} />
            <div className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-500 p-6 text-white">
                <h2 className="text-xl font-bold">{t('customers.viewModal.title')}</h2>
                <button type="button" onClick={() => setViewingCustomer(null)} className="min-h-touch-sm min-w-touch-sm rounded-xl p-2 hover:bg-white/20">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-6 md:grid-cols-2">{infoCards}</div>
              <div className="flex justify-between border-t border-gray-100 bg-neutral-50 px-6 py-4">
                {editButton}
                <button type="button" onClick={() => setViewingCustomer(null)} className="min-h-touch rounded-xl bg-gray-200 px-6 py-3 font-semibold text-gray-700">
                  {t('customers.viewModal.close')}
                </button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
};

export default CustomersInner;
