import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import {
    pemExtractBase64Payload,
    pemToArrayBuffer,
    pemPrivateKeyDerFromPem,
    derLikelyPkcs1RsaPrivateKey,
    derContainsRsaOid,
} from '../../src/fiscal/pem';

describe('pemExtractBase64Payload', () => {
    it('joins only base64 lines and skips Proc-Type / DEK-Info', () => {
        const pem = `-----BEGIN RSA PRIVATE KEY-----
Proc-Type: 4,ENCRYPTED
DEK-Info: DES-EDE3-CBC,ABCDEF01

MIIE
-----END RSA PRIVATE KEY-----`;
        expect(() => pemExtractBase64Payload(pem)).toThrow(/Proc-Type|encriptada/i);
    });

    it('decodes PKCS#8 from Node when body has blank lines', () => {
        const { privateKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            publicKeyEncoding: { type: 'spki', format: 'pem' },
        });
        const der = new Uint8Array(pemToArrayBuffer(privateKey));
        expect(der.length).toBeGreaterThan(100);
        expect(derContainsRsaOid(der)).toBe(true);
        expect(derLikelyPkcs1RsaPrivateKey(der)).toBe(false);
    });

    it('detects PKCS#1 RSA DER shape', () => {
        const { privateKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
            publicKeyEncoding: { type: 'spki', format: 'pem' },
        });
        const der = new Uint8Array(pemToArrayBuffer(privateKey));
        expect(derLikelyPkcs1RsaPrivateKey(der)).toBe(true);
        expect(derContainsRsaOid(der)).toBe(false);
    });

    it('pemPrivateKeyDerFromPem picks PKCS#8 block after a dummy PEM block', () => {
        const { privateKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            publicKeyEncoding: { type: 'spki', format: 'pem' },
        });
        const noise = `-----BEGIN FOO-----
YmFy
-----END FOO-----
`;
        const combined = noise + '\n' + privateKey;
        const der = new Uint8Array(pemPrivateKeyDerFromPem(combined, 'pkcs8'));
        expect(derContainsRsaOid(der)).toBe(true);
    });
});
