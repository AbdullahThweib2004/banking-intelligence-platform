import type { Role } from '@/lib/roles';

// Single source of truth for Role lives in src/lib/roles.ts; re-exported here
// so it can be imported from either path.
export type { Role };

// Application-level user (shape we care about across the app). The raw Supabase
// auth user is separate; this is the normalized user we attach a role to.
export interface User {
  id: string;
  email: string;
  role: Role;
}

// Mirrors the `public.profiles` table row.
export interface UserProfile {
  id: string;
  full_name: string;
  role: Role;
  created_at: string;
}

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  role: Role | null;
  loading: boolean;
}
