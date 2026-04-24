import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, test, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import Products from '../src/pages/Products';
import Categories from '../src/pages/Categories';
import { ProductsProvider } from '../src/contexts/ProductsContext';
import { LanguageProvider } from '../src/contexts/LanguageContext';
import i18n from '../src/i18n';

vi.mock('../src/components/ProductForm', () => ({
    default: () => null,
}));

vi.mock('../src/components/CategoryForm', () => ({
    default: () => null,
}));

const renderWithProviders = async (ui: React.ReactElement, lang: string) => {
    localStorage.setItem('language', lang);
    await i18n.changeLanguage(lang);
    return render(
        <LanguageProvider>
            <ProductsProvider>
                {ui}
            </ProductsProvider>
        </LanguageProvider>
    );
};

describe('Products and Categories i18n', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
    });

    test('Products page shows translated headers in EN', async () => {
        await renderWithProviders(<Products />, 'en');
        expect(await screen.findByText(/^Products$/)).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Search product name...')).toBeInTheDocument();
        expect(screen.getAllByText('Sort').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Filter').length).toBeGreaterThanOrEqual(1);
    });

    test('Products page shows translated headers in PT', async () => {
        await renderWithProviders(<Products />, 'pt');
        expect(await screen.findByText(/^Produtos$/)).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Pesquisar nome do produto...')).toBeInTheDocument();
        expect(screen.getAllByText('Ordenar').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Filtrar').length).toBeGreaterThanOrEqual(1);
    });

    test('Categories page shows translated headers in EN', async () => {
        await renderWithProviders(<Categories />, 'en');
        expect(await screen.findByText('Category Management')).toBeInTheDocument();
        expect(screen.getAllByText('Add Category').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/^Categories$/)).toBeInTheDocument();
    });

    test('Categories page shows translated headers in PT', async () => {
        await renderWithProviders(<Categories />, 'pt');
        expect(await screen.findByText('Gestão de Categorias')).toBeInTheDocument();
        expect(screen.getAllByText('Adicionar Categoria').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/^Categorias$/)).toBeInTheDocument();
    });
});


