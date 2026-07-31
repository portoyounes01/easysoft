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
    Info,
    ShieldAlert,
    Trash2,
    UtensilsCrossed,
} from 'lucide-react';
import { seedDataService, SeedResult } from '../utils/seedData';
import { seedRestaurantDataset } from '../utils/seedRestaurantData';
import { QBELLA_EVORA_DATASET } from '../utils/restaurantSeedDataset';
import { AdminActionButton } from '../components/ui/AdminActionButton';
import { dialogButtonClasses, useAppliedDialogStyle } from '../theme/dialogStyle';
import { useEmployees } from '../contexts/EmployeesContext';
import { useProducts } from '../contexts/ProductsContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useSettings } from '../contexts/SettingsContext';
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

/** Which button is mid-run, so only that one shows a spinner. */
type SeedAction = 'yaml' | 'restaurant' | 'clear' | null;

export interface SeedManagementPanelProps {
    embedded?: boolean;
}

export const SeedManagementPanel: React.FC<SeedManagementPanelProps> = ({ embedded = false }) => {
    const { t } = useTranslation();
    const { visualStyle, prefs, layoutClasses } = useDesignSystem2Customization();
    const { refreshEmployees } = useEmployees();
    const { refreshData: refreshProducts } = useProducts();
    const { employee, hasPermission } = useSupabaseAuth();
    const { updateSettings } = useSettings();
    const applied = useAppliedDialogStyle();
    const shellButtons = applied ? dialogButtonClasses(applied) : null;
    const canClearLocalData = hasPermission('clear_data');
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
    const [activeAction, setActiveAction] = useState<SeedAction>(null);
    const [showClearDialog, setShowClearDialog] = useState(false);
    const [clearConfirmation, setClearConfirmation] = useState('');

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
        setActiveAction('yaml');
        setSeedStatus({
            isRunning: true,
            success: null,
            message: t('seedManagement.starting'),
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
                    details: [t('seedManagement.failureConsole')]
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
        } finally {
            setActiveAction(null);
        }
    }, [refreshEmployees, refreshProducts, t]);

    const handleSeedRestaurant = useCallback(async () => {
        setActiveAction('restaurant');
        setSeedStatus({
            isRunning: true,
            success: null,
            message: t('seedManagement.restaurant.starting', { name: QBELLA_EVORA_DATASET.name }),
            details: []
        });

        try {
            const result = await seedRestaurantDataset(QBELLA_EVORA_DATASET);

            // The seeder only writes local rows; the company block lives in
            // settings, so the panel applies it once the catalogue is in.
            const seedCompany = QBELLA_EVORA_DATASET.company;
            if (seedCompany) updateSettings({ company: seedCompany });

            const details = [
                `✅ ${t('seedManagement.restaurant.detailCategories', { count: result.categoriesCount })}`,
                `✅ ${t('seedManagement.restaurant.detailProducts', { count: result.productsCount })}`,
                `✅ ${t('seedManagement.restaurant.detailRawMaterials', { count: result.rawMaterialsCount })}`,
                `✅ ${t('seedManagement.restaurant.detailRecipeLines', { count: result.recipeLinesCount })}`,
                `✅ ${t('seedManagement.restaurant.detailVariantOptions', { count: result.variantOptionsCount })}`,
                `✅ ${t('seedManagement.restaurant.detailModifiers', { count: result.modifiersCount })}`,
                `ℹ️ ${t('seedManagement.restaurant.detailCostsFromRecipes')}`,
                `ℹ️ ${t('seedManagement.restaurant.detailLocalOnlyInventory')}`,
            ];
            if (seedCompany) {
                details.push(`✅ ${t('seedManagement.restaurant.detailCompany', { name: seedCompany.name })}`);
            }
            if (result.unknownMaterials.length > 0) {
                details.push(
                    `⚠️ ${t('seedManagement.restaurant.detailUnknownMaterials', {
                        materials: result.unknownMaterials.join(', '),
                    })}`
                );
            }

            setSeedStatus({
                isRunning: false,
                success: true,
                message: t('seedManagement.restaurant.success', { name: result.datasetName }),
                details
            });

            await refreshProducts();
        } catch (error) {
            setSeedStatus({
                isRunning: false,
                success: false,
                message: t('seedManagement.restaurant.failure', {
                    message: error instanceof Error ? error.message : t('seedManagement.unknownError'),
                }),
                details: [t('seedManagement.failureHints.console')]
            });
        } finally {
            setActiveAction(null);
        }
    }, [refreshProducts, t, updateSettings]);

    const handleClearLocalData = useCallback(async () => {
        if (!canClearLocalData || !employee || clearConfirmation !== 'CLEAR LOCAL DATA') {
            return;
        }

        setActiveAction('clear');
        setSeedStatus({
            isRunning: true,
            success: null,
            message: t('seedManagement.clear.running'),
            details: []
        });

        try {
            const result = await seedDataService.clearLocalData();
            setSeedStatus({
                isRunning: false,
                success: result.success,
                message: t('seedManagement.clear.success'),
                details: [
                    t('seedManagement.clear.localCleared'),
                    t('seedManagement.clear.adminsKept', { count: result.preservedSystemAdmins }),
                    t('seedManagement.clear.issueAttemptsKept', {
                        count: result.preservedFiscalIssueAttempts,
                    }),
                    t('seedManagement.clear.fiscalEvidenceKept', {
                        documents: result.preservedFiscalDocuments,
                        transactions: result.preservedFiscalTransactions,
                    }),
                    t('seedManagement.clear.settingsKept'),
                    t('seedManagement.clear.otherSlotKept'),
                    t('seedManagement.clear.startupSeedDisabled'),
                ]
            });
            setShowClearDialog(false);
            setClearConfirmation('');
            window.setTimeout(() => {
                window.location.reload();
            }, 1500);
        } catch (error) {
            setSeedStatus({
                isRunning: false,
                success: false,
                message: t('seedManagement.clear.failure', {
                    message: error instanceof Error ? error.message : t('seedManagement.unknownError'),
                }),
                details: [t('seedManagement.clear.failureHint')]
            });
        }
    }, [canClearLocalData, clearConfirmation, employee, t]);

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

                                <AdminActionButton
                                    type="button"
                                    variant="primary"
                                    onClick={handleRunSeed}
                                    isLoading={activeAction === 'yaml'}
                                    disabled={seedStatus.isRunning}
                                    icon={Play}
                                    label={activeAction === 'yaml' ? t('seedManagement.running') : t('seedManagement.runButton')}
                                    className="w-full"
                                />
                            </div>
                        </div>

                        {/* Ready-made restaurant catalogue */}
                        <div className="min-w-0 bg-white rounded-xl shadow-lg p-6" data-testid="restaurant-seed-card">
                            <h2 className="text-xl font-semibold text-gray-900 mb-4">
                                {t('seedManagement.restaurant.title')}
                            </h2>
                            <div className="space-y-4">
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <div className="mb-2 flex min-w-0 items-center gap-2 text-sm text-gray-600">
                                        <Info className="w-4 h-4 shrink-0" />
                                        <span className="min-w-0 break-words">
                                            {t('seedManagement.restaurant.description', {
                                                name: QBELLA_EVORA_DATASET.name,
                                            })}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-600">
                                        {t('seedManagement.restaurant.contents', {
                                            categories: QBELLA_EVORA_DATASET.categories.length,
                                            products: QBELLA_EVORA_DATASET.products.length,
                                            materials: QBELLA_EVORA_DATASET.rawMaterials.length,
                                        })}
                                    </p>
                                    <p className="mt-2 text-xs text-gray-500">
                                        {t('seedManagement.restaurant.source', {
                                            source: QBELLA_EVORA_DATASET.source,
                                        })}
                                    </p>
                                    <ul className="mt-2 space-y-1 text-xs text-gray-500">
                                        <li className="flex min-w-0 items-start gap-2">
                                            <span className="shrink-0">⚠️</span>
                                            <span className="min-w-0 break-words">
                                                {t('seedManagement.restaurant.estimateWarning')}
                                            </span>
                                        </li>
                                        <li className="flex min-w-0 items-start gap-2">
                                            <span className="shrink-0">•</span>
                                            <span className="min-w-0 break-words">
                                                {t('seedManagement.restaurant.rerunHint')}
                                            </span>
                                        </li>
                                    </ul>
                                </div>

                                <AdminActionButton
                                    type="button"
                                    variant="success"
                                    onClick={handleSeedRestaurant}
                                    isLoading={activeAction === 'restaurant'}
                                    disabled={seedStatus.isRunning}
                                    icon={UtensilsCrossed}
                                    label={
                                        activeAction === 'restaurant'
                                            ? t('seedManagement.restaurant.running')
                                            : t('seedManagement.restaurant.button')
                                    }
                                    className="w-full"
                                    data-testid="seed-restaurant-button"
                                />
                            </div>
                        </div>

                        {canClearLocalData && (
                            <div className="min-w-0 border border-red-200 bg-red-50 p-6 shadow-lg ds2-control-radius-lg">
                                <div className="flex min-w-0 items-start gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-100">
                                        <ShieldAlert className="h-6 w-6 text-red-700" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h2 className="text-xl font-semibold text-red-950">
                                            {t('seedManagement.clear.title')}
                                        </h2>
                                        <p className="mt-1 text-sm leading-6 text-red-800">
                                            {t('seedManagement.clear.description')}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowClearDialog(true)}
                                    disabled={seedStatus.isRunning}
                                    className="mt-5 flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-[var(--ds2-danger-solid,#dc2626)] px-6 py-3 font-semibold text-white transition-colors duration-200 hover:bg-[var(--ds2-danger-hover,#b91c1c)] disabled:cursor-not-allowed disabled:opacity-50"
                                    data-testid="clear-local-database-button"
                                >
                                    <Trash2 className="h-5 w-5" />
                                    <span>{t('seedManagement.clear.button')}</span>
                                </button>
                            </div>
                        )}

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

            {showClearDialog && canClearLocalData && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
                    role="presentation"
                    onMouseDown={event => {
                        if (event.target === event.currentTarget && !seedStatus.isRunning) {
                            setShowClearDialog(false);
                            setClearConfirmation('');
                        }
                    }}
                >
                    <div
                        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-2xl"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="clear-local-database-title"
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-red-100">
                                <ShieldAlert className="h-7 w-7 text-red-700" />
                            </div>
                            <div className="min-w-0">
                                <h2 id="clear-local-database-title" className="text-xl font-semibold text-gray-950">
                                    {t('seedManagement.clear.dialogTitle')}
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-gray-600">
                                    {t('seedManagement.clear.dialogDescription')}
                                </p>
                            </div>
                        </div>

                        <label htmlFor="clear-local-database-confirmation" className="mt-6 block text-sm font-semibold text-gray-800">
                            {t('seedManagement.clear.confirmLabel')}
                        </label>
                        <input
                            id="clear-local-database-confirmation"
                            type="text"
                            value={clearConfirmation}
                            onChange={event => setClearConfirmation(event.target.value)}
                            autoComplete="off"
                            className="mt-2 min-h-touch w-full rounded-lg border-2 border-gray-200 bg-gray-50 px-4 text-base font-semibold text-gray-950 outline-none transition-colors focus:border-red-500 focus:ring-4 focus:ring-red-100"
                        />

                        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowClearDialog(false);
                                    setClearConfirmation('');
                                }}
                                disabled={seedStatus.isRunning}
                                className={shellButtons
                                    ? `${shellButtons.secondary} disabled:opacity-50`
                                    : 'min-h-touch rounded-lg border border-gray-300 bg-white px-5 font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50'}
                            >
                                {t('seedManagement.clear.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={handleClearLocalData}
                                disabled={seedStatus.isRunning || clearConfirmation !== 'CLEAR LOCAL DATA'}
                                className={shellButtons
                                    ? `flex items-center justify-center gap-2 ${shellButtons.danger} disabled:cursor-not-allowed disabled:opacity-40`
                                    : 'flex min-h-touch items-center justify-center gap-2 rounded-lg bg-red-600 px-5 font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40'}
                            >
                                {seedStatus.isRunning ? (
                                    <RefreshCw className="h-5 w-5 animate-spin" />
                                ) : (
                                    <Trash2 className="h-5 w-5" />
                                )}
                                <span>{t('seedManagement.clear.confirmButton')}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const SeedManagement: React.FC = () => <SeedManagementPanel embedded={false} />;

export default SeedManagement;
