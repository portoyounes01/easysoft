#!/usr/bin/env node
// Platform (vendor) device-provisioning tool — v1 back-office tooling.
//
// Creates a `devices` row (status='provisioned') + a single-use `device_pairing_codes`
// row, and prints the RAW pairing code for an operator to enter on the till's pairing
// screen. Only the sha256 code_hash is stored server-side; the raw code is shown ONCE.
//
// This is the bootstrap path: the FIRST till of a tenant must be provisioned here
// (there is no paired till yet to generate a code from). An in-app tenant-admin
// console for adding further devices is post-v1 (see docs/multi-tenant-plan.md §6.4).
//
// Usage:
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service_role key> \
//   node scripts/provision-device.mjs --label "Front Counter" [--tenant <uuid>] [--store <uuid>] [--expires-min 15]
//
// Defaults --tenant/--store to the seeded default tenant/store for v1 convenience.

import crypto from 'node:crypto';

const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001';
const DEFAULT_STORE = '00000000-0000-0000-0000-000000000002';
// Crockford base32 (no I/L/O/U — unambiguous for manual entry).
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function makeCode() {
  // 20 random bytes = 160 bits; encode to base32, group in 4s for readability.
  const bytes = crypto.randomBytes(20);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  return out.match(/.{1,4}/g).join('-'); // e.g. AB12-CD34-...
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('ERROR: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
    process.exit(1);
  }
  const tenant = arg('tenant', DEFAULT_TENANT);
  const store = arg('store', DEFAULT_STORE);
  const label = arg('label', null);
  const expiresMin = parseInt(arg('expires-min', '15'), 10);
  if (!label) { console.error('ERROR: --label "<till name>" is required.'); process.exit(1); }

  const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const rest = (path, opts = {}) => fetch(`${url}/rest/v1/${path}`, { ...opts, headers: { ...h, ...(opts.headers || {}) } });

  // 1. create the provisioned device
  const dRes = await rest('devices', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ tenant_id: tenant, store_id: store, label, status: 'provisioned' }),
  });
  if (!dRes.ok) { console.error('device create failed:', dRes.status, await dRes.text()); process.exit(1); }
  const device = (await dRes.json())[0];

  // 2. create the single-use pairing code (store only its hash)
  const code = makeCode();
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  const expiresAt = new Date(Date.now() + expiresMin * 60_000).toISOString();
  const pRes = await rest('device_pairing_codes', {
    method: 'POST',
    body: JSON.stringify({ tenant_id: tenant, store_id: store, device_id: device.id, code_hash: codeHash, expires_at: expiresAt }),
  });
  if (!pRes.ok) { console.error('pairing code create failed:', pRes.status, await pRes.text()); process.exit(1); }

  console.log('\n  Device provisioned ✓');
  console.log('  device_id :', device.id);
  console.log('  tenant/store:', tenant, '/', store);
  console.log('  label     :', label);
  console.log('\n  ┌─────────────────────────────────────────────┐');
  console.log('  │  PAIRING CODE (enter on the till, once):      │');
  console.log(`  │    ${code.padEnd(41)}│`);
  console.log('  └─────────────────────────────────────────────┘');
  console.log(`  expires in ${expiresMin} min. The raw code is not stored and cannot be shown again.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
