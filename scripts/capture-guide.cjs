#!/usr/bin/env node
/*
  Captures STEP-BY-STEP illustrated tutorials of the running app for the assistant.
  For each workflow (add a product, add an employee, ...) it drives the real app
  click-by-click and, at every micro-step, draws a cursor circle + numbered badge
  + a simple caption on the exact button/field, then screenshots it. Output PNGs +
  manifest.json mapping each workflow to its ordered steps.

  Usage: node scripts/capture-guide.cjs   (dev server must be at http://localhost:5173)
*/
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const BASE = process.env.APP_URL || 'http://localhost:5173';
const OUT = process.env.OUT_DIR || path.join(process.cwd(), 'scratchpad-guide');
const EMAIL = 'owner@easysoft.test';
const PASSWORD = 'EasySoft2026!';

// Draw a click indicator (cursor circle) + numbered badge + caption over a box.
async function annotate(page, box, step, caption) {
  await page.evaluate(({ box, step, caption }) => {
    document.getElementById('__guide__')?.remove();
    const o = document.createElement('div');
    o.id = '__guide__';
    o.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:system-ui,-apple-system,sans-serif;';
    if (box) {
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      // highlight box
      const b = document.createElement('div');
      b.style.cssText = `position:fixed;left:${box.x - 6}px;top:${box.y - 6}px;width:${box.width + 12}px;height:${box.height + 12}px;border:3px solid #ef4444;border-radius:10px;box-shadow:0 0 0 9999px rgba(0,0,0,.10);`;
      o.appendChild(b);
      // cursor circle (a "tap")
      const c = document.createElement('div');
      c.style.cssText = `position:fixed;left:${cx - 27}px;top:${cy - 27}px;width:54px;height:54px;border-radius:50%;background:rgba(37,99,235,.30);border:3px solid #2563eb;box-shadow:0 0 0 6px rgba(37,99,235,.15);`;
      o.appendChild(c);
      // caption bubble (above if room, else below)
      const below = box.y < 110;
      const by = below ? box.y + box.height + 16 : box.y - 52;
      const bub = document.createElement('div');
      bub.style.cssText = `position:fixed;left:${Math.max(8, box.x - 8)}px;top:${by}px;max-width:520px;background:#111827;color:#fff;font-size:15px;font-weight:600;padding:8px 14px 8px 40px;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.28);`;
      bub.textContent = caption;
      // step number badge on the bubble
      const badge = document.createElement('div');
      badge.textContent = String(step);
      badge.style.cssText = 'position:absolute;left:8px;top:50%;transform:translateY(-50%);width:24px;height:24px;border-radius:50%;background:#ef4444;color:#fff;font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center;';
      bub.appendChild(badge);
      o.appendChild(bub);
    } else {
      const bub = document.createElement('div');
      bub.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);background:#111827;color:#fff;font-size:15px;font-weight:600;padding:8px 16px;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.28);';
      bub.textContent = `Step ${step}: ${caption}`;
      o.appendChild(bub);
    }
    document.body.appendChild(o);
  }, { box, step, caption });
}
const clearAnn = (page) => page.evaluate(() => document.getElementById('__guide__')?.remove());

async function boxOf(loc) { try { if (await loc.isVisible()) return await loc.boundingBox(); } catch {} return null; }

async function firstVisible(page, locators) {
  for (const l of locators) {
    const loc = typeof l === 'string' ? page.locator(l) : l;
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i);
      if (await el.isVisible().catch(() => false)) return el;
    }
  }
  return null;
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="text"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForFunction(() => !location.pathname.includes('login'), { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1800);
}

