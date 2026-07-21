import React, { useContext } from 'react';
import {
    Archive,
    Boxes,
    CalendarDays,
    Clock,
    CreditCard,
    Edit,
    FileText,
    Package,
    Scale,
    ShoppingCart,
    SlidersHorizontal,
    Table2,
    Tag,
    Upload,
    UserPlus,
    Users,
    type LucideIcon,
} from 'lucide-react';
import {
    DIALOG_CONTROL_CLASSES,
    DIALOG_PALETTES,
    DIALOG_TOGGLE_ON_CLASS,
    DialogShellStyleContext,
    dialogButtonClasses,
    type DialogStyleConfig,
} from '../theme/dialogStyle';

/**
 * Static replicas of every dialog family in the app, with realistic sample
 * data, rendered through ConfiguredDialogShell by the Dialog lab so any draft
 * style can be previewed against each dialog's real layout. Replicas are
 * intentionally non-interactive — they exist to judge the style, not to work.
 */

export interface DialogPreviewSpec {
    key: string;
    label: string;
    title: string;
    subtitle?: string;
    icon?: LucideIcon;
    /** Render the confirm-card look (no shell header/footer chrome). */
    bare?: boolean;
    Body: React.FC;
    Footer?: React.FC<{ buttons: ReturnType<typeof dialogButtonClasses> }>;
}

/** Style tokens available to replica bodies (always inside an applied shell). */
function useTokens() {
    const cfg = useContext(DialogShellStyleContext) as DialogStyleConfig;
    const p = DIALOG_PALETTES[cfg.palette];
    return {
        cfg,
        p,
        input: `w-full bg-white outline-none ${DIALOG_CONTROL_CLASSES[cfg.controls]}`,
        label: `mb-1.5 block text-sm font-semibold ${p.titleText}`,
    };
}

const F: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className = '' }) => {
    const { label: labelCls } = useTokens();
    return (
        <div className={className}>
            <span className={labelCls}>{label}</span>
            {children}
        </div>
    );
};

const InfoCard: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => {
    const { p } = useTokens();
    return (
        <div className={`rounded-xl border ${p.border} bg-white px-4 py-3`}>
            <p className={`text-xs ${p.subText}`}>{label}</p>
            <p className={`mt-0.5 font-semibold ${p.titleText}`}>{value}</p>
        </div>
    );
};

const twoButtonFooter = (secondary: string, primary: string): DialogPreviewSpec['Footer'] =>
    function PreviewFooter({ buttons }) {
        return (
            <div className={buttons.container}>
                <button type="button" className={buttons.secondary}>{secondary}</button>
                <button type="button" className={buttons.primary}>{primary}</button>
            </div>
        );
    };

// ---- Replica bodies -------------------------------------------------------

const CashDrawerBody: React.FC = () => {
    const { input, p } = useTokens();
    return (
        <div className="space-y-4 px-6 py-5">
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                <p className="text-sm font-semibold text-green-800">Last confirmed state: closed or unknown</p>
                <p className="text-xs text-green-700">No drawer actions recorded on this terminal.</p>
            </div>
            <F label="Reason for opening without a sale">
                <select className={input} value="change" onChange={() => undefined}>
                    <option value="change">Make change</option>
                    <option value="count">Count drawer</option>
                </select>
            </F>
            <F label="Required justification">
                <textarea className={`${input} min-h-20 py-3`} readOnly value="" placeholder="Explain why the drawer must be opened without a sale" />
            </F>
            <p className={`text-xs ${p.subText}`}>Every manual opening is recorded in the cash-drawer audit log.</p>
        </div>
    );
};

const ProfileBody: React.FC = () => {
    const { p } = useTokens();
    return (
        <div className="space-y-4 px-6 py-5 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 text-xl font-bold text-white">YF</div>
            <div>
                <p className={`text-lg font-semibold ${p.titleText}`}>Youne Ferreira</p>
                <p className={`text-sm ${p.subText}`}>ADMIN001</p>
            </div>
            <div className={`rounded-2xl border ${p.border} bg-white p-4`}>
                <div className="flex items-center justify-between">
                    <span className={`text-sm font-semibold ${p.titleText}`}>Shift status</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Not clocked in</span>
                </div>
                <p className={`mt-3 text-3xl font-bold tabular-nums ${p.titleText}`}>15:48:40</p>
            </div>
        </div>
    );
};

