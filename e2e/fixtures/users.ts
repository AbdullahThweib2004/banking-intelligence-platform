import { ROLES, type Role } from '../utils/routes';

/**
 * Central test-user config. Credentials are NEVER hardcoded — each role's
 * email/password comes from environment variables so real Supabase
 * accounts can be provisioned per environment (local/staging/CI) without
 * touching test code. There is no "admin" role in this app (only the four
 * below — see src/lib/roles.ts), so no admin entry is defined here.
 *
 * Required env vars (set in .env.e2e or the CI environment):
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD
 *   E2E_MANAGER_EMAIL  / E2E_MANAGER_PASSWORD
 *   E2E_RISK_EMAIL     / E2E_RISK_PASSWORD
 *   E2E_AUDIT_EMAIL    / E2E_AUDIT_PASSWORD
 */
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
