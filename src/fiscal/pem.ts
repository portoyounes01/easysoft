/** RSA encryption OID (1.2.840.113549.1.1.1) inside PKCS#8 / AlgorithmIdentifier */
const RSA_OID_BYTES = new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]);

/** EC / id-ecPublicKey OID prefix often seen when PKCS#8 is not RSA */
const EC_OID_BYTES = new Uint8Array([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);

/**
 * Extract base64 payload between PEM headers, ignoring OpenSSL "Proc-Type" / "DEK-Info" lines
 * and any non-base64 lines (so `atob` is not fed colons or labels).
 */
export function pemExtractBase64Payload(pem: string): string {
    const normalized = pem.trim().replace(/^\uFEFF/, '');
    const block = normalized.match(
        /-----BEGIN ([^-]+)-----\s*\r?\n?([\s\S]*?)\r?\n?-----END \1-----/i
    );
    if (!block) {
        return normalized
            .replace(/-----BEGIN [^-]+-----/g, '')
            .replace(/-----END [^-]+-----/g, '')
            .replace(/\s/g, '');
    }
    const body = block[2];
    if (/Proc-Type:\s*4,\s*ENCRYPTED/i.test(body) || /\bDEK-Info:/i.test(body)) {
        throw new Error(
            'Chave PEM encriptada (OpenSSL "Proc-Type: 4,ENCRYPTED" / DEK-Info). ' +
                'Exporte sem password: openssl rsa -in key.pem -out key-clear.pem (ou pkcs8 -nocrypt) ou use Electron.'
        );
    }
    const lines = body.split(/\r?\n/);
    const parts: string[] = [];
    for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        if (t.includes(':')) continue;
        if (!/^[A-Za-z0-9+/]+=*$/.test(t)) continue;
        parts.push(t);
    }
    if (parts.length === 0) {
        throw new Error('PEM sem linhas base64 válidas entre os marcadores BEGIN/END.');
    }
    return parts.join('');
}

export type RsaPrivatePemKind = 'pkcs8' | 'pkcs1-rsa' | 'encrypted-pkcs8' | 'unknown';

/** Detect PEM envelope for RSA private keys (Web Crypto import expects PKCS#8 DER). */
export function detectRsaPrivateKeyPemKind(pem: string): RsaPrivatePemKind {
    const p = pem.trim().replace(/^\uFEFF/, '');
    if (/-----BEGIN\s+ENCRYPTED\s+PRIVATE\s+KEY-----/i.test(p)) return 'encrypted-pkcs8';
    if (/-----BEGIN\s+RSA\s+PRIVATE\s+KEY-----/i.test(p)) return 'pkcs1-rsa';
    if (/-----BEGIN\s+PRIVATE\s+KEY-----/i.test(p)) return 'pkcs8';
    return 'unknown';
}

/**
 * Decode a **private** PEM block, preferring PKCS#8 / PKCS#1 RSA when the paste contains
 * multiple PEM blocks (e.g. certificate + key).
 */
export function pemPrivateKeyDerFromPem(pem: string, kind: RsaPrivatePemKind): ArrayBuffer {
    const normalized = pem.trim().replace(/^\uFEFF/, '');
    let blockPem = normalized;
    if (kind === 'pkcs1-rsa') {
        const m = normalized.match(
            /-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----/i
        );
        if (m) blockPem = m[0];
    } else if (kind === 'pkcs8') {
        const m = normalized.match(
            /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/i
        );
        if (m) blockPem = m[0];
    } else {
        const pk8 = normalized.match(
            /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/i
        );
        const rsa = normalized.match(
            /-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----/i
        );
        if (pk8) blockPem = pk8[0];
        else if (rsa) blockPem = rsa[0];
    }
    return pemToArrayBuffer(blockPem);
}

/**
 * Decode PEM (PKCS#8 private, PKCS#1 RSA private, or SPKI public) to raw DER bytes.
 */
