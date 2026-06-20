export const ROLES = {
  EMPLOYEE: 'branch_employee',
  MANAGER: 'branch_manager',
  RISK: 'risk_department',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

// Permission map — single source of truth for all route access.
export const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  '/dashboard':       ['branch_employee', 'branch_manager', 'risk_department'],
  '/credit-risk':     ['branch_employee', 'branch_manager', 'risk_department'],
  '/documents':       ['branch_employee', 'branch_manager', 'risk_department'],
  '/ai-assistant':    ['branch_employee', 'branch_manager', 'risk_department'],
  '/approvals':       ['branch_employee', 'branch_manager', 'risk_department'],
  '/user-management': ['branch_manager'],
  '/audit-log':       ['risk_department'],
  '/modification-requests': ['branch_manager', 'risk_department'],
};

export function canAccess(role: Role | null, path: string): boolean {
  if (!role) return false;
  return (ROUTE_PERMISSIONS[path] ?? []).includes(role);
}
