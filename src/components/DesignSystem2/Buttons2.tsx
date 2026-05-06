import React from 'react';
import {
    Plus,
    Banknote,
    CreditCard,
    Download,
    Filter,
    Eye,
    ChevronDown,
    Users,
    TicketPercent,
    Save,
    BarChart3,
    Camera,
    ArrowUpDown,
    MoreVertical,
    Edit,
    Trash2,
} from 'lucide-react';
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

const Buttons2: React.FC = () => {
    return (
        <div className="space-y-16">
            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">ActionButton</h3>
                <div className="flex flex-wrap gap-4 max-w-2xl">
                    <ActionButton label="Primary" className="w-auto min-w-50" />
                    <ActionButton label="Secondary" variant="secondary" className="w-auto min-w-50" />
                    <ActionButton label="Outline" variant="outline" className="w-auto min-w-50" />
                    <ActionButton label="Disabled" disabled className="w-auto min-w-50" />
                </div>
            </section>

            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">AdminActionButton</h3>
                <div className="flex flex-wrap gap-4 items-center">
                    <AdminActionButton variant="primary" label="Primary" icon={Plus} />
                    <AdminActionButton variant="outline" label="Outline" icon={Plus} />
                    <AdminActionButton variant="ghost" label="Ghost" icon={Plus} />
                    <AdminActionButton variant="icon" icon={Plus} aria-label="Icon" />
                    <AdminActionButton variant="outline" label="With chevron" icon={Filter} showChevron />
                    <AdminActionButton variant="primary" label="Disabled" icon={Download} disabled />
                </div>
            </section>

            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">OutlineButton</h3>
                <div className="max-w-md">
                    <OutlineButton label="Clear all (outline)" className="w-full" />
                </div>
            </section>

            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">TableActionButton</h3>
                <div className="flex flex-wrap gap-4 items-center">
                    <TableActionButton variant="sort" label="Sort" icon={ArrowUpDown} />
                    <TableActionButton variant="icon" icon={MoreVertical} aria-label="More" />
                    <TableActionButton variant="delete" icon={Trash2} aria-label="Delete" />
                    <TableActionButton variant="edit" label="Edit" icon={Edit} />
                </div>
            </section>

            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">NumpadButton</h3>
                <div className="grid grid-cols-3 gap-4 w-64">
                    <NumpadButton label="1" />
                    <NumpadButton variant="action" icon={Plus} className="rotate-45" />
                    <NumpadButton variant="confirm" label="OK" />
                </div>
            </section>

            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">TabButton</h3>
                <div className="space-y-8">
                    <div>
                        <h4 className="text-sm font-medium text-neutral-500 mb-4">Sidebar</h4>
                        <div className="flex gap-4 bg-slate-900 p-4 rounded-xl w-fit">
                            <TabButton variant="sidebar" active={true} label="Active" icon={Plus} type="button" />
                            <TabButton variant="sidebar" active={false} label="Inactive" icon={Plus} type="button" />
                        </div>
                    </div>
                    <div>
                        <h4 className="text-sm font-medium text-neutral-500 mb-4">Reports</h4>
                        <div className="flex border-b border-gray-200 w-fit">
                            <TabButton variant="reports" active={true} label="Overview" icon={BarChart3} type="button" />
                            <TabButton variant="reports" active={false} label="Employees" icon={Users} type="button" />
                        </div>
                    </div>
                </div>
            </section>

            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">PaymentMethodButton</h3>
                <div className="flex gap-4">
                    <PaymentMethodButton selected={true} method="cash" label="Cash (selected)" icon={Banknote} />
                    <PaymentMethodButton selected={false} method="card" label="Card" icon={CreditCard} />
                </div>
            </section>

            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">POSActionButton</h3>
                <div className="flex gap-4">
                    <POSActionButton label="Customer" icon={Users} />
                    <POSActionButton label="Discount" icon={TicketPercent} />
                    <POSActionButton label="Save Bill" icon={Save} variant="disabled" disabled />
                </div>
            </section>

            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">TabToggle</h3>
                <div className="w-80 space-y-4">
                    <TabToggle
                        options={[
                            { value: 'dine-in', label: 'Dine In' },
                            { value: 'take-away', label: 'Take Away' },
                        ]}
                        value="dine-in"
                        onChange={() => {}}
                        showIndicator={false}
                    />
                    <TabToggle
                        options={[
                            { value: 'preset', label: 'Preset' },
                            { value: 'percentage', label: 'Percentage' },
                            { value: 'fixed', label: 'Fixed' },
                        ]}
                        value="preset"
                        onChange={() => {}}
                    />
                </div>
            </section>

            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">PairingButton</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
                    <PairingButton variant="primary" label="Pair Device" />
                    <PairingButton variant="secondary" label="Scan QR" icon={Camera} />
                </div>
            </section>

            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">DashedCardButton</h3>
                <div className="h-40 w-64">
                    <DashedCardButton label="Add Category" icon={Plus} />
                </div>
            </section>

            <section>
                <h3 className="text-lg font-semibold text-neutral-900 mb-8 border-b pb-4">Admin toolbar (sample)</h3>
                <div className="flex flex-wrap gap-4 items-center">
                    <AdminActionButton variant="primary" label="Export" icon={Download} />
                    <AdminActionButton variant="outline" label="Filters" icon={Filter} showChevron />
                    <AdminActionButton variant="ghost" label="View Receipt" icon={Eye} />
                    <AdminActionButton variant="icon" icon={ChevronDown} aria-label="Open menu" />
                </div>
            </section>
        </div>
    );
};

export default Buttons2;