export function pemToArrayBuffer(pem: string): ArrayBuffer {
    const b64 = pemExtractBase64Payload(pem);
    let binary: string;
    try {
        binary = atob(b64);
    } catch {
        throw new Error('PEM base64 inválido (caracteres ilegais ou corpo truncado).');
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

/** True if DER appears to contain the rsaEncryption OID (PKCS#8 RSA or SPKI RSA). */
export function derContainsRsaOid(der: Uint8Array): boolean {
    return indexOfSub(der, RSA_OID_BYTES) >= 0;
}

/** True if DER appears to be PKCS#8 for EC (not usable for AT RSA-SHA1). */
export function derContainsEcPrivateOid(der: Uint8Array): boolean {
    return indexOfSub(der, EC_OID_BYTES) >= 0;
}

function indexOfSub(haystack: Uint8Array, needle: Uint8Array): number {
    outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
        for (let j = 0; j < needle.length; j++) {
            if (haystack[i + j] !== needle[j]) continue outer;
        }
        return i;
    }
    return -1;
}

/**
 * Heuristic: PKCS#1 RSAPrivateKey is SEQUENCE { version INTEGER, modulus INTEGER, ... }.
 * PKCS#8 is SEQUENCE { version INTEGER, AlgorithmIdentifier SEQUENCE, ... } → next tag is 0x30 not 0x02.
 */
export function derLikelyPkcs1RsaPrivateKey(der: Uint8Array): boolean {
    if (der.length < 12 || der[0] !== 0x30) return false;
    let i = 1;
    if (der[i] < 0x80) {
        i += 1;
    } else {
        const nb = der[i] & 0x7f;
        if (nb === 0 || nb > 3 || i + nb >= der.length) return false;
        i += 1;
        i += nb;
    }
    const innerStart = i;
    if (innerStart >= der.length || der[innerStart] !== 0x02) return false;
    i = innerStart + 1;
    if (i >= der.length) return false;
    const vlen = der[i];
    if (vlen >= 0x80) return false;
    i += 1 + vlen;
    if (i >= der.length) return false;
    return der[i] === 0x02;
}

function encodeDerLength(len: number): Uint8Array {
    if (len < 0x80) return new Uint8Array([len]);
    if (len <= 0xff) return new Uint8Array([0x81, len]);
    if (len <= 0xffff) return new Uint8Array([0x82, (len >> 8) & 0xff, len & 0xff]);
    throw new Error('DER length overflow');
}

function concatParts(...parts: Uint8Array[]): Uint8Array {
    const n = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) {
        out.set(p, o);
        o += p.length;
    }
    return out;
}

function derOctetString(content: Uint8Array): Uint8Array {
    const lenEnc = encodeDerLength(content.length);
    const out = new Uint8Array(1 + lenEnc.length + content.length);
    out[0] = 0x04;
    out.set(lenEnc, 1);
    out.set(content, 1 + lenEnc.length);
    return out;
}

function derSequence(...children: Uint8Array[]): Uint8Array {
    const body = concatParts(...children);
    const lenEnc = encodeDerLength(body.length);
    const out = new Uint8Array(1 + lenEnc.length + body.length);
    out[0] = 0x30;
    out.set(lenEnc, 1);
    out.set(body, 1 + lenEnc.length);
    return out;
}

/** rsaEncryption OID 1.2.840.113549.1.1.1 + NULL (RFC 5208 / PKCS#8). */
const RSA_PRIVATE_KEY_ALGORITHM_IDENTIFIER = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
]);

const PKCS8_VERSION_ZERO = new Uint8Array([0x02, 0x01, 0x00]);

/**
 * Wrap PKCS#1 RSAPrivateKey DER (from "BEGIN RSA PRIVATE KEY") into PKCS#8 PrivateKeyInfo
 * so `crypto.subtle.importKey('pkcs8', ...)` accepts it.
 */
export function wrapPkcs1RsaPrivateKeyDerToPkcs8(pkcs1Der: Uint8Array): ArrayBuffer {
    const privateKeyOctetString = derOctetString(pkcs1Der);
    const privateKeyInfo = derSequence(PKCS8_VERSION_ZERO, RSA_PRIVATE_KEY_ALGORITHM_IDENTIFIER, privateKeyOctetString);
    return privateKeyInfo.buffer;
}
