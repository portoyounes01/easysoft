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
// Import bootstrap loader for offline initialization
import { loadBootstrapData } from './utils/bootstrapLoader';

// Initialize app with bootstrap support
async function initializeApp() {
  try {
    // Attempt to load bootstrap data (for offline initialization)
    const bootstrapLoaded = await loadBootstrapData();
    
    if (bootstrapLoaded) {
      console.log('🎉 App initialized with bootstrap data');
    } else {
      console.log('📱 App initialized normally');
    }
  } catch (error) {
    console.warn('⚠️ Bootstrap loading failed, continuing with normal startup:', error);
  }

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
