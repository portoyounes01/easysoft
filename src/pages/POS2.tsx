import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Home,
  ClipboardList,
  Columns2,
  Users,
  BarChart3,
  Settings,
  LogOut,
  MoreHorizontal,
  Wifi,
  BatteryFull,
  Package,
} from 'lucide-react';
import { useProducts } from '../contexts/ProductsContext';
import '../styles/pos2.css';

interface Pos2Product {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  soldByWeight: boolean;
}

interface Pos2Category {
  id: string;
  label: string;
  products: Pos2Product[];
}

interface Pos2OrderLine {
  id: string;
  nameKey: string;
  qty: number;
  price: number;
  modifierKey?: string;
}

const ORDER_LINES: Pos2OrderLine[] = [
  { id: 'l1', nameKey: 'pos2.productDoubleCheeseburger', qty: 1, price: 5.49 },
  { id: 'l2', nameKey: 'pos2.productMediumFries', qty: 1, price: 2.49 },
  { id: 'l3', nameKey: 'pos2.productLemonade', qty: 1, price: 2.29, modifierKey: 'pos2.modifierLarge' },
];

const NAV_ITEMS = [
  { id: 'home', labelKey: 'pos2.navHome', icon: Home },
  { id: 'orders', labelKey: 'pos2.navOrders', icon: ClipboardList },
  { id: 'menu', labelKey: 'pos2.navMenu', icon: Columns2 },
  { id: 'customers', labelKey: 'pos2.navCustomers', icon: Users },
  { id: 'reports', labelKey: 'pos2.navReports', icon: BarChart3 },
  { id: 'settings', labelKey: 'pos2.navSettings', icon: Settings },
];

const formatMoney = (value: number) => `€${value.toFixed(2)}`;

const Pos2StatusBar: React.FC = () => (
  <div className="pos2-statusbar flex w-full shrink-0 items-start justify-between text-neutral-900">
    <span className="font-semibold tabular-nums">9:41 AM &nbsp;&nbsp;Mon Jun 10</span>
    <div className="pos2-statusbar-right flex items-center">
      <Wifi className="h-[1em] w-[1em]" strokeWidth={2.25} aria-hidden />
      <span className="font-semibold tabular-nums">100%</span>
      <BatteryFull className="h-[1.3em] w-[1.3em]" strokeWidth={2} aria-hidden />
    </div>
  </div>
);

