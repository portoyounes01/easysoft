import type { SystemSettings } from '../contexts/SettingsContext';
import { isPwaHost } from '../lib/host';
import { getFiscalRsaPrivateKeyPemFromEnv } from '../utils/fiscalEnvDefaults';
import { HASH_FIELD_SEPARATOR, formatGrossTotalForHash } from './spec';
import {
    derContainsEcPrivateOid,
    derContainsRsaOid,
    derLikelyPkcs1RsaPrivateKey,
    detectRsaPrivateKeyPemKind,
    pemPrivateKeyDerFromPem,
    wrapPkcs1RsaPrivateKeyDerToPkcs8,
} from './pem';

export interface HashPlaintextInput {
    invoiceDate: string;
    systemEntryDate: string;
    invoiceNo: string;
    grossTotal: number;
    /** Empty string for first document in series */
    previousHashBase64: string;
}

export function buildHashPlaintext(input: HashPlaintextInput): string {
    const gross = formatGrossTotalForHash(input.grossTotal);
    return [
        input.invoiceDate,
        input.systemEntryDate,
        input.invoiceNo,
        gross,
        input.previousHashBase64
    ].join(HASH_FIELD_SEPARATOR);
}

/**
 * Four characters from Base64 hash at positions 1, 11, 21, 31 (1-based) = indices 0,10,20,30.
 * Concatenated with no separator (receipt: `{chars}-Processado…`; QR field `Q:` uses same value).
 */
export function extractQrHashFourChars(hashBase64: string): string {
    const indices = [0, 10, 20, 30];
    return indices.map(i => hashBase64.charAt(i) || '').join('');
}

export interface FiscalSignResult {
    hashBase64: string;
    hashPlaintext: string;
}

export interface FiscalSigner {
    signHashPlaintext(plaintext: string): Promise<FiscalSignResult>;
}

/**
 * RSA-SHA1 (PKCS#1 v1.5) signer using Web Crypto — matches Node crypto.createSign('RSA-SHA1') for AT hash.
 */
export class WebCryptoRsaSha1Signer implements FiscalSigner {
    private readonly privateKey: CryptoKey;

    constructor(privateKey: CryptoKey) {
        this.privateKey = privateKey;
    }

    async signHashPlaintext(plaintext: string): Promise<FiscalSignResult> {
        const enc = new TextEncoder();
        const data = enc.encode(plaintext);
        const signature = await crypto.subtle.sign(
            'RSASSA-PKCS1-v1_5',
            this.privateKey,
            data
        );
        const hashBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
        return { hashBase64, hashPlaintext: plaintext };
    }

