import { loadBootstrapData } from './bootstrapLoader';
import { seedDataService } from './seedData';
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

  try {
    const seedResult = await seedDataService.seedLocalFromYaml({
      useStartupJson: false,
    });
    const localSeedRowCount =
      seedResult.details.employeesCount + seedResult.details.categoriesCount + seedResult.details.productsCount;
    result.localSeedLoaded = seedResult.success && localSeedRowCount > 0;

    if (result.localSeedLoaded) {
      console.log('🎉 Local startup seed ready', seedResult.details);
    } else if (seedResult.success) {
      console.warn('⚠️ Local startup seed had no rows to load:', seedResult.details);
    } else {
      console.warn('⚠️ Local startup seed skipped or failed:', seedResult.message);
    }
  } catch (error) {
    console.warn('⚠️ Local startup seed failed, continuing startup:', error);
  }

  return result;
}
