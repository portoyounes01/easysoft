const { safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEY_FILE = 'fiscal-private-key.safe';

function keyPath(app) {
  return path.join(app.getPath('userData'), KEY_FILE);
}

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {import('electron').App} app
 */
function registerFiscalSigningIpc(ipcMain, app) {
  ipcMain.handle('fiscal:has-secure-key', async () => {
    try {
      return fs.existsSync(keyPath(app));
    } catch {
      return false;
    }
  });

  ipcMain.handle('fiscal:store-private-key-pem', async (_event, pem) => {
    try {
      if (typeof pem !== 'string' || !pem.trim()) {
        return { success: false, error: 'PEM vazio.' };
      }
      if (!safeStorage.isEncryptionAvailable()) {
        return { success: false, error: 'Armazenamento seguro indisponível neste sistema.' };
      }
      const encrypted = safeStorage.encryptString(pem.trim());
      fs.writeFileSync(keyPath(app), encrypted);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('fiscal:clear-secure-key', async () => {
    try {
      const p = keyPath(app);
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('fiscal:sign-hash-plaintext', async (_event, plaintext) => {
    try {
      const p = keyPath(app);
      if (!fs.existsSync(p)) {
        return { success: false, error: 'Chave segura não configurada.' };
      }
      const buf = fs.readFileSync(p);
      const pem = safeStorage.decryptString(buf);
      const sign = crypto.createSign('RSA-SHA1');
      sign.update(plaintext, 'utf8');
      const sig = sign.sign(pem);
      return { success: true, hashBase64: sig.toString('base64') };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
}

module.exports = { registerFiscalSigningIpc };
