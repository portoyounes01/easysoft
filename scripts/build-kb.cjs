#!/usr/bin/env node

/*
  Build the AI assistant's how-to knowledge base (public.kb_documents).

  Chunks the product's user-facing markdown guides by heading and upserts each
  chunk into kb_documents. Dev changelogs / plans / security notes are excluded
  (they are not how-to material and some contain internal detail).

  Env (same as seed/run-seed.cjs): SUPABASE_URL (or VITE_SUPABASE_URL) +
  SUPABASE_SERVICE_ROLE_KEY, loaded from .env and supabase/.env.

  Usage: npm run build:kb
*/

const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { loadEnv } = require('../seed/lib/env.cjs');

const ROOT = process.cwd();

// Owner-facing how-to knowledge base. ASSISTANT_QA.md is authored specifically
// for the assistant (real end-user Q&A, EN/PT), so it's the primary source. The
// repo's other .md files are DEVELOPER docs and were deliberately dropped — they
// polluted answers with technical, non-owner content.
const INCLUDE = [
  'ASSISTANT_QA.md',
  'TUTORIALS.md', // illustrated step-by-step guides (with screenshot URLs)
];

const MAX_CHUNK = 6000; // characters; longer sections are split

function titleFromFile(file, firstH1) {
  if (firstH1) return firstH1;
  return file
    .replace(/\.md$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\bGUIDE\b/i, 'Guide')
    .trim();
}

function splitLong(heading, body) {
  if (body.length <= MAX_CHUNK) return [{ heading, content: body }];
  const parts = [];
  for (let i = 0, n = 1; i < body.length; i += MAX_CHUNK, n += 1) {
    parts.push({
      heading: n === 1 ? heading : `${heading} (part ${n})`,
      content: body.slice(i, i + MAX_CHUNK),
    });
  }
  return parts;
}

function chunkMarkdown(file, raw) {
  const lines = raw.split(/\r?\n/);
  let firstH1 = null;
  const sections = [];
  let heading = null;
  let buf = [];

  const flush = () => {
    const body = buf.join('\n').trim();
    if (body) sections.push({ heading, content: body });
    buf = [];
  };

  for (const line of lines) {
    const m = /^(#{1,3})\s+(.*)$/.exec(line);
    if (m) {
      flush();
      const text = m[2].replace(/#+\s*$/, '').trim();
      if (!firstH1 && m[1] === '#') firstH1 = text;
      heading = text;
    } else {
      buf.push(line);
    }
  }
  flush();

  const title = titleFromFile(file, firstH1);
  const rows = [];
  const seen = new Set();
  for (const s of sections) {
    for (const piece of splitLong(s.heading, s.content)) {
      // kb_documents UNIQUE (source_file, heading); de-dupe repeated headings.
      let h = piece.heading || 'Overview';
      let key = h.toLowerCase();
      let i = 2;
      while (seen.has(key)) { h = `${piece.heading || 'Overview'} (${i++})`; key = h.toLowerCase(); }
      seen.add(key);
      rows.push({ source_file: file, title, heading: h, content: piece.content });
    }
  }
  return rows;
}

async function main() {
  const { supabaseUrl, serviceKey, online } = loadEnv();
  if (!online) {
    console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.');
    console.error('Set them in .env / supabase/.env (same as `npm run seed`).');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const allRows = [];
  for (const file of INCLUDE) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) {
      console.warn(`  skip (not found): ${file}`);
      continue;
    }
    const raw = fs.readFileSync(full, 'utf8');
    if (!raw.trim()) { console.warn(`  skip (empty): ${file}`); continue; }
    const rows = chunkMarkdown(file, raw);
    allRows.push(...rows);
    console.log(`  ${file}: ${rows.length} chunk(s)`);
  }

  if (allRows.length === 0) {
    console.error('No documents to index.');
    process.exit(1);
  }

  // Idempotent rebuild: clear then insert.
  const del = await supabase.from('kb_documents').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (del.error) { console.error('Failed clearing kb_documents:', del.error.message); process.exit(1); }

  for (let i = 0; i < allRows.length; i += 200) {
    const batch = allRows.slice(i, i + 200);
    const { error } = await supabase.from('kb_documents').insert(batch);
    if (error) { console.error('Insert failed:', error.message); process.exit(1); }
  }

  console.log(`\nIndexed ${allRows.length} chunks from ${INCLUDE.length} guides into kb_documents.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
