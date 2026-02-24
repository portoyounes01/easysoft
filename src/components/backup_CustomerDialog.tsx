import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search, Users, UserCircle, Plus } from 'lucide-react';

export interface BackupCustomerDialogProps {
    open: boolean;
    customers: Array<{
        id: string;
        name: string;
        email?: string | null;
        phone?: string | null;
        total_spent?: number | null;
        transaction_count?: number | null;
    }>;
    searchTerm: string;
    onSearchTermChange: (next: string) => void;
    onSearchClick: () => void;
    onSelect: (id: string) => void;
    onAddNew: () => void;
    onClose: () => void;
    isNumpadOpen?: boolean;
    numpadSlot?: React.ReactNode;
}

// Backup of the previous inline customer selection modal UI from POS.tsx (pre-refactor)
// This component preserves the original layout and styles for reference or reuse.
const BackupCustomerDialog: React.FC<BackupCustomerDialogProps> = ({
    open,
    customers,
    searchTerm,
    onSearchTermChange,
    onSearchClick,
    onSelect,
    onAddNew,
    onClose,
    isNumpadOpen = false,
    numpadSlot,
}) => {
    const { t } = useTranslation();
    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
            <div className={`bg-white rounded-3xl p-8 shadow-2xl flex flex-col ${isNumpadOpen ? 'w-[1000px] max-w-6xl' : 'w-[600px] max-w-2xl'} h-[600px]`} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-bold text-gray-800">{t('pos.selectCustomerTitle')}</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-50 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Main Content Area */}
                <div className={`flex-1 flex ${isNumpadOpen ? 'space-x-6' : ''} overflow-hidden`}>
                    {/* Customer Section */}
                    <div className={`flex-1 flex flex-col`}>
                        {/* Search Section */}
                        <div className="mb-6 space-y-4">
                            <div className="flex space-x-3">
                                <div className="flex-1 relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder={t('pos.searchByNif')}
                                        value={searchTerm}
                                        onChange={(e) => onSearchTermChange(e.target.value)}
                                        onClick={onSearchClick}
                                        className={`w-full pl-10 pr-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:border-transparent cursor-pointer border-gray-300 focus:ring-blue-500`}
                                        maxLength={50}
                                    />
                                </div>
                                <button
                                    onClick={onSearchClick}
                                    className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center space-x-2"
                                >
                                    <Search className="w-4 h-4" />
                                    <span>{t('pos.search')}</span>
                                </button>
                                <button
                                    onClick={onAddNew}
                                    className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center space-x-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span>{t('pos.addNew')}</span>
                                </button>
                            </div>
                        </div>

                        {/* Customer List */}
                        <div className="flex-1 overflow-y-auto space-y-3">
                            {customers.map((customer) => (
                                <div
                                    key={customer.id}
                                    onClick={() => onSelect(customer.id)}
                                    className="bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-2xl p-4 cursor-pointer transition-all duration-200 hover:shadow-lg"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center space-x-3 mb-2">
                                                <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-2 rounded-xl">
                                                    <UserCircle className="w-5 h-5 text-white" />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-gray-800">{customer.name}</h4>
                                                    <p className="text-sm text-gray-600">{customer.email || customer.phone || 'No contact info'}</p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                <div className="flex items-center space-x-2">
                                                    <span className="text-gray-600">{t('pos.totalOrders')}</span>
                                                    <span className="font-semibold text-gray-800">{customer.transaction_count || 0}</span>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <span className="text-gray-600">Total Spent</span>
                                                    <span className="font-semibold text-gray-800">€{(customer.total_spent || 0).toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="ml-4">
                                            <button className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-200">
                                                {t('common.select')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {customers.length === 0 && (
                                <div className="text-center py-12">
                                    <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                    <p className="text-xl text-gray-50 mb-2">{t('pos.noCustomersFoundTitle')}</p>
                                    <p className="text-gray-400">{t('pos.noCustomersFoundMessage')}</p>
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Numpad Section */}
                    {isNumpadOpen && (
                        <div className="flex-1">
                            {numpadSlot}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default React.memo(BackupCustomerDialog);


