import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AIChatProvider } from "@/contexts/AIChatContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ROLES } from "@/lib/roles";
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

const AppRoutes = () => {
  return (
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
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/credit-risk"
        element={
          <RequireAuth>
            <CreditRisk />
          </RequireAuth>
        }
      />
      <Route
        path="/documents"
        element={
          <RequireAuth>
            <Documents />
          </RequireAuth>
        }
      />
      <Route
        path="/ai-assistant"
        element={
          <RequireAuth>
            <AIAssistant />
          </RequireAuth>
        }
      />
      <Route
        path="/approvals"
        element={
          <RequireAuth>
            <Approvals />
          </RequireAuth>
        }
      />

      {/* Risk Department only */}
      <Route
        path="/audit-log"
        element={
          <RequireAuth>
            <ProtectedRoute allowedRoles={[ROLES.RISK]}>
              <AuditLog />
            </ProtectedRoute>
          </RequireAuth>
        }
      />
      <Route
        path="/modification-requests"
        element={
          <RequireAuth>
            <ProtectedRoute allowedRoles={[ROLES.RISK, ROLES.MANAGER]}>
              <ModificationRequests />
            </ProtectedRoute>
          </RequireAuth>
        }
      />

      {/* Branch Manager only */}
      <Route
        path="/user-management"
        element={
          <RequireAuth>
            <ProtectedRoute allowedRoles={[ROLES.MANAGER]}>
              <UserManagement />
            </ProtectedRoute>
          </RequireAuth>
        }
      />

      {/* Publicly accessible — must NOT be guarded to avoid a redirect loop */}
      <Route path="/unauthorized" element={<Unauthorized />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
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
