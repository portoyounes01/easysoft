/**
 * Country profile — single source of truth for every PT vs ES difference.
 *
 * The app is single-country-per-install: one POS operates in exactly one country,
 * chosen in Settings (`settings.operatingCountry`). Rather than scatter `country === 'PT'`
 * checks across the codebase, every country-varying value lives here and is read either by
 * passing the country explicitly or via the module-level "active country" (mirrors how i18n
 * keeps a global current language). `setActiveCountry()` is called from SettingsContext when
 * settings load/change, so pure helpers (formatters, validators) can resolve the profile
 * without threading `country` through every call site.
 *
 * Differences deliberately centralized here: fiscal issuer set, VAT/IVA rates, tax-id
 * (NIF/CIF/NIE) format + validation, currency/number/date locale, postal-code + phone shape,
 * default UI/receipt language, timezone, and the "final consumer" tax-id placeholder.
 */
import type { FiscalProvider } from '../fiscal/types';
import { IVA_RATES, ES_IVA_RATES } from '../types/supabase';

export type OperatingCountry = 'PT' | 'ES';

export const OPERATING_COUNTRIES: OperatingCountry[] = ['PT', 'ES'];

export interface TaxIdCheck {
    /** Passed structural + checksum validation. */
    valid: boolean;
    /** Detected kind, when recognizable. */
    kind?: 'PT_NIF' | 'ES_DNI' | 'ES_NIE' | 'ES_CIF';
    /** Upper-cased, whitespace/punctuation-stripped value. */
    normalized: string;
}

export interface CountryProfile {
    code: OperatingCountry;
    /** English display name (localize via i18n at the UI if needed). */
    name: string;
    /** BCP-47 locale for Intl number/date/currency formatting. */
    locale: 'pt-PT' | 'es-ES';
    currency: 'EUR';
    currencySymbol: string;
    /** IANA timezone (business day boundaries, reports). */
    timezone: 'Europe/Lisbon' | 'Europe/Madrid';
    /** Default app UI + receipt language for this country (user can still override). */
    defaultLanguage: 'pt' | 'es';

    /** VAT/IVA rate options for product/tax pickers (shared with src/types/supabase). */
    vatRates: typeof IVA_RATES | typeof ES_IVA_RATES;
    /** Standard rate — the sensible default for a new product. */
    defaultVatRate: number;

    /** Fiscal issuers offered in Settings for this country. */
    fiscalIssuers: FiscalProvider[];
    /** Issuer selected by default when the country is chosen. */
    defaultFiscalIssuer: FiscalProvider;
    /** Whether this country uses the PT AT stack (ATCUD, SAF-T, hash chains, AT QR). */
    usesPtAtStack: boolean;

    taxId: {
        /** Full field label, e.g. "NIF" (PT) / "NIF/CIF/NIE" (ES). */
        label: string;
        placeholder: string;
        /** A concrete valid-looking example for help text. */
        example: string;
        /** The magic "final consumer" tax id, if the country uses one (PT: 999999990). */
        finalConsumer?: string;
        validate: (raw: string) => TaxIdCheck;
    };

    postalCode: {
        placeholder: string;
        pattern: RegExp;
        example: string;
    };

    phone: {
        /** International dialing prefix, e.g. "+351". */
        prefix: string;
        placeholder: string;
        example: string;
    };
}

// ---------------------------------------------------------------------------
// Tax-id validators
// ---------------------------------------------------------------------------

const stripId = (raw: string): string => (raw || '').toUpperCase().replace(/[\s.\-/]/g, '');

/** Portugal NIF: 9 digits, mod-11 check digit. */
function validatePtNif(raw: string): TaxIdCheck {
    const v = stripId(raw);
    if (!/^\d{9}$/.test(v)) return { valid: false, normalized: v };
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += Number(v[i]) * (9 - i);
    let check = 11 - (sum % 11);
    if (check >= 10) check = 0;
    return { valid: check === Number(v[8]), kind: 'PT_NIF', normalized: v };
}

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

/** Spain DNI/NIF (person): 8 digits + control letter. */
function validateEsDni(v: string): boolean {
    if (!/^\d{8}[A-Z]$/.test(v)) return false;
    return DNI_LETTERS[Number(v.slice(0, 8)) % 23] === v[8];
}

/** Spain NIE (foreign resident): X/Y/Z + 7 digits + control letter. */
function validateEsNie(v: string): boolean {
    if (!/^[XYZ]\d{7}[A-Z]$/.test(v)) return false;
    const prefix = { X: '0', Y: '1', Z: '2' }[v[0] as 'X' | 'Y' | 'Z'];
    return DNI_LETTERS[Number(prefix + v.slice(1, 8)) % 23] === v[8];
}

