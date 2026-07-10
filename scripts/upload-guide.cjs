#!/usr/bin/env node
/*
  Uploads the captured tutorial screenshots to Supabase Storage (public bucket
  "guide") and generates TUTORIALS.md — illustrated, step-by-step how-to entries
  that get indexed into the assistant's RAG (via build:kb).

  Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (from supabase/.env).
  Input: OUT_DIR with the PNGs + manifest.json (from capture-guide.cjs).
*/
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { loadEnv } = require('../seed/lib/env.cjs');

const OUT = process.env.OUT_DIR || path.join(process.cwd(), 'scratchpad-guide');
const BUCKET = 'guide';

// Bilingual titles for retrieval.
const TITLES = {
  'add-product':  'How do I add a new product? (with pictures) / Como adiciono um produto? (passo a passo)',
  'add-employee': 'How do I add an employee? (with pictures) / Como adiciono um funcionário? (passo a passo)',
  'add-customer': 'How do I add a customer? (with pictures) / Como adiciono um cliente? (passo a passo)',
  'add-category': 'How do I create a category? (with pictures) / Como crio uma categoria? (passo a passo)',
};

async function main() {
  const { supabaseUrl, serviceKey, online } = loadEnv();
  if (!online) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));

  // Portable primary home: the app's own public/ folder, referenced by RELATIVE
  // /guide/<file> URLs so the images work on ANY deployment origin (merge-safe,
  // no dependency on a specific Supabase project). Supabase Storage is kept as an
  // optional mirror.
  const pubDir = path.join(process.cwd(), 'public', 'guide');
  fs.mkdirSync(pubDir, { recursive: true });
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  await supabase.storage.updateBucket(BUCKET, { public: true }).catch(() => {});

  let uploaded = 0;
  for (const w of manifest) {
    for (const s of w.steps) {
      const buf = fs.readFileSync(path.join(OUT, s.file));
      fs.copyFileSync(path.join(OUT, s.file), path.join(pubDir, s.file)); // versioned in the repo
      s.url = `/guide/${s.file}`; // relative -> served from the app origin
      await supabase.storage.from(BUCKET).upload(s.file, buf, { contentType: 'image/png', upsert: true }).catch(() => {}); // mirror
      uploaded++;
    }
    console.log(`  staged ${w.key} (${w.steps.length} images)`);
  }

  // generate TUTORIALS.md
  let out = '# EasySoft POS — Illustrated Step-by-Step Tutorials\n\n' +
    'Picture guides for common tasks. Each step shows exactly where to tap.\n\n';
  for (const w of manifest) {
    out += `## ${TITLES[w.key] || w.title}\n\n`;
    out += `Follow these simple steps:\n\n`;
    w.steps.forEach((s, i) => {
      out += `**Step ${i + 1} — ${s.caption}**\n\n![Step ${i + 1}](${s.url})\n\n`;
    });
    out += `\n`;
  }
  fs.writeFileSync(path.join(process.cwd(), 'TUTORIALS.md'), out);
  console.log(`\nUploaded ${uploaded} images. Wrote TUTORIALS.md (${manifest.length} tutorials).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
