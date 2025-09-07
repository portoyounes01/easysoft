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
    canSaveBill?: boolean;
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
    canSaveBill = false,
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
                        <button
                            onClick={onCustomer}
                            className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center hover:bg-gray-50 transition-all duration-200"
                            style={{ padding: '0.5vh', height: '6vh' }}
                        >
                            <Users style={{ width: '1.8vh', height: '1.8vh', marginBottom: '0.3vh' }} className="text-gray-800" />
                            <span className="text-gray-800 font-medium" style={{ fontSize: '1.5vh' }}>{t('pos.customer')}</span>
                        </button>

                        <button
                            onClick={onDiscount}
                            className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center hover:bg-gray-50 transition-all duration-200"
                            style={{ padding: '0.5vh', height: '6vh' }}
                        >
                            <TicketPercent style={{ width: '1.8vh', height: '1.8vh', marginBottom: '0.3vh' }} className="text-gray-800" />
                            <span className="text-gray-800 font-medium" style={{ fontSize: '1.5vh' }}>{t('pos.discountHeader')}</span>
                        </button>
                        <button
                            onClick={onSaveBill}
                            disabled={!canSaveBill}
                            aria-disabled={!canSaveBill}
                            title={!canSaveBill ? 'Disponível após completar a venda' : undefined}
                            className={`bg-white border rounded-xl flex flex-col items-center justify-center transition-all duration-200 ${canSaveBill ? 'border-gray-200 hover:bg-gray-50' : 'border-gray-300 opacity-50 cursor-not-allowed'
                                }`}
                            style={{ padding: '0.3vh', height: '6vh' }}
                        >
                            <Save style={{ width: '1.8vh', height: '1.8vh', marginBottom: '0.3vh' }} className="text-gray-800" />
                            <span className="text-gray-800 font-medium" style={{ fontSize: '1.5vh' }}>{t('pos.saveBill')}</span>
                        </button>
                        <button
                            disabled
                            aria-disabled="true"
                            title="Disabled"
                            className="bg-gray-200 border border-gray-400 rounded-xl flex flex-col items-center justify-center opacity-50 cursor-not-allowed transition-all duration-200"
                            style={{ padding: '0.5vh', height: '6vh' }}
                        >
                            <Table style={{ width: '1.8vh', height: '1.8vh', marginBottom: '0.3vh' }} className="text-gray-800" />
                            <span className="text-gray-800 font-medium" style={{ fontSize: '1.5vh' }}>{t('pos.tables')}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Middle section: Order details + Items list (58% row) */}
            <div className="h-full overflow-visible relative" style={{ paddingTop: '1vh', paddingLeft: '2vh', paddingRight: '2vh' }}>
                <div className="h-full overflow-visible flex flex-col" style={{ gap: '1vh' }}>
                    {/* Order details header + tabs */}
                    <div>
                        <h2 className="font-bold text-gray-900" style={{ fontSize: '2vh', marginBottom: '1.3vh' }}>{t('pos.orderDetails')}</h2>
                        <div className="bg-gray-100 rounded-[10px] flex w-full border shadow-sm relative">
                            <div className="flex w-full relative">
                                <button
                                    onClick={() => handleSetServiceType('dine-in')}
                                    className={`flex-1 rounded-[10px] font-semibold transition-all relative ${serviceType === 'dine-in' ? 'bg-white text-gray-900' : 'text-gray-600'}`}
                                    style={{ padding: '1.25vh', fontSize: '1.5vh' }}
                                >
                                    {t('pos.dineIn')}
                                    {serviceType === 'dine-in' && (
                                        <span
                                            className="absolute left-1/2 -translate-x-1/2 bottom-0 h-[0.4vh] bg-gradient-to-r from-green-500 to-green-600 rounded-full"
                                            style={{ width: '25%' }}
                                        />
                                    )}
                                </button>
                                <button
                                    onClick={() => handleSetServiceType('take-away')}
                                    className={`flex-1 rounded-[10px] font-semibold transition-all relative ${serviceType === 'take-away' ? 'bg-white text-gray-900' : 'text-gray-600'}`}
                                    style={{ padding: '1.25vh', fontSize: '1.5vh' }}
                                >
                                    {t('pos.takeAway')}
                                    {serviceType === 'take-away' && (
                                        <span
                                            className="absolute left-1/2 -translate-x-1/2 bottom-0 h-[0.4vh] bg-gradient-to-r from-green-500 to-green-600 rounded-full"
                                            style={{ width: '25%' }}
                                        />
                                    )}
                                </button>
                            </div>
                        </div>
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
                                    {items.map((ci, index) => (
                                        <li key={ci.product.id} style={{ paddingTop: index === 0 ? '2vh' : '1.5vh', paddingBottom: '1vh' }}>
                                            <div className="flex items-center justify-between">
                                                <p className="font-semibold text-gray-900 truncate" style={{ fontSize: '1.7vh', paddingRight: '1vh' }}>{ci.product.name}</p>
                                                <p className="font-semibold text-gray-900" style={{ fontSize: '1.5vh' }}>{formatCurrency(ci.product.price)}</p>
                                            </div>
                                            <div className="flex items-center space-x-3 text-gray-500" style={{ marginTop: index === 0 ? '0.2vh' : '0.8vh', paddingLeft: '1vh' }}>
                                                <span className="font-medium" style={{ fontSize: '1.3vh' }}>x{ci.quantity}</span>
                                                <span style={{ fontSize: '1.3vh' }}>{formatCurrency(ci.product.price * ci.quantity)}</span>
                                            </div>
                                        </li>
                                    ))}
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
                        <button
                            onClick={onClearAll}
                            className="w-full bg-white shadow border border-gray-200 text-gray-900 rounded-2xl font-semibold transition-all duration-200 hover:bg-gray-50"
                            style={{ fontSize: '1.4vh', height: '4vh' }}
                        >
                            {t('pos.clearAllOrder')}
                        </button>
                    )}
                </div>
            </div>

            {/* Bottom section: Totals + Process button (26.5% row) */}
            <div className="h-full overflow-hidden relative" style={{ paddingLeft: '2vh', paddingRight: '2vh', paddingBottom: '2vh', paddingTop: '1.5vh' }}>
                <div className="h-full overflow-hidden flex flex-col justify-between">
                    {/* Totals section */}
                    <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden" style={{ padding: '1vh', height: 'calc(26.5vh - 8vh - 2vh)' }}>
                        <div className="flex items-center justify-between" style={{ marginBottom: '0.5vh', paddingTop: '0.25vh' }}>
                            <span className="text-gray-500 font-medium" style={{ fontSize: '1.5vh' }}>{t('pos.subtotalLabel')}</span>
                            <span className="text-gray-600 font-semibold" style={{ fontSize: '1.5vh' }}>{formatCurrency(subtotal)}</span>
                        </div>
                        <div className="flex items-center justify-between" style={{ marginBottom: '0.5vh', paddingTop: '0.25vh' }}>
                            <span className="text-gray-500 font-medium" style={{ fontSize: '1.5vh' }}>{t('pos.taxLabel')}</span>
                            <span className="text-gray-600 font-semibold" style={{ fontSize: '1.5vh' }}>{formatCurrency(tax)}</span>
                        </div>
                        <div className="flex items-center justify-between opacity-50" style={{ marginBottom: '1vh', paddingTop: '0.25vh' }}>
                            <span className="text-gray-500 font-medium" style={{ fontSize: '1.5vh' }}>{t('pos.voucherLabel')}</span>
                            <span className="text-gray-600 font-semibold" style={{ fontSize: '1.5vh' }}>{formatCurrency(0)}</span>
                        </div>
                        <div className="border-t border-gray-200" style={{ marginBottom: '1vh' }}></div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-800 font-semibold" style={{ fontSize: '1.5vh' }}>{t('pos.totalLabel')}</span>
                            <span className="font-extrabold text-gray-900" style={{ fontSize: '2.75vh' }}>{formatCurrency(total)}</span>
                        </div>
                    </div>

                    {/* Process button */}
                    <button
                        onClick={onProcess}
                        disabled={items.length === 0}
                        className="w-full bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-700 text-white rounded-[10px] font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ height: '4.5vh', fontSize: '1.85vh' }}
                    >
                        {t('pos.processTransaction')}
                    </button>
                </div>
            </div>
        </aside>
    );
};

export default React.memo(OrderSummaryPanel);


