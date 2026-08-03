/**
 * Stable, English-only UI copy this suite selects against, taken verbatim
 * from src/contexts/LanguageContext.tsx (`translations.*.en`). The app
 * always boots with language = 'en', so hardcoding these strings is safe
 * and avoids re-deriving them (or importing app internals) from every spec.
 * If a translation string changes, update it here alongside the app.
 */
export const TEXT = {
  auth: {
    login: 'Login',
    email: 'Email',
    password: 'Password',
    invalidCredentials: 'Invalid email or password',
  },
  nav: {
    dashboard: 'Dashboard',
    creditRisk: 'Credit Risk',
    documents: 'Documents',
    aiAssistant: 'AI Assistant',
    approvals: 'Approvals',
    auditLog: 'Audit Log',
    modificationRequests: 'Modification Requests',
    users: 'User Management',
    auditMonitoring: 'Audit Monitoring',
    auditApprovals: 'Loan Approvals',
    settings: 'Settings',
    logout: 'Logout',
  },
  dashboard: {
    welcome: 'Welcome back',
    totalApplications: 'Total Applications',
    pendingReview: 'Pending Review',
    approvedToday: 'Approved Today',
    riskScore: 'Avg Risk Score',
  },
  credit: {
    newAssessment: 'New Assessment',
  },
  ai: {
    title: 'AI Assistant',
    placeholder: 'Ask about banking policies, procedures',
  },
  approvals: {
    title: 'Pending Approvals',
    approve: 'Approve',
    reject: 'Reject',
  },
  users: {
    title: 'User Management',
    addUser: 'Add User',
  },
  auditLog: {
    title: 'Audit Log',
    activityLog: 'Activity Log',
  },
  auditMonitoring: {
    title: 'Audit Monitoring',
  },
  common: {
    cancel: 'Cancel',
    loading: 'Loading',
  },
} as const;
