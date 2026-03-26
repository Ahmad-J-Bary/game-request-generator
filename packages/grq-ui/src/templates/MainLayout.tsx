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
        className="md:hidden flex items-center justify-between border-b border-border/50 py-0 bg-background/80 backdrop-blur-md sticky top-0 z-40 shadow-sm transition-all"
        style={{ 
          paddingTop: 'env(safe-area-inset-top)',
          paddingLeft: 'calc(1rem + env(safe-area-inset-left))',
          paddingRight: 'calc(1rem + env(safe-area-inset-right))',
          height: 'calc(4rem + env(safe-area-inset-top))' 
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Gamepad2 className="h-5 w-5 text-primary" />
          </div>
          <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Game Manager
          </span>
        </div>
        
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(true)} className="h-9 w-9 rounded-full hover:bg-accent">
            <Menu className="h-5 w-5" />
          </Button>
        </div>
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

          {/* Bottom Actions Area */}
          <div className="mt-auto flex flex-col border-t bg-card/50 backdrop-blur-md p-3 gap-2 transition-all duration-300">
            {/* Primary Action: Completed Tasks */}
            <Button
              variant={completedSidebarOpen ? "secondary" : "ghost"}
              onClick={toggleCompletedSidebar}
              className={cn(
                "w-full justify-start transition-all duration-300 overflow-hidden",
                sidebarCollapsed ? "px-0 justify-center h-10" : "px-3 bg-secondary/30 hover:bg-secondary/60"
              )}
              title={t('dailyTasks.completedToday', 'Completed Today')}
            >
              <CheckCircle className={cn("h-5 w-5 flex-shrink-0 transition-colors", !sidebarCollapsed ? "mr-3 text-primary" : (completedSidebarOpen ? "text-primary" : "text-muted-foreground"))} />
              {!sidebarCollapsed && (
                <span className="font-medium tracking-wide">
                  {t('dailyTasks.completed', 'Completed')}
                </span>
              )}
            </Button>

            {/* Utility Toolbar */}
            <div className={cn(
              "flex items-center transition-all duration-300",
              sidebarCollapsed ? "flex-col gap-2" : "flex-row justify-between pt-1 px-1"
            )}>
              <ThemeToggle />
              <LanguageSelector />
              
              <Link
                to="/settings"
                title={sidebarCollapsed ? t('settings.title') : undefined}
                className={cn(
                  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-9 w-9 text-muted-foreground hover:scale-105 active:scale-95 duration-200",
                  !sidebarCollapsed && "ml-1"
                )}
              >
                <Settings className="h-5 w-5" />
              </Link>
            </div>

            {/* Desktop Only: Collapse Sidebar Indicator */}
            <div className="hidden md:block pt-1 mt-1 border-t border-border/40">
               <Button
                 variant="ghost"
                 size="sm"
                 onClick={toggleSidebar}
                 className={cn(
                   "w-full text-muted-foreground hover:text-foreground h-8 transition-all overflow-hidden",
                    sidebarCollapsed && "px-0"
                 )}
               >
                 {sidebarCollapsed ? (
                   <ChevronRight className="h-4 w-4 mx-auto" />
                 ) : (
                   <div className="flex items-center justify-center gap-2 w-full opacity-80 hover:opacity-100">
                     <ChevronLeft className="h-4 w-4" />
                     <span className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">Collapse</span>
                   </div>
                 )}
               </Button>
            </div>
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
          "transition-all duration-300 min-h-screen flex flex-col",
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
        <div 
          className="container mx-auto py-4 md:py-6 flex-1"
          style={{
            paddingLeft: 'calc(1rem + env(safe-area-inset-left))',
            paddingRight: 'calc(1rem + env(safe-area-inset-right))'
          }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}