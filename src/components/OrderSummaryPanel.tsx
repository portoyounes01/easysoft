import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Users, Table, TicketPercent, Save, Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LocalProduct } from '../types/supabase';
import { POSActionButton } from './ui/POSActionButton';
import { OutlineButton } from './ui/OutlineButton';
import { TabToggle, TabToggleOption } from './ui/TabToggle';
import { ActionButton } from './ui/ActionButton';


export interface OrderSummaryItem {
    product: LocalProduct;
    quantity: number;
    /** When false, + is disabled (e.g. stock max reached). Defaults to true if omitted. */
    canIncrement?: boolean;
}

export interface OrderSummaryPanelProps {
    items: OrderSummaryItem[];
    onClearAll: () => void;
    onCustomer: () => void;
    onTables?: () => void;
    onDiscount?: () => void;
    onSaveBill?: () => void;
    onProcess?: () => void;
    canSaveBill?: boolean;
    className?: string;
    totalsOverride?: {
        subtotal: number;
        tax: number;
        discount: number;
        total: number;
    };
    discountInfo?: {
        type: 'none' | 'percentage' | 'fixed';
        value: number;
        amount: number;
    };
    /** Last issued invoice no in current AT chain (local Dexie). */
    fiscalChainHint?: string;
    /** Tap − to subtract 1 unit; removes line when quantity was 1. */
    onDecrementCartLine?: (productId: string) => void;
    /** Tap + to add 1 unit (stock limits enforced in parent). */
    onIncrementCartLine?: (productId: string) => void;
    /** Selected invoice customer for display (name + NIF). */
    customerSummary?: { name: string; taxNumber?: string | null };
}

type ServiceType = 'dine-in' | 'take-away';