// A create-flow: click menu -> click add -> fill fields -> point at Save.
async function createFlow(page, cfg, results) {
  const steps = [];
  const shot = async (box, caption) => {
    const step = steps.length + 1;
    await annotate(page, box, step, caption);
    const file = `${cfg.key}-${String(step).padStart(2, '0')}.png`;
    await page.screenshot({ path: path.join(OUT, file) });
    await clearAnn(page);
    steps.push({ file, caption });
  };

  // Step: open the section from the menu
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const menu = await firstVisible(page, [
    page.getByRole('link', { name: cfg.menu }),
    page.locator('nav a, aside a').filter({ hasText: cfg.menu }),
  ]);
  await shot(await boxOf(menu) , `On the left menu, tap “${cfg.menuText}”.`);
  if (menu) { await menu.click().catch(() => {}); } else { await page.goto(`${BASE}${cfg.route}`); }
  await page.waitForTimeout(1600);

  // Step: the Add button
  const addBtn = await firstVisible(page, [
    page.getByRole('button', { name: cfg.addRe }),
    page.getByRole('link', { name: cfg.addRe }),
    page.locator('button, a').filter({ hasText: cfg.addRe }),
  ]);
  await shot(await boxOf(addBtn), `Tap the “${cfg.addText}” button to start a new one.`);
  if (addBtn) await addBtn.click().catch(() => {});
  await page.waitForTimeout(1500);

  // Steps: fill the visible fields (inside a dialog if present)
  const scope = (await page.locator('[role="dialog"], .fixed .bg-white, form').first().isVisible().catch(() => false))
    ? page.locator('[role="dialog"], .fixed .bg-white, form').first() : page;
  const fields = scope.locator('input:visible, textarea:visible, select:visible');
  const total = await fields.count().catch(() => 0);
  let shown = 0;
  for (let i = 0; i < total && shown < 5; i++) {
    const f = fields.nth(i);
    const box = await boxOf(f);
    if (!box) continue;
    const info = await f.evaluate((el) => {
      const clean = (s) => (s || '').split('\n')[0].replace(/\([^)]*\)/g, '').replace(/[*:]/g, '')
        .replace(/^\s*(enter|type|choose|select|add)\s+/i, '').replace(/\s+/g, ' ').trim();
      let label = '';
      if (el.labels && el.labels.length) label = el.labels[0].innerText || '';
      if (!label) { // nearest visible label-ish element before the field
        let node = el;
        for (let hop = 0; hop < 4 && node && !label; hop++) {
          let prev = node.previousElementSibling;
          while (prev) { const t = (prev.innerText || '').trim(); if (t && t.length < 40 && /[a-zA-Z]/.test(t)) { label = t; break; } prev = prev.previousElementSibling; }
          node = node.parentElement;
        }
      }
      if (!label) label = el.getAttribute('aria-label') || '';
      // only use placeholder if it's a real label (not a value like "0.00")
      if (!label && el.placeholder && !/^[\d.,€$\s]+$/.test(el.placeholder)) label = el.placeholder;
      return {
        label: clean(label),
        tag: el.tagName.toLowerCase(),
        type: (el.getAttribute('type') || 'text').toLowerCase(),
        locked: !!(el.readOnly || el.disabled),
      };
    });
    if (info.locked || info.type === 'hidden' || info.type === 'checkbox') continue; // skip auto/uneditable
    const lbl = (info.label || '').toLowerCase();
    let caption;
    if (info.tag === 'select') caption = `Tap here and choose the ${lbl || 'option'}.`;
    else if (info.type === 'number' || /price|cost|preç|custo|stock|min|qty|quant/.test(lbl)) caption = `Tap this box and type the ${lbl || 'amount'} (a number).`;
    else caption = `Tap this box and type the ${lbl || 'details'}.`;
    shown++;
    await shot(box, caption);
    try {
      if (info.tag === 'select') { const opts = await f.locator('option').count(); if (opts > 1) await f.selectOption({ index: 1 }); }
      else if (info.type === 'number' || /price|cost|preç|custo|stock|min|qty|quant/.test(lbl)) await f.fill('10');
      else await f.fill(cfg.sample[lbl] || cfg.sampleDefault || 'Test');
    } catch {}
    await page.waitForTimeout(300);
  }

  // Step: point at Save (don't actually save — keep data clean)
  const saveBtn = await firstVisible(page, [
    scope.getByRole('button', { name: /save|guardar|create|criar|add|confirm|submit/i }),
    page.getByRole('button', { name: /save|guardar|create|criar|confirm/i }),
  ]);
  await shot(await boxOf(saveBtn), `Tap “Save” to finish — done! Your new ${cfg.noun} is added.`);

  results.push({ key: cfg.key, title: cfg.title, kb: cfg.kb, steps });
  console.log(`  ${cfg.key}: ${steps.length} steps`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const EXEC = process.env.CHROME_PATH;
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(page);
  console.log('logged in:', page.url());

  const results = [];
  const flows = [
    { key: 'add-product',  menu: /products/i,   menuText: 'Products',   route: '/products',   addRe: /add|new|create|\+/i, addText: 'Add', noun: 'product',  title: 'How to add a product', kb: 'How do I add a new product?', sample: {}, sampleDefault: 'Sample Coffee' },
    { key: 'add-employee', menu: /employees/i,  menuText: 'Employees',  route: '/employees',  addRe: /add|new|create|\+/i, addText: 'Add', noun: 'employee', title: 'How to add an employee', kb: 'How do I add an employee?', sample: {}, sampleDefault: 'Ana Sousa' },
    { key: 'add-customer', menu: /customers/i,  menuText: 'Customers',  route: '/customers',  addRe: /add|new|create|\+/i, addText: 'Add', noun: 'customer', title: 'How to add a customer', kb: 'How do I add a customer?', sample: {}, sampleDefault: 'Cliente Teste' },
    { key: 'add-category', menu: /categories/i, menuText: 'Categories', route: '/categories', addRe: /add|new|create|\+/i, addText: 'Add', noun: 'category', title: 'How to create a category', kb: 'How do I create a category?', sample: {}, sampleDefault: 'Snacks' },
  ];
  for (const f of flows) {
    try { await createFlow(page, f, results); }
    catch (e) { console.log(`  ${f.key} FAILED:`, e.message); }
  }

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(results, null, 2));
  await browser.close();
  console.log(`\nDone. ${results.reduce((a, r) => a + r.steps.length, 0)} step images across ${results.length} tutorials.`);
})().catch((e) => { console.error(e); process.exit(1); });
