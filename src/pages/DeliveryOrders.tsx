import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Filter,
  MoreVertical,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  Search,
  Store,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { activeProfile } from '../lib/countryProfile';
import { useDesignSystem2Customization } from '../contexts/DesignSystem2CustomizationContext';
import { AdminActionButton } from '../components/ui/AdminActionButton';
import '../styles/design-system-2-scope.css';

type OrderSource = 'pos' | 'uber_eats' | 'glovo';
type OrderType = 'dine_in' | 'take_away' | 'delivery';
type OrderStatus = 'open' | 'in_progress' | 'completed' | 'cancelled' | 'needs_review';
type OrderStatusFilter = OrderStatus | 'all';
type OrderSort = 'newest' | 'oldest';
type PayoutStatus = 'pending' | 'scheduled' | 'settled';
type FiscalDocumentType = 'platform_invoice' | 'pos_receipt';
type OrderTableColumn =
  | 'id'
  | 'source'
  | 'status'
  | 'orderTime'
  | 'customer'
  | 'orderType'
  | 'qty'
  | 'total'
  | 'actions';

interface OrderItem {
  id: string;
  name: string;
  note?: string;
  quantity: number;
  price: number;
  station: 'Kitchen' | 'Bar' | 'Packaging';
}

interface FiscalDocument {
  type: FiscalDocumentType;
  number: string;
  date: string;
  pdfAvailable: boolean;
  payoutStatus: PayoutStatus;
}

interface OrderRecord {
  id: string;
  source: OrderSource;
  orderType: OrderType;
  status: OrderStatus;
  orderTime: string;
  promisedTime: string;
  customerName: string;
  paymentMethod: string;
  cashier: string;
  subtotal: number;
  tax: number;
  voucher: number;
  platformFees: number;
  total: number;
  payoutNet: number;
  fiscalDocument: FiscalDocument;
  items: OrderItem[];
  attention?: string;
}

const mockOrdersUrl = `${import.meta.env.BASE_URL}mock/orders.json`;

const statusFilters: Array<{ value: OrderStatusFilter; icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'all', icon: Store },
  { value: 'open', icon: PackageCheck },
  { value: 'in_progress', icon: Clock },
  { value: 'completed', icon: Check },
  { value: 'cancelled', icon: X },
  { value: 'needs_review', icon: AlertTriangle },
];

const statusTone: Record<OrderStatus, string> = {
  open: 'bg-sky-50 text-sky-700',
  in_progress: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-700',
  needs_review: 'bg-orange-50 text-orange-700',
};

const payoutTone: Record<PayoutStatus, string> = {
  pending: 'bg-orange-50 text-orange-700',
  scheduled: 'bg-sky-50 text-sky-700',
  settled: 'bg-emerald-50 text-emerald-700',
};

const orderTableColumns: OrderTableColumn[] = [
  'id',
  'source',
  'status',
  'orderTime',
  'customer',
  'orderType',
  'qty',
  'total',
  'actions',
];

const orderTableColumnClass: Record<OrderTableColumn, string> = {
  id: 'w-28',
  source: 'w-32',
  status: 'w-32',
  orderTime: 'w-36',
  customer: 'w-40',
  orderType: 'w-28',
  qty: 'w-16',
  total: 'w-28',
  actions: 'w-16',
};

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat(activeProfile().locale, {
    style: 'currency',
    currency: 'EUR',
  }).format(value);

const formatOrderDate = (value: string): string =>
  new Intl.DateTimeFormat(activeProfile().locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));

