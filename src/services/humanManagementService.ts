import { supabase } from '../lib/supabase';

// Client entry point for the revoke-human edge fn (P3d). Removes a human's membership from the
// CALLER's tenant (the fn forces the tenant from the caller's verified JWT and re-checks authz):
// deletes the membership + their push subscriptions, and re-points/clears their active tenant
// claim. The custom_access_token hook drops the tenant claim at their next refresh.
//
// NOTE: no in-app team-management UI calls this yet (humans are provisioned via
// scripts/provision-human.mjs, and provision-human has no in-app caller either). This is the
// ready backend companion for that future admin surface. See docs/REGISTER.md D-N4.
export async function revokeHuman(userId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('revoke-human', { body: { user_id: userId } });
  if (error) return { ok: false, error: error.message };
  const res = data as { status?: string; error?: string };
  if (res?.status !== 'ok') return { ok: false, error: res?.error ?? 'unknown_error' };
  return { ok: true };
}
