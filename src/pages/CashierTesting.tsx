import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useWebSerialPrinter } from '../utils/webSerialPrinter';
import {
  Zap,
  Printer,
  DollarSign,
  CheckCircle,
  AlertCircle,
  Download,
  Settings,
  RefreshCw,
  Monitor,
  Usb,
  Send
} from 'lucide-react';
import {
  useDesignSystem2Customization,
} from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

interface TestResult {
  testName: string;
  description: string;
  commands?: number[];
  expectedResult: string;
  instructions: string[];
  success: boolean;
  timestamp: string;
  logId?: string;
}

interface TestSuite {
  success: boolean;
  message: string;
  tests: TestResult[];
  totalTests: number;
  timestamp: string;
}

const DS2_PRIMARY_FULL =
  'ds2-control-radius-lg min-h-touch-sm flex w-full transform items-center justify-center gap-2 p-4 font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-200 hover:scale-105 hover:from-blue-600 hover:to-blue-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:transform-none';
const DS2_PRIMARY_ROW =
  'ds2-control-radius-lg min-h-touch-sm inline-flex items-center justify-center gap-2 px-4 font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-sm transition-all duration-200';
const DS2_GRAY_ROW =
  'ds2-control-radius-lg min-h-touch-sm inline-flex items-center justify-center gap-2 px-4 font-semibold text-white bg-gray-600 hover:bg-gray-700 shadow-sm transition-all duration-200';
const DS2_DANGER_ROW =
  'ds2-control-radius-lg min-h-touch-sm inline-flex items-center justify-center gap-2 px-4 font-semibold text-white bg-red-500 hover:bg-red-600 shadow-sm transition-all duration-200';
const DS2_COMPACT_GRAY =
  'ds2-control-radius-lg inline-flex min-h-touch-sm items-center justify-center gap-1 px-3 text-sm font-semibold text-white bg-gray-600 hover:bg-gray-700 shadow-sm transition-all duration-200';
const DS2_COMPACT_PRIMARY =
  'ds2-control-radius-lg inline-flex min-h-touch-sm items-center justify-center gap-1 px-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-sm transition-all duration-200';

export interface CashierTestingPanelProps {
  embedded?: boolean;
}