const PaymentBody: React.FC = () => {
    const { input, p } = useTokens();
    const pad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '×', '0', '⌫'];
    return (
        <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
            <div className="space-y-3">
                <F label="Cash Received">
                    <input className={input} readOnly value="30" />
                </F>
                <div className="grid grid-cols-3 gap-2">
                    {pad.map(k => (
                        <button key={k} type="button" className={`min-h-touch-sm rounded-xl border ${p.border} bg-white font-semibold ${p.titleText}`}>{k}</button>
                    ))}
                </div>
            </div>
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" className="min-h-touch-sm rounded-xl border-2 border-green-500 bg-green-50 font-semibold text-green-700">Cash</button>
                    <button type="button" className={`min-h-touch-sm rounded-xl border ${p.border} bg-white font-semibold ${p.subText}`}>Card</button>
                </div>
                <div className={`space-y-2 rounded-xl border ${p.border} bg-white p-4 text-sm`}>
                    <div className="flex justify-between"><span className={p.subText}>Total</span><b className={p.titleText}>€24.90</b></div>
                    <div className="flex justify-between"><span className={p.subText}>Cash Received</span><b className={p.titleText}>€30.00</b></div>
                    <div className="flex justify-between"><span className={p.subText}>Change Due</span><b className="text-green-600">€5.10</b></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" className={`min-h-touch-xs rounded-xl border ${p.border} bg-white text-sm font-semibold ${p.subText}`}>− €2.50</button>
                    <button type="button" className={`min-h-touch-xs rounded-xl border ${p.border} bg-white text-sm font-semibold ${p.subText}`}>NIF 123456789</button>
                </div>
            </div>
        </div>
    );
};

const NifBody: React.FC = () => {
    const { input, p } = useTokens();
    return (
        <div className="space-y-4 px-6 py-5">
            <div className="grid grid-cols-2 gap-2">
                <button type="button" className="min-h-touch-xs rounded-xl border-b-2 border-green-500 bg-white text-sm font-bold text-green-700">Existing customer</button>
                <button type="button" className={`min-h-touch-xs rounded-xl bg-white text-sm font-semibold ${p.subText}`}>+ New customer</button>
            </div>
            <F label="Tax number (NIF)">
                <input className={input} readOnly value="123456789" />
            </F>
            <div className={`flex items-center justify-between rounded-xl border ${p.border} bg-white px-4 py-3`}>
                <div>
                    <p className={`font-semibold ${p.titleText}`}>123456789</p>
                    <p className={`text-xs ${p.subText}`}>Maria Silva · 6 orders</p>
                </div>
                <b className={p.titleText}>€342.50</b>
            </div>
            <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => (
                    <button key={k} type="button" className={`min-h-touch-sm rounded-xl border ${p.border} bg-white font-semibold ${p.titleText}`}>{k}</button>
                ))}
            </div>
        </div>
    );
};

