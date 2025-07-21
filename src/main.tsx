import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n';
import { LanguageProvider } from './contexts/LanguageContext';
import { EmployeesProvider } from './contexts/EmployeesContext';
import { ProductsProvider } from './contexts/ProductsContext';

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
