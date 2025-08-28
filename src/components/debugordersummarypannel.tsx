import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Table, TicketPercent, Save } from 'lucide-react';

const DebugOrderSummaryPannel: React.FC = () => {
    const [containerHeight, setContainerHeight] = useState<number>(0);
    const { t } = useTranslation();
    const blueRef = useRef<HTMLDivElement | null>(null);
    const redRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const compute = () => {
            const vh = window.innerHeight;
            const status = document.getElementById('pos-status-bar');
            const statusH = status ? status.getBoundingClientRect().height : 0;
            setContainerHeight(vh - statusH);
        };
        compute();
        window.addEventListener('resize', compute);
        window.visualViewport?.addEventListener('resize', compute);
        return () => {
            window.removeEventListener('resize', compute);
            window.visualViewport?.removeEventListener('resize', compute);
        };
    }, []);

    // No scaling for blue or red sections - use fixed viewport units

    return (
        <aside className="w-[24.5vw] overflow-hidden grid grid-rows-[25%_50%_25%]" style={{ height: `${containerHeight}px` }}>
            <div ref={redRef} className="bg-red-200 h-full overflow-hidden relative" style={{ padding: '1vh' }}>
                <div className="h-full overflow-hidden">
                    {/* Top quick actions */}
                    <div className="grid grid-cols-2" style={{ gap: '0.8vh', padding: '0.5vh' }}>
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

                    {/* Order details header + tabs */}
                    <div style={{ paddingLeft: '0.8vh', paddingRight: '0.8vh' }}>
                        <h2 className="font-bold text-gray-900" style={{ fontSize: '1.8vh', marginBottom: '0.5vh' }}>{t('pos.orderDetails')}</h2>
                        <div className="bg-gray-100 rounded-2xl flex w-full" style={{ padding: '0.3vh' }}>
                            <button className="flex-1 rounded-xl font-semibold transition-all bg-white text-gray-900 shadow" style={{ padding: '1vh', fontSize: '1.5vh' }}>
                                {t('pos.dineIn')}
                            </button>
                            <button className="flex-1 rounded-xl font-semibold transition-all text-gray-600" style={{ padding: '1vh', fontSize: '1.5vh' }}>
                                {t('pos.takeAway')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="bg-green-200 h-full overflow-hidden relative" style={{ padding: '1vh' }}>
                <div className="h-full overflow-hidden flex flex-col" style={{ gap: '1vh' }}>
                    {/* Items list - takes most space */}
                    <div className="flex-1 overflow-y-auto" style={{ paddingRight: '1vh' }}>
                        {/* Sample items to show the layout */}
                        <ul className="divide-y divide-gray-100">
                            <li style={{ paddingTop: '1.5vh', paddingBottom: '1.5vh' }}>
                                <div className="flex items-center justify-between">
                                    <p className="font-semibold text-gray-900 truncate" style={{ fontSize: '1.4vh', paddingRight: '1vh' }}>Sample Coffee</p>
                                    <p className="font-semibold text-gray-900" style={{ fontSize: '1.4vh' }}>€3.50</p>
                                </div>
                                <div className="flex items-center space-x-3 text-gray-500" style={{ marginTop: '0.8vh' }}>
                                    <span className="font-medium" style={{ fontSize: '1.2vh' }}>x2</span>
                                    <span style={{ fontSize: '1.2vh' }}>€3.50</span>
                                </div>
                            </li>
                            <li style={{ paddingTop: '1.5vh', paddingBottom: '1.5vh' }}>
                                <div className="flex items-center justify-between">
                                    <p className="font-semibold text-gray-900 truncate" style={{ fontSize: '1.4vh', paddingRight: '1vh' }}>Pastry Item</p>
                                    <p className="font-semibold text-gray-900" style={{ fontSize: '1.4vh' }}>€2.25</p>
                                </div>
                                <div className="flex items-center space-x-3 text-gray-500" style={{ marginTop: '0.8vh' }}>
                                    <span className="font-medium" style={{ fontSize: '1.2vh' }}>x1</span>
                                    <span style={{ fontSize: '1.2vh' }}>€2.25</span>
                                </div>
                            </li>
                            <li style={{ paddingTop: '1.5vh', paddingBottom: '1.5vh' }}>
                                <div className="flex items-center justify-between">
                                    <p className="font-semibold text-gray-900 truncate" style={{ fontSize: '1.4vh', paddingRight: '1vh' }}>Sandwich Special</p>
                                    <p className="font-semibold text-gray-900" style={{ fontSize: '1.4vh' }}>€5.75</p>
                                </div>
                                <div className="flex items-center space-x-3 text-gray-500" style={{ marginTop: '0.8vh' }}>
                                    <span className="font-medium" style={{ fontSize: '1.2vh' }}>x1</span>
                                    <span style={{ fontSize: '1.2vh' }}>€5.75</span>
                                </div>
                            </li>
                        </ul>
                    </div>

                    {/* Clear All Orders button at bottom */}
                    <button className="w-full bg-white border-2 border-gray-200 text-gray-900 rounded-xl font-semibold transition-all duration-200 hover:bg-gray-50" style={{ fontSize: '1.4vh', height: '3vh' }}>
                        {t('pos.clearAllOrder')}
                    </button>
                </div>
            </div>
            <div ref={blueRef} className="bg-blue-200 h-full overflow-hidden relative" style={{ padding: '1vh' }}>
                <div className="h-full overflow-hidden flex flex-col justify-between">
                    {/* Totals section */}
                    <div className="bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden" style={{ padding: '1vh', height: 'calc(25vh - 8vh - 2vh)' }}>
                        <div className="flex items-center justify-between" style={{ marginBottom: '0.5vh' }}>
                            <span className="text-gray-600 font-medium" style={{ fontSize: '1.2vh' }}>{t('pos.subtotalLabel')}</span>
                            <span className="text-gray-700 font-semibold" style={{ fontSize: '1.4vh' }}>€0.00</span>
                        </div>
                        <div className="flex items-center justify-between" style={{ marginBottom: '0.5vh' }}>
                            <span className="text-gray-600 font-medium" style={{ fontSize: '1.2vh' }}>{t('pos.taxLabel')}</span>
                            <span className="text-gray-700 font-semibold" style={{ fontSize: '1.4vh' }}>€0.00</span>
                        </div>
                        <div className="flex items-center justify-between opacity-50" style={{ marginBottom: '1vh' }}>
                            <span className="text-gray-600 font-medium" style={{ fontSize: '1.2vh' }}>{t('pos.voucherLabel')}</span>
                            <span className="text-gray-700 font-semibold" style={{ fontSize: '1.4vh' }}>€0.00</span>
                        </div>
                        <div className="border-t border-gray-200" style={{ marginBottom: '0.5vh' }}></div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-800 font-semibold" style={{ fontSize: '1.4vh' }}>{t('pos.totalLabel')}</span>
                            <span className="font-extrabold text-gray-900" style={{ fontSize: '1.8vh' }}>€0.00</span>
                        </div>
                    </div>

                    {/* Process button */}
                    <button
                        className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-xl font-semibold transition-all duration-200"
                        style={{ height: '6vh', fontSize: '2vh' }}
                    >
                        {t('pos.processTransaction')}
                    </button>
                </div>
            </div>
        </aside>
    );
};

export default React.memo(DebugOrderSummaryPannel);


