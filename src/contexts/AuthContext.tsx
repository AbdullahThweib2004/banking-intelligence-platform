import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
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
  // The user id whose profile we've already fully resolved at least once
  // (or null, meaning "resolved to logged-out") — see the auth-event
  // handling below for why this matters.
  const resolvedUserIdRef = useRef<string | null>(null);
  const hasResolvedOnceRef = useRef(false);

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
        resolvedUserIdRef.current = null;
        hasResolvedOnceRef.current = true;
        setIsLoading(false);
        return;
      }

      const userId = session.user.id;

      // INCIDENT: Supabase's client re-emits auth events — not just
      // TOKEN_REFRESHED, but in some cases SIGNED_IN again too — for the
      // SAME already-authenticated user simply because a background browser
      // tab regained focus (e.g. switching back from another site). If this
      // is the same user we've already resolved a profile for at least
      // once, refresh it quietly but NEVER flip isLoading back to true:
      // that unmounts the entire app via RequireAuth (every page, every open
      // dialog/wizard) for an event that changed nothing about who's signed
      // in. isLoading is only for the two cases where the app genuinely
      // doesn't know the role yet: first load, and switching to a different
      // account.
      if (hasResolvedOnceRef.current && resolvedUserIdRef.current === userId) {
        loadProfile(userId);
        return;
      }

      setIsLoading(true);
      setTimeout(() => {
        loadProfile(userId).finally(() => {
          resolvedUserIdRef.current = userId;
          hasResolvedOnceRef.current = true;
          setIsLoading(false);
        });
      }, 0);
    });

    // THEN check for an existing session. Loading stays true until both the
    // session check and the profile fetch have completed.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser((session?.user as AuthUser) ?? null);

      if (session?.user) {
        await loadProfile(session.user.id);
        resolvedUserIdRef.current = session.user.id;
      }
      hasResolvedOnceRef.current = true;
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
