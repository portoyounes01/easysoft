// Read side of the issuer logo archive (D-IM1).
//
// Kept out of `issuerSnapshot.ts` on purpose: that module is imported BY
// localDatabase, and this one imports localDb. Splitting them is what keeps the
// graph acyclic — nothing on the write path pulls this in.

import { localDb } from '../lib/localDatabase';
import { logoDigest } from './issuerSnapshot';
import type { ReceiptLogo } from '../utils/receiptLogo';
import type { FiscalIssuerSnapshot } from './types';

/**
 * The logo this document was issued with, or nothing.
 *
 * The one rule: a reprint prints the original logo or NO logo. It never falls
 * back to today's, because the case this exists for is precisely the owner
 * having changed it.
 */
export async function resolveIssuerLogo(
    ref: FiscalIssuerSnapshot['logo'],
    liveLogo: ReceiptLogo | undefined
): Promise<ReceiptLogo | undefined> {
    if (ref === null) return undefined;

    const archived = await localDb.receiptLogoArchive.get(ref.digest);
    // Dimensions are cross-checked, not trusted: it costs nothing and covers
    // both a digest collision and a half-written row.
    if (
        archived &&
        archived.bitmap &&
        archived.widthDots === ref.widthDots &&
        archived.heightDots === ref.heightDots
    ) {
        return {
            widthDots: archived.widthDots,
            heightDots: archived.heightDots,
            bitmap: archived.bitmap,
        };
    }

    if (liveLogo && logoDigest(liveLogo) === ref.digest) return liveLogo;

    return undefined;
}
