import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, Trash2, RefreshCw, AlertTriangle, CheckCircle, Bug, Info } from 'lucide-react';
import { clearAndReinitializeDatabase } from '../utils/clearLocalDatabase';
import { AdminActionButton } from './ui/AdminActionButton';
import { runDatabaseDiagnostics, fixDatabaseIssues, DatabaseDiagnostics } from '../utils/debugDatabase';

interface DatabaseResetProps {
    onComplete?: () => void;
}

const DatabaseReset: React.FC<DatabaseResetProps> = ({ onComplete }) => {
    const { t } = useTranslation();
    const [isResetting, setIsResetting] = useState(false);
    const [resetComplete, setResetComplete] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [diagnostics, setDiagnostics] = useState<DatabaseDiagnostics | null>(null);
    const [isDebugging, setIsDebugging] = useState(false);
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [autoFixing, setAutoFixing] = useState(false);

    // Run diagnostics on mount
    useEffect(() => {
        runDiagnostics();
    }, []);

    const runDiagnostics = async () => {
        setIsDebugging(true);
        try {
            const results = await runDatabaseDiagnostics();
            setDiagnostics(results);
        } catch (err) {
            setError(`Diagnostics failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsDebugging(false);
        }
    };

    const handleAutoFix = async () => {
        setAutoFixing(true);
        setError(null);
        setResetComplete(false);

        try {
            const result = await fixDatabaseIssues();
            if (result.success) {
                setResetComplete(true);
                setTimeout(() => {
                    if (onComplete) {
                        onComplete();
                    } else {
                        window.location.reload();
                    }
                }, 2000);
            } else {
                setError(result.message);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Auto-fix failed');
        } finally {
            setAutoFixing(false);
        }
    };

    const handleReset = async () => {
        if (!confirm(t('database.resetConfirm'))) {
            return;
        }

        setIsResetting(true);
        setError(null);
        setResetComplete(false);

        try {
            await clearAndReinitializeDatabase();
            setResetComplete(true);
            setTimeout(() => {
                if (onComplete) {
                    onComplete();
                } else {
                    window.location.reload();
                }
            }, 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to reset database');
        } finally {
            setIsResetting(false);
        }
    };

    const handleManualReset = () => {
        const instructions = `
To manually reset the database:

1. Open Browser Dev Tools (F12)
2. Go to Application tab
3. Find IndexedDB in the left sidebar
4. Expand IndexedDB and find "POSDatabase"
5. Right-click on "POSDatabase" and select "Delete database"
6. Refresh the page

Alternative: Open browser console and run:
indexedDB.deleteDatabase('POSDatabase').onsuccess = () => location.reload();
    `.trim();

        alert(instructions);
    };

    if (resetComplete) {
        return (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                    <div>
                        <h3 className="text-green-800 font-semibold">Database Reset Complete</h3>
                        <p className="text-green-700 text-sm">The page will reload automatically...</p>
                    </div>
                </div>
            </div>
        );
    }

    const shouldShowAutoFix = diagnostics && diagnostics.errors.length > 0;
    const shouldShowReset = diagnostics && (diagnostics.errors.length > 0 || !diagnostics.isDatabaseOpen);

    return (
        <div className="space-y-4">
            {/* Main Error Display */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <div className="flex items-start space-x-3 mb-4">
                    <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <h3 className="text-red-800 font-semibold text-lg">Database Issue Detected</h3>
                        <p className="text-red-700 text-sm mt-1">
                            The local database has encountered an issue and needs attention.
                        </p>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-100 border border-red-300 rounded p-3 mb-4">
                        <p className="text-red-800 text-sm">{error}</p>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                    {shouldShowAutoFix && (
                        <AdminActionButton
                            variant="primary"
                            icon={RefreshCw}
                            label={autoFixing ? 'Auto-fixing...' : 'Auto-Fix Issues'}
                            isLoading={autoFixing}
                            onClick={handleAutoFix}
                            disabled={autoFixing || isDebugging}
                            className="disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                    )}

                    {shouldShowReset && (
                        <button
                            onClick={handleReset}
                            disabled={isResetting}
                            className="flex items-center justify-center space-x-2 px-4 py-2 bg-[var(--ds2-danger-solid,#dc2626)] text-white hover:bg-[var(--ds2-danger-hover,#b91c1c)] rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isResetting ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    <span>Resetting...</span>
                                </>
                            ) : (
                                <>
                                    <Database className="w-4 h-4" />
                                    <span>Reset Database</span>
                                </>
                            )}
                        </button>
                    )}

                    <AdminActionButton
                        variant="outline"
                        icon={Trash2}
                        label="Manual Instructions"
                        onClick={handleManualReset}
                    />

                    <AdminActionButton
                        variant="outline"
                        icon={Bug}
                        label="Debug Info"
                        onClick={() => setShowDiagnostics(!showDiagnostics)}
                    />
                </div>
            </div>

            {/* Diagnostics Information */}
            {showDiagnostics && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-gray-800 flex items-center space-x-2">
                            <Bug className="w-5 h-5" />
                            <span>Database Diagnostics</span>
                        </h4>
                        <button
                            onClick={runDiagnostics}
                            disabled={isDebugging}
                            className="text-sm bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 px-3 py-1 rounded-2xl transition-colors disabled:opacity-50"
                        >
                            {isDebugging ? 'Running...' : 'Refresh'}
                        </button>
                    </div>

                    {diagnostics ? (
                        <div className="space-y-3 text-sm">
                            {/* Status Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex items-center space-x-2">
                                    <div className={`w-3 h-3 rounded-full ${diagnostics.isIndexedDBSupported ? 'bg-green-400' : 'bg-red-400'}`}></div>
                                    <span>IndexedDB Support</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <div className={`w-3 h-3 rounded-full ${diagnostics.isDatabaseOpen ? 'bg-green-400' : 'bg-red-400'}`}></div>
                                    <span>Database Open</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <div className={`w-3 h-3 rounded-full ${diagnostics.hasData ? 'bg-green-400' : 'bg-yellow-400'}`}></div>
                                    <span>Has Data</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Info className="w-3 h-3 text-gray-500" />
                                    <span>Version: {diagnostics.version || 'Unknown'}</span>
                                </div>
                            </div>

                            {/* Tables */}
                            {diagnostics.tables.length > 0 && (
                                <div>
                                    <p className="font-medium text-gray-700 mb-1">Available Tables:</p>
                                    <p className="text-gray-600">{diagnostics.tables.join(', ')}</p>
                                </div>
                            )}

                            {/* Errors */}
                            {diagnostics.errors.length > 0 && (
                                <div>
                                    <p className="font-medium text-red-700 mb-1">Errors:</p>
                                    <ul className="space-y-1">
                                        {diagnostics.errors.map((error, index) => (
                                            <li key={index} className="text-red-600 flex items-start space-x-1">
                                                <span className="text-red-400 mt-1">•</span>
                                                <span>{error}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Recommendations */}
                            {diagnostics.recommendations.length > 0 && (
                                <div>
                                    <p className="font-medium text-yellow-700 mb-1">Recommendations:</p>
                                    <ul className="space-y-1">
                                        {diagnostics.recommendations.map((rec, index) => (
                                            <li key={index} className="text-yellow-600 flex items-start space-x-1">
                                                <span className="text-yellow-400 mt-1">•</span>
                                                <span>{rec}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-gray-500">Loading diagnostics...</p>
                    )}
                </div>
            )}

            {/* Information Note */}
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <p className="text-yellow-800 text-sm">
                    <strong>Note:</strong> Database issues can occur when the app's schema is updated or when browser data becomes corrupted.
                    The auto-fix will attempt to resolve common issues, while a reset will recreate the database with the correct structure.
                </p>
            </div>
        </div>
    );
};

export default DatabaseReset; 