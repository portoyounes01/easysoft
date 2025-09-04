import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, test, expect } from 'vitest';
import '@testing-library/jest-dom';
import Products from '../src/pages/Products';
import Categories from '../src/pages/Categories';
import { ProductsProvider } from '../src/contexts/ProductsContext';
import { LanguageProvider } from '../src/contexts/LanguageContext';

const renderWithProviders = (ui: React.ReactElement, lang: string) => {
    localStorage.setItem('language', lang);
    return render(
        <LanguageProvider>
            <ProductsProvider>
                {ui}
            </ProductsProvider>
        </LanguageProvider>
    );
};

describe('Products and Categories i18n', () => {
    test('Products page shows translated headers in EN', async () => {
        renderWithProviders(<Products />, 'en');
        expect(await screen.findByText('Products')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Search product name...')).toBeInTheDocument();
        expect(screen.getByText('Sort')).toBeInTheDocument();
        expect(screen.getByText('Filter')).toBeInTheDocument();
    });

    test('Products page shows translated headers in PT', async () => {
        renderWithProviders(<Products />, 'pt');
        expect(await screen.findByText('Produtos')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Pesquisar nome do produto...')).toBeInTheDocument();
        expect(screen.getByText('Ordenar')).toBeInTheDocument();
        expect(screen.getByText('Filtrar')).toBeInTheDocument();
    });

    test('Categories page shows translated headers in EN', async () => {
        renderWithProviders(<Categories />, 'en');
        expect(await screen.findByText('Category Management')).toBeInTheDocument();
        expect(screen.getByText('Add Category')).toBeInTheDocument();
        expect(screen.getByText('Categories')).toBeInTheDocument();
    });

    test('Categories page shows translated headers in PT', async () => {
        renderWithProviders(<Categories />, 'pt');
        expect(await screen.findByText('Gestão de Categorias')).toBeInTheDocument();
        expect(screen.getByText('Adicionar Categoria')).toBeInTheDocument();
        expect(screen.getByText('Categorias')).toBeInTheDocument();
    });
});


