// notify-push — deliver CRITICAL notification_events as Web Push to a tenant's opted-in humans.
// verify_jwt=false (invoked by the pg trigger / cron backstop) + a shared-secret header gate.
//
// SAFETY-CRITICAL isolation: fan-out is tenant-keyed AND membership-checked. We read
// push_subscriptions for the event's tenant, then keep ONLY those whose user_id is still in
// tenant_members for that tenant — the LIVE revocation guard the stored/JWT tenant_id cannot
// provide (a removed member's stale subscription is never delivered to). Deduped by physical
// endpoint per pass. delivered_at is the idempotency gate (trigger + cron can both call this).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

const CRITICAL_COPY: Record<string, { title: string; body: (p: Record<string, unknown>) => string }> = {
  FISCAL_CANCELLATION: { title: 'Fiscal cancellation', body: (p) => `Document ${p.transaction_number ? '#' + p.transaction_number : ''} was cancelled.` },
  FISCAL_ISSUE_FAILED: { title: 'Fiscal issuing failed', body: (p) => (typeof p.error === 'string' && p.error ? p.error : 'A sale could not be fiscalised.') },
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const secret = Deno.env.get('NOTIFY_PUSH_SHARED_SECRET') ?? '';
  if (!secret || req.headers.get('x-webhook-secret') !== secret) return json({ error: 'unauthorized' }, 401);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:alerts@example.com';
  if (!url || !serviceKey || !vapidPublic || !vapidPrivate) return json({ error: 'server_misconfigured' }, 500);
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: { event_id?: string; sweep?: boolean };
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  // Target set: one event, or every undelivered critical event (cron backstop).
  let q = admin.from('notification_events')
    .select('id, tenant_id, event_type, severity, payload')
    .eq('severity', 'critical')
    .is('delivered_at', null);
  if (body.event_id) q = q.eq('id', body.event_id);
  else if (!body.sweep) return json({ error: 'event_id_or_sweep_required' }, 400);
  const { data: events, error: evErr } = await q.limit(200);
  if (evErr) return json({ error: 'events_query_failed', detail: evErr.message }, 500);

  let sent = 0, pruned = 0, delivered = 0;

  for (const ev of events ?? []) {
    // Membership-checked fan-out (two service-role reads; PostgREST can't embed the non-FK join).
    const [{ data: subs }, { data: members }] = await Promise.all([
      admin.from('push_subscriptions').select('endpoint, p256dh, auth, user_id').eq('tenant_id', ev.tenant_id),
      admin.from('tenant_members').select('user_id').eq('tenant_id', ev.tenant_id),
    ]);
    const memberIds = new Set((members ?? []).map((m: { user_id: string }) => m.user_id));
    const seen = new Set<string>();
    const targets = (subs ?? []).filter((s: { user_id: string; endpoint: string }) => {
      if (!memberIds.has(s.user_id)) return false;        // LIVE revocation guard
      if (seen.has(s.endpoint)) return false;             // one send per physical endpoint
      seen.add(s.endpoint);
      return true;
    });

    const copy = CRITICAL_COPY[ev.event_type] ?? { title: 'Alert', body: () => '' };
    const payload = JSON.stringify({
      title: copy.title,
      body: copy.body((ev.payload ?? {}) as Record<string, unknown>),
      severity: ev.severity,
      event_id: ev.id,
      tenant_id: ev.tenant_id,
      url: `/alerts?event=${ev.id}`,
    });

    for (const t of targets as Array<{ endpoint: string; p256dh: string; auth: string }>) {
      try {
        await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload);
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) { // gone — prune the dead subscription
          await admin.from('push_subscriptions').delete().eq('endpoint', t.endpoint);
          pruned++;
        }
      }
    }

    // Stamp delivered regardless (zero subscribers still counts as handled) — stops the cron retry loop.
    const { error: upErr } = await admin.from('notification_events')
      .update({ delivered_at: new Date().toISOString() })
      .eq('id', ev.id).is('delivered_at', null);
    if (!upErr) delivered++;
  }

  return json({ status: 'ok', events: (events ?? []).length, sent, pruned, delivered });
});
