// src/components/templates/MainLayout.tsx
import { ReactNode, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Gamepad2,
  Users,
  FileText,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Menu,
  X,
  Table
} from 'lucide-react';
import { cn } from '@grq/ui/lib/utils';
import { ThemeToggle } from '@grq/ui/molecules/ThemeToggle';
import { LanguageSelector } from '@grq/ui/molecules/LanguageSelector';
import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { useSettings } from '@grq/ui/contexts/SettingsContext';
import { Button } from '@grq/ui/atoms/button';
import { CompletedTasksSidebar } from '@grq/ui/organisms/CompletedTasksSidebar';

interface MainLayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'dashboard', href: '/', icon: LayoutDashboard },
  { name: 'games', href: '/games', icon: Gamepad2 },
  { name: 'gamesTable', href: '/games-table', icon: Table },
  { name: 'accounts', href: '/accounts', icon: Users },
  { name: 'accountsDetail', href: '/accounts/detail', icon: FileText },
  { name: 'dailyTasks', href: '/daily-tasks', icon: Calendar },
];

export function MainLayout({ children }: MainLayoutProps) {
  const { t } = useTranslation();
  const { sidebarCollapsed, toggleSidebar, completedSidebarOpen, toggleCompletedSidebar } = useSettings();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header (Visible only on mobile) */}
      <header 
        className="md:hidden flex items-center justify-between border-b px-4 bg-background sticky top-0 z-40 transition-colors"
        style={{ 
          paddingTop: 'env(safe-area-inset-top)',
          height: 'calc(3.5rem + env(safe-area-inset-top))' 
        }}
      >
        <div className="flex items-center gap-2">
          <Gamepad2 className="h-6 w-6 text-primary" />
          <span className="font-semibold text-lg">Game Manager</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setMobileMenuOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
      </header>

      {/* Mobile Swipe Backdrop */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 md:hidden" 
          onClick={() => setMobileMenuOpen(false)} 
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-card transition-all duration-300",
          sidebarCollapsed ? "md:w-16" : "md:w-64",
          "w-64", // Fixed width for mobile
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Sidebar Content */}
        <div className="flex h-full flex-col">
          {/* Logo Area */}
          <div className="flex h-16 items-center border-b px-6 justify-between">
            {!sidebarCollapsed ? (
              <div className="flex items-center gap-2">
                <Gamepad2 className="h-6 w-6 text-primary" />
                <span className="text-lg font-semibold whitespace-nowrap">Game Manager</span>
              </div>
            ) : (
              <Gamepad2 className="h-6 w-6 text-primary mx-auto hidden md:block" />
            )}
            {/* Close button for mobile */}
            <Button 
              variant="ghost" 
              size="sm" 
              className="md:hidden ml-auto" 
              onClick={() => setMobileMenuOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  end
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      sidebarCollapsed && 'md:justify-center'
                    )
                  }
                  title={sidebarCollapsed ? t(`nav.${item.name}`) : undefined}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className={cn(sidebarCollapsed && "md:hidden")}>
                    {t(`nav.${item.name}`)}
                  </span>
                </NavLink>
              );
            })}
          </nav>

          {/* Quick Settings */}
          <div className="border-t p-4 space-y-4">
            {!sidebarCollapsed ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('theme.toggle')}</span>
                  <ThemeToggle />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('language.select')}</span>
                  <LanguageSelector />
                </div>
                <Link
                  to="/settings"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors pt-2 border-t"
                >
                  <Settings className="h-4 w-4" />
                  {t('settings.title')}
                </Link>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <ThemeToggle />
                <LanguageSelector />
                <Link to="/settings" title={t('settings.title')}>
                  <Settings className="h-5 w-5 text-muted-foreground" />
                </Link>
              </div>
            )}
          </div>

          {/* Sidebar Toggle (Desktop Only) */}
          <div className="border-t p-2 hidden md:block">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSidebar}
              className="w-full h-9"
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <div className="flex items-center gap-2">
                  <ChevronLeft className="h-4 w-4" />
                  <span className="text-sm">Collapse</span>
                </div>
              )}
            </Button>
          </div>

          {/* Completed Sidebar Toggle */}
          <div className="border-t p-2">
            <Button
              variant={completedSidebarOpen ? "default" : "ghost"}
              size="sm"
              onClick={toggleCompletedSidebar}
              className="w-full h-9 px-2"
              title={t('dailyTasks.completedToday', 'Completed Today')}
            >
              {sidebarCollapsed ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm truncate">
                    {t('dailyTasks.completed', 'Completed')}
                  </span>
                </div>
              )}
            </Button>
          </div>
        </div>
      </aside>

      {/* Completed Tasks Sidebar */}
      <CompletedTasksSidebar
        isOpen={completedSidebarOpen}
        onClose={toggleCompletedSidebar}
      />

      {/* Main Content Area */}
      <main
        className={cn(
          "transition-all duration-300 min-h-screen",
          // Deskop padding
          sidebarCollapsed ? "md:pl-16" : "md:pl-64",
          // Right panel padding
          completedSidebarOpen ? "lg:pr-96" : "pr-0",
          // Mobile padding
          "pt-0 pb-10"
        )}
        style={{
          paddingBottom: 'calc(2.5rem + env(safe-area-inset-bottom))'
        }}
      >
        <div className="container mx-auto p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}