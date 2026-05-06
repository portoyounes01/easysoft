import React from 'react';
import { Plus, Banknote, CreditCard, Download, Filter, Eye, ChevronDown, Users, TicketPercent, Save, Table, BarChart3, Camera, ArrowUpDown, MoreVertical, Edit, Trash2 } from 'lucide-react';
import { NumpadButton } from '../ui/NumpadButton';
import { TabButton } from '../ui/TabButton';
import { PaymentMethodButton } from '../ui/PaymentMethodButton';
import { AdminActionButton } from '../ui/AdminActionButton';
import { POSActionButton } from '../ui/POSActionButton';
import { TabToggle } from '../ui/TabToggle';
import { ActionButton } from '../ui/ActionButton';
import { OutlineButton } from '../ui/OutlineButton';

import { PairingButton } from '../ui/PairingButton';
import { DashedCardButton } from '../ui/DashedCardButton';
import { TableActionButton } from '../ui/TableActionButton';

const Buttons: React.FC = () => {
    const renderButtonSection = (
        title: string,
        baseClass: string
    ) => (
        <section>
            <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">{title}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 items-start">
                {/* Large */}
                <div className="flex flex-col gap-3">
                    <button className={`px-6 py-3 rounded-[10px] font-medium text-lg flex items-center justify-center gap-2 ${baseClass}`}>
                        <Plus className="w-5 h-5" />
                        Button
                        <Plus className="w-5 h-5" />
                    </button>
                    <div className="text-center">
                        <p className="text-sm text-neutral-600 font-medium">Large</p>
                        <p className="text-xs text-neutral-400 font-mono">h-14 px-6 text-lg</p>
                    </div>
                </div>

                {/* Default/Medium */}
                <div className="flex flex-col gap-3">
                    <button className={`px-4 py-2 rounded-[10px] font-medium flex items-center justify-center gap-2 ${baseClass}`}>
                        <Plus className="w-4 h-4" />
                        Button
                        <Plus className="w-4 h-4" />
                    </button>
                    <div className="text-center">
                        <p className="text-sm text-neutral-600 font-medium">Default</p>
                        <p className="text-xs text-neutral-400 font-mono">h-10 px-4 text-base</p>
                    </div>
                </div>

                {/* Small */}
                <div className="flex flex-col gap-3">
                    <button className={`px-3 py-1.5 rounded-[10px] font-medium text-sm flex items-center justify-center gap-1.5 ${baseClass}`}>
                        <Plus className="w-3.5 h-3.5" />
                        Button
                        <Plus className="w-3.5 h-3.5" />
                    </button>
                    <div className="text-center">
                        <p className="text-sm text-neutral-600 font-medium">Small</p>
                        <p className="text-xs text-neutral-400 font-mono">h-8 px-3 text-sm</p>
                    </div>
                </div>

                {/* Disabled */}
                <div className="flex flex-col gap-3">
                    <button disabled className={`px-4 py-2 rounded-[10px] font-medium flex items-center justify-center gap-2 opacity-50 cursor-not-allowed ${baseClass}`}>
                        <Plus className="w-4 h-4" />
                        Button
                        <Plus className="w-4 h-4" />
                    </button>
                    <div className="text-center">
                        <p className="text-sm text-neutral-600 font-medium">Disabled</p>
                        <p className="text-xs text-neutral-400 font-mono">opacity-50</p>
                    </div>
                </div>

                {/* Icon Only (Circular) */}
                <div className="flex flex-col gap-3 items-center">
                    <button className={`w-10 h-10 rounded-full flex items-center justify-center ${baseClass}`}>
                        <Plus className="w-5 h-5" />
                    </button>
                    <div className="text-center">
                        <p className="text-sm text-neutral-600 font-medium">Icon Only</p>
                        <p className="text-xs text-neutral-400 font-mono">rounded-full w-10</p>
                    </div>
                </div>
            </div>
        </section>
    );

    return (
        <div className="space-y-16">
            {renderButtonSection(
                'Primary',
                'bg-primary-600 text-neutral-50 hover:bg-primary-700 transition-colors')}

            {renderButtonSection(
                'Outline',
                'bg-white text-neutral-700 border border-neutral-300 hover:bg-neutral-50 transition-colors'
            )}

            {renderButtonSection(
                'Gradient',
                'bg-[linear-gradient(135.7deg,theme(colors.primary.500)_-33%,theme(colors.secondary.700)_100%)] text-neutral-50 hover:opacity-90 transition-opacity'
            )}

            {renderButtonSection(
                'Danger',
                'bg-error-600 text-neutral-50 hover:bg-error-700 transition-colors'
            )}

            {renderButtonSection(
                'Ghost',
                'text-neutral-600 hover:bg-neutral-50 transition-colors'
            )}

            {/* Explicit Disabled Section as requested */}
            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">Disabled</h3>
                <div className="flex flex-wrap gap-8 items-center">
                    <button disabled className="px-6 py-3 rounded-[10px] font-medium text-lg flex items-center justify-center gap-2 opacity-50 cursor-not-allowed bg-primary-600 text-neutral-100">
                        <Plus className="w-5 h-5" />
                        Primary
                        <Plus className="w-5 h-5" />
                    </button>
                    <button disabled className="px-6 py-3 rounded-[10px] font-medium text-lg flex items-center justify-center gap-2 opacity-50 cursor-not-allowed bg-white text-neutral-700 border border-neutral-300">
                        <Plus className="w-5 h-5" />
                        Outline
                        <Plus className="w-5 h-5" />
                    </button>
                    <button disabled className="px-6 py-3 rounded-[10px] font-medium text-lg flex items-center justify-center gap-2 opacity-50 cursor-not-allowed bg-error-600 text-neutral-50">
                        <Plus className="w-5 h-5" />
                        Danger
                        <Plus className="w-5 h-5" />
                    </button>
                </div>
            </section>

            {/* Misc Section from Codebase Scan */}
            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">Misc (Scanned from App)</h3>
                <div className="space-y-12">

                    {/* Numpad Buttons */}
                    <div>
                        <h4 className="text-sm font-medium text-neutral-500 mb-4">Numpad Style</h4>
                        <div className="grid grid-cols-3 gap-4 w-64">
                            <NumpadButton label="1" />
                            <NumpadButton variant="action" icon={Plus} className="rotate-45" />
                            <NumpadButton variant="confirm" label="OK" />
                        </div>
                    </div>

                    {/* Sidebar Buttons */}
                    <div>
                        <h4 className="text-sm font-medium text-neutral-500 mb-4">Sidebar / Navigation</h4>
                        <div className="flex gap-4 bg-slate-900 p-4 rounded-xl w-fit">
                            <TabButton variant="sidebar" active={true} label="Active Tab" icon={Plus} />
                            <TabButton variant="sidebar" active={false} label="Inactive Tab" icon={Plus} />
                        </div>
                    </div>

                    {/* Payment / Action Buttons */}
                    <div>
                        <h4 className="text-sm font-medium text-neutral-500 mb-4">Payment & Actions (Dialog)</h4>
                        <div className="flex gap-4">
                            <PaymentMethodButton selected={true} method="cash" label="Cash (Selected)" icon={Banknote} />
                            <PaymentMethodButton selected={false} method="card" label="Card (Default)" icon={CreditCard} />
                        </div>
                    </div>

                    {/* Admin / Management Actions */}
                    <div>
                        <h4 className="text-sm font-medium text-neutral-500 mb-4">Admin / Management Actions</h4>
                        <div className="flex flex-wrap gap-4 items-center">
                            <AdminActionButton variant="primary" label="Export" icon={Download} />
                            <AdminActionButton variant="outline" label="Filters" icon={Filter} showChevron />
                            <AdminActionButton variant="ghost" label="View Receipt" icon={Eye} />
                            <AdminActionButton variant="icon" icon={ChevronDown} />
                        </div>
                    </div>

                    {/* Tab Navigation (Reports Style) */}
                    <div>
                        <h4 className="text-sm font-medium text-neutral-500 mb-4">Tab Navigation (Reports)</h4>
                        <div className="flex border-b border-gray-200 w-fit">
                            <TabButton variant="reports" active={true} label="Overview" icon={BarChart3} />
                            <TabButton variant="reports" active={false} label="Employees" icon={Users} />
                        </div>
                    </div>

                    {/* POS Quick Actions & Toggles */}
                    <div>
                        <h4 className="text-sm font-medium text-neutral-500 mb-4">POS Quick Actions & Toggles</h4>
                        <div className="space-y-6">
                            {/* Quick Actions Grid */}
                            <div className="flex gap-4">
                                <POSActionButton label="Customer" icon={Users} />
                                <POSActionButton label="Discount" icon={TicketPercent} />
                                <POSActionButton label="Save Bill" icon={Save} variant="disabled" disabled />
                            </div>

                            {/* Tab Toggle */}
                            <div className="w-80 space-y-4">
                                <TabToggle
                                    options={[
                                        { value: 'dine-in', label: 'Dine In' },
                                        { value: 'take-away', label: 'Take Away' }
                                    ]}
                                    value="dine-in"
                                    onChange={() => { }}
                                    showIndicator={false}
                                />
                                <TabToggle
                                    options={[
                                        { value: 'preset', label: 'Preset' },
                                        { value: 'percentage', label: 'Percentage' },
                                        { value: 'fixed', label: 'Fixed' }
                                    ]}
                                    value="preset"
                                    onChange={() => { }}
                                />
                            </div>

                            {/* Process Transaction */}
                            <div className="w-80 space-y-4">
                                <ActionButton />
                                <OutlineButton label="Clear All Order" className="w-full" />
                                <ActionButton label="Clear All Order" variant="outline" className="w-full" />
                                <ActionButton label="Cancel" variant="secondary" className="w-full" />
                            </div>
                        </div>
                    </div>

                    {/* Device Pairing (Extra Large) */}
                    <div>
                        <h4 className="text-sm font-medium text-neutral-500 mb-4">Device Pairing (Extra Large)</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
                            <PairingButton variant="primary" label="Pair Device" />
                            <PairingButton variant="secondary" label="Scan QR" icon={Camera} />
                        </div>
                    </div>

                    {/* Card Actions (Dashed) */}
                    <div>
                        <h4 className="text-sm font-medium text-neutral-500 mb-4">Card Actions (Dashed)</h4>
                        <div className="h-40 w-64">
                            <DashedCardButton label="Add Category" icon={Plus} />
                        </div>
                    </div>

                    {/* Table Actions & Menus */}
                    <div>
                        <h4 className="text-sm font-medium text-neutral-500 mb-4">Table Actions & Menus</h4>
                        <div className="flex flex-wrap gap-4 items-center">
                            <TableActionButton variant="sort" label="Sort" icon={ArrowUpDown} />
                            <TableActionButton variant="icon" icon={MoreVertical} />
                            <TableActionButton variant="delete" icon={Trash2} />
                            <TableActionButton variant="edit" label="Edit Product" icon={Edit} />
                        </div>
                    </div>

                </div>
            </section>
        </div>
    );
};

export default Buttons;
