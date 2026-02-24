import React, { useState, useCallback, useEffect } from 'react';
import {
    Database,
    Upload,
    Download,
    Play,
    CheckCircle,
    XCircle,
    AlertTriangle,
    FileText,
    Users,
    Tag,
    Package,
    UserCheck,
    CreditCard,
    TestTube,
    Archive,
    RefreshCw,
    Info
} from 'lucide-react';
import { seedDataService, SeedResult } from '../utils/seedData';
import { useEmployees } from '../contexts/EmployeesContext';
import { useProducts } from '../contexts/ProductsContext';

interface SeedStatus {
    isRunning: boolean;
    success: boolean | null;
    message: string;
    details: string[];
}

const SeedManagement: React.FC = () => {
    const { refreshEmployees } = useEmployees();
    const { refreshData: refreshProducts } = useProducts();
    const [seedStatus, setSeedStatus] = useState<SeedStatus>({
        isRunning: false,
        success: null,
        message: '',
        details: []
    });
    const [filesAvailable, setFilesAvailable] = useState<{
        available: string[];
        missing: string[];
    }>({ available: [], missing: [] });
    const [selectedMode, setSelectedMode] = useState<'online' | 'offline'>('online');

    // Check file availability on mount
    useEffect(() => {
        const checkFiles = async () => {
            const result = await seedDataService.checkYamlFilesAvailable();
            setFilesAvailable(result);
        };
        checkFiles();
    }, []);

    const handleRunSeed = useCallback(async () => {
        setSeedStatus({
            isRunning: true,
            success: null,
            message: 'Starting seeding process...',
            details: []
        });

        try {
            // Execute seeding directly in the browser
            const result: SeedResult = await seedDataService.seedFromYaml();

            if (result.success) {
                // Refresh contexts to show new data
                setSeedStatus({
                    isRunning: false,
                    success: true,
                    message: result.message,
                    details: [
                        `✅ ${result.details.employeesCount} employees seeded`,
                        `✅ ${result.details.categoriesCount} categories seeded`,
                        `✅ ${result.details.productsCount} products seeded`,
                        `✅ ${result.details.customersCount} customers seeded`,
                        `✅ ${result.details.transactionsCount} transactions seeded`,
                        `✅ ${result.details.cashierTestsCount} cashier tests seeded`,
                        `✅ ${result.details.cashDrawerLogsCount} cash drawer logs seeded`,
                        '🔄 Data synced to Supabase (if online)',
                        '📱 Local database updated'
                    ]
                });

                // Refresh UI contexts
                await Promise.all([
                    refreshEmployees(),
                    refreshProducts()
                ]);
            } else {
                setSeedStatus({
                    isRunning: false,
                    success: false,
                    message: result.message,
                    details: ['Check the browser console for detailed error information']
                });
            }
        } catch (error) {
            setSeedStatus({
                isRunning: false,
                success: false,
                message: `Seeding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                details: [
                    'Check that YAML files are present in /public/seed/',
                    'Verify YAML file format is correct',
                    'Check browser console for detailed errors'
                ]
            });
        }
    }, [refreshEmployees, refreshProducts]);

    const seedFiles = [
        { name: 'employees.yml', icon: Users, description: 'Employee data with roles and permissions', required: true },
        { name: 'categories.yml', icon: Tag, description: 'Product categories with colors and icons', required: true },
        { name: 'products.yml', icon: Package, description: 'Product catalog with pricing and inventory', required: false },
        { name: 'customers.yml', icon: UserCheck, description: 'Customer information and loyalty data', required: false },
        { name: 'transactions.yml', icon: CreditCard, description: 'Transaction history and sales data', required: false },
        { name: 'cashier-tests.yml', icon: TestTube, description: 'Hardware testing logs (optional)', required: false },
        { name: 'cash-drawer-logs.yml', icon: Archive, description: 'Cash drawer operation logs (optional)', required: false }
    ];

    // Check if file is available
    const isFileAvailable = (filename: string) => filesAvailable.available.includes(filename);

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center space-x-3 mb-4">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <Database className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">Seed Management</h1>
                            <p className="text-gray-600">Manage database seeding with YAML configuration files</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Controls */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* File Status */}
                        <div className="bg-white rounded-xl shadow-lg p-6">
                            <h2 className="text-xl font-semibold text-gray-900 mb-4">Seed Files Status</h2>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                                    <div className="flex items-center space-x-2 mb-2">
                                        <CheckCircle className="w-5 h-5 text-green-600" />
                                        <span className="font-semibold text-green-800">Available Files</span>
                                    </div>
                                    <div className="text-sm text-green-700">
                                        {filesAvailable.available.length > 0 ? (
                                            filesAvailable.available.map(file => (
                                                <div key={file} className="flex items-center space-x-1">
                                                    <span>•</span>
                                                    <span>{file}</span>
                                                </div>
                                            ))
                                        ) : (
                                            <span className="text-gray-50">Loading...</span>
                                        )}
                                    </div>
                                </div>
                                <div className="p-4 rounded-lg bg-orange-50 border border-orange-200">
                                    <div className="flex items-center space-x-2 mb-2">
                                        <AlertTriangle className="w-5 h-5 text-orange-600" />
                                        <span className="font-semibold text-orange-800">Missing Files</span>
                                    </div>
                                    <div className="text-sm text-orange-700">
                                        {filesAvailable.missing.length > 0 ? (
                                            filesAvailable.missing.map(file => (
                                                <div key={file} className="flex items-center space-x-1">
                                                    <span>•</span>
                                                    <span>{file}</span>
                                                </div>
                                            ))
                                        ) : (
                                            <span className="text-green-600">All files found!</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Run Seeding */}
                        <div className="bg-white rounded-xl shadow-lg p-6">
                            <h2 className="text-xl font-semibold text-gray-900 mb-4">Execute Seeding</h2>
                            <div className="space-y-4">
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <div className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                                        <Info className="w-4 h-4" />
                                        <span>Browser-based seeding from YAML files</span>
                                    </div>
                                    <p className="text-sm text-gray-600">
                                        Seeds local database first, then syncs to Supabase (offline-first approach).
                                    </p>
                                </div>

                                <button
                                    onClick={handleRunSeed}
                                    disabled={seedStatus.isRunning}
                                    className={`w-full flex items-center justify-center space-x-2 px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${seedStatus.isRunning
                                        ? 'bg-gray-300 text-gray-50 cursor-not-allowed'
                                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                                        }`}
                                >
                                    {seedStatus.isRunning ? (
                                        <>
                                            <RefreshCw className="w-5 h-5 animate-spin" />
                                            <span>Running Seeding...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Play className="w-5 h-5" />
                                            <span>Run YAML Seeding</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Status Display */}
                        {seedStatus.message && (
                            <div className={`rounded-xl shadow-lg p-6 ${seedStatus.success === true
                                ? 'bg-green-50 border border-green-200'
                                : seedStatus.success === false
                                    ? 'bg-red-50 border border-red-200'
                                    : 'bg-blue-50 border border-blue-200'
                                }`}>
                                <div className="flex items-start space-x-3">
                                    {seedStatus.success === true && <CheckCircle className="w-6 h-6 text-green-600 mt-0.5" />}
                                    {seedStatus.success === false && <XCircle className="w-6 h-6 text-red-600 mt-0.5" />}
                                    {seedStatus.success === null && <RefreshCw className="w-6 h-6 text-blue-600 mt-0.5 animate-spin" />}

                                    <div className="flex-1">
                                        <h3 className={`font-semibold ${seedStatus.success === true
                                            ? 'text-green-800'
                                            : seedStatus.success === false
                                                ? 'text-red-800'
                                                : 'text-blue-800'
                                            }`}>
                                            {seedStatus.message}
                                        </h3>
                                        {seedStatus.details.length > 0 && (
                                            <ul className="mt-2 space-y-1 text-sm opacity-80">
                                                {seedStatus.details.map((detail, index) => (
                                                    <li key={index} className="flex items-start space-x-2">
                                                        <span className="text-gray-400">•</span>
                                                        <span>{detail}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sidebar - Seed Files */}
                    <div className="space-y-6">
                        <div className="bg-white rounded-xl shadow-lg p-6">
                            <h2 className="text-xl font-semibold text-gray-900 mb-4">Seed Files</h2>
                            <div className="space-y-3">
                                {seedFiles.map((file) => {
                                    const Icon = file.icon;
                                    const available = isFileAvailable(file.name);
                                    return (
                                        <div
                                            key={file.name}
                                            className={`flex items-start space-x-3 p-3 rounded-lg transition-colors ${available
                                                ? 'bg-green-50 hover:bg-green-100 border border-green-200'
                                                : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                                                }`}
                                        >
                                            <div className="flex items-center space-x-2">
                                                <Icon className={`w-5 h-5 mt-0.5 ${available ? 'text-green-600' : 'text-gray-400'}`} />
                                                {available ? (
                                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                                ) : (
                                                    <XCircle className="w-4 h-4 text-gray-400" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center space-x-2">
                                                    <span className={`font-medium text-sm ${available ? 'text-green-800' : 'text-gray-600'}`}>
                                                        {file.name}
                                                    </span>
                                                    {file.required && (
                                                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                                                            Required
                                                        </span>
                                                    )}
                                                    {available && (
                                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                                            Found
                                                        </span>
                                                    )}
                                                </div>
                                                <p className={`text-xs mt-1 ${available ? 'text-green-700' : 'text-gray-50'}`}>
                                                    {file.description}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Environment Status */}
                        <div className="bg-white rounded-xl shadow-lg p-6">
                            <h2 className="text-xl font-semibold text-gray-900 mb-4">Environment</h2>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-600">Supabase URL</span>
                                    <div className="flex items-center space-x-2">
                                        {import.meta.env.VITE_SUPABASE_URL ? (
                                            <CheckCircle className="w-4 h-4 text-green-600" />
                                        ) : (
                                            <XCircle className="w-4 h-4 text-red-600" />
                                        )}
                                        <span className="text-xs">
                                            {import.meta.env.VITE_SUPABASE_URL ? 'Configured' : 'Missing'}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-600">Service Role</span>
                                    <div className="flex items-center space-x-2">
                                        <AlertTriangle className="w-4 h-4 text-yellow-600" />
                                        <span className="text-xs">Server-side only</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Documentation */}
                        <div className="bg-white rounded-xl shadow-lg p-6">
                            <h2 className="text-xl font-semibold text-gray-900 mb-4">How It Works</h2>
                            <div className="space-y-3 text-sm">
                                <div className="flex items-start space-x-2">
                                    <FileText className="w-4 h-4 text-blue-600 mt-0.5" />
                                    <div>
                                        <p className="font-medium">1. Load YAML Files</p>
                                        <p className="text-gray-600">Reads data from <code>/public/seed/</code> directory</p>
                                    </div>
                                </div>
                                <div className="flex items-start space-x-2">
                                    <Database className="w-4 h-4 text-blue-600 mt-0.5" />
                                    <div>
                                        <p className="font-medium">2. Seed Local Database</p>
                                        <p className="text-gray-600">Populates IndexedDB (offline-first)</p>
                                    </div>
                                </div>
                                <div className="flex items-start space-x-2">
                                    <RefreshCw className="w-4 h-4 text-blue-600 mt-0.5" />
                                    <div>
                                        <p className="font-medium">3. Sync to Supabase</p>
                                        <p className="text-gray-600">Automatically syncs to cloud (if online)</p>
                                    </div>
                                </div>
                                <div className="flex items-start space-x-2">
                                    <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5" />
                                    <div>
                                        <p className="font-medium">4. Update UI</p>
                                        <p className="text-gray-600">Refreshes contexts to show new data</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SeedManagement;
