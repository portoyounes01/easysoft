import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createSign } from 'crypto';
import { buildHashPlaintext, extractQrHashFourChars, WebCryptoRsaSha1Signer } from '../../src/fiscal/signing';

describe('AT RSA-SHA1 fiscal signing', () => {
    it('matches Node crypto.createSign(RSA-SHA1) for the same plaintext', async () => {
        const { privateKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            publicKeyEncoding: { type: 'spki', format: 'pem' }, // required by API
        });

        const plaintext = buildHashPlaintext({
            invoiceDate: '2026-03-30',
            systemEntryDate: '2026-03-30T14:00:00',
            invoiceNo: 'FS CDVF/0001',
            grossTotal: 100.0,
            previousHashBase64: '',
        });

        const nodeSign = createSign('RSA-SHA1');
        nodeSign.update(plaintext, 'utf8');
        nodeSign.end();
        const nodeB64 = nodeSign.sign(privateKey, 'base64');

        const signer = await WebCryptoRsaSha1Signer.fromPkcs8Pem(privateKey);
        const { hashBase64 } = await signer.signHashPlaintext(plaintext);

        expect(hashBase64).toBe(nodeB64);
        expect(extractQrHashFourChars(nodeB64).split('-')).toHaveLength(4);
    });

    it('accepts PKCS#1 PEM (BEGIN RSA PRIVATE KEY) via automatic PKCS#8 wrap', async () => {
        const { privateKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
            publicKeyEncoding: { type: 'spki', format: 'pem' },
        });

        const plaintext = buildHashPlaintext({
            invoiceDate: '2026-03-30',
            systemEntryDate: '2026-03-30T14:00:00',
            invoiceNo: 'FS CDVF/0001',
            grossTotal: 100.0,
            previousHashBase64: '',
        });

        const nodeSign = createSign('RSA-SHA1');
        nodeSign.update(plaintext, 'utf8');
        nodeSign.end();
        const nodeB64 = nodeSign.sign(privateKey, 'base64');

        const signer = await WebCryptoRsaSha1Signer.fromPkcs8Pem(privateKey);
        const { hashBase64 } = await signer.signHashPlaintext(plaintext);

        expect(hashBase64).toBe(nodeB64);
    });

    it('uses previous hash in chain plaintext (same shape as hash-teste-node.js)', () => {
        const prev =
            'dGVzdA==';
        const second = buildHashPlaintext({
            invoiceDate: '2026-03-30',
            systemEntryDate: '2026-03-30T14:05:22',
            invoiceNo: 'FS CDVF/0002',
            grossTotal: 250.5,
            previousHashBase64: prev,
        });
        expect(second.endsWith(`;${prev}`)).toBe(true);
        expect(second).toContain('250.50');
    });

    it('includes negative gross total with two decimals (credit notes)', () => {
        const p = buildHashPlaintext({
            invoiceDate: '2026-04-10',
            systemEntryDate: '2026-04-10T11:00:00',
            invoiceNo: 'NC A/0003',
            grossTotal: -12.3,
            previousHashBase64: 'eA==',
        });
        expect(p).toContain(';-12.30;');
    });
});
