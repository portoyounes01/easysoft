#!/usr/bin/env node
/**
 * Validates a SAFT-PT XML file against the official XSD when available.
 * Place SAFTPT1.04_01.xsd under `certification requirements/` (vendor separately due to license).
 *
 * Usage: node scripts/validate-saft-xsd.mjs [path-to.xml]
 *
 * Large real-world sample (restaurant FT batch): `certification requirements/SAFT-517404419-2026-02-01-2026-02-28.xml`
 * Requires `xmllint` (libxml2) on PATH for schema validation.
 */

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const defaultXsd = join(root, 'certification requirements', 'SAFTPT1.04_01.xsd');
const defaultXml = join(root, 'certification requirements', 'exemplo-xml.xml');

const xmlPath = process.argv[2] || defaultXml;
const xsdPath = process.env.SAFT_XSD_PATH || defaultXsd;

if (!existsSync(xmlPath)) {
    console.error('XML not found:', xmlPath);
    process.exit(1);
}

if (!existsSync(xsdPath)) {
    console.warn('XSD not found — skipping validation. Set SAFT_XSD_PATH or add SAFTPT1.04_01.xsd to certification requirements/');
    process.exit(0);
}

const r = spawnSync('xmllint', ['--noout', '--schema', xsdPath, xmlPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
});

if (r.error) {
    console.warn('xmllint not available — install libxml2 (e.g. brew install libxml2) for XSD validation.');
    process.exit(0);
}

if (r.status !== 0) {
    console.error(r.stderr || r.stdout || 'xmllint failed');
    process.exit(r.status ?? 1);
}

console.log('OK:', xmlPath, 'validates against', xsdPath);
