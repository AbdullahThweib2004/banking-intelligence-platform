import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LayoutDashboard,
  FileText,
  Bot,
  CheckSquare,
  ClipboardList,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Globe,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  icon: React.ElementType;
  labelKey: string;
  path: string;
  roles: ('employee' | 'manager' | 'admin')[];
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, labelKey: 'nav.dashboard', path: '/dashboard', roles: ['employee', 'manager', 'admin'] },
  { icon: TrendingUp, labelKey: 'nav.creditRisk', path: '/credit-risk', roles: ['employee', 'manager', 'admin'] },
  { icon: FileText, labelKey: 'nav.documents', path: '/documents', roles: ['employee', 'manager', 'admin'] },
  { icon: Bot, labelKey: 'nav.aiAssistant', path: '/ai-assistant', roles: ['employee', 'manager', 'admin'] },
  { icon: CheckSquare, labelKey: 'nav.approvals', path: '/approvals', roles: ['manager', 'admin'] },
  { icon: ClipboardList, labelKey: 'nav.auditLog', path: '/audit-log', roles: ['manager', 'admin'] },
  { icon: Users, labelKey: 'nav.users', path: '/users', roles: ['admin'] },
];

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const { t, language, setLanguage, direction } = useLanguage();
  const { user, role, signOut, hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'ar' : 'en');
  };

  const filteredNavItems = navItems.filter(item => 
    hasPermission(item.roles as any)
  );

  const getRoleLabel = () => {
    switch (role) {
      case 'admin': return t('users.admin');
      case 'manager': return t('users.manager');
      default: return t('users.employee');
    }
  };

  return (
    <div className={cn("min-h-screen bg-background flex", direction === 'rtl' && 'flex-row-reverse')}>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col fixed inset-y-0 z-50 transition-all duration-300 sidebar-gradient",
          sidebarOpen ? "w-64" : "w-20",
          direction === 'rtl' ? 'right-0' : 'left-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border/30">
          {sidebarOpen && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sidebar-foreground/10 flex items-center justify-center">
                <span className="text-sidebar-foreground font-bold text-lg">BoP</span>
              </div>
              <div className="flex flex-col">
                <span className="text-sidebar-foreground font-semibold text-sm">
                  {language === 'ar' ? 'بنك فلسطين' : 'Bank of Palestine'}
                </span>
                <span className="text-sidebar-foreground/70 text-xs">
                  {t('dashboard.title')}
                </span>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-sidebar-foreground hover:bg-sidebar-accent"
          >
            {direction === 'rtl' ? (
              sidebarOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />
            ) : (
              sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                  isActive
                    ? "bg-sidebar-foreground/20 text-sidebar-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  !sidebarOpen && "justify-center"
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {sidebarOpen && (
                  <span className="truncate">{t(item.labelKey)}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-sidebar-border/30">
          <div className={cn("flex items-center gap-3", !sidebarOpen && "justify-center")}>
            <Avatar className="h-9 w-9 border-2 border-sidebar-foreground/20">
              <AvatarFallback className="bg-sidebar-foreground/10 text-sidebar-foreground text-sm">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {user?.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-xs text-sidebar-foreground/60">{getRoleLabel()}</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className={cn(
        "lg:hidden fixed top-0 left-0 right-0 h-16 sidebar-gradient z-50 flex items-center justify-between px-4"
      )}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sidebar-foreground/10 flex items-center justify-center">
            <span className="text-sidebar-foreground font-bold text-sm">BoP</span>
          </div>
          <span className="text-sidebar-foreground font-semibold">
            {language === 'ar' ? 'بنك فلسطين' : 'Bank of Palestine'}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-sidebar-foreground"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40 pt-16"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div 
            className="sidebar-gradient w-64 h-full p-4 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all",
                    isActive
                      ? "bg-sidebar-foreground/20 text-sidebar-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span>{t(item.labelKey)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className={cn(
        "flex-1 min-h-screen transition-all duration-300",
        sidebarOpen ? "lg:ml-64" : "lg:ml-20",
        direction === 'rtl' && (sidebarOpen ? "lg:mr-64 lg:ml-0" : "lg:mr-20 lg:ml-0"),
        "pt-16 lg:pt-0"
      )}>
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border h-16 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-foreground hidden sm:block">
              {t('dashboard.welcome')}, {user?.email?.split('@')[0] || 'User'}
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleLanguage}
              className="gap-2"
            >
              <Globe className="h-4 w-4" />
              {language === 'en' ? 'العربية' : 'English'}
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Settings className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={direction === 'rtl' ? 'start' : 'end'}>
                <DropdownMenuItem>
                  <Settings className="h-4 w-4 mr-2" />
                  {t('nav.settings')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  {t('nav.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
};
