const STARTUP_SEED_DISABLED_KEY = 'pos_startup_seed_disabled';

export function isStartupSeedDisabled(): boolean {
  try {
    return localStorage.getItem(STARTUP_SEED_DISABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setStartupSeedDisabled(disabled: boolean): void {
  try {
    if (disabled) {
      localStorage.setItem(STARTUP_SEED_DISABLED_KEY, 'true');
      return;
    }

    localStorage.removeItem(STARTUP_SEED_DISABLED_KEY);
  } catch {
    // Storage availability must not block explicit seed/reset operations.
  }
}
