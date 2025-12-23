// src/components/templates/MainLayout.tsx
import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  LayoutDashboard, 
  Gamepad2, 
  Users, 
  Trophy, 
  FileText, 
  Calendar,
  ShoppingCart,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeToggle } from '../molecules/ThemeToggle';
import { LanguageSelector } from '../molecules/LanguageSelector';
import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { Button } from '../ui/button';

interface MainLayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'dashboard', href: '/', icon: LayoutDashboard },
  { name: 'games', href: '/games', icon: Gamepad2 },
  { name: 'levels', href: '/levels', icon: Trophy },
  { name: 'purchaseEvents', href: '/purchase-events', icon: ShoppingCart },
  { name: 'accounts', href: '/accounts', icon: Users },
  { name: 'accountsDetail', href: '/accounts/detail', icon: FileText },
  { name: 'requests', href: '/requests', icon: FileText },
  { name: 'events', href: '/events', icon: Calendar },
];

export function MainLayout({ children }: MainLayoutProps) {
  const { t } = useTranslation();
  const { sidebarCollapsed, toggleSidebar } = useSettings();

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-50 border-r bg-card transition-all duration-300",
          sidebarCollapsed ? "w-16" : "w-64"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b px-6 justify-between">
            {!sidebarCollapsed && (
              <>
                <Gamepad2 className="h-6 w-6 text-primary" />
                <span className="ml-2 text-lg font-semibold">Game Manager</span>
              </>
            )}
            {sidebarCollapsed && (
              <Gamepad2 className="h-6 w-6 text-primary mx-auto" />
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4" role="navigation" aria-label="Main navigation">
            {navigation.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  end
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      sidebarCollapsed && 'justify-center'
                    )
                  }
                  title={sidebarCollapsed ? t(`nav.${item.name}`) : undefined}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {!sidebarCollapsed && t(`nav.${item.name}`)}
                </NavLink>
              );
            })}
          </nav>

          {/* Quick Settings */}
          <div className="border-t p-4 space-y-2">
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
                <div className="flex items-center justify-between pt-2 border-t">
                  <Link
                    to="/settings"
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                    {t('settings.title')}
                  </Link>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <ThemeToggle />
                <LanguageSelector />
                <Link
                  to="/settings"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title={t('settings.title')}
                >
                  <Settings className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>

          {/* Toggle Button */}
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSidebar}
              className="w-full"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  <span className="text-sm">Collapse</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main 
        className={cn(
          "transition-all duration-300",
          sidebarCollapsed ? "pl-16" : "pl-64"
        )}
      >
        <div className="container mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}