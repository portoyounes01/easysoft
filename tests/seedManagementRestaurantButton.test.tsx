import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../src/i18n';

const seedRestaurantDataset = vi.fn(() =>
    Promise.resolve({
        success: true,
        message: 'ok',
        datasetName: "Q'Bella",
        categoriesCount: 12,
        productsCount: 48,
        rawMaterialsCount: 50,
        recipeLinesCount: 200,
        variantOptionsCount: 60,
        modifiersCount: 300,
        unknownMaterials: [],
    })
);

vi.mock('../src/utils/seedRestaurantData', () => ({ seedRestaurantDataset }));

vi.mock('../src/utils/seedData', () => ({
    seedDataService: {
        checkYamlFilesAvailable: vi.fn(() => Promise.resolve({ available: [], missing: [] })),
        seedFromYaml: vi.fn(),
        clearLocalData: vi.fn(),
    },
}));

const refreshProducts = vi.fn(() => Promise.resolve());

vi.mock('../src/contexts/EmployeesContext', () => ({
    useEmployees: () => ({ refreshEmployees: vi.fn(() => Promise.resolve()) }),
}));
vi.mock('../src/contexts/ProductsContext', () => ({
    useProducts: () => ({ refreshData: refreshProducts }),
}));
vi.mock('../src/contexts/SupabaseAuthContext', () => ({
    useSupabaseAuth: () => ({ employee: { id: 'e1' }, hasPermission: () => false }),
}));
vi.mock('../src/contexts/DesignSystem2CustomizationContext', () => ({
    useDesignSystem2Customization: () => ({
        visualStyle: {},
        prefs: { neutralFamilyId: 'slate' },
        layoutClasses: { contentInsetX: '' },
    }),
}));
vi.mock('../src/theme/dialogStyle', () => ({
    dialogButtonClasses: () => null,
    useAppliedDialogStyle: () => null,
}));

const { SeedManagementPanel } = await import('../src/pages/SeedManagement');

describe('SeedManagement restaurant seed button', () => {
    beforeEach(() => {
        seedRestaurantDataset.mockClear();
        refreshProducts.mockClear();
    });

    it('offers the ready-made restaurant catalogue alongside the YAML seeder', async () => {
        render(<SeedManagementPanel embedded />);

        expect(await screen.findByTestId('restaurant-seed-card')).toBeInTheDocument();
        expect(screen.getByTestId('seed-restaurant-button')).toBeInTheDocument();
        // The restaurant it seeds is named on the card, not hidden in code.
        expect(screen.getByText(/Q'Bella/)).toBeInTheDocument();
    });

    it('seeds the catalogue and reports what was written', async () => {
        const user = userEvent.setup();
        render(<SeedManagementPanel embedded />);

        await user.click(await screen.findByTestId('seed-restaurant-button'));

        await waitFor(() => expect(seedRestaurantDataset).toHaveBeenCalledTimes(1));
        expect(refreshProducts).toHaveBeenCalled();

        expect(await screen.findByText(/48 products seeded/)).toBeInTheDocument();
        expect(screen.getByText(/50 inventory raw materials seeded/)).toBeInTheDocument();
        expect(screen.getByText(/200 recipe ingredient lines seeded/)).toBeInTheDocument();
        expect(screen.getByText(/300 modifiers seeded/)).toBeInTheDocument();
    });

    it('surfaces a failure instead of reporting success', async () => {
        seedRestaurantDataset.mockRejectedValueOnce(new Error('boom'));
        const user = userEvent.setup();
        render(<SeedManagementPanel embedded />);

        await user.click(await screen.findByTestId('seed-restaurant-button'));

        expect(await screen.findByText(/boom/)).toBeInTheDocument();
    });
});
