// In-UI side of the Stage-3 min-shell-version handshake (update-policy §8).
//
// The boot gate already refuses handoff when the shell is too old, but the gate
// lives in the installer — an OLD installer has no gate (or an old one). This
// runtime check is the second, UI-owned layer: a network-served UI must never
// silently drive an incompatible shell (P1), whichever of the two layers is
// missing. Browser hosts (the manager PWA) have no shell and are never blocked.
import requirements from '../shell-requirements.json';
import { isTillHost } from './host';

export const MIN_SHELL_VERSION: string = requirements.min_shell_version;
export const MIN_HARDWARE_API_VERSION: number = requirements.min_hardware_api_version;

// Dotted-numeric comparison ('1.2.10' > '1.2.9'); tolerant of a leading 'v'.
// Mirrors electron/shellContract.js (CJS ↔ ESM keeps them separate files).
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/i, '')
      .split('.')
      .map((part) => parseInt(part, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const length = Math.max(pa.length, pb.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export interface ShellCompatibility {
  ok: boolean;
  installedVersion: string;
  installedHardwareApiVersion: number;
  reason?: string;
}

export function checkShellCompatibility(): ShellCompatibility {
  if (!isTillHost) {
    return { ok: true, installedVersion: 'browser', installedHardwareApiVersion: 0 };
  }

  // A shell that predates the contract exposes no `shell` key — treat it as
  // 0.0.0 (fail closed: it must be updated before this UI will drive it).
  const shell = window.electronAPI?.shell;
  const installedVersion = shell?.version ?? '0.0.0';
  const installedHardwareApiVersion = shell?.hardwareApiVersion ?? 0;

  if (compareVersions(installedVersion, MIN_SHELL_VERSION) < 0) {
    return {
      ok: false,
      installedVersion,
      installedHardwareApiVersion,
      reason: `installed shell ${installedVersion} < required ${MIN_SHELL_VERSION}`,
    };
  }
  if (installedHardwareApiVersion < MIN_HARDWARE_API_VERSION) {
    return {
      ok: false,
      installedVersion,
      installedHardwareApiVersion,
      reason: `installed hardware API v${installedHardwareApiVersion} < required v${MIN_HARDWARE_API_VERSION}`,
    };
  }
  return { ok: true, installedVersion, installedHardwareApiVersion };
}
