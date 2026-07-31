#!/usr/bin/env node
/**
 * Button design-language drift gate (2026-07-23).
 *
 * The app's buttons must come from src/components/ui/ (or the dialog-system
 * classes in theme/dialogStyle.ts). This script scans for native <button>
 * elements styled with literal color/gradient utility classes and compares
 * their signatures against the checked-in baseline. New signatures fail CI:
 * that's a hand-written button style — use a ui/ component or, if the design
 * language genuinely lacks the shape, add it deliberately and re-baseline.
 *
 *   node scripts/check-button-drift.mjs           # check (exit 1 on drift)
 *   node scripts/check-button-drift.mjs --update  # rewrite the baseline
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const BASELINE = join(ROOT, 'scripts', 'button-drift-baseline.json');

// Styled = literal className carrying a color-ish utility. Neutral hovers and
// pure layout classes are fine — those are structure, not a design language.
const COLOR_RE = /(?:^|[\s"'`])(?:bg-gradient-|(?:bg|border|text|from|to)-(?:red|green|blue|slate|gray|neutral|zinc|stone|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|orange|amber|yellow|lime|primary|white|black)\b|bg-\[)/;

// Files allowed to define button styles.
const ALLOWED = [
    /^src\/components\/ui\//,
    /^src\/theme\//,
    /^src\/components\/buttonLab/, // the lab replicates styles by design
    /^src\/components\/DialogLab/,
    /^src\/components\/dialogLabPreviews/,
];

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) yield* walk(p);
        else if (/\.tsx$/.test(name)) yield p;
    }
}

// Signature: file + sorted class tokens of the styled button opener.
function extract(file, source) {
    const out = [];
    const rel = relative(ROOT, file);
    if (ALLOWED.some((re) => re.test(rel))) return out;
    // Attribute scan must tolerate `>` inside brace expressions (onClick={() => …});
    // plain [^>]*? would stop at the arrow and miss the className.
    const re = /<button\b(?:[^>{"]|"[^"]*"|\{(?:[^{}]|\{[^{}]*\})*\})*?className=(?:"([^"]*)"|\{`([^`]*)`\})/gs;
    let m;
    while ((m = re.exec(source))) {
        const cls = (m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, ' ');
        if (!COLOR_RE.test(cls)) continue;
        const sig = cls.split(/\s+/).filter(Boolean).sort().join(' ');
        out.push(`${rel} :: ${sig}`);
    }
    return out;
}

const found = new Set();
for (const file of walk(SRC)) {
    for (const sig of extract(file, readFileSync(file, 'utf8'))) found.add(sig);
}

if (process.argv.includes('--update')) {
    writeFileSync(BASELINE, JSON.stringify([...found].sort(), null, 1) + '\n');
    console.log(`baseline updated: ${found.size} known styled-button signatures`);
    process.exit(0);
}

let baseline;
try {
    baseline = new Set(JSON.parse(readFileSync(BASELINE, 'utf8')));
} catch {
    console.error('No baseline found — run: node scripts/check-button-drift.mjs --update');
    process.exit(1);
}

const fresh = [...found].filter((s) => !baseline.has(s));
const healed = [...baseline].filter((s) => !found.has(s));
if (healed.length) console.log(`ℹ ${healed.length} baseline signature(s) no longer present (run --update to shrink the baseline)`);
if (fresh.length) {
    console.error(`✖ ${fresh.length} NEW hand-written button style(s) — use a src/components/ui/ component instead:`);
    for (const s of fresh) console.error('  ' + s);
    process.exit(1);
}
console.log(`✓ no button-style drift (${found.size} known signatures)`);
