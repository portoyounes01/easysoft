import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n';
import { LanguageProvider } from './contexts/LanguageContext';
import { EmployeesProvider } from './contexts/EmployeesContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <EmployeesProvider>
        <App />
      </EmployeesProvider>
    </LanguageProvider>
  </StrictMode>
);
