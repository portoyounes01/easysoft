import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n';
import { LanguageProvider } from './contexts/LanguageContext';
import { EmployeesProvider } from './contexts/EmployeesContext';
import { ProductsProvider } from './contexts/ProductsContext';

// Import debugging utility to auto-run diagnostics
import './utils/debugDatabase';
// Import test utilities for browser console access
import './utils/testScript';
// Import startup seed loader for offline initialization
import { prepareLocalStartupData } from './utils/startupSeed';
import { isTillHost } from './lib/host';
import { registerPwa } from './pwa';
import { initDeviceHeartbeat } from './services/deviceHeartbeat';

// Initialize app with local seed support
async function initializeApp() {
  // The local Dexie startup seed is a TILL concept (offline-first cache). The PWA (browser)
  // reads from PostgREST and must not write demo data into a manager's browser IndexedDB.
  const startupSeed = isTillHost
    ? await prepareLocalStartupData()
    : { bootstrapLoaded: false, localSeedLoaded: false };

  if (startupSeed.bootstrapLoaded || startupSeed.localSeedLoaded) {
    console.log('🎉 App initialized with local startup data');
  } else {
    console.log('📱 App initialized normally');
  }

  // Register the PWA (browser host only; no-op on the Electron till).
  registerPwa();

  // Till presence heartbeat (Electron + device session only; no-op elsewhere).
  initDeviceHeartbeat();

  // Render the app
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LanguageProvider>
        <EmployeesProvider>
          <ProductsProvider>
            <App />
          </ProductsProvider>
        </EmployeesProvider>
      </LanguageProvider>
    </StrictMode>
  );
}

// Start the app
initializeApp();
