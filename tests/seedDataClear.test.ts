import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLocalDatabasePreservingRecovery } from '../src/utils/clearLocalDatabase';
import { seedDataService } from '../src/utils/seedData';

vi.mock('../src/utils/clearLocalDatabase', () => ({
  clearLocalDatabasePreservingRecovery: vi.fn(),
}));

const clearLocalDataMock = vi.mocked(clearLocalDatabasePreservingRecovery);

describe('SeedDataService clearLocalData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    clearLocalDataMock.mockResolvedValue({
      preservedSystemAdmins: 1,
      preservedFiscalIssueAttempts: 2,
      preservedFiscalDocuments: 3,
      preservedFiscalTransactions: 3,
    });
  });

  it('recreates the active local database and disables startup seeding', async () => {
    const result = await seedDataService.clearLocalData();

    expect(clearLocalDataMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('pos_startup_seed_disabled')).toBe('true');
    expect(result).toEqual({
      success: true,
      message: 'The active local IndexedDB database was cleared.',
      preservedSystemAdmins: 1,
      preservedFiscalIssueAttempts: 2,
      preservedFiscalDocuments: 3,
      preservedFiscalTransactions: 3,
    });
  });

  it('does not disable startup seeding when local cleanup fails', async () => {
    clearLocalDataMock.mockRejectedValue(new Error('Local cleanup failed'));

    await expect(seedDataService.clearLocalData()).rejects.toThrow('Local cleanup failed');

    expect(clearLocalDataMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('pos_startup_seed_disabled')).toBeNull();
  });
});
