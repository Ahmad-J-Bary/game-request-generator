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
  ShoppingCart
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeToggle } from '../molecules/ThemeToggle';
import { LanguageSelector } from '../molecules/LanguageSelector';

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

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 border-r bg-card">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b px-6">
            <Gamepad2 className="h-6 w-6 text-primary" />
            <span className="ml-2 text-lg font-semibold">Game Manager</span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4" role="navigation" aria-label="Main navigation">
            {navigation.map((item) => {
              const Icon = item.icon;

              // Use NavLink with `end` to require exact match so "/accounts" is NOT active on "/accounts/detail"
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
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )
                  }
                >
                  <Icon className="h-5 w-5" />
                  {t(`nav.${item.name}`)}
                </NavLink>
              );
            })}
          </nav>

          {/* Settings */}
          <div className="border-t p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('theme.toggle')}</span>
              <ThemeToggle />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('language.select')}</span>
              <LanguageSelector />
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="pl-64">
        <div className="container mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