export const CashierTestingPanel: React.FC<CashierTestingPanelProps> = ({ embedded = false }) => {
  const { employee } = useSupabaseAuth();
  const { visualStyle, prefs, layoutClasses } = useDesignSystem2Customization();
  const { connectPrinter, connectToAnyDevice, sendToPrinter, disconnectPrinter, isConnected, isSupported } =
    useWebSerialPrinter();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<TestSuite | null>(null);
  const [testLogs, setTestLogs] = useState<any[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    printerWidth: 48,
    drawerType: 'standard' as 'standard' | 'alternative',
    includeSound: true
  });

  // Fetch recent test logs
  const fetchTestLogs = async () => {
    if (!employee) return;

    setIsLoadingLogs(true);
    setFetchError(null);

    try {
      const { data, error } = await supabase
        .from('cashier_tests')
        .select('*')
        .eq('employee_id', employee.id)
        .order('timestamp', { ascending: false })
        .limit(10);

      if (error) {
        // Check if it's a table not found error or permission error
        if (error.message.includes('relation "cashier_tests" does not exist') ||
          error.message.includes('permission denied')) {
          console.warn('Cashier tests table not available:', error.message);
          setFetchError('Database tables not yet created. Run tests to initialize.');
          setTestLogs([]);
          return;
        }
        throw error;
      }

      setTestLogs(data || []);
    } catch (error) {
      console.error('Error fetching test logs:', error);
      setFetchError('Failed to load test history');
      setTestLogs([]);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadLogs = async () => {
      if (employee && isMounted) {
        // Only try to fetch logs if we haven't already tried and failed
        if (!fetchError) {
          await fetchTestLogs();
        }
      }
    };

    // Add a small delay to prevent immediate requests
    const timeoutId = setTimeout(loadLogs, 500);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [employee?.id, fetchError]); // Include fetchError to prevent retries

  // Execute test function
  const runTest = async (testType: string) => {
    if (!employee) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-cashier', {
        body: {
          testType,
          employeeId: employee.id,
          settings
        }
      });

      if (error) throw error;

      setLastTestResult(data);

      // If test has commands, simulate sending to hardware
      if (data.tests[0]?.commands) {
        simulateHardwareCommand(data.tests[0].commands);
      }

      // Refresh logs after a successful test, with a delay to avoid rapid requests
      setTimeout(() => {
        fetchTestLogs();
      }, 1000);

    } catch (error) {
      console.error('Error running test:', error);
      alert('Error running test: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsLoading(false);
    }
  };

  // Simulate hardware command execution
  const simulateHardwareCommand = async (commands: number[]) => {
    console.log('Sending ESC/POS commands to hardware:', commands);

    // Try to send directly to hardware if connected
    if (isConnected) {
      try {
        const success = await sendToPrinter(commands);
        if (success) {
          console.log('✅ Commands sent directly to hardware!');
          return;
        }
      } catch (error) {
        console.error('❌ Failed to send to hardware:', error);
      }
    }

    // Fallback: show download option
    console.log('💾 Hardware not connected - generating download file...');

    // In a real implementation, this would:
    // 1. Send commands via USB/Serial to printer
    // 2. Handle responses and errors
    // 3. Provide real-time feedback

    // For now, we'll show the commands in a downloadable format
    const commandString = commands.map(cmd =>
      '0x' + cmd.toString(16).padStart(2, '0').toUpperCase()
    ).join(', ');

    console.log('ESC/POS Command Sequence:', commandString);
  };

  // Download commands as a file for testing
  const downloadCommands = (commands: number[], testName: string) => {
    const commandBytes = new Uint8Array(commands);
    const blob = new Blob([commandBytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${testName.toLowerCase().replace(/\s+/g, '-')}-commands.bin`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const testButtons = [
    {
      id: 'cash-drawer',
      label: 'Cash Drawer Test',
      icon: DollarSign,
      description: 'Test cash drawer opening mechanism',
    },
    {
      id: 'printer-test',
      label: 'Printer Test',
      icon: Printer,
      description: 'Test thermal printer functionality',
    },
    {
      id: 'full-sequence',
      label: 'Full Sequence',
      icon: Zap,
      description: 'Complete transaction: print + open drawer',
    },
    {
      id: 'hardware-check',
      label: 'Hardware Check',
      icon: Monitor,
      description: 'Physical hardware inspection checklist',
    },
    {
      id: 'all-tests',
      label: 'All Tests',
      icon: CheckCircle,
      description: 'Run complete test suite',
    },
  ];

  return (
    <div
      className={embedded ? 'ds2-visual-scope' : 'ds2-visual-scope min-h-screen bg-gray-50'}
      style={visualStyle}
      data-ds2-neutral={prefs.neutralFamilyId}
    >
      <div className={embedded ? 'max-w-6xl' : `mx-auto max-w-6xl py-6 ${layoutClasses.contentInsetX}`}>
        <div className="mb-6 rounded-lg bg-white p-6 shadow-md">
          <div className="flex items-center justify-between">
            {!embedded && (
              <div>
                <h1 className="mb-2 text-3xl font-bold text-gray-800">
                  Cashier Hardware Testing
                </h1>
                <p className="text-gray-600">
                  Test cash drawer and thermal printer functionality
                </p>
              </div>
            )}
            <div className="flex items-center space-x-4">
              <button
                type="button"
                onClick={fetchTestLogs}
                disabled={isLoadingLogs}
                className={`${DS2_GRAY_ROW} px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingLogs ? 'animate-spin' : ''}`} />
                <span>{isLoadingLogs ? 'Loading...' : 'Refresh'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Test Controls */}
          <div className="lg:col-span-2">
            {/* Hardware Connection Panel */}
            {isSupported && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                  <Usb className="w-5 h-5 mr-2" />
                  Hardware Connection
                </h2>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-gray-700">
                      {isConnected ? 'Connected to printer/cash drawer' : 'Not connected'}
                    </span>
                  </div>
                  <div className="flex space-x-2">
                    {!isConnected ? (
                      <>
                        <button
                          type="button"
                          onClick={() => connectPrinter()}
                          className={DS2_PRIMARY_ROW}
                        >
                          <Usb className="h-4 w-4" />
                          <span>Connect Printer</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => connectToAnyDevice()}
                          className={`${DS2_GRAY_ROW} px-3 text-sm`}
                        >
                          <span>Show All Devices</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={disconnectPrinter}
                        className={DS2_DANGER_ROW}
                      >
                        <span>Disconnect</span>
                      </button>
                    )}
                  </div>
                </div>
                {isConnected && (
                  <div className="mt-3 p-3 bg-green-50 rounded-lg">
                    <p className="text-sm text-green-700">
                      ✅ Hardware connected! Test commands will be sent directly to your printer/cash drawer.
                    </p>
                  </div>
                )}
                {!isSupported && (
                  <div className="mt-3 p-3 bg-yellow-50 rounded-lg">
                    <p className="text-sm text-yellow-700">
                      ⚠️ Direct hardware control requires Chrome or Edge browser. Commands will be downloaded as files.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Settings Panel */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                <Settings className="w-5 h-5 mr-2" />
                Test Settings
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Printer Width
                  </label>
                  <select
                    value={settings.printerWidth}
                    onChange={(e) => setSettings(prev => ({ ...prev, printerWidth: Number(e.target.value) }))}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value={32}>32 characters</option>
                    <option value={42}>42 characters</option>
                    <option value={48}>48 characters</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Drawer Type
                  </label>
                  <select
                    value={settings.drawerType}
                    onChange={(e) => setSettings(prev => ({ ...prev, drawerType: e.target.value as 'standard' | 'alternative' }))}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="standard">Standard (Pin 0)</option>
                    <option value="alternative">Alternative (Pin 1)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Include Sound
                  </label>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={settings.includeSound}
                      onChange={(e) => setSettings(prev => ({ ...prev, includeSound: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Audio feedback</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Test Buttons */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Hardware Tests
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {testButtons.map((test) => {
                  const Icon = test.icon;
                  return (
                    <button
                      key={test.id}
                      type="button"
                      onClick={() => runTest(test.id)}
                      disabled={isLoading}
                      className={DS2_PRIMARY_FULL}
                    >
                      <div className="flex items-center justify-center mb-2">
                        <Icon className="w-8 h-8" />
                      </div>
                      <h3 className="font-semibold text-lg mb-1">{test.label}</h3>
                      <p className="text-sm opacity-90">{test.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Test Results */}
            {lastTestResult && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Last Test Results
                </h2>
                <div className="space-y-4">
                  {lastTestResult.tests.map((test, index) => (
                    <div
                      key={index}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-lg text-gray-800">
                            {test.testName}
                          </h3>
                          <p className="text-gray-600 text-sm">{test.description}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          {test.commands && (
                            <>
                              <button
                                type="button"
                                onClick={() => downloadCommands(test.commands!, test.testName)}
                                className={DS2_COMPACT_GRAY}
                              >
                                <Download className="h-4 w-4" />
                                <span>Download</span>
                              </button>
                              {isConnected && (
                                <button
                                  type="button"
                                  onClick={() => sendToPrinter(test.commands!)}
                                  className={DS2_COMPACT_PRIMARY}
                                >
                                  <Send className="w-4 h-4" />
                                  <span>Send to Hardware</span>
                                </button>
                              )}
                            </>
                          )}
                          {test.success ? (
                            <CheckCircle className="w-6 h-6 text-green-500" />
                          ) : (
                            <AlertCircle className="w-6 h-6 text-red-500" />
                          )}
                        </div>
                      </div>

                      <div className="mb-3">
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          Expected Result:
                        </p>
                        <p className="text-sm text-gray-600">{test.expectedResult}</p>
                      </div>

                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          Instructions:
                        </p>
                        <ol className="text-sm text-gray-600 space-y-1">
                          {test.instructions.map((instruction, idx) => (
                            <li key={idx} className="flex items-start">
                              <span className="mr-2">{idx + 1}.</span>
                              <span>{instruction}</span>
                            </li>
                          ))}
                        </ol>
                      </div>

                      {test.commands && (
                        <div className="mt-3 p-3 bg-gray-50 rounded">
                          <p className="text-xs font-medium text-gray-700 mb-1">
                            ESC/POS Commands ({test.commands.length} bytes):
                          </p>
                          <code className="text-xs text-gray-600 break-all">
                            {test.commands.map(cmd =>
                              '0x' + cmd.toString(16).padStart(2, '0').toUpperCase()
                            ).join(' ')}
                          </code>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Test History */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Test History
            </h2>
            <div className="space-y-3">
              {isLoadingLogs ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                  <p className="text-gray-500 text-sm">Loading test history...</p>
                </div>
              ) : fetchError ? (
                <div className="text-center py-8">
                  <p className="text-red-500 text-sm mb-2">{fetchError}</p>
                  <button
                    onClick={fetchTestLogs}
                    className="text-blue-500 text-sm hover:underline"
                  >
                    Try again
                  </button>
                </div>
              ) : testLogs.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No tests run yet
                </p>
              ) : (
                testLogs.map((log) => (
                  <div
                    key={log.id}
                    className="border border-gray-200 rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm capitalize">
                        {log.test_type.replace('-', ' ')}
                      </span>
                      <span className={`w-2 h-2 rounded-full ${log.success ? 'bg-green-500' : 'bg-red-500'
                        }`}></span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {new Date(log.timestamp).toLocaleString('pt-PT')}
                    </p>
                    {log.test_details && (
                      <div className="mt-2 text-xs text-gray-600">
                        {Object.entries(log.test_details).map(([key, value]) => (
                          <div key={key}>
                            <span className="capitalize">{key}:</span> {String(value)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Loading Overlay */}
        {isLoading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="ds2-control-radius-lg flex items-center space-x-4 rounded-lg bg-white p-6">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500"></div>
              <span className="text-lg">Running test...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/** @deprecated Use `CashierTestingPanel` — kept for stale HMR / deep links. */
export const CashierTestingInner = CashierTestingPanel;

function CashierTestingPage() {
  return <CashierTestingPanel embedded={false} />;
}

export default CashierTestingPage;
