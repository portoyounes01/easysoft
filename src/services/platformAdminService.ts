// platformAdminService — client for the platform-admin edge function (sysadmin console).
// Same request shape as deviceManagementService: caller's session JWT + anon apikey;
// the function re-authorizes against public.platform_admins per request.
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';

export type TenantStatus = 'provisioning' | 'active' | 'suspended' | 'offboarding';
export type SubscriptionPlan = 'trial' | 'basic' | 'standard' | 'premium';

export interface PlatformTenant {
  id: string;
  name: string;
  legal_name: string;
  nif: string;
  country: string;
  status: TenantStatus;
  subscription_plan: SubscriptionPlan;
  created_at: string;
  counts: {
    stores: number;
    stores_active: number;
    devices: number;
    devices_enrolled: number;
    devices_online: number;
    members: number;
    owners: number;
  };
}

export interface PlatformStore {
  id: string;
  tenant_id: string;
  name: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  status: 'active' | 'closed';
  created_at: string;
}

export interface PlatformMember {
  user_id: string;
  role: 'owner' | 'admin' | 'manager';
  store_ids: string[] | null;
  created_at: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
}

export interface PlatformDevice {
  id: string;
  tenant_id: string;
  store_id: string;
  label: string;
  status: 'provisioned' | 'enrolled' | 'revoked';
  training_mode: boolean;
  enrolled_at: string | null;
  last_seen_at: string | null;
  presence: 'online' | 'offline' | 'unknown';
  presence_changed_at: string | null;
  created_at: string;
  device_pairing_codes: { expires_at: string; used_at: string | null; created_at: string }[];
}

export interface PlatformDeviceList {
  devices: PlatformDevice[];
  tenants: { id: string; name: string }[];
  stores: { id: string; tenant_id: string; name: string }[];
}

export interface PlatformPairingCode {
  device?: PlatformDevice;
  pairing_code: string;
  expires_at: string;
}

export interface PlatformAuditEntry {
  id: string;
  actor_user_id: string;
  action: string;
  target: Record<string, unknown>;
  created_at: string;
}

const errorMessages: Record<string, string> = {
  not_platform_admin: 'This account is not a platform administrator.',
  unauthorized: 'Your session has expired — sign in again.',
  tenant_not_found: 'That tenant no longer exists.',
  tenant_has_transactions: 'This tenant has recorded sales — it cannot be deleted, only suspended (offboarding is a managed process).',
  tenant_has_fiscal_documents: 'This tenant has fiscal documents — it cannot be deleted, only suspended (offboarding is a managed process).',
  cannot_remove_last_owner: 'A tenant must keep at least one owner. Delete the tenant instead if it is being dismantled.',
  store_not_found: 'That store is unavailable (it must exist and be active).',
  device_not_found: 'That till no longer exists.',
  device_already_enrolled: 'Only an unpaired till can receive a replacement code.',
  invalid_device_label: 'Enter a till name of up to 80 characters.',
  bad_subscription_plan: 'Unknown subscription plan.',
  bad_status: 'Unknown status value.',
  bad_role: 'Unknown role.',
  email_password_required: 'Email and password are required.',
  username_taken_or_failed: 'That username is already taken.',
  unknown_store_ids: 'Some store ids do not belong to this tenant.',
  target_is_platform_admin: 'That email belongs to a platform administrator — platform admins cannot also be tenant members.',
};

async function request<T>(body: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('No active session — sign in again.');

  const response = await fetch(`${supabaseUrl}/functions/v1/platform-admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string; detail?: string };
  if (!response.ok) {
    const base = errorMessages[result.error ?? ''] ?? `Platform request failed (${result.error ?? response.status}).`;
    throw new Error(result.detail ? `${base} — ${result.detail}` : base);
  }
  return result;
}

export const platformAdminService = {
  listTenants: () => request<{ tenants: PlatformTenant[] }>({ action: 'list_tenants' }),
  // response types match the wire exactly — the fn returns bare tenant rows (no counts)
  createTenant: (input: { name: string; legal_name: string; nif: string; country?: string; subscription_plan?: string; status?: string }) =>
    request<{ tenant: Omit<PlatformTenant, 'counts'> }>({ action: 'create_tenant', ...input }),
  updateTenant: (tenantId: string, patch: Partial<Pick<PlatformTenant, 'name' | 'legal_name' | 'nif' | 'country' | 'status' | 'subscription_plan'>>) =>
    request<{ tenant: Omit<PlatformTenant, 'counts' | 'created_at'> }>({ action: 'update_tenant', tenant_id: tenantId, patch }),
  deleteTenant: (tenantId: string) =>
    request<{ deleted: string }>({ action: 'delete_tenant', tenant_id: tenantId }),

  listStores: (tenantId: string) =>
    request<{ stores: PlatformStore[] }>({ action: 'list_stores', tenant_id: tenantId }),
  createStore: (tenantId: string, input: { name: string; address?: string; postal_code?: string; city?: string; phone?: string; email?: string; timezone?: string }) =>
    request<{ store: PlatformStore }>({ action: 'create_store', tenant_id: tenantId, ...input }),
  updateStore: (storeId: string, patch: Partial<Pick<PlatformStore, 'name' | 'address' | 'postal_code' | 'city' | 'phone' | 'email' | 'timezone' | 'status'>>) =>
    request<{ store: Pick<PlatformStore, 'id' | 'tenant_id' | 'name' | 'status'> }>({ action: 'update_store', store_id: storeId, patch }),

  listMembers: (tenantId: string) =>
    request<{ members: PlatformMember[] }>({ action: 'list_members', tenant_id: tenantId }),
  createMember: (tenantId: string, input: { email: string; password: string; username?: string; role?: string; store_ids?: string[]; display_name?: string }) =>
    request<{ user_id: string; role: string }>({ action: 'create_member', tenant_id: tenantId, ...input }),
  removeMember: (tenantId: string, userId: string) =>
    request<{ user_id: string }>({ action: 'remove_member', tenant_id: tenantId, user_id: userId }),

  listDevices: (tenantId?: string) =>
    request<PlatformDeviceList>({ action: 'list_devices', ...(tenantId ? { tenant_id: tenantId } : {}) }),
  createDevice: (input: { tenantId: string; storeId: string; label: string }) =>
    request<PlatformPairingCode>({ action: 'create_device', tenant_id: input.tenantId, store_id: input.storeId, label: input.label }),
  reissueCode: (deviceId: string) =>
    request<PlatformPairingCode>({ action: 'reissue_code', device_id: deviceId }),
  revokeDevice: (deviceId: string) =>
    request<{ status: string }>({ action: 'revoke_device', device_id: deviceId }),
  renameDevice: (deviceId: string, label: string) =>
    request<{ status: string }>({ action: 'update_device', device_id: deviceId, label }),

  auditLog: (limit = 100) =>
    request<{ entries: PlatformAuditEntry[]; actors: Record<string, string | null> }>({ action: 'audit_log', limit }),
};
