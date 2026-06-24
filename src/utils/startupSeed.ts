import { loadBootstrapData } from './bootstrapLoader';
import { isStartupSeedDisabled } from './startupSeedPreference';

export interface StartupSeedResult {
  bootstrapLoaded: boolean;
  localSeedLoaded: boolean;
}

/**
 * Prepares offline-first demo data before React providers load.
 * This keeps the login employee grid populated on first paint without touching Supabase.
 */
export async function prepareLocalStartupData(): Promise<StartupSeedResult> {
  const result: StartupSeedResult = {
    bootstrapLoaded: false,
    localSeedLoaded: false,
  };

  if (isStartupSeedDisabled()) {
    console.info('Startup seed is disabled after an explicit data clear.');
    return result;
  }

  try {
    result.bootstrapLoaded = await loadBootstrapData();
  } catch (error) {
    console.warn('⚠️ Bootstrap loading failed, continuing startup:', error);
  }

  // Local YAML demo seeding stays disabled on startup.
  // We still bootstrap employee accounts on fresh installs/incognito, but we
  // do not auto-populate the rest of the demo dataset before the app renders.

  return result;
}
