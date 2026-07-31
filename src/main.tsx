// FIRST import on purpose: hydrates localStorage from the shell's device store
// before the Supabase client or any route guard reads identity (§6.2 / D-U4).
import './lib/shellDeviceStore';
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
import { checkShellCompatibility, MIN_SHELL_VERSION } from './lib/shellContract';

// Stage-3 handshake, UI side: a newer UI must never silently drive an
// incompatible shell (update-policy §8). The boot gate already blocks this on
// current installers; this covers OLD installers that predate the gate.
// Framework-free on purpose — it must render even if React/app code would not.
function renderShellTooOld(reason: string) {
  document.body.innerHTML = '';
  const box = document.createElement('div');
  box.style.cssText =
    'min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;'
    + 'background:#0f1420;color:#e8ecf4;font-family:system-ui,sans-serif;text-align:center;padding:24px;gap:12px;';
  const title = document.createElement('h1');
  title.textContent = 'Atualização necessária / Update required';
  const detail = document.createElement('p');
  detail.style.cssText = 'color:#93a0b8;max-width:560px;line-height:1.6;';
  detail.textContent =
    `Este terminal tem uma versão de software instalada demasiado antiga para esta interface (${reason}; `
    + `mínimo: ${MIN_SHELL_VERSION}). Atualize o instalador do terminal e reinicie. `
    + 'This till’s installed shell is too old for this UI — run the till installer update, then restart.';
  box.appendChild(title);
  box.appendChild(detail);
  document.body.appendChild(box);
}

// Initialize app with local seed support
async function initializeApp() {
  const shellCompatibility = checkShellCompatibility();
  if (!shellCompatibility.ok) {
    console.error('Shell too old for this UI:', shellCompatibility.reason);
    renderShellTooOld(shellCompatibility.reason ?? 'unknown shell version');
    return;
  }

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
