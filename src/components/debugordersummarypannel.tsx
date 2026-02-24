import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Table, TicketPercent, Save } from 'lucide-react';

const DebugOrderSummaryPannel: React.FC = () => {
    const { t } = useTranslation();
    const blueRef = useRef<HTMLDivElement | null>(null);
    const redRef = useRef<HTMLDivElement | null>(null);

    // No scaling for blue or red sections - use fixed viewport units

    return (
        <aside className="w-[24.5vw] h-screen overflow-hidden grid grid-rows-[15.5%_58%_26.5%]">
            <div ref={redRef} className="bg-red-200 h-full overflow-hidden relative" style={{ paddingTop: '1.25vh', paddingBottom: '1.25vh', paddingLeft: '2vh', paddingRight: '2vh' }}>
                <div className="h-full overflow-hidden">
                    {/* Top quick actions */}
                    <div className="grid grid-cols-2" style={{ gap: '0.8vh' }}>
                        <button className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center hover:bg-gray-50 transition-all duration-200" style={{ padding: '0.5vh', height: '6vh' }}>
                            <Users style={{ width: '1.8vh', height: '1.8vh', marginBottom: '0.3vh' }} className="text-gray-800" />
                            <span className="text-gray-800 font-medium" style={{ fontSize: '1.5vh' }}>{t('pos.customer')}</span>
                        </button>
                        <button className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center hover:bg-gray-50 transition-all duration-200" style={{ padding: '0.5vh', height: '6vh' }}>
                            <Table style={{ width: '1.8vh', height: '1.8vh', marginBottom: '0.3vh' }} className="text-gray-800" />
                            <span className="text-gray-800 font-medium" style={{ fontSize: '1.5vh' }}>{t('pos.tables')}</span>
                        </button>
                        <button className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center hover:bg-gray-50 transition-all duration-200" style={{ padding: '0.5vh', height: '6vh' }}>
                            <TicketPercent style={{ width: '1.8vh', height: '1.8vh', marginBottom: '0.3vh' }} className="text-gray-800" />
                            <span className="text-gray-800 font-medium" style={{ fontSize: '1.5vh' }}>{t('pos.discountHeader')}</span>
                        </button>
                        <button className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center hover:bg-gray-50 transition-all duration-200" style={{ padding: '0.3vh', height: '6vh' }}>
                            <Save style={{ width: '1.8vh', height: '1.8vh', marginBottom: '0.3vh' }} className="text-gray-800" />
                            <span className="text-gray-800 font-medium" style={{ fontSize: '1.5vh' }}>{t('pos.saveBill')}</span>
                        </button>
                    </div>
                </div>
            </div>
            <div className="bg-green-200 h-full overflow-hidden relative" style={{ paddingTop: '1vh', paddingLeft: '2vh', paddingRight: '2vh' }}>
                <div className="h-full overflow-hidden flex flex-col" style={{ gap: '1vh' }}>
                    {/* Order details header + tabs */}
                    <div>
                        <h2 className="font-bold text-gray-900" style={{ fontSize: '1.9vh', marginBottom: '1.3vh' }}>{t('pos.orderDetails')}</h2>
                        <div className="bg-gray-100 rounded-[10px] flex w-full">
                            <button className="flex-1 rounded-[10px] font-semibold transition-all bg-white text-gray-900 shadow" style={{ padding: '1.25vh', fontSize: '1.25vh' }}>
                                {t('pos.dineIn')}
                            </button>
                            <button className="flex-1 rounded-[10px] font-semibold transition-all text-gray-600" style={{ padding: '1.25vh', fontSize: '1.25vh' }}>
                                {t('pos.takeAway')}
                            </button>
                        </div>
                    </div>

                    {/* Items list - takes most space */}
                    <div className="flex-1 overflow-y-auto" style={{ paddingRight: '1vh' }}>
                        {/* Sample items to show the layout */}
                        <ul className="divide-y divide-gray-100">
                            <li style={{ paddingTop: '2vh', paddingBottom: '1vh' }}>
                                <div className="flex items-center justify-between">
                                    <p className="font-semibold text-gray-900 truncate" style={{ fontSize: '1.7vh', paddingRight: '1vh' }}>Classic Crispyburger</p>
                                    <p className="font-semibold text-gray-900" style={{ fontSize: '1.5vh' }}>€3.50</p>
                                </div>
                                <div className="flex items-center space-x-3 text-gray-500" style={{ marginTop: '0.2vh', paddingLeft: '1vh' }}>
                                    <span className="font-medium" style={{ fontSize: '1.3vh' }}>x1</span>
                                    <span style={{ fontSize: '1.3vh' }}>€3.50</span>
                                </div>
                            </li>
                            <li style={{ paddingTop: '1.5vh', paddingBottom: '1vh' }}>
                                <div className="flex items-center justify-between">
                                    <p className="font-semibold text-gray-900 truncate" style={{ fontSize: '1.7vh', paddingRight: '1vh' }}>Pastry Item</p>
                                    <p className="font-semibold text-gray-900" style={{ fontSize: '1.5vh' }}>€2.25</p>
                                </div>
                                <div className="flex items-center space-x-3 text-gray-500" style={{ marginTop: '0.8vh', paddingLeft: '1vh' }}>
                                    <span className="font-medium" style={{ fontSize: '1.3vh' }}>x1</span>
                                    <span style={{ fontSize: '1.3vh' }}>€2.25</span>
                                </div>
                            </li>
                            <li style={{ paddingTop: '1.5vh', paddingBottom: '1vh' }}>
                                <div className="flex items-center justify-between">
                                    <p className="font-semibold text-gray-900 truncate" style={{ fontSize: '1.7vh', paddingRight: '1vh' }}>Sandwich Special</p>
                                    <p className="font-semibold text-gray-900" style={{ fontSize: '1.7vh' }}>€5.75</p>
                                </div>
                                <div className="flex items-center space-x-3 text-gray-500" style={{ marginTop: '0.8vh', paddingLeft: '1vh' }}>
                                    <span className="font-medium" style={{ fontSize: '1.3vh' }}>x1</span>
                                    <span style={{ fontSize: '1.3vh' }}>€5.75</span>
                                </div>
                            </li>
                            <li style={{ paddingTop: '2vh', paddingBottom: '1vh' }}>
                                <div className="flex items-center justify-between">
                                    <p className="font-semibold text-gray-900 truncate" style={{ fontSize: '1.7vh', paddingRight: '1vh' }}>Classic Crispyburger</p>
                                    <p className="font-semibold text-gray-900" style={{ fontSize: '1.5vh' }}>€3.50</p>
                                </div>
                                <div className="flex items-center space-x-3 text-gray-500" style={{ marginTop: '0.2vh', paddingLeft: '1vh' }}>
                                    <span className="font-medium" style={{ fontSize: '1.3vh' }}>x1</span>
                                    <span style={{ fontSize: '1.3vh' }}>€3.50</span>
                                </div>
                            </li>
                            <li style={{ paddingTop: '1.5vh', paddingBottom: '1vh' }}>
                                <div className="flex items-center justify-between">
                                    <p className="font-semibold text-gray-900 truncate" style={{ fontSize: '1.7vh', paddingRight: '1vh' }}>Pastry Item</p>
                                    <p className="font-semibold text-gray-900" style={{ fontSize: '1.5vh' }}>€2.25</p>
                                </div>
                                <div className="flex items-center space-x-3 text-gray-500" style={{ marginTop: '0.8vh', paddingLeft: '1vh' }}>
                                    <span className="font-medium" style={{ fontSize: '1.3vh' }}>x1</span>
                                    <span style={{ fontSize: '1.3vh' }}>€2.25</span>
                                </div>
                            </li>
                            <li style={{ paddingTop: '1.5vh', paddingBottom: '1vh' }}>
                                <div className="flex items-center justify-between">
                                    <p className="font-semibold text-gray-900 truncate" style={{ fontSize: '1.7vh', paddingRight: '1vh' }}>Spicy Drumstick</p>
                                    <p className="font-semibold text-gray-900" style={{ fontSize: '1.7vh' }}>€5.75</p>
                                </div>
                                <div className="flex items-center space-x-3 text-gray-500" style={{ marginTop: '0.8vh', paddingLeft: '1vh' }}>
                                    <span className="font-medium" style={{ fontSize: '1.3vh' }}>x1</span>
                                    <span style={{ fontSize: '1.3vh' }}>€5.75</span>
                                </div>
                            </li>
                        </ul>
                    </div>

                    {/* Clear All Orders button at bottom */}
                    <button className="w-full bg-white border-2 border-gray-200 text-gray-900 rounded-2xl font-semibold transition-all duration-200 hover:bg-gray-50" style={{ fontSize: '1.4vh', height: '4vh' }}>
                        {t('pos.clearAllOrder')}
                    </button>
                </div>
            </div>
            <div ref={blueRef} className="bg-blue-200 h-full overflow-hidden relative" style={{ paddingLeft: '2vh', paddingRight: '2vh', paddingBottom: '2vh', paddingTop: '1.5vh' }}>
                <div className="h-full overflow-hidden flex flex-col justify-between" >
                    {/* Totals section */}
                    <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden" style={{ padding: '1vh', height: 'calc(26.5vh - 8vh - 2vh)' }}>
                        <div className="flex items-center justify-between" style={{ marginBottom: '0.5vh', paddingTop: '0.25vh' }}>
                            <span className="text-gray-500 font-medium" style={{ fontSize: '1.5vh' }}>{t('pos.subtotalLabel')}</span>
                            <span className="text-gray-600 font-semibold" style={{ fontSize: '1.5vh' }}>€0.00</span>
                        </div>
                        <div className="flex items-center justify-between" style={{ marginBottom: '0.5vh', paddingTop: '0.25vh' }}>
                            <span className="text-gray-500 font-medium" style={{ fontSize: '1.5vh' }}>{t('pos.taxLabel')}</span>
                            <span className="text-gray-600 font-semibold" style={{ fontSize: '1.5vh' }}>€0.00</span>
                        </div>
                        <div className="flex items-center justify-between opacity-50" style={{ marginBottom: '1vh', paddingTop: '0.25vh' }}>
                            <span className="text-gray-500 font-medium" style={{ fontSize: '1.5vh' }}>{t('pos.voucherLabel')}</span>
                            <span className="text-gray-600 font-semibold" style={{ fontSize: '1.5vh' }}>€0.00</span>
                        </div>
                        <div className="border-t border-gray-200" style={{ marginBottom: '1vh' }}></div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-800 font-semibold" style={{ fontSize: '1.5vh' }}>{t('pos.totalLabel')}</span>
                            <span className="font-extrabold text-gray-900" style={{ fontSize: '2.75vh' }}>€31.75</span>
                        </div>
                    </div>

                    {/* Process button */}
                    <button
                        className="w-full bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-700 text-white rounded-[10px] font-medium transition-all duration-200"
                        style={{ height: '4.5vh', fontSize: '1.85vh' }}
                    >
                        {t('pos.processTransaction')}
                    </button>
                </div>
            </div>
        </aside>
    );
};

export default React.memo(DebugOrderSummaryPannel);