const DiscountBody: React.FC = () => {
    const { input, p } = useTokens();
    return (
        <div className="space-y-4 px-6 py-5">
            <div className="grid grid-cols-4 gap-1.5">
                {['Redeem', 'Preset', 'Percentage', 'Price'].map((tab, i) => (
                    <button key={tab} type="button" className={`min-h-touch-xs rounded-xl text-sm font-semibold ${i === 0 ? 'border-b-2 border-green-500 text-green-700' : p.subText}`}>{tab}</button>
                ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
                <button type="button" className="min-h-touch-xs rounded-xl border-b-2 border-green-500 bg-white text-sm font-bold text-green-700">Voucher</button>
                <button type="button" className={`min-h-touch-xs rounded-xl bg-white text-sm font-semibold ${p.subText}`}>Points</button>
            </div>
            <F label="Voucher code">
                <input className={input} readOnly value="SUMMER10" />
            </F>
        </div>
    );
};

const ViewProductBody: React.FC = () => {
    const { p } = useTokens();
    return (
        <div className="space-y-5 px-6 py-5">
            <div>
                <h4 className={`mb-2 font-bold ${p.titleText}`}>Basic Information</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                    <InfoCard label="Product Name" value="Almond Croissant" />
                    <InfoCard label="SKU" value="BAK-CRO-002" />
                    <InfoCard label="Category" value="Bakery" />
                    <InfoCard label="Status" value={<span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">In Stock</span>} />
                </div>
                <div className="mt-3"><InfoCard label="Description" value="Butter croissant with almond cream" /></div>
            </div>
            <div>
                <h4 className={`mb-2 font-bold ${p.titleText}`}>Pricing Information</h4>
                <div className="grid gap-3 sm:grid-cols-3">
                    <InfoCard label="Cost Price" value="€1.10" />
                    <InfoCard label="Selling Price (incl. IVA)" value="€3.40" />
                    <InfoCard label="IVA Rate" value="13%" />
                </div>
                <div className="mt-3 grid gap-3 rounded-xl border border-green-100 bg-green-50 p-4 sm:grid-cols-2">
                    <div><p className="text-xs text-green-700">Profit Margin</p><p className="font-bold text-green-800">€2.30 (209.1%)</p></div>
                    <div><p className="text-xs text-green-700">Price without IVA</p><p className="font-bold text-green-800">€3.01</p></div>
                </div>
            </div>
        </div>
    );
};

const CreateProductBody: React.FC = () => {
    const { input, p } = useTokens();
    return (
        <div className="space-y-4 px-6 py-5">
            <F label="Product Name *">
                <input className={input} readOnly value="" placeholder="Enter product name" />
            </F>
            <F label="SKU (Auto-Generated)">
                <div className={`rounded-xl border border-dashed ${p.border} px-4 py-3 font-mono text-sm ${p.subText}`}>Will be generated when you enter name and category</div>
            </F>
            <F label="Category *">
                <select className={input} value="geral" onChange={() => undefined}><option value="geral">Geral</option></select>
            </F>
            <h4 className={`border-b pb-2 font-bold ${p.titleText} ${p.border}`}>Pricing &amp; Tax</h4>
            <div className="grid gap-3 sm:grid-cols-2">
                <F label="Price (incl. IVA) *"><input className={input} readOnly value="0.00" /></F>
                <F label="Cost"><input className={input} readOnly value="0.00" /></F>
            </div>
            <F label="IVA Rate *">
                <select className={input} value="23" onChange={() => undefined}><option value="23">23% (Standard Rate)</option></select>
            </F>
        </div>
    );
};

const PurchaseImportBody: React.FC = () => {
    const { input, p } = useTokens();
    return (
        <div className="grid gap-5 px-6 py-5 sm:grid-cols-[2fr,1fr]">
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" className="min-h-touch-sm rounded-xl bg-slate-950 font-semibold text-white">Scan</button>
                    <button type="button" className={`min-h-touch-sm rounded-xl border ${p.border} bg-white font-semibold ${p.subText}`}>Upload</button>
                </div>
                <F label="Document type">
                    <select className={input} value="auto" onChange={() => undefined}><option value="auto">Detect automatically</option></select>
                </F>
                <div className={`flex min-h-40 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed ${p.border} p-6 text-center`}>
                    <Upload className={`h-6 w-6 ${p.subText}`} />
                    <p className={`text-sm ${p.subText}`}>Take a clear photo or upload an image/PDF.</p>
                </div>
            </div>
            <div className={`space-y-3 border-l ${p.border} pl-5`}>
                <div>
                    <p className={`font-bold ${p.titleText}`}>Purchase lines</p>
                    <p className={`text-xs ${p.subText}`}>Match existing products or create missing catalog items.</p>
                </div>
                <div className={`space-y-2 text-xs ${p.subText}`}>
                    <p>INCLUDED LINES<br /><b className={`text-base ${p.titleText}`}>0</b></p>
                    <p>UNITS TO ADD<br /><b className={`text-base ${p.titleText}`}>0</b></p>
                    <p>PURCHASE VALUE<br /><b className={`text-base ${p.titleText}`}>€0.00</b></p>
                </div>
            </div>
        </div>
    );
};

const InventoryFormBody: React.FC = () => {
    const { input, p } = useTokens();
    return (
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
            <F label="Item image" className="sm:col-span-2">
                <div className={`flex flex-col items-center justify-center gap-1 rounded-2xl border border-dashed ${p.border} px-4 py-6 text-center`}>
                    <Upload className={`h-6 w-6 ${p.subText}`} />
                    <span className={`text-sm font-semibold ${p.titleText}`}>Click to upload</span>
                    <span className={`text-xs ${p.subText}`}>JPG, PNG (max 2 MB)</span>
                </div>
            </F>
            <F label="Name" className="sm:col-span-2"><input className={input} readOnly value="Sesame bun" /></F>
            <F label="Description" className="sm:col-span-2"><textarea className={`${input} min-h-20 py-3`} readOnly value="Soft sesame-topped burger bun." /></F>
            <div className={`flex items-center justify-between gap-4 rounded-2xl border ${p.border} ${p.tintBg} p-4 sm:col-span-2`}>
                <div>
                    <p className={`text-sm font-semibold ${p.titleText}`}>Status</p>
                    <p className={`text-sm ${p.subText}`}>Show this item as a sellable product on the POS.</p>
                </div>
                <span className={`relative h-7 w-12 shrink-0 rounded-full ${DIALOG_TOGGLE_ON_CLASS}`}>
                    <span className="absolute left-0.5 top-0.5 h-6 w-6 translate-x-5 rounded-full bg-white shadow" />
                </span>
            </div>
            <F label="Selling price, incl. IVA (€)"><input className={input} readOnly value="0.80" /></F>
            <F label="Tax (IVA)"><select className={input} value="13" onChange={() => undefined}><option value="13">13% (Intermediate)</option></select></F>
            <F label="Stock (pcs)"><input className={input} readOnly value="250" /></F>
            <F label="Unit"><select className={input} value="pcs" onChange={() => undefined}><option value="pcs">pcs</option></select></F>
            <F label="Cost / pcs (€)"><input className={input} readOnly value="0.12" /></F>
            <F label="Low-stock alert (pcs)"><input className={input} readOnly value="50" /></F>
        </div>
    );
};

const UpdateItemBody: React.FC = () => {
    const { p } = useTokens();
    return (
        <div className="space-y-4 px-6 py-5">
            <div className={`flex items-center justify-between gap-3 rounded-2xl border ${p.border} bg-white px-4 py-3.5`}>
                <span className={`font-semibold ${p.titleText}`}>Pretzel Bun</span>
                <span className={`text-sm ${p.subText}`}>Current stock: <b className={p.titleText}>12</b> pcs</span>
            </div>
            <div className={`grid grid-cols-2 rounded-2xl ${p.tintBg} p-1`}>
                <button type="button" className={`min-h-touch-xs rounded-xl bg-white text-sm font-semibold shadow-sm ${p.titleText}`}>Stock in</button>
                <button type="button" className={`min-h-touch-xs rounded-xl text-sm font-semibold ${p.subText}`}>Stock out</button>
            </div>
            <div className="flex items-center justify-between gap-4">
                <div>
                    <p className={`font-semibold ${p.titleText}`}>Number of items</p>
                    <p className={`text-sm ${p.subText}`}>This quantity will be added to the current stock.</p>
                </div>
                <div className={`flex items-center gap-1 rounded-full ${p.tintBg} p-1`}>
                    <span className={`flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ${p.subText}`}>−</span>
                    <span className={`w-10 text-center font-semibold ${p.titleText}`}>0</span>
                    <span className={`flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ${p.subText}`}>+</span>
                </div>
            </div>
        </div>
    );
};

const CategoryBody: React.FC = () => {
    const { input, p } = useTokens();
    const gradients = ['from-orange-400 to-orange-600', 'from-sky-400 to-blue-600', 'from-yellow-400 to-amber-500', 'from-pink-400 to-rose-600', 'from-green-400 to-emerald-600', 'from-purple-400 to-violet-600', 'from-red-400 to-red-600', 'from-teal-400 to-cyan-600'];
    return (
        <div className="space-y-4 px-6 py-5">
            <F label="Category Name *"><input className={input} readOnly value="" placeholder="Enter category name" /></F>
            <F label="Description"><textarea className={`${input} min-h-16 py-3`} readOnly value="" placeholder="Enter category description" /></F>
            <F label="Color Gradient *">
                <div className="grid grid-cols-2 gap-2">
                    {gradients.map((g, i) => (
                        <span key={g} className={`h-9 rounded-lg bg-gradient-to-r ${g} ${i === 7 ? 'ring-2 ring-slate-500 ring-offset-1' : ''}`} />
                    ))}
                </div>
            </F>
        </div>
    );
};

const CustomerFormBody: React.FC = () => {
    const { input } = useTokens();
    return (
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
            <F label="Name" className="sm:col-span-2"><input className={input} readOnly value="" /></F>
            <F label="Tax ID (NIF) *" className="sm:col-span-2"><input className={input} readOnly value="" /></F>
            <F label="Email"><input className={input} readOnly value="" /></F>
            <F label="Phone"><input className={input} readOnly value="" /></F>
            <F label="Address" className="sm:col-span-2"><input className={input} readOnly value="" /></F>
            <F label="City"><input className={input} readOnly value="" /></F>
            <F label="Country (ISO or name)"><input className={input} readOnly value="PT" /></F>
        </div>
    );
};

const ViewCustomerBody: React.FC = () => (
    <div className="grid gap-3 px-6 py-5 sm:grid-cols-2">
        <InfoCard label="Name" value="João Pereira" />
        <InfoCard label="Tax ID" value="987654321" />
        <InfoCard label="Email" value="—" />
        <InfoCard label="Phone" value="963456789" />
        <InfoCard label="City" value="Porto" />
        <InfoCard label="Points" value="15 pts" />
        <InfoCard label="Enrolled" value="Jul 21, 2026" />
        <InfoCard label="Last purchase" value="—" />
    </div>
);

const EmployeeFormBody: React.FC = () => {
    const { input, p } = useTokens();
    const levels = [['All Access', false], ['Sales', true], ['Inventory', false], ['Customers', false], ['Employees', false], ['Settings', false], ['Transactions', false], ['Reports', false]] as const;
    return (
        <div className="space-y-4 px-6 py-5">
            <p className={`text-sm ${p.subText}`}>Employee Number: <b className={p.titleText}>EMP0004</b></p>
            <div className="grid gap-3 sm:grid-cols-2">
                <F label="Full Name *"><input className={input} readOnly value="" placeholder="John Doe" /></F>
                <F label="Hire Date *"><input className={input} readOnly value="21/07/2026" /></F>
            </div>
            <F label="Role *"><select className={input} value="cashier" onChange={() => undefined}><option value="cashier">Cashier</option></select></F>
            <F label="PIN *"><input className={input} readOnly value="" placeholder="PIN" /></F>
            <F label="Access Levels">
                <div className="grid gap-2 sm:grid-cols-2">
                    {levels.map(([name, checked]) => (
                        <label key={name} className={`flex items-center gap-2 text-sm ${p.titleText}`}>
                            <input type="checkbox" readOnly checked={checked} className="h-4 w-4" /> {name}
                        </label>
                    ))}
                </div>
            </F>
        </div>
    );
};

const HrEditorBody: React.FC = () => {
    const { input, p } = useTokens();
    return (
        <div className="space-y-4 px-6 py-5">
            <div className="grid gap-3 sm:grid-cols-2">
                <F label="Contract start"><input className={input} readOnly value="20/05/2024" /></F>
                <F label="Contract end"><input className={input} readOnly value="dd/mm/yyyy" /></F>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <F label="Carried days"><input className={input} readOnly value="0" /></F>
                <div className={`rounded-xl border ${p.border} ${p.tintBg} px-4 py-3`}>
                    <p className={`text-xs ${p.subText}`}>Holiday entitlement (accrued)</p>
                    <p className={`font-bold ${p.titleText}`}>10 days</p>
                </div>
            </div>
            <F label="Working days">
                <div className="flex flex-wrap gap-1.5">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
                        <span key={d} className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${i < 5 ? 'bg-slate-950 text-white' : `${p.tintBg} ${p.subText}`}`}>{d}</span>
                    ))}
                </div>
            </F>
            <F label="Book holiday · July 2026">
                <div className="grid grid-cols-7 gap-1 text-center text-sm">
                    {Array.from({ length: 28 }, (_, i) => (
                        <span key={i} className={`rounded-lg py-1.5 ${i === 15 || i === 16 ? 'bg-green-600 font-bold text-white' : p.titleText}`}>{i + 1}</span>
                    ))}
                </div>
            </F>
        </div>
    );
};

const InvoiceBody: React.FC = () => {
    const { input, p } = useTokens();
    return (
        <div className="space-y-4 px-6 py-5">
            <div className={`grid grid-cols-[3fr,1fr,1.4fr,1.2fr] gap-2 text-xs font-semibold uppercase ${p.subText}`}>
                <span>Description</span><span>Qty</span><span>Unit price</span><span>Tax</span>
            </div>
            <div className="grid grid-cols-[3fr,1fr,1.4fr,1.2fr] gap-2">
                <input className={input} readOnly value="" placeholder="Item or service" />
                <input className={input} readOnly value="1" />
                <input className={input} readOnly value="0.00" />
                <select className={input} value="23" onChange={() => undefined}><option value="23">23%</option></select>
            </div>
            <button type="button" className={`rounded-xl border border-dashed ${p.border} px-4 py-2 text-sm font-semibold ${p.subText}`}>+ Add line</button>
            <div className="grid gap-3 sm:grid-cols-2">
                <F label="Customer name"><input className={input} readOnly value="" placeholder="Optional" /></F>
                <F label="NIF (tax number)"><input className={input} readOnly value="" placeholder="999999990" /></F>
            </div>
            <div className="flex items-center gap-3">
                <span className={`text-sm font-semibold ${p.titleText}`}>Payment method</span>
                <span className={`rounded-xl bg-white px-4 py-2 text-sm font-bold shadow-sm ${p.titleText}`}>Cash</span>
                <span className={`rounded-xl ${p.tintBg} px-4 py-2 text-sm font-semibold ${p.subText}`}>Card</span>
            </div>
        </div>
    );
};

const InvoiceFooter: DialogPreviewSpec['Footer'] = ({ buttons }) => {
    return (
        <div className={buttons.container}>
            <div className="flex items-center gap-4 text-sm">
                <span>Net: <b>€0.00</b></span>
                <span>Tax: <b>€0.00</b></span>
                <span>Total: <b className="text-base">€0.00</b></span>
            </div>
            <button type="button" className={buttons.primary}>Create invoice</button>
        </div>
    );
};

const AddTableBody: React.FC = () => {
    const { input, p } = useTokens();
    return (
        <div className="space-y-4 px-6 py-5">
            <F label="Table name"><input className={input} readOnly value="Table 1" /></F>
            <F label="Type">
                <select className={input} value="" onChange={() => undefined}>
                    <option value="">Choose table type</option>
                </select>
            </F>
            <p className={`rounded-xl ${p.tintBg} px-4 py-3 text-sm ${p.subText}`}>Small tables seat 2, medium tables seat 4, and large tables seat 6.</p>
        </div>
    );
};

const WeighBody: React.FC = () => {
    const { input, p } = useTokens();
    return (
        <div className="space-y-4 px-6 py-5">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-800">Scale not detected</p>
                <p className="text-xs text-amber-700">This till has no scale support.</p>
            </div>
            <div className={`space-y-3 rounded-2xl border ${p.border} bg-white p-4`}>
                <p className={`text-sm font-semibold ${p.titleText}`}>Manual weight entry</p>
                <p className={`text-xs ${p.subText}`}>Requires authorization by a manager or admin. Every manual entry is logged.</p>
                <F label="Weight (kg)"><input className={input} readOnly value="0.000" /></F>
                <div className="grid gap-3 sm:grid-cols-2">
                    <F label="Manager number"><input className={input} readOnly value="" /></F>
                    <F label="Manager PIN"><input className={input} readOnly value="" /></F>
                </div>
            </div>
        </div>
    );
};

const ConfirmBody: React.FC = () => {
    const { p } = useTokens();
    return (
        <div className="px-6 py-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-400 text-white">
                <span className="text-2xl font-bold">!</span>
            </div>
            <h3 className={`mt-4 text-lg font-bold ${p.titleText}`}>Add item?</h3>
            <p className={`mt-1.5 text-sm ${p.subText}`}>Are you sure you want to add a new item? Please make sure your data is correct.</p>
        </div>
    );
};

// ---- Registry --------------------------------------------------------------

export const DIALOG_PREVIEWS: DialogPreviewSpec[] = [
    { key: 'cashdrawer', label: 'Cash drawer', title: 'Cash Drawer', subtitle: 'Counter 1', icon: Archive, Body: CashDrawerBody, Footer: twoButtonFooter('Confirm Drawer Closed', 'Open Without Sale') },
    { key: 'profile', label: 'My profile (clock in)', title: 'My Profile', subtitle: 'Clock in and out of your shift', icon: Clock, Body: ProfileBody, Footer: twoButtonFooter('Close', 'Clock In') },
    { key: 'payment', label: 'Process payment', title: 'Process Payment', icon: CreditCard, Body: PaymentBody, Footer: twoButtonFooter('Cancel', 'Confirm Payment') },
    { key: 'nif', label: 'Select customer (NIF)', title: 'Select Customer', icon: Users, Body: NifBody, Footer: twoButtonFooter('Cancel', 'Select') },
    { key: 'discount', label: 'Discount', title: 'Discount', icon: Tag, Body: DiscountBody, Footer: twoButtonFooter('Cancel', 'Apply') },
    { key: 'viewproduct', label: 'Product details', title: 'Product Details', icon: Package, Body: ViewProductBody, Footer: twoButtonFooter('Close', 'Edit Product') },
    { key: 'createproduct', label: 'Create product', title: 'Create New Product', icon: Package, Body: CreateProductBody, Footer: twoButtonFooter('Cancel', 'Create') },
    { key: 'purchaseimport', label: 'Import purchase receipt', title: 'Import Purchase Receipt', subtitle: 'Azure Document Intelligence · review required before stock changes', icon: ShoppingCart, Body: PurchaseImportBody, Footer: twoButtonFooter('Cancel', 'Extract with Azure') },
    { key: 'inventoryform', label: 'Inventory: new raw item', title: 'New raw item', icon: Boxes, Body: InventoryFormBody, Footer: twoButtonFooter('Cancel', 'Save') },
    { key: 'updateitem', label: 'Inventory: update stock', title: 'Update item', subtitle: 'Pretzel Bun', icon: SlidersHorizontal, Body: UpdateItemBody, Footer: twoButtonFooter('Cancel', 'Stock in') },
    { key: 'category', label: 'Create category', title: 'Create New Category', icon: Tag, Body: CategoryBody, Footer: twoButtonFooter('Cancel', 'Create') },
    { key: 'customerform', label: 'New customer', title: 'New customer', icon: UserPlus, Body: CustomerFormBody, Footer: twoButtonFooter('Cancel', 'Create') },
    { key: 'viewcustomer', label: 'Customer details', title: 'Customer details', icon: Edit, Body: ViewCustomerBody, Footer: twoButtonFooter('Close', 'Edit customer') },
    { key: 'employeeform', label: 'Add employee', title: 'Add New Employee', icon: UserPlus, Body: EmployeeFormBody, Footer: twoButtonFooter('Cancel', 'Create') },
    { key: 'hreditor', label: 'HR profile editor', title: 'Carla Mendes', subtitle: 'Contract and holiday policy', icon: CalendarDays, Body: HrEditorBody, Footer: twoButtonFooter('Cancel', 'Save HR profile') },
    { key: 'invoice', label: 'Custom invoice', title: 'Custom Invoice', subtitle: 'Issue an invoice for free-text items', icon: FileText, Body: InvoiceBody, Footer: InvoiceFooter },
    { key: 'table', label: 'Add table', title: 'Add table', icon: Table2, Body: AddTableBody, Footer: twoButtonFooter('Cancel', 'Add') },
    { key: 'weigh', label: 'Weigh item (scale)', title: 'Queijo da Serra', subtitle: '18.90 €/kg', icon: Scale, Body: WeighBody, Footer: twoButtonFooter('Cancel', 'Authorize & add') },
    { key: 'confirm', label: 'Confirmation (Add item?)', title: 'Add item?', bare: true, Body: ConfirmBody, Footer: twoButtonFooter('Cancel', 'Add') },
];
