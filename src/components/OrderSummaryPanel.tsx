import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Users, Table, TicketPercent, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LocalProduct } from '../types/supabase';

export interface OrderSummaryItem {
    product: LocalProduct;
    quantity: number;
}

export interface OrderSummaryPanelProps {
    items: OrderSummaryItem[];
    onClearAll: () => void;
    onCustomer: () => void;
    onTables?: () => void;
    onDiscount?: () => void;
    onSaveBill?: () => void;
    onProcess?: () => void;
    className?: string;
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
    className = ''
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

    const total = subtotal;

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
        const trackHeight = container.clientHeight;
        const thumbHeight = Math.max(30, (container.clientHeight / container.scrollHeight) * trackHeight);
        const top = ratio * (trackHeight - thumbHeight);
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
        <aside className={`w-96 bg-white shadow-xl border-l border-gray-200 flex flex-col h-screen ${className}`}>
            {/* Top quick actions */}
            <div className="grid grid-cols-2 gap-2 p-3">
                <button
                    onClick={onCustomer}
                    className="bg-white border border-gray-200 rounded-xl p-2 min-h-[64px] flex flex-col items-center justify-center hover:bg-gray-50 transition-all duration-200"
                >
                    <Users className="w-4 h-4 text-gray-800 mb-2" />
                    <span className="text-gray-800 text-sm font-medium">{t('pos.customer')}</span>
                </button>
                <button
                    onClick={onTables}
                    className="bg-white border border-gray-200 rounded-xl p-2 min-h-[64px] flex flex-col items-center justify-center hover:bg-gray-50 transition-all duration-200"
                >
                    <Table className="w-4 h-4 text-gray-800 mb-2" />
                    <span className="text-gray-800 text-sm font-medium">{t('pos.tables')}</span>
                </button>
                <button
                    onClick={onDiscount}
                    className="bg-white border border-gray-200 rounded-xl p-2 min-h-[64px] flex flex-col items-center justify-center hover:bg-gray-50 transition-all duration-200"
                >
                    <TicketPercent className="w-4 h-4 text-gray-800 mb-2" />
                    <span className="text-gray-800 text-sm font-medium">{t('pos.discountHeader')}</span>
                </button>
                <button
                    onClick={onSaveBill}
                    className="bg-white border border-gray-200 rounded-xl p-2 min-h-[64px] flex flex-col items-center justify-center hover:bg-gray-50 transition-all duration-200"
                >
                    <Save className="w-4 h-4 text-gray-800 mb-2" />
                    <span className="text-gray-800 text-sm font-medium">{t('pos.saveBill')}</span>
                </button>
            </div>

            {/* Order details header + tabs */}
            <div className="px-4">
                <h2 className="text-lg font-bold text-gray-900 mb-2">{t('pos.orderDetails')}</h2>
                <div className="bg-gray-100 rounded-2xl p-1 flex w-full mb-4">
                    <button
                        onClick={() => handleSetServiceType('dine-in')}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-all ${serviceType === 'dine-in' ? 'bg-white text-gray-900 shadow' : 'text-gray-600'
                            }`}
                    >
                        {t('pos.dineIn')}
                    </button>
                    <button
                        onClick={() => handleSetServiceType('take-away')}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-all ${serviceType === 'take-away' ? 'bg-white text-gray-900 shadow' : 'text-gray-600'
                            }`}
                    >
                        {t('pos.takeAway')}
                    </button>
                </div>
            </div>

            {/* Items list */}
            <div className="relative flex-1 bg-white min-h-0 overflow-hidden">
                {/* Scrollable content with native scrollbar hidden */}
                <div
                    ref={scrollRef}
                    className="overflow-y-auto overscroll-contain h-full pl-4 pr-8 hide-native-scrollbar"
                    onScroll={updateScrollbar}
                    onMouseEnter={updateScrollbar}
                >
                    {items.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-xl text-gray-500 mb-2">{t('pos.noCartItemsTitle')}</p>
                            <p className="text-gray-400">{t('pos.noCartItemsMessage')}</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {items.map((ci) => (
                                <li key={ci.product.id} className="py-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-semibold text-gray-900 truncate pr-3">{ci.product.name}</p>
                                        <p className="text-sm font-semibold text-gray-900">{formatCurrency(ci.product.price)}</p>
                                    </div>
                                    <div className="mt-1.5 flex items-center space-x-3 text-gray-500">
                                        <span className="text-xs font-medium">x{ci.quantity}</span>
                                        <span className="text-xs">{formatCurrency(ci.product.price)}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                {/* Always-visible custom track inside the section */}
                <div className="pointer-events-none absolute right-4 top-0 bottom-0 w-3 flex">
                    <div ref={trackRef} className="scroll-indicator-track w-full bg-[#F7F7F7] rounded-full relative my-2 transition-opacity duration-200 opacity-0">
                        <div ref={thumbRef} className="scroll-indicator-thumb absolute left-0 right-0 bg-[#D7D7D7] rounded-full" style={{ top: 0, height: 40 }} />
                    </div>
                </div>
            </div>

            {/* Footer actions */}
            <div className="p-4 pb-8 space-y-4">
                {items.length > 0 && (
                    <button
                        onClick={onClearAll}
                        className="w-full bg-white border-2 border-gray-200 text-gray-900 rounded-xl text-lg font-semibold min-h-[36px] transition-all duration-200"
                    >
                        {t('pos.clearAllOrder')}
                    </button>
                )}

                <div className="bg-gray-50 rounded-3xl border border-gray-200 p-5">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-gray-600 text-lg font-medium">{t('pos.subtotalLabel')}</span>
                        <span className="text-gray-700 text-lg font-semibold">{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-gray-600 text-lg font-medium">{t('pos.taxLabel')}</span>
                        <span className="text-gray-700 text-lg font-semibold">{formatCurrency(tax)}</span>
                    </div>
                    <div className="flex items-center justify-between mb-4 opacity-50">
                        <span className="text-gray-600 text-lg font-medium">{t('pos.voucherLabel')}</span>
                        <span className="text-gray-700 text-lg font-semibold">{formatCurrency(0)}</span>
                    </div>
                    <div className="border-t border-gray-200 my-2"></div>
                    <div className="flex items-center justify-between">
                        <span className="text-gray-800 text-lg font-semibold">{t('pos.totalLabel')}</span>
                        <span className="text-2xl font-extrabold text-gray-900">{formatCurrency(total)}</span>
                    </div>
                </div>

                <button
                    onClick={onProcess}
                    disabled={items.length === 0}
                    className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-xl text-lg font-semibold min-h-[48px] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {t('pos.processTransaction')}
                </button>
            </div>
        </aside>
    );
};

export default React.memo(OrderSummaryPanel);


