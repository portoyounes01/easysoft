import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom';
import Customers from '../src/pages/Customers';
import { LanguageProvider } from '../src/contexts/LanguageContext';
import { DesignSystem2CustomizationProvider } from '../src/contexts/DesignSystem2CustomizationContext';
import i18n from '../src/i18n';

vi.mock('../src/components/CustomerForm', () => ({
  default: () => null,
}));

vi.mock('../src/lib/localDatabase', () => ({
  initializeLocalDatabase: vi.fn(() => Promise.resolve()),
  customerLocalService: {
    getAllCustomers: vi.fn(() => Promise.resolve([])),
    deleteCustomer: vi.fn(() => Promise.resolve()),
    updateCustomer: vi.fn(() => Promise.resolve()),
    createCustomer: vi.fn(() => Promise.resolve('')),
  },
  transactionLocalService: {
    getLatestPurchaseDatesByCustomer: vi.fn(() => Promise.resolve({})),
  },
}));

const renderCustomers = async (lang: string) => {
  localStorage.setItem('language', lang);
  await i18n.changeLanguage(lang);
  return render(
    <LanguageProvider>
      <DesignSystem2CustomizationProvider>
        <Customers />
      </DesignSystem2CustomizationProvider>
    </LanguageProvider>
  );
};

describe('Customers page', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  test('shows translated title and toolbar in EN', async () => {
    await renderCustomers('en');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Customers');
    expect(
      screen.getByPlaceholderText('Search name, tax ID, email, phone…')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add customer/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Points' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Enrolled' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Last purchase' })).toBeInTheDocument();
  });

  test('shows translated title and toolbar in PT', async () => {
    await renderCustomers('pt');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Clientes');
    expect(
      screen.getByPlaceholderText('Pesquisar nome, NIF, email, telefone…')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /adicionar cliente/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Pontos' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Adesão' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Última compra' })).toBeInTheDocument();
  });
});
