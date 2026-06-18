import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Database,
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
import {
    useDesignSystem2Customization,
} from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

interface SeedStatus {
    isRunning: boolean;
    success: boolean | null;
    message: string;
    details: string[];
}

export interface SeedManagementPanelProps {
    embedded?: boolean;
}

export const SeedManagementPanel: React.FC<SeedManagementPanelProps> = ({ embedded = false }) => {
    const { t } = useTranslation();
    const { visualStyle, prefs, layoutClasses } = useDesignSystem2Customization();
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

    const panelInnerClass = embedded
        ? 'w-full max-w-full space-y-6'
        : `mx-auto max-w-6xl space-y-8 py-6 ${layoutClasses.contentInsetX}`;
    const contentGridClass = embedded
        ? 'grid min-w-0 gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,28rem),1fr))]'
        : 'grid grid-cols-1 gap-6 lg:grid-cols-3';
    const mainControlsClass = embedded ? 'min-w-0 space-y-6' : 'min-w-0 space-y-6 lg:col-span-2';
    const fileStatusGridClass =
        'grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))]';

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
                        `✅ ${t('seedManagement.detailEmployees', { count: result.details.employeesCount })}`,
                        `✅ ${t('seedManagement.detailCategories', { count: result.details.categoriesCount })}`,
                        `✅ ${t('seedManagement.detailProducts', { count: result.details.productsCount })}`,
                        `✅ ${t('seedManagement.detailCustomers', { count: result.details.customersCount })}`,
                        `✅ ${t('seedManagement.detailTransactions', { count: result.details.transactionsCount })}`,
                        `✅ ${t('seedManagement.detailCashierTests', { count: result.details.cashierTestsCount })}`,
                        `✅ ${t('seedManagement.detailCashDrawerLogs', { count: result.details.cashDrawerLogsCount })}`,
                        `🔄 ${t('seedManagement.detailSupabaseSync')}`,
                        `📱 ${t('seedManagement.detailLocalDb')}`,
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
                message: t('seedManagement.failureMessage', {
                    message: error instanceof Error ? error.message : t('seedManagement.unknownError'),
                }),
                details: [
                    t('seedManagement.failureHints.yamlPath'),
                    t('seedManagement.failureHints.format'),
                    t('seedManagement.failureHints.console'),
                ]
            });
        }
    }, [refreshEmployees, refreshProducts, t]);

    const seedFiles = useMemo(
        () =>
            [
                { name: 'employees.yml', icon: Users, descKey: 'employees' as const, required: true },
                { name: 'categories.yml', icon: Tag, descKey: 'categories' as const, required: true },
                { name: 'products.yml', icon: Package, descKey: 'products' as const, required: false },
                { name: 'customers.yml', icon: UserCheck, descKey: 'customers' as const, required: false },
                { name: 'transactions.yml', icon: CreditCard, descKey: 'transactions' as const, required: false },
                { name: 'cashier-tests.yml', icon: TestTube, descKey: 'cashierTests' as const, required: false },
                { name: 'cash-drawer-logs.yml', icon: Archive, descKey: 'cashDrawerLogs' as const, required: false },
            ] as const,
        []
    );

    // Check if file is available
    const isFileAvailable = (filename: string) => filesAvailable.available.includes(filename);

    return (
        <div
            className={embedded ? 'ds2-visual-scope' : 'ds2-visual-scope min-h-screen bg-gray-50'}
            style={visualStyle}
            data-ds2-neutral={prefs.neutralFamilyId}
        >
            <div className={panelInnerClass} data-testid="seed-management-panel">
                {!embedded && (
                    <div className="mb-8">
                        <div className="flex items-center space-x-3 mb-4">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <Database className="w-6 h-6 text-blue-600" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">{t('seedManagement.title')}</h1>
                                <p className="text-gray-600">{t('seedManagement.subtitle')}</p>
                            </div>
                        </div>
                    </div>
                )}

                <div className={contentGridClass}>
                    {/* Main Controls */}
                    <div className={mainControlsClass}>
                        {/* File Status */}
                        <div className="min-w-0 bg-white rounded-xl shadow-lg p-6">
                            <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('seedManagement.filesStatus')}</h2>
                            <div className={fileStatusGridClass}>
                                <div className="min-w-0 p-4 rounded-lg bg-green-50 border border-green-200">
                                    <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
                                        <CheckCircle className="w-5 h-5 text-green-600" />
                                        <span className="font-semibold text-green-800">{t('seedManagement.availableFiles')}</span>
                                    </div>
                                    <div className="min-w-0 text-sm text-green-700">
                                        {filesAvailable.available.length > 0 ? (
                                            filesAvailable.available.map(file => (
                                                <div key={file} className="flex min-w-0 items-center gap-1">
                                                    <span className="shrink-0">•</span>
                                                    <span className="min-w-0 break-words">{file}</span>
                                                </div>
                                            ))
                                        ) : (
                                            <span className="text-gray-500">{t('seedManagement.loading')}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="min-w-0 p-4 rounded-lg bg-orange-50 border border-orange-200">
                                    <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
                                        <AlertTriangle className="w-5 h-5 text-orange-600" />
                                        <span className="font-semibold text-orange-800">{t('seedManagement.missingFiles')}</span>
                                    </div>
                                    <div className="min-w-0 text-sm text-orange-700">
                                        {filesAvailable.missing.length > 0 ? (
                                            filesAvailable.missing.map(file => (
                                                <div key={file} className="flex min-w-0 items-center gap-1">
                                                    <span className="shrink-0">•</span>
                                                    <span className="min-w-0 break-words">{file}</span>
                                                </div>
                                            ))
                                        ) : (
                                            <span className="text-green-600">{t('seedManagement.allFilesFound')}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Run Seeding */}
                        <div className="min-w-0 bg-white rounded-xl shadow-lg p-6">
                            <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('seedManagement.execute')}</h2>
                            <div className="space-y-4">
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <div className="mb-2 flex min-w-0 items-center gap-2 text-sm text-gray-600">
                                        <Info className="w-4 h-4" />
                                        <span>{t('seedManagement.browserSeedingHint')}</span>
                                    </div>
                                    <p className="text-sm text-gray-600">
                                        {t('seedManagement.offlineFirstHint')}
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleRunSeed}
                                    disabled={seedStatus.isRunning}
                                    className={`ds2-control-radius-lg flex w-full items-center justify-center gap-2 px-6 py-3 font-semibold transition-all duration-200 ${
                                        seedStatus.isRunning
                                            ? 'cursor-not-allowed bg-gray-300 text-gray-500'
                                            : 'bg-blue-600 text-white hover:bg-blue-700'
                                    }`}
                                >
                                    {seedStatus.isRunning ? (
                                        <>
                                            <RefreshCw className="w-5 h-5 animate-spin" />
                                            <span>{t('seedManagement.running')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Play className="w-5 h-5" />
                                            <span>{t('seedManagement.runButton')}</span>
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
                                <div className="flex min-w-0 items-start gap-3">
                                    {seedStatus.success === true && <CheckCircle className="w-6 h-6 text-green-600 mt-0.5" />}
                                    {seedStatus.success === false && <XCircle className="w-6 h-6 text-red-600 mt-0.5" />}
                                    {seedStatus.success === null && <RefreshCw className="w-6 h-6 text-blue-600 mt-0.5 animate-spin" />}

                                    <div className="min-w-0 flex-1">
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
                                                    <li key={index} className="flex min-w-0 items-start gap-2">
                                                        <span className="shrink-0 text-gray-400">•</span>
                                                        <span className="min-w-0 break-words">{detail}</span>
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
                    <div className="min-w-0 space-y-6">
                        <div className="min-w-0 bg-white rounded-xl shadow-lg p-6">
                            <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('seedManagement.filesListTitle')}</h2>
                            <div className="space-y-3">
                                {seedFiles.map((file) => {
                                    const Icon = file.icon;
                                    const available = isFileAvailable(file.name);
                                    return (
                                        <div
                                            key={file.name}
                                            className={`flex min-w-0 items-start gap-3 p-3 rounded-lg transition-colors ${available
                                                ? 'bg-green-50 hover:bg-green-100 border border-green-200'
                                                : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                                                }`}
                                            data-testid="seed-file-row"
                                        >
                                            <div className="flex shrink-0 items-center gap-2">
                                                <Icon className={`w-5 h-5 mt-0.5 ${available ? 'text-green-600' : 'text-gray-400'}`} />
                                                {available ? (
                                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                                ) : (
                                                    <XCircle className="w-4 h-4 text-gray-400" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                    <span className={`min-w-0 break-words text-sm font-medium ${available ? 'text-green-800' : 'text-gray-600'}`}>
                                                        {file.name}
                                                    </span>
                                                    {file.required && (
                                                        <span className="shrink-0 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                                                            {t('seedManagement.required')}
                                                        </span>
                                                    )}
                                                    {available && (
                                                        <span className="shrink-0 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                                            {t('seedManagement.fileFound')}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className={`text-xs mt-1 ${available ? 'text-green-700' : 'text-gray-500'}`}>
                                                    {t(`seedManagement.fileDescriptions.${file.descKey}`)}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Environment Status */}
                        <div className="min-w-0 bg-white rounded-xl shadow-lg p-6">
                            <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('seedManagement.environment')}</h2>
                            <div className="space-y-3">
                                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" data-testid="seed-env-row">
                                    <span className="text-sm text-gray-600">{t('seedManagement.supabaseUrl')}</span>
                                    <div className="flex shrink-0 items-center gap-2">
                                        {import.meta.env.VITE_SUPABASE_URL ? (
                                            <CheckCircle className="w-4 h-4 text-green-600" />
                                        ) : (
                                            <XCircle className="w-4 h-4 text-red-600" />
                                        )}
                                        <span className="text-xs">
                                            {import.meta.env.VITE_SUPABASE_URL ? t('seedManagement.configured') : t('seedManagement.missing')}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" data-testid="seed-env-row">
                                    <span className="text-sm text-gray-600">{t('seedManagement.serviceRole')}</span>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 text-yellow-600" />
                                        <span className="text-xs">{t('seedManagement.serverSideOnly')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Documentation */}
                        <div className="min-w-0 bg-white rounded-xl shadow-lg p-6">
                            <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('seedManagement.howItWorks')}</h2>
                            <div className="space-y-3 text-sm">
                                <div className="flex min-w-0 items-start gap-2">
                                    <FileText className="w-4 h-4 text-blue-600 mt-0.5" />
                                    <div className="min-w-0">
                                        <p className="font-medium">{t('seedManagement.step1Title')}</p>
                                        <p className="text-gray-600">{t('seedManagement.step1Desc')}</p>
                                    </div>
                                </div>
                                <div className="flex min-w-0 items-start gap-2">
                                    <Database className="w-4 h-4 text-blue-600 mt-0.5" />
                                    <div className="min-w-0">
                                        <p className="font-medium">{t('seedManagement.step2Title')}</p>
                                        <p className="text-gray-600">{t('seedManagement.step2Desc')}</p>
                                    </div>
                                </div>
                                <div className="flex min-w-0 items-start gap-2">
                                    <RefreshCw className="w-4 h-4 text-blue-600 mt-0.5" />
                                    <div className="min-w-0">
                                        <p className="font-medium">{t('seedManagement.step3Title')}</p>
                                        <p className="text-gray-600">{t('seedManagement.step3Desc')}</p>
                                    </div>
                                </div>
                                <div className="flex min-w-0 items-start gap-2">
                                    <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5" />
                                    <div className="min-w-0">
                                        <p className="font-medium">{t('seedManagement.step4Title')}</p>
                                        <p className="text-gray-600">{t('seedManagement.step4Desc')}</p>
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

const SeedManagement: React.FC = () => <SeedManagementPanel embedded={false} />;

export default SeedManagement;
