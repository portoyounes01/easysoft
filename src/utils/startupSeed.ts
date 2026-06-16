import { loadBootstrapData } from './bootstrapLoader';
import { seedDataService } from './seedData';

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

  try {
    result.bootstrapLoaded = await loadBootstrapData();
  } catch (error) {
    console.warn('⚠️ Bootstrap loading failed, continuing startup:', error);
  }

  try {
    const seedResult = await seedDataService.seedLocalFromYaml();
    const localSeedRowCount =
      seedResult.details.employeesCount + seedResult.details.categoriesCount + seedResult.details.productsCount;
    result.localSeedLoaded = seedResult.success && localSeedRowCount > 0;

    if (seedResult.success) {
      console.log('🎉 Local startup seed ready', seedResult.details);
    } else {
      console.warn('⚠️ Local startup seed skipped or failed:', seedResult.message);
    }
  } catch (error) {
    console.warn('⚠️ Local startup seed failed, continuing startup:', error);
  }

  return result;
}
