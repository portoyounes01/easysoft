import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBootstrapData } from '../src/utils/bootstrapLoader';
import { prepareLocalStartupData } from '../src/utils/startupSeed';
import { setStartupSeedDisabled } from '../src/utils/startupSeedPreference';

vi.mock('../src/utils/bootstrapLoader', () => ({
  loadBootstrapData: vi.fn(),
}));

const loadBootstrapDataMock = vi.mocked(loadBootstrapData);

describe('prepareLocalStartupData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    loadBootstrapDataMock.mockResolvedValue(true);
  });

  it('skips bootstrap loading after an explicit clear', async () => {
    setStartupSeedDisabled(true);

    await expect(prepareLocalStartupData()).resolves.toEqual({
      bootstrapLoaded: false,
      localSeedLoaded: false,
    });
    expect(loadBootstrapDataMock).not.toHaveBeenCalled();
  });

  it('loads bootstrap employees on fresh startup', async () => {
    setStartupSeedDisabled(false);

    await expect(prepareLocalStartupData()).resolves.toEqual({
      bootstrapLoaded: true,
      localSeedLoaded: false,
    });
    expect(loadBootstrapDataMock).toHaveBeenCalledTimes(1);
  });
});
