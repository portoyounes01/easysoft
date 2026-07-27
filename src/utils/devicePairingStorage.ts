import i18n from '../i18n';
import { mirrorToShell } from '../lib/shellDeviceStore';

export interface DevicePairingScope {
    tenantId: string;
    storeId: string;
    deviceId: string;
    pairedAt: string;
}

const DEVICE_PAIRING_SCOPE_KEY = 'pos_device_pairing_scope';
// Control-plane seed ids are UUID-shaped but intentionally use all-zero
// version/variant segments, so validate shape rather than RFC version bits.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const readDevicePairingScope = (): DevicePairingScope | null => {
    try {
        const raw = localStorage.getItem(DEVICE_PAIRING_SCOPE_KEY);
        if (!raw) return null;
        const value = JSON.parse(raw) as Partial<DevicePairingScope>;
        if (!UUID_PATTERN.test(value.tenantId ?? '') ||
            !UUID_PATTERN.test(value.storeId ?? '') ||
            !UUID_PATTERN.test(value.deviceId ?? '')) {
            return null;
        }
        return {
            tenantId: value.tenantId as string,
            storeId: value.storeId as string,
            deviceId: value.deviceId as string,
            pairedAt: typeof value.pairedAt === 'string' ? value.pairedAt : new Date(0).toISOString(),
        };
    } catch {
        return null;
    }
};

export const saveDevicePairingScope = (scope: DevicePairingScope): void => {
    if (!UUID_PATTERN.test(scope.tenantId) ||
        !UUID_PATTERN.test(scope.storeId) ||
        !UUID_PATTERN.test(scope.deviceId)) {
        throw new Error(i18n.t('devicePairing.errors.invalidScope'));
    }
    const serialized = JSON.stringify(scope);
    localStorage.setItem(DEVICE_PAIRING_SCOPE_KEY, serialized);
    // Device store write-through: pairing survives renderer_source origin flips.
    mirrorToShell(DEVICE_PAIRING_SCOPE_KEY, serialized);
};

export const hasDevicePairingScope = (): boolean => readDevicePairingScope() !== null;
