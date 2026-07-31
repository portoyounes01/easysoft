// Issuer identity captured at issuance (D-IM1).
//
// ⚠️ Every export here is SYNCHRONOUS and allocation-only, and must stay that
// way. An `await` inside a Dexie transaction callback silently aborts the
// transaction (same trap the signing step is warned about at
// localDatabase.ts:1370), and `createNonFiscalFallbackAtomic` builds its
// metadata literal inside an already-open rw transaction. This module also
// deliberately imports no database: it is pulled in by localDatabase itself, so
// a localDb import here would close a cycle. Reading the archive back lives in
// `resolveIssuerLogo.ts`, which nothing on the write path imports.

import type { SystemSettings } from '../contexts/SettingsContext';
import type { ReceiptLogo } from '../utils/receiptLogo';
import type { FiscalIssuerSnapshot, LocalReceiptLogoArchiveEntry } from './types';

/**
 * Content key for a prepared logo.
 *
 * Non-cryptographic on purpose: this is a local cache key, never an integrity
 * claim, and it must be synchronous so no write-path function becomes async
 * (Web Crypto digest is not). Dimensions and byte length are part of the key,
 * so a collision needs identical dimensions, identical length AND an identical
 * 32-bit hash among the handful of logos one till will ever hold.
 */
export function logoDigest(logo: ReceiptLogo): string {
    if (memo && memo.bitmap === logo.bitmap) return memo.digest;
    const digest = `${logo.widthDots}x${logo.heightDots}-${logo.bitmap.length}-${fnv1a32(logo.bitmap).toString(16)}`;
    memo = { bitmap: logo.bitmap, digest };
    return digest;
}

// Hashing the base64 costs a pass over ~23 KB; the logo does not change between
// two sales, so one slot is all the cache this ever needs.
let memo: { bitmap: string; digest: string } | null = null;

function fnv1a32(input: string): number {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
}

/** Freeze the receipt header exactly as this device would print it right now. */
export function buildIssuerSnapshot(settings: SystemSettings): FiscalIssuerSnapshot {
    const company = settings.company;
    const logo = company.logo;
    return Object.freeze({
        v: 1,
        name: company.name,
        address: company.address,
        postalCode: company.postalCode,
        city: company.city,
        taxNumber: company.taxNumber,
        // '' rather than undefined throughout: a captured blank must never be
        // distinguishable from an absent one, or a `??` on the read side can
        // reach past it to today's value.
        phone: company.phone?.trim() ?? '',
        email: company.email?.trim() ?? '',
        slogan: company.slogan?.trim() ?? '',
        softwareInfo: company.softwareInfo?.trim() ?? '',
        certificationNumber: company.certificationNumber?.trim() ?? '',
        softwareCertNumber: company.softwareCertNumber?.trim() ?? '',
        counterLabel: settings.receipt.counterLabel ?? '',
        receiptLanguage: settings.receipt.receiptLanguage,
        logo: logo
            ? { widthDots: logo.widthDots, heightDots: logo.heightDots, digest: logoDigest(logo) }
            : null,
    } satisfies FiscalIssuerSnapshot);
}

/** The bitmap the snapshot's digest points at, ready to `put` in the same txn. */
export function logoArchiveEntryFor(settings: SystemSettings): LocalReceiptLogoArchiveEntry | null {
    const logo = settings.company.logo;
    if (!logo) return null;
    return {
        digest: logoDigest(logo),
        widthDots: logo.widthDots,
        heightDots: logo.heightDots,
        bitmap: logo.bitmap,
        created_at: new Date().toISOString(),
    };
}
