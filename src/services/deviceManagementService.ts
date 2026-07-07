import { supabase } from '../lib/supabase';

export type ManagedDeviceStatus = 'provisioned' | 'enrolled' | 'revoked';
export type DevicePresence = 'online' | 'offline' | 'unknown';

export interface ManagedStore {
  id: string;
  name: string;
  status: 'active' | 'closed';
}

export interface PairingCodeSummary {
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface ManagedDevice {
  id: string;
  store_id: string;
  label: string;
  status: ManagedDeviceStatus;
  enrolled_at: string | null;
  last_seen_at: string | null;
  presence: DevicePresence;
  presence_changed_at: string | null;
  created_at: string;
  device_pairing_codes: PairingCodeSummary[];
}

export interface DeviceAdminCredentials {
  employeeNumber: string;
  secret: string;
}

export interface DeviceListResponse {
  stores: ManagedStore[];
  devices: ManagedDevice[];
}

export interface PairingCodeResponse {
  device?: ManagedDevice;
  pairing_code: string;
  expires_at: string;
}

const errorMessages: Record<string, string> = {
  admin_reauth_required: 'Enter your administrator PIN.',
  invalid_admin_credentials: 'The administrator PIN is incorrect.',
  admin_locked: 'This administrator account is locked for 15 minutes.',
  admin_required: 'Only administrators can manage tills.',
  invalid_session: 'Your device session has expired. Pair this till again.',
  no_tenant_context: 'This session is not assigned to a business.',
  invalid_device_label: 'Enter a till name of up to 80 characters.',
  store_required: 'Select a store.',
  store_not_found: 'That store is unavailable.',
  device_not_found: 'That till no longer exists.',
  device_already_enrolled: 'Only an unpaired till can receive a replacement code.',
  device_create_failed: 'The till could not be created.',
  pairing_code_create_failed: 'The pairing code could not be created.',
  device_revoke_failed: 'The till could not be revoked.',
  device_list_failed: 'The till list could not be loaded.',
};

async function request<T>(
  body: Record<string, string>,
  credentials: DeviceAdminCredentials,
): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('This till has no active device session.');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-devices`;
  const anon = import.meta.env.VITE_SUPABASE_ANON ?? '';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anon,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      ...body,
      employee_number: credentials.employeeNumber,
      secret: credentials.secret,
    }),
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    throw new Error(errorMessages[result.error ?? ''] ?? 'Device management request failed.');
  }
  return result;
}

export const deviceManagementService = {
  list: (credentials: DeviceAdminCredentials) =>
    request<DeviceListResponse>({ action: 'list' }, credentials),

  create: (
    credentials: DeviceAdminCredentials,
    input: { label: string; storeId: string },
  ) => request<PairingCodeResponse>({
    action: 'create',
    label: input.label,
    store_id: input.storeId,
  }, credentials),

  reissue: (credentials: DeviceAdminCredentials, deviceId: string) =>
    request<PairingCodeResponse>({ action: 'reissue', device_id: deviceId }, credentials),

  revoke: (credentials: DeviceAdminCredentials, deviceId: string) =>
    request<{ success: boolean }>({ action: 'revoke', device_id: deviceId }, credentials),
};
