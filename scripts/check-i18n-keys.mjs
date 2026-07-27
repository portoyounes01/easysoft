/**
 * Every literal translation key used in src/ must resolve in src/i18n.ts, in all
 * three languages. A key that does not resolve renders as the raw key on screen,
 * which is the exact failure mode this refactor could introduce silently.
 *
  * Usage: npm run check:i18n   (add --changed-only to limit to the working diff)
 */
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const TMP = process.env.TMPDIR ?? '/tmp';

const src = fs.readFileSync(path.join(ROOT, 'src/i18n.ts'), 'utf8');
const objStart = src.indexOf('{', src.indexOf('const resources = {'));
let depth = 0, end = -1, inStr = null, esc = false;
for (let i = objStart; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === inStr) inStr = null; continue; }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '{') depth++; else if (c === '}') { depth--; if (!depth) { end = i; break; } }
}
const out = await build({
    stdin: { contents: `export default ${src.slice(objStart, end + 1)}`, loader: 'ts', resolveDir: ROOT },
    bundle: false, write: false, format: 'esm',
});
const resPath = path.join(TMP, `res-check-${process.hrtime.bigint()}.mjs`);
fs.writeFileSync(resPath, out.outputFiles[0].text);
const res = (await import(resPath)).default;
fs.unlinkSync(resPath);

const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) =>
    (v && typeof v === 'object' && !Array.isArray(v)) ? flat(v, p ? `${p}.${k}` : k) : [p ? `${p}.${k}` : k]);
// A plural key is stored as `key_one` / `key_other`; call sites still write `key`
// and pass `count`. Register the base name too, or those read as unresolved.
const PLURAL = /_(zero|one|two|few|many|other)$/;
const keysFor = lang => {
    const set = new Set(flat(res[lang].translation));
    for (const k of [...set]) if (PLURAL.test(k)) set.add(k.replace(PLURAL, ''));
    return set;
};
const sets = { en: keysFor('en'), pt: keysFor('pt'), es: keysFor('es') };

const changedOnly = process.argv.includes('--changed-only');
const files = changedOnly
    ? execSync('git diff --name-only -- "src/**/*.ts" "src/**/*.tsx"', { cwd: ROOT }).toString().trim().split('\n').filter(Boolean)
    : execSync(`find src -name '*.ts' -o -name '*.tsx'`, { cwd: ROOT }).toString().trim().split('\n');

// t('a.b'), i18n.t("a.b") … plus <Trans i18nKey="a.b">, which resolves the same way
// but would otherwise slip past a call-shaped pattern.
const CALL = /\b(?:i18n\.)?(?:t|rt|tt)\(\s*(['"])([A-Za-z0-9_$]+(?:\.[A-Za-z0-9_$]+)+)\1|\bi18nKey\s*=\s*(?:\{\s*)?(['"])([A-Za-z0-9_$]+(?:\.[A-Za-z0-9_$]+)+)\3/g;

const missing = [];
let checked = 0;
for (const file of files) {
    if (file.endsWith('src/i18n.ts')) continue;
    let text;
    try { text = fs.readFileSync(path.join(ROOT, file), 'utf8'); } catch { continue; }
    for (const m of text.matchAll(CALL)) {
        checked++;
        const key = m[2] ?? m[4];
        const absent = ['en', 'pt', 'es'].filter(l => !sets[l].has(key));
        if (absent.length) {
            const line = text.slice(0, m.index).split('\n').length;
            missing.push({ file, line, key, missingIn: absent });
        }
    }
}

console.log(JSON.stringify({
    scope: changedOnly ? 'changed files' : 'all of src/',
    filesScanned: files.length,
    keyCallsChecked: checked,
    unresolvedKeys: missing.length,
    missing: missing.slice(0, 60),
}, null, 1));
process.exit(missing.length ? 1 : 0);
