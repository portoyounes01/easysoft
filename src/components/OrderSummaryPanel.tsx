import React, { useMemo, useState, useCallback } from 'react';
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
    className = ''
}) => {
    // 1. Hooks
    const { t } = useTranslation();
    const [serviceType, setServiceType] = useState<ServiceType>('dine-in');

    // 2. Event handlers
    const handleSetServiceType = useCallback((type: ServiceType) => {
        setServiceType(type);
    }, []);

    const formatCurrency = useCallback((value: number) => {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(value);
    }, []);

    // 3. Computed values
    const total = useMemo(() => {
        return items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    }, [items]);

    // 4. Effects - none

    // 5. Render
    return (
        <aside className={`w-96 bg-white shadow-xl border-l border-gray-200 flex flex-col h-screen ${className}`}>
            {/* Top quick actions */}
            <div className="grid grid-cols-2 gap-3 p-4">
                <button
                    onClick={onCustomer}
                    className="bg-white border border-gray-200 rounded-2xl p-4 min-h-[80px] flex flex-col items-center justify-center hover:bg-gray-50 transition-all duration-200"
                >
                    <Users className="w-6 h-6 text-gray-800 mb-2" />
                    <span className="text-gray-800 text-lg font-medium">{t('pos.customer')}</span>
                </button>
                <button
                    onClick={onTables}
                    className="bg-white border border-gray-200 rounded-2xl p-4 min-h-[80px] flex flex-col items-center justify-center hover:bg-gray-50 transition-all duration-200"
                >
                    <Table className="w-6 h-6 text-gray-800 mb-2" />
                    <span className="text-gray-800 text-lg font-medium">{t('pos.tables')}</span>
                </button>
                <button
                    onClick={onDiscount}
                    className="bg-white border border-gray-200 rounded-2xl p-4 min-h-[80px] flex flex-col items-center justify-center hover:bg-gray-50 transition-all duration-200"
                >
                    <TicketPercent className="w-6 h-6 text-gray-800 mb-2" />
                    <span className="text-gray-800 text-lg font-medium">{t('pos.discountHeader')}</span>
                </button>
                <button
                    onClick={onSaveBill}
                    className="bg-white border border-gray-200 rounded-2xl p-4 min-h-[80px] flex flex-col items-center justify-center hover:bg-gray-50 transition-all duration-200"
                >
                    <Save className="w-6 h-6 text-gray-800 mb-2" />
                    <span className="text-gray-800 text-lg font-medium">{t('pos.saveBill')}</span>
                </button>
            </div>

            {/* Order details header + tabs */}
            <div className="px-4">
                <h2 className="text-2xl font-bold text-gray-900 mb-3">{t('pos.orderDetails')}</h2>
                <div className="bg-gray-100 rounded-2xl p-1 flex w-full mb-4">
                    <button
                        onClick={() => handleSetServiceType('dine-in')}
                        className={`flex-1 py-2 rounded-xl text-base font-semibold transition-all ${serviceType === 'dine-in' ? 'bg-white text-gray-900 shadow' : 'text-gray-600'
                            }`}
                    >
                        {t('pos.dineIn')}
                    </button>
                    <button
                        onClick={() => handleSetServiceType('take-away')}
                        className={`flex-1 py-2 rounded-xl text-base font-semibold transition-all ${serviceType === 'take-away' ? 'bg-white text-gray-900 shadow' : 'text-gray-600'
                            }`}
                    >
                        {t('pos.takeAway')}
                    </button>
                </div>
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto px-4">
                {items.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-xl text-gray-500 mb-2">{t('pos.noCartItemsTitle')}</p>
                        <p className="text-gray-400">{t('pos.noCartItemsMessage')}</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {items.map((ci) => (
                            <li key={ci.product.id} className="py-4">
                                <div className="flex items-center justify-between">
                                    <p className="text-lg font-semibold text-gray-900 truncate pr-3">{ci.product.name}</p>
                                    <p className="text-lg font-semibold text-gray-900">{formatCurrency(ci.product.price)}</p>
                                </div>
                                <div className="mt-2 flex items-center space-x-3 text-gray-500">
                                    <span className="text-base font-medium">x{ci.quantity}</span>
                                    <span className="text-base">{formatCurrency(ci.product.price)}</span>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Footer actions */}
            <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-gray-600 font-medium">{t('pos.totalLabel')}</span>
                    <span className="text-2xl font-bold text-gray-900">{formatCurrency(total)}</span>
                </div>
                <button
                    onClick={onClearAll}
                    disabled={items.length === 0}
                    className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl text-2xl font-semibold min-h-[80px] transition-all duration-200"
                >
                    {t('pos.clearAllOrder')}
                </button>
            </div>
        </aside>
    );
};

export default React.memo(OrderSummaryPanel);


