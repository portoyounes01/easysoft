import { beforeEach, describe, expect, it } from 'vitest';
import { resolveDexieDbName } from '../src/lib/localDatabase';
import {
    hasDevicePairingScope,
    readDevicePairingScope,
    saveDevicePairingScope,
} from '../src/utils/devicePairingStorage';

beforeEach(() => {
    localStorage.clear();
});

describe('device pairing scope', () => {
    it('keeps the pilot tenant/store on the legacy database alias', () => {
        saveDevicePairingScope({
            tenantId: '00000000-0000-0000-0000-000000000001',
            storeId: '00000000-0000-0000-0000-000000000002',
            deviceId: '00000000-0000-4000-8000-000000000003',
            pairedAt: '2026-07-05T00:00:00.000Z',
        });

        expect(resolveDexieDbName()).toBe('POSDatabase');
    });

    it('derives an isolated database name for another tenant/store', () => {
        saveDevicePairingScope({
            tenantId: '10000000-0000-4000-8000-000000000001',
            storeId: '20000000-0000-4000-8000-000000000002',
            deviceId: '30000000-0000-4000-8000-000000000003',
            pairedAt: '2026-07-05T00:00:00.000Z',
        });

        expect(resolveDexieDbName()).toBe(
            'POSDatabase::10000000-0000-4000-8000-000000000001::20000000-0000-4000-8000-000000000002'
        );
        localStorage.setItem('pos_dexie_slot', 'training');
        expect(resolveDexieDbName()).toMatch(/::training$/);
    });

    it('fails closed on malformed stored scope', () => {
        localStorage.setItem('pos_device_pairing_scope', '{"tenantId":"forged"}');
        expect(readDevicePairingScope()).toBeNull();
        expect(hasDevicePairingScope()).toBe(false);
        expect(resolveDexieDbName()).toBe('POSDatabase');
    });
});

