/**
 * Central test-user config for the API/integration suite. Same env var
 * names as e2e/fixtures/users.ts (E2E_<ROLE>_EMAIL/PASSWORD) so a single
 * .env.test configures both the UI and API suites — no duplicated
 * credential wiring, no hardcoded secrets. There is no "admin" role in
 * this app (see src/lib/roles.ts / profiles_role_check) so no admin entry
 * is defined here.
 */
export const ROLES = {
  EMPLOYEE: 'branch_employee',
  MANAGER: 'branch_manager',
  RISK: 'risk_department',
  AUDIT: 'audit_department',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export interface TestUser {
  role: Role;
  envPrefix: string;
  email: string | undefined;
  password: string | undefined;
}

const buildUser = (role: Role, envPrefix: string): TestUser => ({
  role,
  envPrefix,
  email: process.env[`${envPrefix}_EMAIL`],
  password: process.env[`${envPrefix}_PASSWORD`],
});

export const TEST_USERS: Record<Role, TestUser> = {
  [ROLES.EMPLOYEE]: buildUser(ROLES.EMPLOYEE, 'E2E_EMPLOYEE'),
  [ROLES.MANAGER]: buildUser(ROLES.MANAGER, 'E2E_MANAGER'),
  [ROLES.RISK]: buildUser(ROLES.RISK, 'E2E_RISK'),
  [ROLES.AUDIT]: buildUser(ROLES.AUDIT, 'E2E_AUDIT'),
};

export const isUserConfigured = (role: Role): boolean => {
  const user = TEST_USERS[role];
  return Boolean(user.email && user.password);
};
