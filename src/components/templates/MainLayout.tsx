import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
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
  { name: 'accounts', href: '/accounts', icon: Users },
  { name: 'levels', href: '/levels', icon: Trophy },
  { name: 'requests', href: '/requests', icon: FileText },
  { name: 'purchaseEvents', href: '/purchase-events', icon: ShoppingCart },
  { name: 'events', href: '/events', icon: Calendar },
];

export function MainLayout({ children }: MainLayoutProps) {
  const location = useLocation();
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
          <nav className="flex-1 space-y-1 p-4">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {t(`nav.${item.name}`)}
                </Link>
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