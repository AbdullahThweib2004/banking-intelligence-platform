import React, { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AIChatProvider } from "@/contexts/AIChatContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ROLES } from "@/lib/roles";
import { cn } from "@/lib/utils";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import CreditRisk from "./pages/CreditRisk";
import Documents from "./pages/Documents";
import AIAssistant from "./pages/AIAssistant";
import Approvals from "./pages/Approvals";
import AuditLog from "./pages/AuditLog";
import ModificationRequests from "./pages/ModificationRequests";
import UserManagement from "./pages/UserManagement";
import Unauthorized from "./pages/Unauthorized";
import NotFound from "./pages/NotFound";
import { HelpProvider } from "@/components/help";

const queryClient = new QueryClient();

// Auth-only guard. (Renamed from the former local `ProtectedRoute` to avoid a
// name clash with the role-based ProtectedRoute imported above.)
const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

// Public Route wrapper (redirects to dashboard if logged in)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

interface DashboardRouteConfig {
  path: string;
  element: React.ReactNode;
}

// Every sidebar-navigable, authenticated page. Kept as a single source of
// truth consumed by both <Routes> (for matching/guarding) and
// KeepAliveDashboard (for persistence) below, so the two never drift apart.
const DASHBOARD_ROUTES: DashboardRouteConfig[] = [
  { path: "/dashboard", element: <RequireAuth><Dashboard /></RequireAuth> },
  { path: "/credit-risk", element: <RequireAuth><CreditRisk /></RequireAuth> },
  { path: "/documents", element: <RequireAuth><Documents /></RequireAuth> },
  { path: "/ai-assistant", element: <RequireAuth><AIAssistant /></RequireAuth> },
  { path: "/approvals", element: <RequireAuth><Approvals /></RequireAuth> },
  {
    path: "/audit-log",
    element: (
      <RequireAuth>
        <ProtectedRoute allowedRoles={[ROLES.RISK]}>
          <AuditLog />
        </ProtectedRoute>
      </RequireAuth>
    ),
  },
  {
    path: "/modification-requests",
    element: (
      <RequireAuth>
        <ProtectedRoute allowedRoles={[ROLES.RISK, ROLES.MANAGER]}>
          <ModificationRequests />
        </ProtectedRoute>
      </RequireAuth>
    ),
  },
  {
    path: "/user-management",
    element: (
      <RequireAuth>
        <ProtectedRoute allowedRoles={[ROLES.MANAGER]}>
          <UserManagement />
        </ProtectedRoute>
      </RequireAuth>
    ),
  },
];

/**
 * Keeps every dashboard page mounted for the rest of the session once first
 * visited, instead of letting react-router unmount it on navigation —
 * switching sidebar pages and back no longer resets page state (open
 * dialogs, in-progress multi-step wizards, uploaded files, form input,
 * etc.), because the page component is never actually torn down.
 *
 * Inactive pages are hidden with `display: none` (Tailwind `hidden`) —
 * removed from layout and the accessibility tree, not interactive — rather
 * than being unmounted. Each page is only ever added to `visitedPaths` (and
 * therefore only ever mounted) the first time the user actually navigates to
 * it, so a role-gated page's data fetching never fires for a user who never
 * visits it; <RequireAuth>/<ProtectedRoute> still guard every one of them
 * exactly as before.
 *
 * `visitedPaths` resets on logout so a new session never inherits another
 * account's already-mounted, possibly role-restricted, pages.
 */
const KeepAliveDashboard: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();
  const [visitedPaths, setVisitedPaths] = useState<string[]>([]);

  const activePath = DASHBOARD_ROUTES.find((r) => r.path === location.pathname)?.path;

  useEffect(() => {
    if (activePath && !visitedPaths.includes(activePath)) {
      setVisitedPaths((prev) => [...prev, activePath]);
    }
  }, [activePath, visitedPaths]);

  // Logging out (or switching accounts) must not leave a previous session's
  // pages mounted in the background.
  useEffect(() => {
    if (!user) setVisitedPaths([]);
  }, [user]);

  return (
    <>
      {DASHBOARD_ROUTES.filter((r) => visitedPaths.includes(r.path)).map((r) => (
        <div key={r.path} className={cn(r.path !== location.pathname && "hidden")}>
          {r.element}
        </div>
      ))}
    </>
  );
};

const AppRoutes = () => {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/auth"
          element={
            <PublicRoute>
              <Auth />
            </PublicRoute>
          }
        />

        {/* Actual content for these paths is rendered by KeepAliveDashboard
            below, kept mounted across navigation — these entries exist only
            so react-router recognizes the path (instead of falling through
            to the "*" 404 route). */}
        {DASHBOARD_ROUTES.map((r) => (
          <Route key={r.path} path={r.path} element={null} />
        ))}

        {/* Publicly accessible — must NOT be guarded to avoid a redirect loop */}
        <Route path="/unauthorized" element={<Unauthorized />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
      <KeepAliveDashboard />
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <HelpProvider>
        <AuthProvider>
          <AIChatProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </TooltipProvider>
          </AIChatProvider>
        </AuthProvider>
      </HelpProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
