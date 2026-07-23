/**
 * Electron-Compatible Cashier Testing Component
 * Supports both web (Web Serial) and Electron (native hardware) environments
 */

import React, { useState, useEffect } from 'react';
import { useWebSerialPrinter } from '../utils/webSerialPrinter';
import electronHardwareService from '../services/electronHardwareService';
import { 
  Zap, 
  Printer, 
  DollarSign, 
  CheckCircle, 
  Settings,
  RefreshCw,
  Monitor,
  Usb,
  Laptop,
  CircleDot
} from 'lucide-react';
import {
    useDesignSystem2Customization,
} from '../contexts/DesignSystem2CustomizationContext';
import { AdminActionButton } from '../components/ui/AdminActionButton';
import '../styles/design-system-2-scope.css';

const DS2_DANGER_ROW =
    'rounded-xl min-h-touch-sm inline-flex items-center justify-center gap-2 px-4 font-semibold text-white bg-[var(--ds2-danger-solid,#dc2626)] hover:bg-[var(--ds2-danger-hover,#b91c1c)] transition-all duration-200';
const DS2_TEST_TILE =
    'rounded-xl min-h-touch-sm flex w-full items-center gap-3 border border-gray-200 bg-white p-4 text-left text-neutral-900 hover:bg-gray-50 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50';

interface HardwareMode {
  type: 'electron' | 'web';
  available: boolean;
  initialized: boolean;
  status: string;
}

export interface ElectronTestingPanelProps {
  embedded?: boolean;
}

