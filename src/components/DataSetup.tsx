import React, { useState } from 'react';
import { Database, RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { populateTransactionData, clearTransactionData, checkTransactionDataExists } from '../utils/populateTransactionData';
import { useEmployees } from '../contexts/EmployeesContext';
import { useProducts } from '../contexts/ProductsContext';

interface SetupResult {
    success: boolean;
    message: string;
    details?: any;
}

const DataSetup: React.FC = () => {
    const { refreshEmployees } = useEmployees();
    const { refreshData: refreshProducts } = useProducts();
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<SetupResult[]>([]);
    const [currentStep, setCurrentStep] = useState<string>('');

    const addResult = (result: SetupResult) => {
        setResults(prev => [...prev, result]);
    };

    const clearResults = () => {
        setResults([]);
        setCurrentStep('');
    };

    const populateAllData = async () => {
        setIsLoading(true);
        clearResults();

        try {
            // Step 1: Check if transaction data exists
            setCurrentStep('Checking existing data...');
            const dataExists = await checkTransactionDataExists();
            
            if (dataExists) {
                addResult({
                    success: true,
                    message: 'Transaction data already exists. Clearing first...'
                });
                
                setCurrentStep('Clearing existing transaction data...');
                await clearTransactionData();
                addResult({
                    success: true,
                    message: 'Existing transaction data cleared'
                });
            }

            // Step 2: Populate all data (categories, products, employees, customers, transactions)
            setCurrentStep('Populating all data (categories, products, employees, customers, transactions)...');
            const transactionResult = await populateTransactionData();
            addResult({
                success: true,
                message: 'All data populated successfully',
                details: transactionResult
            });

            // Step 3: Refresh contexts to reflect new data
            setCurrentStep('Refreshing data in application...');
            await Promise.all([
                refreshEmployees(),
                refreshProducts()
            ]);
            addResult({
                success: true,
                message: 'Application data refreshed successfully'
            });

            // Step 4: Final verification
            setCurrentStep('Verifying data setup...');
            const finalCheck = await checkTransactionDataExists();
            if (finalCheck) {
                addResult({
                    success: true,
                    message: 'Data setup verification completed successfully!'
                });
            } else {
                addResult({
                    success: false,
                    message: 'Data setup verification failed'
                });
            }

        } catch (error) {
            console.error('Error during data setup:', error);
            addResult({
                success: false,
                message: `Error during setup: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
        } finally {
            setIsLoading(false);
            setCurrentStep('');
        }
    };

    const clearAllData = async () => {
        setIsLoading(true);
        clearResults();

        try {
            setCurrentStep('Clearing all transaction data...');
            await clearTransactionData();
            addResult({
                success: true,
                message: 'All transaction data cleared successfully'
            });

            // Refresh contexts to reflect cleared data
            setCurrentStep('Refreshing application data...');
            await Promise.all([
                refreshEmployees(),
                refreshProducts()
            ]);
            addResult({
                success: true,
                message: 'Application data refreshed successfully'
            });
        } catch (error) {
            console.error('Error clearing data:', error);
            addResult({
                success: false,
                message: `Error clearing data: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
        } finally {
            setIsLoading(false);
            setCurrentStep('');
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="bg-white rounded-lg shadow-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center space-x-3">
                        <Database className="w-6 h-6 text-blue-600" />
                        <h2 className="text-xl font-semibold text-gray-800">Database Setup</h2>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                        Set up your POS system with sample data for testing and reports
                    </p>
                </div>

                <div className="p-6">
                    <div className="flex space-x-4 mb-6">
                        <button
                            onClick={populateAllData}
                            disabled={isLoading}
                            className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <Database className="w-5 h-5" />
                            )}
                            <span>Populate All Data</span>
                        </button>

                        <button
                            onClick={clearAllData}
                            disabled={isLoading}
                            className="flex items-center space-x-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <RefreshCw className="w-5 h-5" />
                            )}
                            <span>Clear All Data</span>
                        </button>
                    </div>

                    {currentStep && (
                        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center space-x-2">
                                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                                <span className="text-blue-800 font-medium">{currentStep}</span>
                            </div>
                        </div>
                    )}

                    {results.length > 0 && (
                        <div className="space-y-3">
                            <h3 className="text-lg font-medium text-gray-800 mb-3">Setup Results</h3>
                            {results.map((result, index) => (
                                <div
                                    key={index}
                                    className={`p-4 rounded-lg border ${
                                        result.success
                                            ? 'bg-green-50 border-green-200 text-green-800'
                                            : 'bg-red-50 border-red-200 text-red-800'
                                    }`}
                                >
                                    <div className="flex items-center space-x-2">
                                        {result.success ? (
                                            <CheckCircle className="w-5 h-5" />
                                        ) : (
                                            <AlertCircle className="w-5 h-5" />
                                        )}
                                        <span className="font-medium">{result.message}</span>
                                    </div>
                                    {result.details && (
                                        <div className="mt-2 text-sm opacity-75">
                                            <pre className="whitespace-pre-wrap">
                                                {JSON.stringify(result.details, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-8 p-4 bg-gray-50 rounded-lg">
                        <h4 className="font-medium text-gray-800 mb-2">What this will populate:</h4>
                        <ul className="text-sm text-gray-600 space-y-1">
                            <li>• Sample categories (Beverages, Dairy, Bakery, Confectionery)</li>
                            <li>• Sample products with realistic pricing and stock levels</li>
                            <li>• Sample employees (Carlos, João, Maria)</li>
                            <li>• Sample customers for transaction history</li>
                            <li>• Transaction history with sales data (past 30 days)</li>
                            <li>• Transaction items for detailed reporting</li>
                        </ul>
                        <p className="text-xs text-gray-50 mt-3">
                            <strong>Note:</strong> This will populate both the local database (for products/categories) 
                            and Supabase (for transactions and reports). The Reports section will show comprehensive 
                            data including stock levels (inventory report) and sales analytics.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DataSetup;