    /**
     * Import RSA private key from PEM: PKCS#8 (`BEGIN PRIVATE KEY`) or PKCS#1 (`BEGIN RSA PRIVATE KEY`).
     * Web Crypto only accepts PKCS#8; PKCS#1 is wrapped automatically.
     */
    static async fromPkcs8Pem(pem: string): Promise<WebCryptoRsaSha1Signer> {
        const normalized = pem.trim().replace(/^\uFEFF/, '');
        const kind = detectRsaPrivateKeyPemKind(normalized);
        if (kind === 'encrypted-pkcs8') {
            throw new Error(
                'Chave privada encriptada (PEM "ENCRYPTED PRIVATE KEY") não é suportada no browser. ' +
                    'Exporte PKCS#8 sem password (openssl pkcs8 -topk8 -nocrypt) ou use assinatura segura no Electron.'
            );
        }

        let keyData: ArrayBuffer;
        if (kind === 'pkcs1-rsa') {
            const pkcs1Der = new Uint8Array(pemPrivateKeyDerFromPem(normalized, kind));
            keyData = wrapPkcs1RsaPrivateKeyDerToPkcs8(pkcs1Der);
        } else {
            keyData = pemPrivateKeyDerFromPem(normalized, kind);
        }

        const importPkcs8 = (buf: ArrayBuffer) =>
            crypto.subtle.importKey(
                'pkcs8',
                buf,
                { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' },
                false,
                ['sign']
            );

        const der = new Uint8Array(keyData);
        if (kind === 'pkcs8') {
            if (derContainsEcPrivateOid(der) && !derContainsRsaOid(der)) {
                throw new Error(
                    'A chave PKCS#8 é EC (elíptica), não RSA. A assinatura AT nesta app usa RSA-SHA1; gere um par RSA e exporte PEM PKCS#8 ou PKCS#1.'
                );
            }
            if (!derContainsRsaOid(der)) {
                throw new Error(
                    'O PEM não parece ser uma chave privada RSA (OID RSA em falta). Verifique se colou a chave privada RSA correta, não a pública nem outro algoritmo.'
                );
            }
        }

        try {
            const privateKey = await importPkcs8(keyData);
            return new WebCryptoRsaSha1Signer(privateKey);
        } catch (e) {
            const isData =
                (e instanceof DOMException && e.name === 'DataError') ||
                (typeof e === 'object' &&
                    e !== null &&
                    'name' in e &&
                    (e as { name: string }).name === 'DataError');
            if (isData && kind === 'unknown' && derLikelyPkcs1RsaPrivateKey(der)) {
                try {
                    const wrapped = wrapPkcs1RsaPrivateKeyDerToPkcs8(der);
                    const privateKey = await importPkcs8(wrapped);
                    return new WebCryptoRsaSha1Signer(privateKey);
                } catch {
                    // fall through
                }
            }
            if (isData && (kind === 'pkcs8' || kind === 'unknown')) {
                throw new Error(
                    'Chave PEM inválida ou corrompida (DataError ao importar PKCS#8). ' +
                        'Confirme: PEM completo (incluindo primeira e última linha), sem texto extra, chave RSA não encriptada. ' +
                        'Se a chave for PKCS#1, use `-----BEGIN RSA PRIVATE KEY-----`. ' +
                        'Se exportar com OpenSSL: `openssl pkcs8 -topk8 -nocrypt -in key.pem -out key.pem`.'
                );
            }
            if (isData) {
                throw new Error(
                    'Falha ao importar chave RSA (DataError). Verifique se o PEM está completo e corresponde a uma chave RSA.'
                );
            }
            throw e;
        }
    }
}

/**
 * Stub for future HSM / backend signing (same plaintext contract).
 */
export class RemoteFiscalSigner implements FiscalSigner {
    async signHashPlaintext(): Promise<FiscalSignResult> {
        throw new Error('Remote fiscal signer is not configured.');
    }
}

/**
 * Electron main-process signer: PEM held in OS keychain-backed `safeStorage`, signing via IPC (no PEM in renderer).
 */
export class ElectronSafeStorageSigner implements FiscalSigner {
    async signHashPlaintext(plaintext: string): Promise<FiscalSignResult> {
        if (typeof window === 'undefined' || !window.electronAPI?.fiscal?.signHashPlaintext) {
            throw new Error('Assinatura fiscal Electron não disponível (IPC em falta).');
        }
        const res = await window.electronAPI.fiscal.signHashPlaintext(plaintext);
        if (!res.success || !res.hashBase64) {
            throw new Error(res.error || 'Falha na assinatura fiscal (Electron).');
        }
        return { hashBase64: res.hashBase64, hashPlaintext: plaintext };
    }
}

export async function createSignerFromSettings(settings: SystemSettings): Promise<FiscalSigner> {
    if (typeof window !== 'undefined' && window.electronAPI?.fiscal?.hasSecureKey) {
        try {
            const has = await window.electronAPI.fiscal.hasSecureKey();
            if (has) {
                return new ElectronSafeStorageSigner();
            }
        } catch {
            // fall through to PEM path (e.g. stale preload)
        }
    }

    // HARD CONSTRAINT (docs/pwa-plan.md §2.4): a browser/PWA host must NEVER be able to
    // sign a fiscal document. The Electron till reaches the secure-key branch above (or,
    // with a stale preload, still falls through to the PEM path — window.electronAPI is
    // present, so isPwaHost is false). Only a true browser build lands here with isPwaHost
    // true — refuse before touching any key material. Server-side, pos-checkout + the
    // sync RPCs also reject non-device sessions; this client guard is defense-in-depth.
    if (isPwaHost) {
        throw new Error('Fiscal signing is unavailable in the browser (PWA host): fiscal issuance is device-only.');
    }

    const pem = getFiscalRsaPrivateKeyPemFromEnv()?.trim() || settings.fiscal?.privateKeyPem?.trim();
    if (!pem) {
        throw new Error(
            'Chave privada fiscal em falta: defina VITE_FISCAL_RSA_PRIVATE_KEY_PEM no ambiente ou guarde a chave no armazenamento seguro (Electron).'
        );
    }
    return WebCryptoRsaSha1Signer.fromPkcs8Pem(pem);
}

export async function verifySignatureRsaSha1(
    plaintext: string,
    signatureBase64: string,
    publicKeyPem: string
): Promise<boolean> {
    const enc = new TextEncoder();
    const data = enc.encode(plaintext);
    const sig = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
    const keyData = pemToArrayBuffer(publicKeyPem);
    const publicKey = await crypto.subtle.importKey(
        'spki',
        keyData,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' },
        false,
        ['verify']
    );
    return crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        publicKey,
        sig,
        data
    );
}
