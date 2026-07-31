import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Sidebar from '../src/components/Layout/Sidebar';

vi.mock('../src/components/LanguageSwitcher', () => ({
    default: () => <div />,
}));

vi.mock('../src/contexts/DesignSystem2CustomizationContext', () => ({
    useDesignSystem2Customization: () => ({
        visualStyle: {},
        prefs: { neutralFamilyId: 'gray' },
    }),
}));

vi.mock('../src/contexts/SupabaseAuthContext', () => ({
    useSupabaseAuth: () => ({
        employee: { name: 'System Administrator', role: 'admin' },
        principal: null,
        signOut: vi.fn(),
        hasPermission: () => true,
    }),
}));

vi.mock('../src/lib/host', () => ({
    isPwaHost: false,
}));

// Only `useTranslation` is stubbed (so assertions can match on key names). The
// rest of the module stays real: the Sidebar's import graph now reaches
// `src/i18n.ts`, which needs the genuine `initReactI18next` to initialise.
vi.mock('react-i18next', async importOriginal => ({
    ...(await importOriginal<typeof import('react-i18next')>()),
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

describe('Sidebar logout confirmation', () => {
    it('renders outside the transformed sidebar container', () => {
        const { container } = render(
            <MemoryRouter>
                <div className="transform">
                    <Sidebar isCollapsed={false} onToggleCollapse={vi.fn()} />
                </div>
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'common.logout' }));

        const dialog = screen.getByText('sidebar.logoutConfirmTitle').closest('.fixed');
        expect(dialog).toBeInTheDocument();
        expect(dialog?.parentElement).toBe(document.body);
        expect(container).not.toContainElement(dialog);
    });
});
