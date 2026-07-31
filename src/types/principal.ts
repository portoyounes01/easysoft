// Normalized auth principal — ONE shape for both hosts (docs/pwa-p1-refactor-plan.md).
//
//   - Till (Electron): derived from the resolved `employee` row (source:'employee').
//     `employee` stays populated for attribution; `hasPermission` still delegates to
//     hasEmployeePermission, so `capabilities` is unused on this path.
//   - PWA human (browser): derived SYNCHRONOUSLY from the JWT `app_metadata`
//     (source:'membership') — the human has NO `employees` row.
//   - Platform (sysadmin) operator (browser): derived from the app_metadata.platform_admin
//     claim (source:'platform'). NO tenant, NO capabilities — the /platform console is
//     gated on the source itself, and every tenant-scoped page/permission stays closed
//     (hasPermission is false for everything; RLS yields zero rows anyway).
//
// `isAuthenticated` keys on `!!principal` (not `!!employee`), so a membership-only human
// is a first-class principal while a bare paired till (device session, no PIN) is not.
export type MembershipRole = 'owner' | 'admin' | 'manager';

export interface Principal {
  source: 'employee' | 'membership' | 'platform';
  userId: string;
  displayName: string;
  /** EmployeeRole on the till path; MembershipRole on the human path; 'sysadmin' on the platform path. */
  role: string;
  tenantId: string | null;
  storeIds: string[];
  /** membership: ROLE_CAPABILITIES[role]; employee: empty set (unused — see above). */
  capabilities: ReadonlySet<string>;
}