export const ElectronTestingPanel: React.FC<ElectronTestingPanelProps> = ({ embedded = false }) => {
  const { connectToAnyDevice, sendToPrinter, disconnectPrinter, isConnected, isSupported } = useWebSerialPrinter();
  const { visualStyle, prefs, layoutClasses } = useDesignSystem2Customization();
  // State management
  const [isLoading, setIsLoading] = useState(false);
  const [hardwareMode, setHardwareMode] = useState<HardwareMode>({
    type: 'web',
    available: false,
    initialized: false,
    status: 'Not connected'
  });
  
  const [settings, setSettings] = useState({
    printerWidth: 48,
    drawerType: 'standard' as 'standard' | 'alternative',
    includeSound: true
  });

  // Check hardware environment on component mount
  useEffect(() => {
    checkHardwareEnvironment();
  }, []);

  const checkHardwareEnvironment = async () => {
    const isElectron = electronHardwareService.isElectronEnvironment();
    
    if (isElectron) {
      setHardwareMode({
        type: 'electron',
        available: true,
        initialized: false,
        status: 'Electron environment detected'
      });
      
      // Auto-initialize Electron hardware
      await initializeElectronHardware();
    } else {
      setHardwareMode({
        type: 'web',
        available: isSupported,
        initialized: false,
        status: isSupported ? 'Web Serial API available' : 'Web Serial API not supported'
      });
    }
  };

  const initializeElectronHardware = async () => {
    try {
      setIsLoading(true);
      const result = await electronHardwareService.initialize();
      
      setHardwareMode(prev => ({
        ...prev,
        initialized: result.success,
        status: result.success ? result.message || 'Hardware initialized' : result.error || 'Initialization failed'
      }));

      if (result.success) {
        console.log('✅ Electron hardware initialized:', result);
      } else {
        console.error('❌ Electron hardware initialization failed:', result.error);
      }
    } catch (error) {
      console.error('Hardware initialization error:', error);
      setHardwareMode(prev => ({
        ...prev,
        initialized: false,
        status: 'Initialization error'
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const connectHardware = async () => {
    if (hardwareMode.type === 'electron') {
      await initializeElectronHardware();
    } else {
      try {
        await connectToAnyDevice();
        setHardwareMode(prev => ({
          ...prev,
          initialized: isConnected,
          status: isConnected ? 'Connected via Web Serial' : 'Connection failed'
        }));
      } catch (error) {
        console.error('Web Serial connection failed:', error);
      }
    }
  };

  const disconnectHardware = () => {
    if (hardwareMode.type === 'web') {
      disconnectPrinter();
      setHardwareMode(prev => ({
        ...prev,
        initialized: false,
        status: 'Disconnected'
      }));
    }
    // Electron doesn't need explicit disconnection
  };

  const testCashDrawer = async () => {
    try {
      setIsLoading(true);
      
      if (hardwareMode.type === 'electron') {
        const result = await electronHardwareService.openCashDrawer({
          command: settings.drawerType,
          reason: 'Manual test'
        });
        
        if (result.success) {
          alert(`✅ Cash drawer test successful!\n${result.message}`);
        } else {
          alert(`❌ Cash drawer test failed:\n${result.error}`);
        }
      } else {
        // Web Serial implementation
        const commands = settings.drawerType === 'standard' 
          ? [0x1B, 0x70, 0x00, 0x19, 0xFA]
          : [0x1B, 0x70, 0x01, 0x19, 0xFA];
        
        await sendToPrinter(commands);
        alert('Cash drawer command sent via Web Serial');
      }
    } catch (error) {
      console.error('Cash drawer test failed:', error);
      alert(`❌ Cash drawer test failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testPrinter = async () => {
    try {
      setIsLoading(true);
      
      if (hardwareMode.type === 'electron') {
        const result = await electronHardwareService.testPrinter();
        
        if (result.success) {
          alert(`✅ Printer test successful!\n${result.message}`);
        } else {
          alert(`❌ Printer test failed:\n${result.error}`);
        }
      } else {
        // Web Serial implementation - create a simple test receipt
        const testCommands = [
          0x1B, 0x40, // Initialize
          ...Array.from(new TextEncoder().encode('=== PRINTER TEST ===')),
          0x0A, 0x0A,
          ...Array.from(new TextEncoder().encode('This is a test print')),
          0x0A,
          ...Array.from(new TextEncoder().encode('from Web Serial API')),
          0x0A, 0x0A,
          0x1D, 0x56, 0x42, 0x00 // Cut
        ];
        
        await sendToPrinter(testCommands);
        alert('Test receipt sent via Web Serial');
      }
    } catch (error) {
      console.error('Printer test failed:', error);
      alert(`❌ Printer test failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testCashDrawerStatus = async () => {
    try {
      setIsLoading(true);
      await electronHardwareService.getDrawerStatus();
    } finally {
      setIsLoading(false);
    }
  };

  const getHardwareStatus = async () => {
    try {
      if (hardwareMode.type === 'electron') {
        const result = await electronHardwareService.getHardwareStatus();
        
        if (result.success && result.status) {
          const status = result.status;
          const statusMessage = `
Hardware Status:
• Initialized: ${status.initialized ? '✅' : '❌'}
• Printer: ${status.printer.connected ? '✅' : '❌'} (${status.printer.type})
• Cash Drawer: ${status.cashDrawer.available ? '✅' : '❌'} (${status.cashDrawer.status})
• Printer Name: ${status.printer.name}
          `.trim();
          
          alert(statusMessage);
        } else {
          alert(`❌ Failed to get hardware status:\n${result.error}`);
        }
      } else {
        const statusMessage = `
Web Hardware Status:
• Web Serial Supported: ${isSupported ? '✅' : '❌'}
• Connected: ${isConnected ? '✅' : '❌'}
• Mode: Web Serial API
        `.trim();
        
        alert(statusMessage);
      }
    } catch (error) {
      console.error('Get hardware status failed:', error);
      alert(`❌ Failed to get hardware status: ${error}`);
    }
  };

  const renderEnvironmentInfo = () => (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-center gap-2 mb-2">
        {hardwareMode.type === 'electron' ? <Laptop className="h-5 w-5 text-blue-600" /> : <Monitor className="h-5 w-5 text-blue-600" />}
        <h3 className="font-semibold text-blue-800">
          {hardwareMode.type === 'electron' ? 'Electron Native Mode' : 'Web Browser Mode'}
        </h3>
      </div>
      <p className="text-blue-700 text-sm">{hardwareMode.status}</p>
      {hardwareMode.type === 'electron' && (
        <div className="mt-2 text-xs text-blue-600">
          • Direct hardware control via Node.js
          • ESC/POS commands sent directly to USB/system printer
          • Cash drawer control with proven working commands
        </div>
      )}
    </div>
  );

  const renderConnectionControls = () => (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Usb className="h-5 w-5" />
        Hardware Connection
      </h2>
      
      {renderEnvironmentInfo()}

      <div className="flex gap-3 flex-wrap">
        {!hardwareMode.initialized ? (
          <AdminActionButton
            type="button"
            variant="primary"
            icon={RefreshCw}
            label={isLoading ? 'Connecting...' : 'Connect Hardware'}
            isLoading={isLoading}
            onClick={connectHardware}
            disabled={isLoading || !hardwareMode.available}
          />
        ) : (
          <>
            <AdminActionButton
              type="button"
              variant="primary"
              icon={CheckCircle}
              label="Hardware Status"
              onClick={getHardwareStatus}
            />

            {hardwareMode.type === 'web' && (
              <button type="button" onClick={disconnectHardware} className={DS2_DANGER_ROW}>
                Disconnect
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );

  const renderQuickTests = () => (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Zap className="h-5 w-5" />
        Quick Hardware Tests
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={testPrinter}
          disabled={!hardwareMode.initialized || isLoading}
          className={DS2_TEST_TILE}
        >
          <Printer className="h-5 w-5 shrink-0 text-gray-800" />
          <div className="text-left">
            <div className="font-medium">Test Printer</div>
            <div className="text-sm font-normal text-neutral-500">Print test receipt</div>
          </div>
        </button>

        <button
          type="button"
          onClick={testCashDrawer}
          disabled={!hardwareMode.initialized || isLoading}
          className={DS2_TEST_TILE}
        >
          <DollarSign className="h-5 w-5 shrink-0 text-gray-800" />
          <div className="text-left">
            <div className="font-medium">Test Cash Drawer</div>
            <div className="text-sm font-normal text-neutral-500">Open cash drawer</div>
          </div>
        </button>

        <button
          type="button"
          onClick={testCashDrawerStatus}
          disabled={hardwareMode.type !== 'electron' || !hardwareMode.initialized || isLoading}
          className={DS2_TEST_TILE}
        >
          <CircleDot className="h-5 w-5 shrink-0 text-gray-800" />
          <div className="text-left">
            <div className="font-medium">Test Drawer State</div>
            <div className="text-sm font-normal text-neutral-500">Print state in terminal</div>
          </div>
        </button>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Settings className="h-5 w-5" />
        Test Settings
      </h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Cash Drawer Command Type
          </label>
          <select
            value={settings.drawerType}
            onChange={(e) => setSettings(prev => ({ ...prev, drawerType: e.target.value as 'standard' | 'alternative' }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="standard">Standard (Pin 0)</option>
            <option value="alternative">Alternative (Pin 1)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Printer Width (characters)
          </label>
          <input
            type="number"
            value={settings.printerWidth}
            onChange={(e) => setSettings(prev => ({ ...prev, printerWidth: parseInt(e.target.value) || 48 }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            min="32"
            max="80"
          />
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={embedded ? 'ds2-visual-scope' : 'ds2-visual-scope min-h-screen bg-gray-50'}
      style={visualStyle}
      data-ds2-neutral={prefs.neutralFamilyId}
    >
      <div className={embedded ? 'max-w-4xl' : `mx-auto max-w-4xl py-6 ${layoutClasses.contentInsetX}`}>
      {!embedded && (
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Hardware Testing</h1>
        <p className="mt-2 text-gray-600">
          Test thermal printer and cash drawer functionality in both web and Electron environments
        </p>
      </div>
      )}

      {renderConnectionControls()}
      {renderQuickTests()}
      {renderSettings()}
      </div>
    </div>
  );
};

const ElectronCashierTesting: React.FC = () => <ElectronTestingPanel embedded={false} />;

export default ElectronCashierTesting;