const Pos2Sidebar: React.FC<{ active: string; onSelect: (id: string) => void }> = ({ active, onSelect }) => {
  const { t } = useTranslation();
  return (
    <aside className="pos2-sidebar flex shrink-0 flex-col justify-between">
      <nav className="flex flex-col">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`pos2-nav-item flex items-center transition-colors ${
                isActive
                  ? 'pos2-nav-item-active font-semibold text-neutral-900'
                  : 'font-medium text-neutral-800 hover:bg-[#f2f2f4]'
              }`}
            >
              <Icon
                className="pos2-nav-icon shrink-0"
                fill={isActive ? 'currentColor' : 'none'}
                strokeWidth={isActive ? 2.25 : 2}
                aria-hidden
              />
              <span>{t(item.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        className="pos2-nav-item flex items-center font-medium text-neutral-800 hover:bg-[#f2f2f4]"
      >
        <LogOut className="pos2-nav-icon shrink-0" aria-hidden />
        <span>{t('common.logout')}</span>
      </button>
    </aside>
  );
};

const Pos2OrderPanel: React.FC<{ lines: Pos2OrderLine[] }> = ({ lines }) => {
  const { t } = useTranslation();
  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.price, 0);
  const tax = subtotal * 0.08;
  const total = subtotal + tax;

  return (
    <section className="pos2-order-panel flex shrink-0 flex-col border border-neutral-200/50 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between">
        <div className="pos2-order-title-row flex items-baseline">
          <h1 className="pos2-order-title font-bold text-neutral-900">{t('pos2.orderTitle')}</h1>
          <span className="pos2-eat-in font-semibold text-emerald-600">{t('pos2.eatIn')}</span>
        </div>
        <button
          type="button"
          className="pos2-more-btn flex items-center justify-center text-neutral-800"
          aria-label={t('pos2.moreOrderActions')}
        >
          <MoreHorizontal className="pos2-more-icon" aria-hidden />
        </button>
      </div>

      <div className="pos2-order-list flex flex-col divide-y divide-neutral-100 border-t border-neutral-100">
        {lines.map((line) => (
          <div key={line.id} className="pos2-order-line flex items-start justify-between">
            <div className="pos2-order-line-main flex items-start">
              <span className="font-semibold text-neutral-500">{line.qty}</span>
              <div>
                <p className="font-semibold text-neutral-900">{t(line.nameKey)}</p>
                {line.modifierKey && <p className="pos2-order-modifier text-neutral-400">{t(line.modifierKey)}</p>}
              </div>
            </div>
            <span className="font-semibold text-neutral-900">{formatMoney(line.qty * line.price)}</span>
          </div>
        ))}
      </div>

      <div className="flex-1" />

      <div className="pos2-totals flex flex-col">
        <div className="flex items-center justify-between text-neutral-500">
          <span>{t('pos2.subtotal')}</span>
          <span className="font-medium text-neutral-900">{formatMoney(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between text-neutral-500">
          <span>{t('pos2.tax')}</span>
          <span className="font-medium text-neutral-900">{formatMoney(tax)}</span>
        </div>
        <div className="pos2-total-row flex items-center justify-between font-bold text-neutral-900">
          <span>{t('pos2.total')}</span>
          <span>{formatMoney(total)}</span>
        </div>
      </div>

      <div className="pos2-order-actions flex">
        <button type="button" className="pos2-order-action-btn pos2-btn-light flex-1">
          {t('pos2.nifButton')}
        </button>
        <button type="button" className="pos2-order-action-btn pos2-btn-dark flex-[1.15]">
          {t('pos2.chargeButton', { amount: formatMoney(total) })}
        </button>
      </div>
    </section>
  );
};

const Pos2Menu: React.FC<{
  categories: Pos2Category[];
  activeCategoryId: string;
  onSelectCategory: (id: string) => void;
  isLoading: boolean;
  error: string | null;
}> = ({ categories, activeCategoryId, onSelectCategory, isLoading, error }) => {
  const { t } = useTranslation();
  const activeCategory = categories.find((c) => c.id === activeCategoryId) ?? categories[0];

  return (
    <section className="pos2-menu-col flex min-w-0 flex-1 flex-col">
      <div className="pos2-pill-row flex">
        {categories.map((category) => {
          const isActive = category.id === activeCategory.id;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onSelectCategory(category.id)}
              className={`pos2-category-pill truncate transition-colors ${
                isActive ? 'pos2-btn-dark' : 'pos2-btn-light'
              }`}
              title={category.label}
            >
              {category.label}
            </button>
          );
        })}
      </div>

      <div className="pos2-product-grid grid flex-1 auto-rows-min overflow-y-auto">
        {isLoading && (
          <div className="pos2-order-line col-span-full flex items-center justify-center text-neutral-400">
            {t('app.loading')}
          </div>
        )}
        {!isLoading && error && (
          <div className="pos2-order-line col-span-full flex items-center justify-center text-red-500" role="alert">
            {error}
          </div>
        )}
        {!isLoading && !error && activeCategory.products.map((product) => (
          <button
            key={product.id}
            type="button"
            className="pos2-product-card flex flex-col items-center overflow-hidden border border-neutral-200/50 bg-white text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-transform hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="pos2-product-thumb relative flex w-full items-center justify-center bg-white">
              <Package className="pos2-product-fallback text-neutral-300" aria-hidden />
              {product.imageUrl && (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="absolute inset-0 h-full w-full object-contain"
                  draggable={false}
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              )}
            </div>
            <p className="pos2-product-name w-full truncate font-semibold text-neutral-900" title={product.name}>
              {product.name}
            </p>
            <p className="pos2-product-price text-neutral-500">
              {formatMoney(product.price)}{product.soldByWeight ? '/kg' : ''}
            </p>
          </button>
        ))}
        {!isLoading && !error && activeCategory.products.length === 0 && (
          <div className="pos2-order-line col-span-full flex flex-1 items-center justify-center text-neutral-400">
            {activeCategory.id === 'all'
              ? t('pos.noCatalogProductsTitle')
              : t('pos2.emptyCategory', { category: activeCategory.label })}
          </div>
        )}
      </div>

      <div className="pos2-menu-actions flex">
        <button type="button" className="pos2-action-btn pos2-btn-light flex-1">
          {t('pos2.customItem')}
        </button>
        <button type="button" className="pos2-action-btn pos2-btn-light flex-1">
          {t('pos2.discount')}
        </button>
      </div>
    </section>
  );
};

const POS2: React.FC = () => {
  const { t } = useTranslation();
  const { products, categories, isLoading, error } = useProducts();
  const [activeNav, setActiveNav] = useState('home');
  const [activeCategoryId, setActiveCategoryId] = useState('all');

  const catalogCategories = useMemo<Pos2Category[]>(() => {
    const activeProducts = products
      .filter((product) => product.is_active && product.deleted_at === null)
      .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));

    const toPos2Product = (product: (typeof activeProducts)[number]): Pos2Product => ({
      id: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.image_url,
      soldByWeight: product.sold_by_weight ?? false,
    });

    const realCategories = categories
      .filter((category) => category.is_active && category.deleted_at === null)
      .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))
      .map((category) => ({
        id: category.id,
        label: category.name,
        products: activeProducts
          .filter((product) => product.category_id === category.id)
          .map(toPos2Product),
      }));

    return [
      {
        id: 'all',
        label: t('pos2.categoryAll'),
        products: activeProducts.map(toPos2Product),
      },
      ...realCategories,
    ];
  }, [categories, products, t]);

  return (
    <div className="pos2-route-host fixed inset-0 z-0 flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden">
      <Pos2StatusBar />
      <div className="pos2-content-row flex min-h-0 flex-1 items-stretch">
        <Pos2Sidebar active={activeNav} onSelect={setActiveNav} />
        <Pos2OrderPanel lines={ORDER_LINES} />
        <Pos2Menu
          categories={catalogCategories}
          activeCategoryId={activeCategoryId}
          onSelectCategory={setActiveCategoryId}
          isLoading={isLoading}
          error={error}
        />
      </div>
    </div>
  );
};

export default POS2;
