import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../integrations/supabase/client';
import { Role, canAccess as canAccessRoute } from '@/lib/roles';
import type { UserProfile } from '@/types';

interface AuthUser extends User {
  role?: Role;
  full_name?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  role: Role | null;
  profile: UserProfile | null;
  isLoading: boolean;
  loading: boolean; // alias of isLoading
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  isRole: (requiredRole: Role | Role[]) => boolean;
  canAccess: (path: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch the user's profile (and role) from the `profiles` table.
  // Never throws: on any failure it clears role/profile so the app keeps working.
  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role, full_name, created_at')
        .eq('id', userId)
        .single();

      if (error) {
        // PGRST116 = no rows returned (user exists but has no profile row yet).
        if (error.code === 'PGRST116') {
          console.warn(`No profile row found for user ${userId}. Role set to null.`);
        } else {
          console.error('Failed to fetch profile:', error);
        }
        setRole(null);
        setProfile(null);
        return;
      }

      setRole((data?.role as Role) ?? null);
      setProfile(
        data
          ? {
              id: userId,
              full_name: data.full_name ?? '',
              role: data.role as Role,
              created_at: data.created_at ?? '',
            }
          : null
      );
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      setRole(null);
      setProfile(null);
    }
  };

  useEffect(() => {
    // Set up the auth state listener FIRST.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser((session?.user as AuthUser) ?? null);

      if (!session?.user) {
        setRole(null);
        setProfile(null);
        setIsLoading(false);
        return;
      }

      const userId = session.user.id;

      // Token refresh on tab focus must NOT flip loading=true — that unmounts
      // the entire app via RequireAuth and wipes in-memory UI state (e.g. chat).
      if (event === 'TOKEN_REFRESHED') {
        return;
      }

      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        setIsLoading(true);
        setTimeout(() => {
          loadProfile(userId).finally(() => setIsLoading(false));
        }, 0);
        return;
      }

      // Other events (USER_UPDATED, etc.) — refresh profile silently.
      loadProfile(userId);
    });

    // THEN check for an existing session. Loading stays true until both the
    // session check and the profile fetch have completed.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser((session?.user as AuthUser) ?? null);

      if (session?.user) {
        await loadProfile(session.user.id);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setProfile(null);
  };

  // Exact-match role check.
  const isRole = (requiredRole: Role | Role[]): boolean => {
    if (!role) return false;
    return Array.isArray(requiredRole) ? requiredRole.includes(role) : requiredRole === role;
  };

  // New, route-based access check (uses ROUTE_PERMISSIONS from src/lib/roles.ts).
  const canAccess = (path: string): boolean => canAccessRoute(role, path);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        profile,
        isLoading,
        loading: isLoading,
        signIn,
        signOut,
        isRole,
        canAccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
