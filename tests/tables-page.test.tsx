import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { POSProvider } from '../src/contexts/POSContext';
import Tables from '../src/pages/Tables';

const renderTables = () => render(
    <MemoryRouter>
        <POSProvider>
            <Tables />
        </POSProvider>
    </MemoryRouter>
);

describe('Tables page', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('creates and persists a table through the layout editor', () => {
        const { unmount } = renderTables();

        expect(screen.getByTestId('tables-empty-state')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('tables-edit-layout'));
        fireEvent.click(screen.getByTestId('tables-add-table'));
        fireEvent.change(screen.getByLabelText('Table name'), { target: { value: 'Terrace 1' } });
        fireEvent.change(screen.getByLabelText('Type'), { target: { value: '4' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));
        fireEvent.click(screen.getByRole('button', { name: 'Yes, add' }));

        expect(screen.getByText('Terrace 1 added')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('tables-save-layout'));
        fireEvent.click(screen.getByRole('button', { name: 'Yes, save' }));

        expect(localStorage.getItem('pos.table-layout.v1')).toContain('Terrace 1');

        unmount();
        renderTables();

        expect(screen.getAllByText('Terrace 1').length).toBeGreaterThan(0);
    });
});
