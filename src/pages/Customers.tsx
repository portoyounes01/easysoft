import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  Edit,
  Contact,
  AlertTriangle,
  Loader2,
  X,
  MoreVertical,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LocalCustomer } from '../types/supabase';
import { customerLocalService, initializeLocalDatabase } from '../lib/localDatabase';
import CustomerForm from '../components/CustomerForm';
import { AdminActionButton } from '../components/ui/AdminActionButton';
import { useDesignSystem2Customization } from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

const CustomersInner: React.FC = () => {
  const { visualStyle, prefs, layoutClasses } = useDesignSystem2Customization();
  const { t } = useTranslation();

  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
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
    const list = await customerLocalService.getAllCustomers();
    setCustomers(list);
  }, []);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        await initializeLocalDatabase();
        await reloadCustomers();
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : t('customers.loadError'));
        setCustomers([]);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [reloadCustomers, t]);

  const filteredCustomers = useMemo(() => {
    let result = customers;
    const q = searchTerm.trim().toLowerCase();
    if (q.length > 0) {
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.tax_number ?? '').toLowerCase().includes(q) ||
          (c.email ?? '').toLowerCase().includes(q) ||
          (c.phone ?? '').toLowerCase().includes(q) ||
          (c.city ?? '').toLowerCase().includes(q)
      );
    }
    if (statusFilter === 'active') {
      result = result.filter((c) => c.is_active);
    } else if (statusFilter === 'inactive') {
      result = result.filter((c) => !c.is_active);
    }
    if (sortOption === 'name_asc') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    } else {
      result = [...result].sort((a, b) => b.name.localeCompare(a.name));
    }
    return result;
  }, [customers, searchTerm, sortOption, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, sortOption]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, currentPage, pageSize]);

  const pageNumbers = useMemo(() => {
    const maxButtons = 5;
    if (totalPages <= maxButtons) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const startInitial = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, startInitial + maxButtons - 1);
    const start = Math.max(1, end - maxButtons + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [totalPages, currentPage]);

  const toolbarBtn =
    'ds2-control-radius-lg ds2-toolbar-control-h !px-3 text-sm font-medium gap-2 shadow-none whitespace-nowrap leading-none shrink-0 [&>svg]:!h-4 [&>svg]:!w-4';

  const handleDeleteCustomer = async (customerId: string) => {
    if (window.confirm(t('customers.confirm.deleteMessage'))) {
      try {
        await customerLocalService.deleteCustomer(customerId);
        await reloadCustomers();
      } catch (deleteError) {
        console.error('Failed to delete customer:', deleteError);
      }
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
    if (!customer.is_active) {
      return <span className={`${pill} bg-neutral-100 text-neutral-600`}>{t('common.inactive')}</span>;
    }
    return <span className={`${pill} bg-emerald-50 text-emerald-800`}>{t('common.active')}</span>;
  };

  const scopeShell = (children: React.ReactNode, extraClass = '') => (
    <div
      className={['ds2-visual-scope', extraClass].filter(Boolean).join(' ')}
      style={visualStyle}
      data-ds2-neutral={prefs.neutralFamilyId}
    >
      {children}
    </div>
  );

  if (isLoading) {
    return scopeShell(
      <div className="flex min-h-60 items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
        <span className="ml-3 text-lg text-gray-600">{t('common.loading')}</span>
      </div>
    );
  }

  if (loadError) {
    return scopeShell(
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <div className="flex items-center">
          <AlertTriangle className="mr-3 h-6 w-6 shrink-0 text-red-500" />
          <span className="font-medium text-red-700">{loadError}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ds2-visual-scope" style={visualStyle} data-ds2-neutral={prefs.neutralFamilyId}>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div
          className={`flex flex-col gap-4 border-b border-gray-100 py-4 lg:flex-row lg:items-center lg:gap-6 ${layoutClasses.contentInsetX}`}
        >
          <h1 className="shrink-0 text-2xl font-bold tracking-tight text-gray-900">
            {t('customers.pageTitle')}
          </h1>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={t('customers.header.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ds2-control-radius-lg ds2-toolbar-control-h box-border w-full border border-gray-200 bg-white pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              aria-label={t('customers.header.searchPlaceholder')}
            />
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="relative">
              <AdminActionButton
                variant="outline"
                type="button"
                icon={ArrowUpDown}
                label={t('customers.header.sort')}
                onClick={() => {
                  setShowSortMenu((prev) => !prev);
                  setShowFilterMenu(false);
                }}
                className={toolbarBtn}
              />
              {showSortMenu && (
                <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setSortOption('name_asc');
                      setShowSortMenu(false);
                    }}
                    className={`w-full min-h-10 px-4 py-2.5 text-left text-sm hover:bg-gray-50 ${sortOption === 'name_asc' ? 'bg-sky-50 font-semibold text-sky-800' : 'text-gray-700'}`}
                  >
                    {t('customers.header.nameAsc')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSortOption('name_desc');
                      setShowSortMenu(false);
                    }}
                    className={`w-full min-h-10 px-4 py-2.5 text-left text-sm hover:bg-gray-50 ${sortOption === 'name_desc' ? 'bg-sky-50 font-semibold text-sky-800' : 'text-gray-700'}`}
                  >
                    {t('customers.header.nameDesc')}
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
              <AdminActionButton
                variant="outline"
                type="button"
                icon={Filter}
                label={t('customers.header.filter')}
                onClick={() => {
                  setShowFilterMenu((prev) => !prev);
                  setShowSortMenu(false);
                }}
                className={toolbarBtn}
              />
              {showFilterMenu && (
                <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
                  <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="customers-filter-status">
                    {t('customers.header.status')}
                  </label>
                  <select
                    id="customers-filter-status"
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')
                    }
                    className="ds2-control-radius-lg ds2-toolbar-control-h box-border w-full border border-gray-200 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
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
              onClick={() => {
                setEditingCustomer(null);
                setShowCustomerForm(true);
              }}
              className={`${toolbarBtn} w-full sm:w-auto !px-4`}
            />
          </div>
        </div>

        <div className={`overflow-x-auto ${layoutClasses.contentInsetX}`}>
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="border-r border-gray-200 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {t('customers.table.id')}
                </th>
                <th className="border-r border-gray-200 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {t('customers.table.name')}
                </th>
                <th className="border-r border-gray-200 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {t('customers.table.taxId')}
                </th>
                <th className="border-r border-gray-200 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {t('customers.table.email')}
                </th>
                <th className="border-r border-gray-200 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {t('customers.table.phone')}
                </th>
                <th className="border-r border-gray-200 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {t('customers.table.city')}
                </th>
                <th className="border-r border-gray-200 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {t('customers.table.status')}
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {' '}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {paginatedCustomers.map((customer) => (
                <tr key={customer.id} className="transition-colors hover:bg-gray-50/80">
                  <td className="border-r border-gray-100 px-4 py-4 font-mono text-xs text-gray-500">
                    #{customer.id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="border-r border-gray-100 px-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
                        <Contact className="h-4 w-4 text-gray-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-gray-900">{customer.name}</div>
                        {customer.address ? (
                          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-gray-500">
                            {customer.address}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-xs text-gray-400">&nbsp;</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-4 py-4 font-mono text-gray-800">
                    {customer.tax_number ?? '—'}
                  </td>
                  <td className="border-r border-gray-100 px-4 py-4 text-gray-700">
                    {customer.email ?? '—'}
                  </td>
                  <td className="border-r border-gray-100 px-4 py-4 text-gray-700">
                    {customer.phone ?? '—'}
                  </td>
                  <td className="border-r border-gray-100 px-4 py-4 text-gray-700">
                    {customer.city ?? '—'}
                  </td>
                  <td className="border-r border-gray-100 px-4 py-4">{statusBadge(customer)}</td>
                  <td className="relative px-4 py-4 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenMenuCustomerId(
                          openMenuCustomerId === customer.id ? null : customer.id
                        )
                      }
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100"
                      title={t('customers.table.actionsTitle')}
                      aria-expanded={openMenuCustomerId === customer.id}
                      aria-haspopup="menu"
                    >
                      <MoreVertical className="h-5 w-5" />
                    </button>
                    {openMenuCustomerId === customer.id && (
                      <div
                        className="absolute right-4 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
                        role="menu"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setViewingCustomer(customer);
                            setOpenMenuCustomerId(null);
                          }}
                          className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          {t('customers.table.view')}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            handleEditCustomer(customer);
                            setOpenMenuCustomerId(null);
                          }}
                          className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          {t('customers.table.edit')}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setOpenMenuCustomerId(null);
                            void handleDeleteCustomer(customer.id);
                          }}
                          className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                        >
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

        <div
          className={`flex flex-col items-stretch justify-between gap-4 border-t border-gray-100 py-3 sm:flex-row sm:items-center ${layoutClasses.contentInsetX}`}
        >
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
            <label htmlFor="customers-page-size" className="whitespace-nowrap">
              {t('customers.table.rowsPerPage')}
            </label>
            <select
              id="customers-page-size"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="ds2-control-radius-lg box-border h-9 border border-gray-200 bg-white px-2 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {[10, 25, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-center gap-1 sm:justify-end">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="ds2-control-radius-lg flex h-9 w-9 items-center justify-center text-gray-500 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t('customers.table.prevPage')}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            {pageNumbers.map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setCurrentPage(num)}
                className={`ds2-control-radius-md flex min-h-9 min-w-9 items-center justify-center px-2 text-sm font-medium transition-colors ${num === currentPage
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100'
                  }`}
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="ds2-control-radius-lg flex h-9 w-9 items-center justify-center text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t('customers.table.nextPage')}
            >
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

      {viewingCustomer && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            aria-hidden
            onClick={() => setViewingCustomer(null)}
          />

          <div className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="shrink-0 rounded-t-2xl bg-gradient-to-r from-blue-600 to-blue-500 p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="rounded-xl bg-white/20 p-2">
                    <Contact className="h-6 w-6" />
                  </div>
                  <h2 className="text-xl font-bold">{t('customers.viewModal.title')}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingCustomer(null)}
                  className="flex min-h-touch-sm min-w-touch-sm items-center justify-center rounded-xl p-2 transition-colors hover:bg-white/20"
                  aria-label={t('common.close')}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
              <div>
                <h3 className="mb-4 text-lg font-bold text-gray-900">{t('customers.viewModal.basicInfo')}</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-xl bg-neutral-50 p-4">
                    <span className="mb-1 block text-sm font-medium text-gray-500">
                      {t('customers.viewModal.name')}
                    </span>
                    <p className="font-semibold text-gray-900">{viewingCustomer.name}</p>
                  </div>
                  <div className="rounded-xl bg-neutral-50 p-4">
                    <span className="mb-1 block text-sm font-medium text-gray-500">
                      {t('customers.viewModal.taxId')}
                    </span>
                    <p className="font-mono text-gray-900">{viewingCustomer.tax_number ?? '—'}</p>
                  </div>
                  <div className="rounded-xl bg-neutral-50 p-4">
                    <span className="mb-1 block text-sm font-medium text-gray-500">
                      {t('customers.viewModal.email')}
                    </span>
                    <p className="text-gray-900">{viewingCustomer.email ?? '—'}</p>
                  </div>
                  <div className="rounded-xl bg-neutral-50 p-4">
                    <span className="mb-1 block text-sm font-medium text-gray-500">
                      {t('customers.viewModal.phone')}
                    </span>
                    <p className="text-gray-900">{viewingCustomer.phone ?? '—'}</p>
                  </div>
                  <div className="rounded-xl bg-neutral-50 p-4 md:col-span-2">
                    <span className="mb-1 block text-sm font-medium text-gray-500">
                      {t('customers.viewModal.address')}
                    </span>
                    <p className="text-gray-900">{viewingCustomer.address ?? '—'}</p>
                  </div>
                  <div className="rounded-xl bg-neutral-50 p-4">
                    <span className="mb-1 block text-sm font-medium text-gray-500">
                      {t('customers.viewModal.city')}
                    </span>
                    <p className="text-gray-900">{viewingCustomer.city ?? '—'}</p>
                  </div>
                  <div className="rounded-xl bg-neutral-50 p-4">
                    <span className="mb-1 block text-sm font-medium text-gray-500">
                      {t('customers.viewModal.postal')}
                    </span>
                    <p className="font-mono text-gray-900">{viewingCustomer.postal_code ?? '—'}</p>
                  </div>
                  <div className="rounded-xl bg-neutral-50 p-4">
                    <span className="mb-1 block text-sm font-medium text-gray-500">
                      {t('customers.viewModal.country')}
                    </span>
                    <p className="font-mono text-gray-900">{viewingCustomer.country ?? '—'}</p>
                  </div>
                  <div className="rounded-xl bg-neutral-50 p-4">
                    <span className="mb-1 block text-sm font-medium text-gray-500">
                      {t('customers.viewModal.status')}
                    </span>
                    {statusBadge(viewingCustomer)}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-4 text-lg font-bold text-gray-900">{t('customers.viewModal.activity')}</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-xl bg-sky-50 p-4">
                    <span className="mb-1 block text-sm font-medium text-sky-800">
                      {t('customers.viewModal.totalSpent')}
                    </span>
                    <p className="text-2xl font-bold tabular-nums text-sky-900">
                      €{viewingCustomer.total_spent.toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-sky-50 p-4">
                    <span className="mb-1 block text-sm font-medium text-sky-800">
                      {t('customers.viewModal.transactionCount')}
                    </span>
                    <p className="text-2xl font-bold tabular-nums text-sky-900">
                      {viewingCustomer.transaction_count}
                    </p>
                  </div>
                  <div className="rounded-xl bg-sky-50 p-4">
                    <span className="mb-1 block text-sm font-medium text-sky-800">
                      {t('customers.viewModal.loyaltyPoints')}
                    </span>
                    <p className="text-2xl font-bold tabular-nums text-sky-900">
                      {viewingCustomer.loyalty_points}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 rounded-b-2xl border-t border-gray-100 bg-neutral-50 px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <AdminActionButton
                  variant="primary"
                  type="button"
                  icon={Edit}
                  label={t('customers.viewModal.editCustomer')}
                  onClick={() => {
                    const c = viewingCustomer;
                    setViewingCustomer(null);
                    handleEditCustomer(c);
                  }}
                  className="ds2-modal-primary-action min-h-touch shadow-lg"
                />
                <button
                  type="button"
                  onClick={() => setViewingCustomer(null)}
                  className="min-h-touch rounded-xl bg-gray-200 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-300"
                >
                  {t('customers.viewModal.close')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CustomersInner;
