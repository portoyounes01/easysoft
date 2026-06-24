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
