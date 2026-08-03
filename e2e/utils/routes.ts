/**
 * Mirrors src/lib/roles.ts ROUTE_PERMISSIONS — the single source of truth in
 * the app for which role can see which route. Kept here (rather than
 * importing the app module) so the E2E suite has no compile-time dependency
 * on app internals; if the two drift, the role-based-access tests will fail
 * loudly and point back here.
 */
export const ROLES = {
  EMPLOYEE: 'branch_employee',
  MANAGER: 'branch_manager',
  RISK: 'risk_department',
  AUDIT: 'audit_department',
} as const;

export type RoleKey = keyof typeof ROLES;
export type Role = (typeof ROLES)[RoleKey];

export const ROUTES = {
  auth: '/auth',
  dashboard: '/dashboard',
  creditRisk: '/credit-risk',
  documents: '/documents',
  aiAssistant: '/ai-assistant',
  approvals: '/approvals',
  userManagement: '/user-management',
  auditLog: '/audit-log',
  modificationRequests: '/modification-requests',
  auditMonitoring: '/audit-monitoring',
  auditApprovals: '/audit-approvals',
  unauthorized: '/unauthorized',
} as const;

export const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  [ROUTES.dashboard]: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.RISK, ROLES.AUDIT],
  [ROUTES.creditRisk]: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.RISK],
  [ROUTES.documents]: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.RISK],
  [ROUTES.aiAssistant]: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.RISK, ROLES.AUDIT],
  [ROUTES.approvals]: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.RISK],
  [ROUTES.userManagement]: [ROLES.MANAGER],
  [ROUTES.auditLog]: [ROLES.RISK],
  [ROUTES.modificationRequests]: [ROLES.MANAGER, ROLES.RISK],
  [ROUTES.auditMonitoring]: [ROLES.AUDIT],
  [ROUTES.auditApprovals]: [ROLES.AUDIT],
};

export const canAccess = (role: Role, route: string): boolean =>
  (ROUTE_PERMISSIONS[route] ?? []).includes(role);

/** One "allowed" and one "not allowed" route per role — used by the shared role-access spec. */
export const roleRouteExpectations: Record<Role, { allowed: string; forbidden: string }> = {
  [ROLES.EMPLOYEE]: { allowed: ROUTES.dashboard, forbidden: ROUTES.userManagement },
  [ROLES.MANAGER]: { allowed: ROUTES.userManagement, forbidden: ROUTES.auditApprovals },
  [ROLES.RISK]: { allowed: ROUTES.auditLog, forbidden: ROUTES.userManagement },
  [ROLES.AUDIT]: { allowed: ROUTES.auditApprovals, forbidden: ROUTES.userManagement },
};