const OrderSummaryPanel: React.FC<OrderSummaryPanelProps> = ({
    items,
    onClearAll,
    onCustomer,
    onTables,
    onDiscount,
    onSaveBill,
    onProcess,
    canSaveBill = false,
    className = '',
    totalsOverride,
    discountInfo,
    fiscalChainHint,
    onDecrementCartLine,
    onIncrementCartLine,
    customerSummary
}) => {
    // 1. Hooks
    const { t } = useTranslation();
    const [serviceType, setServiceType] = useState<ServiceType>('dine-in');
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const trackRef = useRef<HTMLDivElement | null>(null);
    const thumbRef = useRef<HTMLDivElement | null>(null);

    // 2. Event handlers
    const handleSetServiceType = useCallback((type: ServiceType) => {
        setServiceType(type);
    }, []);

    const formatCurrency = useCallback((value: number) => {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(value);
    }, []);

    const formatDiscountDisplay = useCallback((discountInfo?: { type: 'none' | 'percentage' | 'fixed'; value: number; amount: number }) => {
        if (!discountInfo || discountInfo.type === 'none' || discountInfo.amount === 0) {
            return formatCurrency(0);
        }

        if (discountInfo.type === 'fixed') {
            return formatCurrency(discountInfo.amount);
        }

        if (discountInfo.type === 'percentage') {
            return `${discountInfo.value}% (${formatCurrency(discountInfo.amount)})`;
        }

        return formatCurrency(0);
    }, [formatCurrency]);

    // 3. Computed values
    const subtotal = useMemo(() => {
        return items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    }, [items]);

    const tax = useMemo(() => {
        return items.reduce((sum, item) => {
            const rate = item.product.iva_rate || 0;
            const total = item.product.price * item.quantity;
            const taxAmount = total - total / (1 + rate);
            return sum + taxAmount;
        }, 0);
    }, [items]);

    const computedTotals = useMemo(() => {
        return {
            subtotal,
            tax,
            discount: 0,
            total: subtotal
        };
    }, [subtotal, tax]);

    const displayTotals = totalsOverride || computedTotals;

    // 4. Effects - none
    const updateScrollbar = useCallback(() => {
        const container = scrollRef.current;
        const track = trackRef.current;
        const thumb = thumbRef.current;
        if (!container || !track || !thumb) return;

        const isScrollable = container.scrollHeight > container.clientHeight + 1;
        track.style.opacity = isScrollable ? '1' : '0';
        if (!isScrollable) return;

        const ratio = container.scrollTop / (container.scrollHeight - container.clientHeight || 1);
        const trackHeight = track.clientHeight; // use actual track height, not container height
        const bottomInsetPx = 4; // leave a small safe zone to avoid clipping at the bottom
        const effectiveTrack = Math.max(0, trackHeight - bottomInsetPx);
        const thumbHeight = Math.max(30, (container.clientHeight / container.scrollHeight) * effectiveTrack);
        const top = ratio * (effectiveTrack - thumbHeight);
        thumb.style.height = `${thumbHeight}px`;
        thumb.style.transform = `translateY(${top}px)`;
    }, []);

    useEffect(() => {
        updateScrollbar();
    }, [items, updateScrollbar]);

    useEffect(() => {
        const handleResize = () => updateScrollbar();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [updateScrollbar]);

    // 5. Render
    return (
        <aside className={`w-[24.5vw] bg-white shadow-xl border-l border-gray-200 grid grid-rows-[15.5%_58%_26.5%] h-screen overflow-hidden ${className}`}>
            {/* Top quick actions (15.5% row) */}
            <div className="h-full overflow-hidden relative" style={{ paddingTop: '1.25vh', paddingBottom: '1.25vh', paddingLeft: '2vh', paddingRight: '2vh' }}>
                <div className="h-full overflow-hidden">
                    {/* Top quick actions */}
                    <div className="grid grid-cols-2" style={{ gap: '0.8vh' }}>
                        <POSActionButton
                            icon={Users}
                            label={t('pos.customer')}
                            onClick={onCustomer}
                            style={{ padding: '0.5vh', height: '6vh' }}
                            className="w-full"
                        />
                        <POSActionButton
                            icon={TicketPercent}
                            label={t('pos.discountHeader')}
                            onClick={onDiscount}
                            style={{ padding: '0.5vh', height: '6vh' }}
                            className="w-full"
                        />
                        <POSActionButton
                            icon={Save}
                            label={t('pos.saveBill')}
                            onClick={onSaveBill}
                            disabled={!canSaveBill}
                            variant={!canSaveBill ? 'disabled' : 'default'}
                            title={!canSaveBill ? 'Disponível após completar a venda' : undefined}
                            style={{ padding: '0.3vh', height: '6vh' }}
                            className="w-full"
                        />
                        <POSActionButton
                            icon={Table}
                            label={t('pos.tables')}
                            disabled={true}
                            variant="disabled"
                            title={t('pos.paymentDisabled')}
                            style={{ padding: '0.5vh', height: '6vh' }}
                            className="w-full"
                        />
                    </div>
                </div>
            </div>

            {/* Middle section: Order details + Items list (58% row) */}
            <div className="h-full overflow-visible relative" style={{ paddingTop: '1vh', paddingLeft: '2vh', paddingRight: '2vh' }}>
                <div className="h-full overflow-visible flex flex-col" style={{ gap: '1vh' }}>
                    {/* Order details header + tabs */}
                    <div>
                        <h2 className="font-bold text-gray-900" style={{ fontSize: '2vh', marginBottom: '1.3vh' }}>{t('pos.orderDetails')}</h2>
                        {/* Service Type Toggle */}
                        <div className="mb-4">
                            <TabToggle
                                options={[
                                    { value: 'dine-in', label: t('pos.dineIn') },
                                    { value: 'take-away', label: t('pos.takeAway') }
                                ] as TabToggleOption<'dine-in' | 'take-away'>[]}
                                value={serviceType}
                                onChange={handleSetServiceType}
                            />
                        </div>
                        {customerSummary && (
                            <div
                                className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 mb-2"
                                data-testid="order-panel-customer-summary"
                            >
                                <p className="font-semibold text-gray-900 truncate" style={{ fontSize: '1.5vh' }} title={customerSummary.name}>
                                    {customerSummary.name}
                                </p>
                                {customerSummary.taxNumber ? (
                                    <p className="text-gray-600 mt-0.5" style={{ fontSize: '1.35vh' }}>
                                        NIF {customerSummary.taxNumber}
                                    </p>
                                ) : null}
                            </div>
                        )}
                    </div>

                    {/* Items list - takes most space */}
                    <div className="flex-1 overflow-y-auto relative" style={{ paddingRight: '2vh' }}>
                        <div
                            ref={scrollRef}
                            className="overflow-y-auto overscroll-contain h-full hide-native-scrollbar"
                            onScroll={updateScrollbar}
                            onMouseEnter={updateScrollbar}
                        >
                            {items.length === 0 ? (
                                <div className="text-center py-12">
                                    <p className="text-gray-500 mb-2" style={{ fontSize: '1.8vh' }}>{t('pos.noCartItemsTitle')}</p>
                                    <p className="text-gray-400" style={{ fontSize: '1.4vh' }}>{t('pos.noCartItemsMessage')}</p>
                                </div>
                            ) : (
                                <ul className="divide-y divide-gray-100">
                                    {items.map((ci, index) => {
                                        const linePadding = { paddingTop: index === 0 ? '2vh' : '1.5vh', paddingBottom: '1vh' } as const;
                                        const showStepper = Boolean(onDecrementCartLine || onIncrementCartLine);
                                        const canInc = ci.canIncrement !== false;
                                        const lineDetails = (
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p
                                                        className="font-semibold text-gray-900 overflow-hidden text-ellipsis whitespace-nowrap"
                                                        style={{ fontSize: '1.7vh', maxWidth: showStepper ? '11vw' : '14vw' }}
                                                        title={ci.product.name}
                                                    >
                                                        {ci.product.name}
                                                    </p>
                                                    <p className="font-semibold text-gray-900 whitespace-nowrap shrink-0" style={{ fontSize: '1.5vh' }}>{formatCurrency(ci.product.price * ci.quantity)}</p>
                                                </div>
                                                <div className="text-gray-500" style={{ marginTop: index === 0 ? '0.2vh' : '0.8vh', paddingLeft: '0.5vh' }}>
                                                    <span style={{ fontSize: '1.3vh' }}>{formatCurrency(ci.product.price)}</span>
                                                </div>
                                            </div>
                                        );
                                        return (
                                            <li key={ci.product.id} style={linePadding}>
                                                <div className="flex w-full items-center gap-2 rounded-xl px-1 py-1">
                                                    {lineDetails}
                                                    {showStepper ? (
                                                        <div
                                                            className="flex shrink-0 items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            {onDecrementCartLine ? (
                                                                <button
                                                                    type="button"
                                                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-gray-300 bg-white text-gray-800 shadow-sm transition-all duration-150 hover:bg-gray-50 active:scale-95"
                                                                    aria-label={`${t('pos.cartQtyDecrease')}, ${ci.product.name}`}
                                                                    onClick={() => onDecrementCartLine(ci.product.id)}
                                                                >
                                                                    <Minus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                                                                </button>
                                                            ) : null}
                                                            <span
                                                                className="min-w-[2.25rem] text-center font-bold tabular-nums text-gray-900"
                                                                style={{ fontSize: '1.65vh' }}
                                                                aria-live="polite"
                                                            >
                                                                {ci.quantity}
                                                            </span>
                                                            {onIncrementCartLine ? (
                                                                <button
                                                                    type="button"
                                                                    disabled={!canInc}
                                                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-gray-300 bg-white text-gray-800 shadow-sm transition-all duration-150 hover:bg-gray-50 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
                                                                    aria-label={`${t('pos.cartQtyIncrease')}, ${ci.product.name}`}
                                                                    onClick={() => onIncrementCartLine(ci.product.id)}
                                                                >
                                                                    <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>

                        {/* Custom scrollbar track */}
                        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-2 flex">
                            <div ref={trackRef} className="scroll-indicator-track w-full bg-[#F7F7F7] rounded-full relative my-2 transition-opacity duration-200 opacity-0">
                                <div ref={thumbRef} className="scroll-indicator-thumb absolute left-0 right-0 bg-[#D7D7D7] rounded-full" style={{ top: 0, height: 40 }} />
                            </div>
                        </div>
                    </div>

                    {/* Clear All Orders button at bottom */}
                    {items.length > 0 && (
                        <OutlineButton
                            onClick={onClearAll}
                            label={t('pos.clearAllOrder')}
                            className="w-full"
                            style={{ fontSize: '1.4vh', height: '4vh' }}
                        />
                    )}
                </div>
            </div>

            {/* Bottom section: Totals + Process button (26.5% row) */}
            <div className="h-full overflow-hidden relative" style={{ paddingLeft: '2vh', paddingRight: '2vh', paddingBottom: '2vh', paddingTop: '1.5vh' }}>
                <div className="h-full overflow-hidden flex flex-col justify-between">
                    {/* Totals section */}
                    <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden" style={{ padding: '1vh', height: 'calc(26.5vh - 8vh - 2vh)' }}>
                        {fiscalChainHint && (
                            <p className="text-gray-600 mb-1" style={{ fontSize: '1.25vh' }} title={t('pos.lastFiscalDocumentTooltip')}>
                                Último doc.: <span className="font-semibold text-gray-800">{fiscalChainHint}</span>
                            </p>
                        )}
                        <div className="flex items-center justify-between" style={{ marginBottom: '0.5vh', paddingTop: '0.25vh' }}>
                            <span className="text-gray-500 font-medium" style={{ fontSize: '1.5vh' }}>{t('pos.subtotalLabel')}</span>
                            <span className="text-gray-600 font-semibold" style={{ fontSize: '1.5vh' }}>{formatCurrency(displayTotals.subtotal)}</span>
                        </div>
                        <div className="flex items-center justify-between" style={{ marginBottom: '0.5vh', paddingTop: '0.25vh' }}>
                            <span className="text-gray-500 font-medium" style={{ fontSize: '1.5vh' }}>{t('pos.taxLabel')}</span>
                            <span className="text-gray-600 font-semibold" style={{ fontSize: '1.5vh' }}>{formatCurrency(displayTotals.tax)}</span>
                        </div>
                        <div className="flex items-center justify-between" style={{ marginBottom: '1vh', paddingTop: '0.25vh' }}>
                            <span className="text-gray-500 font-medium" style={{ fontSize: '1.5vh' }}>{t('pos.discountLabel') || 'Discount'}</span>
                            <span className="text-gray-600 font-semibold" style={{ fontSize: '1.5vh' }}>{formatDiscountDisplay(discountInfo)}</span>
                        </div>
                        <div className="border-t border-gray-200" style={{ marginBottom: '1vh' }}></div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-800 font-semibold" style={{ fontSize: '1.5vh' }}>{t('pos.totalLabel')}</span>
                            <span className="font-extrabold text-gray-900" style={{ fontSize: '2.75vh' }}>{formatCurrency(displayTotals.total)}</span>
                        </div>
                    </div>

                    {/* Process button */}
                    <ActionButton
                        onClick={onProcess}
                        disabled={items.length === 0}
                        label={t('pos.processTransaction')}
                        style={{ height: '4.7vh', fontSize: '1.8vh' }}
                    />
                </div>
            </div>
        </aside>
    );
};

export default React.memo(OrderSummaryPanel);


