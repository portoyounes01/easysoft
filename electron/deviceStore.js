// Shell-owned device identity store (update-policy §6.2 / register D-U4).
//
// Browser storage is per-origin, so flipping renderer_source (app://pos ↔
// https ui_origin) used to strand the device pairing scope and web session
// under the old origin. This store makes THE DEVICE the durable principal:
// a safeStorage-encrypted key/value map in userData that survives origin
// flips, served to the renderer synchronously at preload time so existing
// synchronous readers (route guards) keep working off localStorage after a
// boot-time hydrate.
//
// Hardened surface: in network mode this IPC is reachable by the remote UI,
// so main enforces the same key allowlist the renderer uses, plus size caps —
// identity strings only (pairing scope JSON, Supabase session JSON), never a
// general-purpose database, never the service key.
const { safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const STORE_FILE = 'device-store.safe';
const MAX_KEY_CHARS = 200;
const MAX_VALUE_BYTES = 64 * 1024; // one identity string
const MAX_STORE_BYTES = 256 * 1024; // whole serialized map

// Must mirror src/lib/shellDeviceStore.ts isMirroredKey — the ONLY keys the
// device owns. Anything else (including '__proto__') is rejected here in main.
function isAllowedKey(key) {
  if (typeof key !== 'string' || !key || key.length > MAX_KEY_CHARS) return false;
  return key === 'pos_device_pairing_scope' || (key.startsWith('sb-') && key.includes('-auth-token'));
}

function storePath(app) {
  return path.join(app.getPath('userData'), STORE_FILE);
}

function readAll(app) {
  try {
    const p = storePath(app);
    if (!fs.existsSync(p)) return {};
    const decrypted = safeStorage.decryptString(fs.readFileSync(p));
    const parsed = JSON.parse(decrypted);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const data = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isAllowedKey(key) && typeof value === 'string') data[key] = value;
    }
    return data;
  } catch (error) {
    // Unreadable store (corrupt file, OS keychain reset) → behave as empty;
    // the renderer falls back to per-origin localStorage exactly as before.
    console.error('deviceStore: unreadable, treating as empty:', error.message);
    return {};
  }
}

function writeAll(app, data) {
  if (!safeStorage.isEncryptionAvailable()) {
    console.error('deviceStore: safeStorage unavailable — not persisting');
    return { success: false, error: 'safeStorage unavailable on this system' };
  }
  const serialized = JSON.stringify(data);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_STORE_BYTES) {
    console.error('deviceStore: store would exceed size cap — write refused');
    return { success: false, error: 'device store full' };
  }
  // Atomic replace: a power cut mid-write must not corrupt the whole store.
  const p = storePath(app);
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, safeStorage.encryptString(serialized));
  fs.renameSync(tmp, p);
  return { success: true };
}

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {import('electron').App} app
 */
function registerDeviceStoreIpc(ipcMain, app) {
  // Synchronous snapshot for preload — runs at every document load, before
  // any page script, so the renderer can hydrate localStorage before the
  // Supabase client or route guards ever read it. `exists` gates the
  // renderer's one-time adoption of legacy localStorage identity.
  ipcMain.on('device-store:get-all-sync', (event) => {
    event.returnValue = { exists: fs.existsSync(storePath(app)), data: readAll(app) };
  });

  ipcMain.handle('device-store:set', async (_event, key, value) => {
    try {
      if (!isAllowedKey(key)) {
        console.error('deviceStore: rejected set of disallowed key:', String(key).slice(0, 80));
        return { success: false, error: 'key not allowed' };
      }
      if (typeof value !== 'string') return { success: false, error: 'value must be a string' };
      if (Buffer.byteLength(value, 'utf8') > MAX_VALUE_BYTES) {
        console.error('deviceStore: rejected oversize value for', key);
        return { success: false, error: 'value too large' };
      }
      const data = readAll(app);
      data[key] = value;
      return writeAll(app, data);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('deviceStore: set failed:', message);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('device-store:remove', async (_event, key) => {
    try {
      if (!isAllowedKey(key)) return { success: false, error: 'key not allowed' };
      const data = readAll(app);
      if (key in data) {
        delete data[key];
        return writeAll(app, data);
      }
      return { success: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('deviceStore: remove failed:', message);
      return { success: false, error: message };
    }
  });
}

module.exports = { registerDeviceStoreIpc };