/** Spain CIF (legal entity): letter + 7 digits + control digit/letter. */
function validateEsCif(v: string): boolean {
    if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) return false;
    const digits = v.slice(1, 8);
    let even = 0;
    let odd = 0;
    for (let i = 0; i < 7; i++) {
        const n = Number(digits[i]);
        if (i % 2 === 0) {
            // odd position (1-based): double then sum digits
            const d = n * 2;
            odd += Math.floor(d / 10) + (d % 10);
        } else {
            even += n;
        }
    }
    const total = even + odd;
    const controlDigit = (10 - (total % 10)) % 10;
    const controlLetter = 'JABCDEFGHI'[controlDigit];
    const provided = v[8];
    // First letter determines whether control is a digit or a letter; permissively accept
    // whichever matches (both are unambiguous per the mod-10 result).
    return provided === String(controlDigit) || provided === controlLetter;
}

/** Spain tax id: DNI/NIF, NIE, or CIF. */
function validateEsTaxId(raw: string): TaxIdCheck {
    const v = stripId(raw);
    if (v.length !== 9) return { valid: false, normalized: v };
    if (/^[XYZ]/.test(v)) return { valid: validateEsNie(v), kind: 'ES_NIE', normalized: v };
    if (/^\d/.test(v)) return { valid: validateEsDni(v), kind: 'ES_DNI', normalized: v };
    return { valid: validateEsCif(v), kind: 'ES_CIF', normalized: v };
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export const COUNTRY_PROFILES: Record<OperatingCountry, CountryProfile> = {
    PT: {
        code: 'PT',
        name: 'Portugal',
        locale: 'pt-PT',
        currency: 'EUR',
        currencySymbol: '€',
        timezone: 'Europe/Lisbon',
        defaultLanguage: 'pt',
        vatRates: IVA_RATES,
        defaultVatRate: 0.23,
        fiscalIssuers: ['local_at', 'vendus', 'invoicexpress', 'fiskaly'],
        defaultFiscalIssuer: 'local_at',
        usesPtAtStack: true,
        taxId: {
            label: 'NIF',
            placeholder: '999999990',
            example: '123456789',
            finalConsumer: '999999990',
            validate: validatePtNif,
        },
        postalCode: {
            placeholder: '0000-000',
            pattern: /^\d{4}-\d{3}$/,
            example: '1000-001',
        },
        phone: {
            prefix: '+351',
            placeholder: '+351 900 000 000',
            example: '+351 912 345 678',
        },
    },
    ES: {
        code: 'ES',
        name: 'España',
        locale: 'es-ES',
        currency: 'EUR',
        currencySymbol: '€',
        timezone: 'Europe/Madrid',
        defaultLanguage: 'es',
        vatRates: ES_IVA_RATES,
        defaultVatRate: 0.21,
        fiscalIssuers: ['sign_es'],
        defaultFiscalIssuer: 'sign_es',
        usesPtAtStack: false,
        taxId: {
            label: 'NIF/CIF/NIE',
            placeholder: 'B12345678',
            example: 'A58818501', // valid CIF (checksum-correct) for help text
            // Spain simplified invoices ("factura simplificada") need no buyer tax id;
            // there is no PT-style "final consumer" magic value.
            finalConsumer: undefined,
            validate: validateEsTaxId,
        },
        postalCode: {
            placeholder: '00000',
            pattern: /^\d{5}$/,
            example: '28001',
        },
        phone: {
            prefix: '+34',
            placeholder: '+34 600 000 000',
            example: '+34 612 345 678',
        },
    },
};

export function normalizeCountry(raw: string | null | undefined): OperatingCountry {
    return (raw || '').toUpperCase() === 'ES' ? 'ES' : 'PT';
}

export function getCountryProfile(country: string | null | undefined): CountryProfile {
    return COUNTRY_PROFILES[normalizeCountry(country)];
}

// ---------------------------------------------------------------------------
// Active country (module global, set from SettingsContext) + shared formatters
// ---------------------------------------------------------------------------

let _activeCountry: OperatingCountry = 'PT';

/** Set the app-wide active country. Call from SettingsContext when settings change. */
export function setActiveCountry(country: string | null | undefined): void {
    _activeCountry = normalizeCountry(country);
}

export function getActiveCountry(): OperatingCountry {
    return _activeCountry;
}

export function activeProfile(): CountryProfile {
    return COUNTRY_PROFILES[_activeCountry];
}

/** Country-aware currency string (both EUR, but pt-PT vs es-ES grouping differs). */
export function formatCurrency(
    value: number,
    country: string | null | undefined = _activeCountry,
): string {
    const p = getCountryProfile(country);
    return new Intl.NumberFormat(p.locale, { style: 'currency', currency: p.currency }).format(
        Number.isFinite(value) ? value : 0,
    );
}

/** Country-aware plain number formatting. */
export function formatNumber(
    value: number,
    country: string | null | undefined = _activeCountry,
    options?: Intl.NumberFormatOptions,
): string {
    return new Intl.NumberFormat(getCountryProfile(country).locale, options).format(
        Number.isFinite(value) ? value : 0,
    );
}
