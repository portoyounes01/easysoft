import React, { useState } from 'react';
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
} from 'lucide-react';
import '../styles/pos2.css';

interface Pos2Product {
  id: string;
  nameKey: string;
  price: number;
  image: string;
}

interface Pos2Category {
  id: string;
  labelKey: string;
  products: Pos2Product[];
}

const CATEGORIES: Pos2Category[] = [
  {
    id: 'favorites',
    labelKey: 'pos2.categoryFavorites',
    products: [
      { id: 'double-cheeseburger', nameKey: 'pos2.productDoubleCheeseburger', price: 5.49, image: '/assets/pos2/double-cheeseburger.png' },
      { id: 'chicken-burger', nameKey: 'pos2.productChickenBurger', price: 5.49, image: '/assets/pos2/chicken-burger.png' },
      { id: 'veggie-burger', nameKey: 'pos2.productVeggieBurger', price: 5.49, image: '/assets/pos2/veggie-burger.png' },
      { id: 'fries', nameKey: 'pos2.productFries', price: 2.49, image: '/assets/pos2/fries.png' },
      { id: 'onion-rings', nameKey: 'pos2.productOnionRings', price: 2.49, image: '/assets/pos2/onion-rings.png' },
      { id: 'chicken-nuggets', nameKey: 'pos2.productChickenNuggets', price: 3.49, image: '/assets/pos2/chicken-nuggets.png' },
      { id: 'lemonade', nameKey: 'pos2.productLemonade', price: 2.29, image: '/assets/pos2/lemonade.png' },
      { id: 'iced-coffee', nameKey: 'pos2.productIcedCoffee', price: 2.49, image: '/assets/pos2/iced-coffee.png' },
      { id: 'apple-pie', nameKey: 'pos2.productApplePie', price: 1.99, image: '/assets/pos2/apple-pie.png' },
    ],
  },
  { id: 'burgers', labelKey: 'pos2.categoryBurgers', products: [] },
  { id: 'sides', labelKey: 'pos2.categorySides', products: [] },
  { id: 'drinks', labelKey: 'pos2.categoryDrinks', products: [] },
  { id: 'desserts', labelKey: 'pos2.categoryDesserts', products: [] },
];

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

const formatMoney = (value: number) => `$${value.toFixed(2)}`;

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
}> = ({ categories, activeCategoryId, onSelectCategory }) => {
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
              className={`pos2-category-pill flex-1 basis-0 truncate transition-colors ${
                isActive ? 'pos2-btn-dark' : 'pos2-btn-light'
              }`}
            >
              {t(category.labelKey)}
            </button>
          );
        })}
      </div>

      <div className="pos2-product-grid grid flex-1 auto-rows-min grid-cols-3 overflow-y-auto">
        {activeCategory.products.map((product) => (
          <button
            key={product.id}
            type="button"
            className="pos2-product-card flex flex-col items-center border border-neutral-200/50 bg-white text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-transform hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="pos2-product-thumb flex w-full items-center justify-center bg-white">
              <img src={product.image} alt="" className="h-full w-full object-contain" draggable={false} />
            </div>
            <p className="pos2-product-name font-semibold text-neutral-900">{t(product.nameKey)}</p>
            <p className="pos2-product-price text-neutral-500">{formatMoney(product.price)}</p>
          </button>
        ))}
        {activeCategory.products.length === 0 && (
          <div className="pos2-order-line col-span-3 flex flex-1 items-center justify-center text-neutral-400">
            {t('pos2.emptyCategory', { category: t(activeCategory.labelKey) })}
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
  const [activeNav, setActiveNav] = useState('home');
  const [activeCategoryId, setActiveCategoryId] = useState('favorites');

  return (
    <div className="pos2-route-host fixed inset-0 z-0 flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden">
      <Pos2StatusBar />
      <div className="pos2-content-row flex min-h-0 flex-1 items-stretch">
        <Pos2Sidebar active={activeNav} onSelect={setActiveNav} />
        <Pos2OrderPanel lines={ORDER_LINES} />
        <Pos2Menu
          categories={CATEGORIES}
          activeCategoryId={activeCategoryId}
          onSelectCategory={setActiveCategoryId}
        />
      </div>
    </div>
  );
};

export default POS2;
