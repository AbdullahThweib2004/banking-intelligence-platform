export const ROLES = {
  EMPLOYEE: 'branch_employee',
  MANAGER: 'branch_manager',
  RISK: 'risk_department',
  AUDIT: 'audit_department',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

// Permission map — single source of truth for all route access.
export const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  '/dashboard':       ['branch_employee', 'branch_manager', 'risk_department', 'audit_department'],
  '/credit-risk':     ['branch_employee', 'branch_manager', 'risk_department'],
  '/documents':       ['branch_employee', 'branch_manager', 'risk_department'],
  '/ai-assistant':    ['branch_employee', 'branch_manager', 'risk_department', 'audit_department'],
  '/approvals':       ['branch_employee', 'branch_manager', 'risk_department'],
  '/user-management': ['branch_manager'],
  '/audit-log':       ['risk_department'],
  // branch_employee has read-only access: they submit modification requests
  // from Credit Risk and need to see which stage each one has reached
  // (Pending Manager Review / Pending Risk Review / Approved / Rejected).
  // RLS scopes them to their own rows and grants them no UPDATE policy.
  '/modification-requests': ['branch_employee', 'branch_manager', 'risk_department'],
  // Audit's own dedicated dashboard — a fully separate account/role, never
  // shared with Risk's /approvals page.
  '/audit-monitoring': ['audit_department'],
  '/audit-approvals':  ['audit_department'],
};

export function canAccess(role: Role | null, path: string): boolean {
  if (!role) return false;
  return (ROUTE_PERMISSIONS[path] ?? []).includes(role);
}

// Roles allowed to use the "Open New Account" flow on the Documents page
// (task card, modal, and the /documents/extract-id + /accounts/open-new calls).
export const ACCOUNT_OPENING_ROLES: Role[] = ['branch_employee', 'branch_manager'];

export function canOpenAccount(role: Role | null): boolean {
  return role != null && ACCOUNT_OPENING_ROLES.includes(role);
}
