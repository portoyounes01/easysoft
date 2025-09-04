import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, test, expect } from 'vitest';
import '@testing-library/jest-dom';
import Dashboard from '../src/pages/Dashboard';
import { LanguageProvider } from '../src/contexts/LanguageContext';

const renderWithLang = (lang: string) => {
    // Simple wrapper to set initial language via localStorage (LanguageProvider reads it)
    localStorage.setItem('language', lang);
    return render(
        <LanguageProvider>
            <Dashboard />
        </LanguageProvider>
    );
};

describe('Dashboard translations', () => {
    test('renders English labels', async () => {
        renderWithLang('en');

        expect(await screen.findByText('Dashboard')).toBeInTheDocument();
        expect(screen.getByText("Welcome back! Here's what's happening today.")).toBeInTheDocument();
        expect(screen.getByText('Recent Transactions')).toBeInTheDocument();
        expect(screen.getByText('View All')).toBeInTheDocument();
        expect(screen.getByText('Low Stock Alert')).toBeInTheDocument();
        expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    });

    test('renders Portuguese labels', async () => {
        renderWithLang('pt');

        expect(await screen.findByText('Painel')).toBeInTheDocument();
        expect(screen.getByText('Bem-vindo de volta! Aqui está o que está a acontecer hoje.')).toBeInTheDocument();
        expect(screen.getByText('Transações recentes')).toBeInTheDocument();
        expect(screen.getByText('Ver tudo')).toBeInTheDocument();
        expect(screen.getByText('Alerta de stock baixo')).toBeInTheDocument();
        expect(screen.getByText('Ações rápidas')).toBeInTheDocument();
    });
});