const formatOrderTime = (value: string): string =>
  new Intl.DateTimeFormat(activeProfile().locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const orderItemCount = (order: OrderRecord): number =>
  order.items.reduce((sum, item) => sum + item.quantity, 0);

const minutesSince = (value: string): number => {
  const now = new Date('2026-06-22T11:52:00');
  return Math.max(0, Math.round((now.getTime() - new Date(value).getTime()) / 60000));
};

const DeliveryOrders: React.FC = () => {
  const { t } = useTranslation();
  const { visualStyle, prefs, layoutClasses } = useDesignSystem2Customization();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<OrderStatusFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<OrderSource | 'all'>('all');
  const [sortOption, setSortOption] = useState<OrderSort>('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [actionMenuOrderId, setActionMenuOrderId] = useState<string | null>(null);
  const [detailsOrderId, setDetailsOrderId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const toolbarBtn =
    'ds2-control-radius-lg ds2-toolbar-control-h !px-3 text-sm font-medium gap-2 shadow-none whitespace-nowrap leading-none shrink-0 [&>svg]:!h-4 [&>svg]:!w-4';

  useEffect(() => {
    let isMounted = true;

    const loadOrders = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await fetch(mockOrdersUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as OrderRecord[];
        if (isMounted) {
          setOrders(data);
        }
      } catch (error) {
        if (isMounted) {
          setLoadError(error instanceof Error ? error.message : t('deliveryOrders.errors.loadFailed'));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadOrders();

    return () => {
      isMounted = false;
    };
  }, [t]);

  const statusCounts = useMemo(() => {
    const counts = new Map<OrderStatusFilter, number>([['all', orders.length]]);
    statusFilters
      .filter((filter) => filter.value !== 'all')
      .forEach((filter) => {
        counts.set(filter.value, orders.filter((order) => order.status === filter.value).length);
      });
    return counts;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const result = orders.filter((order) => {
      const matchesStatus = selectedStatus === 'all' || order.status === selectedStatus;
      const matchesSource = sourceFilter === 'all' || order.source === sourceFilter;
      const matchesSearch =
        !normalizedSearch ||
        order.id.toLowerCase().includes(normalizedSearch) ||
        order.customerName.toLowerCase().includes(normalizedSearch) ||
        order.cashier.toLowerCase().includes(normalizedSearch) ||
        order.fiscalDocument.number.toLowerCase().includes(normalizedSearch);
      return matchesStatus && matchesSource && matchesSearch;
    });

    return [...result].sort((a, b) => {
      const diff = new Date(b.orderTime).getTime() - new Date(a.orderTime).getTime();
      return sortOption === 'newest' ? diff : -diff;
    });
  }, [orders, searchTerm, selectedStatus, sortOption, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const pageNumbers = useMemo(
    () => Array.from({ length: Math.min(totalPages, 5) }, (_, index) => index + 1),
    [totalPages]
  );

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [currentPage, filteredOrders, pageSize]);

  const detailsOrder = useMemo(
    () => orders.find((order) => order.id === detailsOrderId) ?? null,
    [detailsOrderId, orders]
  );

  const closeOrderDetails = useCallback(() => {
    setDetailsOrderId(null);
  }, []);

  useEffect(() => {
    if (!detailsOrder) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeOrderDetails();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeOrderDetails, detailsOrder]);

  const sourceLabel = (source: OrderSource) => t(`deliveryOrders.source.${source}`);
  const statusLabel = (status: OrderStatus) => t(`deliveryOrders.status.${status}`);
  const orderTypeLabel = (orderType: OrderType) => t(`deliveryOrders.orderType.${orderType}`);
  const fiscalDocumentLabel = (type: FiscalDocumentType) => t(`deliveryOrders.fiscal.type.${type}`);

  const openOrderDetails = (orderId: string) => {
    setDetailsOrderId(orderId);
    setActionMenuOrderId(null);
    setShowSortMenu(false);
    setShowFilterMenu(false);
  };

  const handleStatusChange = (orderId: string, status: OrderStatus) => {
    setOrders((currentOrders) =>
      currentOrders.map((order) => (order.id === orderId ? { ...order, status } : order))
    );
    setActionMenuOrderId(null);
  };

  const sourceBadge = (source: OrderSource) => {
    const badgeClass: Record<OrderSource, string> = {
      pos: 'bg-emerald-100 text-emerald-800',
      uber_eats: 'bg-black text-emerald-400',
      glovo: 'bg-yellow-300 text-gray-950',
    };

    const badgeText: Record<OrderSource, string> = {
      pos: 'POS',
      uber_eats: 'UE',
      glovo: 'G',
    };

    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap text-xs font-semibold text-gray-900">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold ${badgeClass[source]}`}
          aria-hidden
        >
          {badgeText[source]}
        </span>
        {sourceLabel(source)}
      </span>
    );
  };

  const statusBadge = (status: OrderStatus) => (
    <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${statusTone[status]}`}>
      {statusLabel(status)}
    </span>
  );

  return (
    <div
      className="ds2-visual-scope"
      style={visualStyle}
      data-ds2-neutral={prefs.neutralFamilyId}
    >
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div
          className={`flex flex-col gap-4 border-b border-gray-100 py-4 xl:flex-row xl:items-center xl:gap-6 ${layoutClasses.contentInsetX}`}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="shrink-0 text-2xl font-bold tracking-tight text-gray-900">
              {t('deliveryOrders.pageTitle')}
            </h1>
            <span className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-900">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {t('deliveryOrders.connection.posActive')}
            </span>
            <span className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-900">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {t('deliveryOrders.connection.uberEatsOnline')}
            </span>
            <span className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-900">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {t('deliveryOrders.connection.glovoOnline')}
            </span>
          </div>

          <div className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={t('deliveryOrders.header.searchPlaceholder')}
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setCurrentPage(1);
              }}
              className="ds2-control-radius-lg ds2-toolbar-control-h box-border w-full border border-gray-200 bg-white pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              aria-label={t('deliveryOrders.header.searchPlaceholder')}
            />
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="relative">
              <AdminActionButton
                variant="outline"
                type="button"
                icon={ArrowUpDown}
                label={t('deliveryOrders.header.sort')}
                onClick={() => {
                  setShowSortMenu((prev) => !prev);
                  setShowFilterMenu(false);
                  setActionMenuOrderId(null);
                }}
                className={toolbarBtn}
              />
              {showSortMenu && (
                <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                  {(['newest', 'oldest'] as OrderSort[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setSortOption(option);
                        setShowSortMenu(false);
                      }}
                      className={`w-full min-h-10 px-4 py-2.5 text-left text-sm hover:bg-gray-50 ${
                        sortOption === option ? 'bg-sky-50 font-semibold text-sky-800' : 'text-gray-700'
                      }`}
                    >
                      {t(`deliveryOrders.sort.${option}`)}
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
                label={t('deliveryOrders.header.filter')}
                onClick={() => {
                  setShowFilterMenu((prev) => !prev);
                  setShowSortMenu(false);
                  setActionMenuOrderId(null);
                }}
                className={toolbarBtn}
              />
              {showFilterMenu && (
                <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
                  <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="order-source-filter">
                    {t('deliveryOrders.header.source')}
                  </label>
                  <select
                    id="order-source-filter"
                    value={sourceFilter}
                    onChange={(event) => {
                      setSourceFilter(event.target.value as OrderSource | 'all');
                      setCurrentPage(1);
                    }}
                    className="ds2-control-radius-lg ds2-toolbar-control-h box-border w-full border border-gray-200 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="all">{t('deliveryOrders.source.all')}</option>
                    <option value="pos">{t('deliveryOrders.source.pos')}</option>
                    <option value="uber_eats">{t('deliveryOrders.source.uber_eats')}</option>
                    <option value="glovo">{t('deliveryOrders.source.glovo')}</option>
                  </select>
                </div>
              )}
            </div>

            <AdminActionButton
              variant="success"
              type="button"
              icon={RefreshCw}
              label={t('deliveryOrders.header.sync')}
              className={`${toolbarBtn} !px-4`}
            />
          </div>
        </div>

        <div className={`grid gap-4 py-4 xl:grid-cols-[9rem_minmax(0,1fr)] ${layoutClasses.contentInsetX}`}>
          <aside className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-1 xl:self-start">
            {statusFilters.map(({ value, icon: Icon }) => {
              const active = selectedStatus === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setSelectedStatus(value);
                    setCurrentPage(1);
                    setActionMenuOrderId(null);
                  }}
                  className={`relative min-h-[5.5rem] rounded-lg border px-4 py-3 text-left transition-colors ${
                    active
                      ? 'border-gray-200 bg-white shadow-sm before:absolute before:left-0 before:top-1/2 before:h-7 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-emerald-500'
                      : 'border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-white'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-600">
                    <Icon className="h-4 w-4" />
                    {t(`deliveryOrders.filters.${value}`)}
                  </span>
                  <span className="mt-4 block text-3xl font-bold tabular-nums text-gray-900">
                    {statusCounts.get(value) ?? 0}
                  </span>
                </button>
              );
            })}
          </aside>

          <section className="min-w-0 rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="px-4 py-4">
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                {t('deliveryOrders.table.title')}
              </h2>
            </div>
            <div className="overflow-x-auto px-4">
              <table className="w-full min-w-[1056px] table-fixed border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    {orderTableColumns.map((column) => (
                      <th
                        key={column}
                        className={`border-r border-gray-200 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap ${orderTableColumnClass[column]} ${
                          column === 'actions' ? 'text-right' : ''
                        }`}
                      >
                        {t(`deliveryOrders.table.${column}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {isLoading && (
                    <tr>
                      <td className="px-4 py-12 text-center text-sm font-medium text-gray-500" colSpan={orderTableColumns.length}>
                        {t('deliveryOrders.loading')}
                      </td>
                    </tr>
                  )}
                  {!isLoading && loadError && (
                    <tr>
                      <td className="px-4 py-12 text-center text-sm font-medium text-red-600" colSpan={orderTableColumns.length}>
                        {t('deliveryOrders.errors.loadFailed')}: {loadError}
                      </td>
                    </tr>
                  )}
                  {!isLoading && !loadError && paginatedOrders.length === 0 && (
                    <tr>
                      <td className="px-4 py-12 text-center text-sm font-medium text-gray-500" colSpan={orderTableColumns.length}>
                        {t('deliveryOrders.empty')}
                      </td>
                    </tr>
                  )}
                  {!isLoading && !loadError && paginatedOrders.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => openOrderDetails(order.id)}
                      className="cursor-pointer transition-colors hover:bg-gray-50/80"
                    >
                      <td className="border-r border-gray-100 px-4 py-4 font-semibold text-gray-900 whitespace-nowrap">
                        {order.id}
                      </td>
                      <td className="border-r border-gray-100 px-4 py-4">
                        {sourceBadge(order.source)}
                      </td>
                      <td className="border-r border-gray-100 px-4 py-4">
                        <div className="flex flex-col items-start gap-1.5">
                          {statusBadge(order.status)}
                          {order.attention && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700">
                              <AlertTriangle className="h-3 w-3" />
                              {t('deliveryOrders.table.review')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="border-r border-gray-100 px-4 py-4 text-gray-900 whitespace-nowrap">
                        <div className="font-semibold">{formatOrderTime(order.orderTime)}</div>
                        <div className="text-xs text-gray-500">{formatOrderDate(order.orderTime)}</div>
                      </td>
                      <td className="border-r border-gray-100 px-4 py-4 text-gray-900">
                        {order.customerName}
                      </td>
                      <td className="border-r border-gray-100 px-4 py-4 text-gray-900">
                        {orderTypeLabel(order.orderType)}
                      </td>
                      <td className="border-r border-gray-100 px-4 py-4 font-semibold tabular-nums text-gray-900">
                        {orderItemCount(order)}
                      </td>
                      <td className="border-r border-gray-100 px-4 py-4 font-semibold tabular-nums text-gray-900">
                        {formatCurrency(order.total)}
                      </td>
                      <td className="relative px-4 py-4 text-right">
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100"
                          title={t('deliveryOrders.table.actions')}
                          aria-haspopup="menu"
                          aria-expanded={actionMenuOrderId === order.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            setActionMenuOrderId((current) => (current === order.id ? null : order.id));
                            setShowSortMenu(false);
                            setShowFilterMenu(false);
                          }}
                        >
                          <MoreVertical className="h-5 w-5" />
                        </button>
                        {actionMenuOrderId === order.id && (
                          <div
                            role="menu"
                            className="absolute right-3 top-12 z-30 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-lg"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => openOrderDetails(order.id)}
                              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                              <ReceiptText className="h-4 w-4" />
                              {t('deliveryOrders.actions.viewDetails')}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleStatusChange(order.id, 'in_progress')}
                              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                              <Clock className="h-4 w-4" />
                              {t('deliveryOrders.actions.markInProgress')}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleStatusChange(order.id, 'completed')}
                              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                              <Check className="h-4 w-4" />
                              {t('deliveryOrders.actions.markCompleted')}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleStatusChange(order.id, 'cancelled')}
                              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
                            >
                              <X className="h-4 w-4" />
                              {t('deliveryOrders.actions.cancelOrder')}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col items-stretch justify-between gap-4 border-t border-gray-100 px-4 py-3 sm:flex-row sm:items-center">
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                <label htmlFor="orders-page-size" className="whitespace-nowrap">
                  {t('deliveryOrders.table.rowsPerPage')}
                </label>
                <select
                  id="orders-page-size"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
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
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  className="ds2-control-radius-lg flex h-9 w-9 items-center justify-center text-gray-500 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={t('deliveryOrders.table.prevPage')}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                {pageNumbers.map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setCurrentPage(num)}
                    className={`ds2-control-radius-md flex min-h-9 min-w-9 items-center justify-center px-2 text-sm font-medium transition-colors ${
                      num === currentPage
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
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  className="ds2-control-radius-lg flex h-9 w-9 items-center justify-center text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={t('deliveryOrders.table.nextPage')}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {detailsOrder && (
        <div
          className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/35 px-4 py-8"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeOrderDetails();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-details-title"
            className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl"
          >
            <div className="relative border-b border-gray-200 bg-gray-100 px-8 py-5 text-center">
              <h2 id="order-details-title" className="text-2xl font-bold tracking-tight text-gray-900">
                {t('deliveryOrders.details.title')}
              </h2>
              <button
                type="button"
                onClick={closeOrderDetails}
                className="absolute right-5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 hover:bg-white"
                aria-label={t('common.close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[calc(100vh-9rem)] overflow-y-auto">
              <div className="grid gap-x-16 gap-y-4 px-8 py-6 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-gray-500">{t('deliveryOrders.details.orderId')}</p>
                  <p className="mt-1 font-bold text-gray-900">{detailsOrder.id}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">{t('deliveryOrders.details.orderTime')}</p>
                  <p className="mt-1 font-semibold text-gray-900">
                    {formatOrderDate(detailsOrder.orderTime)} - {formatOrderTime(detailsOrder.orderTime)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">{t('deliveryOrders.details.status')}</p>
                  <div className="mt-1">{statusBadge(detailsOrder.status)}</div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">{t('deliveryOrders.details.orderType')}</p>
                  <p className="mt-1 font-semibold text-gray-900">{orderTypeLabel(detailsOrder.orderType)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">{t('deliveryOrders.details.source')}</p>
                  <div className="mt-1">{sourceBadge(detailsOrder.source)}</div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">{t('deliveryOrders.details.customer')}</p>
                  <p className="mt-1 font-semibold text-gray-900">{detailsOrder.customerName}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">{t('deliveryOrders.details.paymentMethod')}</p>
                  <p className="mt-1 font-semibold text-gray-900">{detailsOrder.paymentMethod}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">{t('deliveryOrders.details.cashier')}</p>
                  <p className="mt-1 font-semibold text-gray-900">{detailsOrder.cashier}</p>
                </div>
                <div className="sm:col-span-2">
                  <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
                    <Clock className="h-4 w-4" />
                    {detailsOrder.orderType === 'dine_in'
                      ? t('deliveryOrders.details.tableReference', { value: detailsOrder.promisedTime })
                      : t('deliveryOrders.details.promisedTime', { value: detailsOrder.promisedTime })}
                    <span className="text-gray-400">/</span>
                    {t('deliveryOrders.details.elapsed', { count: minutesSince(detailsOrder.orderTime) })}
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 px-8 py-5">
                <h3 className="text-sm font-bold text-gray-900">
                  {detailsOrder.fiscalDocument.type === 'platform_invoice'
                    ? t('deliveryOrders.fiscal.externalTitle')
                    : t('deliveryOrders.fiscal.posTitle')}
                </h3>
                <div className="mt-3 grid gap-4 text-sm sm:grid-cols-4">
                  <div>
                    <span className="inline-flex rounded-md bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                      {fiscalDocumentLabel(detailsOrder.fiscalDocument.type)}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500">{t('deliveryOrders.fiscal.invoiceNumber')}</p>
                    <p className="mt-1 font-semibold text-gray-900">{detailsOrder.fiscalDocument.number}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500">{t('deliveryOrders.fiscal.invoiceDate')}</p>
                    <p className="mt-1 font-semibold text-gray-900">{formatOrderDate(detailsOrder.fiscalDocument.date)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500">{t('deliveryOrders.fiscal.payoutStatus')}</p>
                    <span className={`mt-1 inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${payoutTone[detailsOrder.fiscalDocument.payoutStatus]}`}>
                      {t(`deliveryOrders.payout.${detailsOrder.fiscalDocument.payoutStatus}`)}
                    </span>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <AdminActionButton
                    variant="outline"
                    type="button"
                    icon={Download}
                    label={t('deliveryOrders.fiscal.downloadPdf')}
                    className="ds2-control-radius-lg !min-h-10 !px-3 text-sm shadow-none"
                  />
                  {detailsOrder.source !== 'pos' && (
                    <AdminActionButton
                      variant="outline"
                      type="button"
                      icon={ExternalLink}
                      label={t('deliveryOrders.fiscal.openPlatform')}
                      className="ds2-control-radius-lg !min-h-10 !px-3 text-sm shadow-none"
                    />
                  )}
                </div>
              </div>

              <div className="border-t border-gray-100 px-8 py-5">
                <div className="overflow-hidden rounded-lg border border-gray-100">
                  <table className="w-full table-fixed text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="w-full px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          {t('deliveryOrders.details.product')}
                        </th>
                        <th className="w-16 px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          {t('deliveryOrders.details.qty')}
                        </th>
                        <th className="w-28 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          {t('deliveryOrders.details.price')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {detailsOrder.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs font-bold text-gray-500">
                                {item.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate font-semibold text-gray-900">{item.name}</div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                                  <span>{item.note ?? t(`deliveryOrders.station.${item.station}`)}</span>
                                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                                    {t(`deliveryOrders.station.${item.station}`)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center font-semibold tabular-nums text-gray-900">
                            {item.quantity}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900 whitespace-nowrap">
                            {formatCurrency(item.price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 rounded-lg bg-gray-50 p-4">
                  <div className="space-y-2 border-b border-gray-200 pb-3 text-sm text-gray-600">
                    <div className="flex justify-between">
                      <span>{t('deliveryOrders.reconciliation.subtotal')}</span>
                      <span className="font-medium text-gray-900">{formatCurrency(detailsOrder.subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('deliveryOrders.reconciliation.tax')}</span>
                      <span className="font-medium text-gray-900">{formatCurrency(detailsOrder.tax)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('deliveryOrders.reconciliation.voucher')}</span>
                      <span className="font-medium text-gray-900">{formatCurrency(detailsOrder.voucher)}</span>
                    </div>
                    {detailsOrder.platformFees > 0 && (
                      <div className="flex justify-between">
                        <span>{t('deliveryOrders.reconciliation.platformFees')}</span>
                        <span className="font-medium text-gray-900">-{formatCurrency(detailsOrder.platformFees)}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <span className="text-sm font-semibold text-gray-700">
                      {t('deliveryOrders.reconciliation.total')}
                    </span>
                    <span className="text-2xl font-bold text-gray-900">{formatCurrency(detailsOrder.total)}</span>
                  </div>
                  {detailsOrder.platformFees > 0 && (
                    <div className="mt-2 flex justify-between text-sm text-gray-600">
                      <span>{t('deliveryOrders.reconciliation.netPayout')}</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(detailsOrder.payoutNet)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-gray-200 px-8 py-5">
              <button
                type="button"
                onClick={closeOrderDetails}
                className="ds2-control-radius-lg min-h-touch-xs w-full max-w-xs border border-gray-300 bg-white px-6 text-base font-semibold text-gray-900 hover:bg-gray-50"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeliveryOrders;
