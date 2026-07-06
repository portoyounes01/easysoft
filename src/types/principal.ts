// Normalized auth principal — ONE shape for both hosts (docs/pwa-p1-refactor-plan.md).
//
//   - Till (Electron): derived from the resolved `employee` row (source:'employee').
//     `employee` stays populated for attribution; `hasPermission` still delegates to
//     hasEmployeePermission, so `capabilities` is unused on this path.
//   - PWA human (browser): derived SYNCHRONOUSLY from the JWT `app_metadata`
//     (source:'membership') — the human has NO `employees` row.
//
// `isAuthenticated` keys on `!!principal` (not `!!employee`), so a membership-only human
// is a first-class principal while a bare paired till (device session, no PIN) is not.
export type MembershipRole = 'owner' | 'admin' | 'manager';

export interface Principal {
  source: 'employee' | 'membership';
  userId: string;
  displayName: string;
  /** EmployeeRole on the till path; MembershipRole on the human path. */
  role: string;
  tenantId: string | null;
  storeIds: string[];
  /** membership: ROLE_CAPABILITIES[role]; employee: empty set (unused — see above). */
  capabilities: ReadonlySet<string>;
}
