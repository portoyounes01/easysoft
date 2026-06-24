import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBootstrapData } from '../src/utils/bootstrapLoader';
import { seedDataService } from '../src/utils/seedData';
import { prepareLocalStartupData } from '../src/utils/startupSeed';
import { setStartupSeedDisabled } from '../src/utils/startupSeedPreference';

vi.mock('../src/utils/bootstrapLoader', () => ({
  loadBootstrapData: vi.fn(),
}));

vi.mock('../src/utils/seedData', () => ({
  seedDataService: {
    seedLocalFromYaml: vi.fn(),
  },
}));

const loadBootstrapDataMock = vi.mocked(loadBootstrapData);
const seedLocalFromYamlMock = vi.mocked(seedDataService.seedLocalFromYaml);

describe('prepareLocalStartupData seed gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    loadBootstrapDataMock.mockResolvedValue(true);
    seedLocalFromYamlMock.mockResolvedValue({
      success: true,
      message: 'Seeded',
      details: {
        employeesCount: 1,
        categoriesCount: 1,
        productsCount: 1,
        customersCount: 0,
        transactionsCount: 0,
        cashierTestsCount: 0,
        cashDrawerLogsCount: 0,
      },
    });
  });

  it('skips bootstrap and local startup seeds after an explicit clear', async () => {
    setStartupSeedDisabled(true);

    await expect(prepareLocalStartupData()).resolves.toEqual({
      bootstrapLoaded: false,
      localSeedLoaded: false,
    });
    expect(loadBootstrapDataMock).not.toHaveBeenCalled();
    expect(seedLocalFromYamlMock).not.toHaveBeenCalled();
  });

  it('runs normal startup seeding when the gate is disabled', async () => {
    setStartupSeedDisabled(false);

    await expect(prepareLocalStartupData()).resolves.toEqual({
      bootstrapLoaded: true,
      localSeedLoaded: true,
    });
    expect(loadBootstrapDataMock).toHaveBeenCalledTimes(1);
    expect(seedLocalFromYamlMock).toHaveBeenCalledTimes(1);
  });
});
