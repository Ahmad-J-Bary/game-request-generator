// src/components/templates/MainLayout.tsx
import { ReactNode, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
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
  X,
  Table,
  Settings,
  SlidersHorizontal,
  Database,
  Network,
  MessageSquare,
  Palette,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@grq/ui/lib/utils';
import { useSettings } from '@grq/ui/contexts/SettingsContext';
import { Button } from '@grq/ui/atoms/button';
import { CompletedTasksSidebar } from '@grq/ui/organisms/CompletedTasksSidebar';

interface MainLayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'dashboard',      href: '/',               icon: LayoutDashboard },
  { name: 'games',          href: '/games',           icon: Gamepad2 },
  { name: 'gamesTable',     href: '/games-table',     icon: Table },
  { name: 'accounts',       href: '/accounts',        icon: Users },
  { name: 'accountsDetail', href: '/accounts/detail', icon: FileText },
  { name: 'dailyTasks',     href: '/daily-tasks',     icon: Calendar },
];

const settingsNavigation = [
  { name: 'appearance', href: '/settings/appearance', icon: Palette,      labelKey: 'settings.appearance' },
  { name: 'database',   href: '/settings/database',   icon: Database,     labelKey: 'settings.database'   },
  { name: 'proxy',      href: '/settings/proxy',      icon: Network,      labelKey: 'settings.proxy'      },
  { name: 'telegram',   href: '/settings/telegram',   icon: MessageSquare,labelKey: 'settings.telegram'   },
];

export function MainLayout({ children }: MainLayoutProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar, completedSidebarOpen, toggleCompletedSidebar } = useSettings();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isSettingsActive = location.pathname.startsWith('/settings');
  // When sidebar is expanded, auto-expand settings group if on any settings page
  const [settingsOpen, setSettingsOpen] = useState(isSettingsActive);

  const toggleSettings = () => {
    if (!sidebarCollapsed) {
      setSettingsOpen(o => !o);
    }
  };

  return (
    <div className="min-h-screen bg-background">

      {/* ═══════════════════════════════════════════════
          MOBILE TOP HEADER  (hidden on md+)
      ══════════════════════════════════════════════════*/}
      <header
        className="lg:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between border-b border-border/40 bg-background/70 backdrop-blur-xl shadow-sm"
        style={{
          paddingTop:    'env(safe-area-inset-top)',
          paddingLeft:   'calc(1rem + env(safe-area-inset-left))',
          paddingRight:  'calc(1rem + env(safe-area-inset-right))',
          height:        'calc(3.5rem + env(safe-area-inset-top))',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl overflow-hidden bg-background shadow-md">
            <img src="/icon.png" alt="Logo" className="h-full w-full object-cover" />
          </div>
          <span className="font-bold text-base tracking-tight bg-gradient-to-r from-primary via-primary/80 to-primary/50 bg-clip-text text-transparent">
            Game Manager
          </span>
        </div>

        {/* Utility drawer trigger */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDrawerOpen(true)}
          className="h-9 w-9 rounded-xl hover:bg-accent relative"
        >
          <SlidersHorizontal className="h-5 w-5" />
        </Button>
      </header>

      {/* ═══════════════════════════════════════════════
          MOBILE UTILITY DRAWER  (slides in from right)
      ══════════════════════════════════════════════════*/}
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden',
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setDrawerOpen(false)}
      />

      {/* Drawer panel */}
      <div
        className={cn(
          'fixed top-0 right-0 bottom-0 z-50 w-72 flex flex-col lg:hidden',
          'bg-card/95 backdrop-blur-2xl border-l border-border/40 shadow-2xl',
          'transition-transform duration-300 ease-out',
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{
          paddingTop:   'env(safe-area-inset-top)',
          paddingRight: 'env(safe-area-inset-right)',
          paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))',
        }}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center shadow">
              <SlidersHorizontal className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm tracking-wide text-foreground">
              {t('settings.title', 'Settings & Tools')}
            </span>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Drawer body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {/* Settings group label */}
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-1 mb-1">
            {t('settings.title', 'Settings')}
          </p>

          {/* Settings sub-links */}
          {settingsNavigation.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.name}
                to={item.href}
                onClick={() => setDrawerOpen(false)}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary text-primary-foreground' : 'bg-accent/40 hover:bg-accent text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {t(item.labelKey, item.name)}
              </NavLink>
            );
          })}

          <div className="pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-1 mb-1">
              {t('settings.tools', 'Tools')}
            </p>
          </div>

          {/* Completed Tasks */}
          <button
            onClick={() => {
              toggleCompletedSidebar();
              setDrawerOpen(false);
            }}
            className={cn(
              'w-full flex items-center gap-3 rounded-xl px-4 py-3 transition-colors text-left',
              completedSidebarOpen
                ? 'bg-primary/20 text-primary ring-1 ring-primary/30'
                : 'bg-accent/40 hover:bg-accent'
            )}
          >
            <CheckCircle className={cn('h-5 w-5', completedSidebarOpen ? 'text-primary' : 'text-emerald-500')} />
            <div className="flex-1">
              <p className="text-sm font-medium">{t('dailyTasks.completed', 'Completed')}</p>
              <p className="text-[10px] text-muted-foreground">{t('dailyTasks.completedToday', 'Completed Today')}</p>
            </div>
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          DESKTOP SIDEBAR  (hidden on mobile)
      ══════════════════════════════════════════════════*/}
      <aside
        className={cn(
          'hidden lg:flex fixed inset-y-0 left-0 z-50 flex-col border-r bg-card transition-all duration-300',
          sidebarCollapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b px-4 justify-between">
            {!sidebarCollapsed ? (
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg overflow-hidden flex items-center justify-center">
                  <img src="/icon.png" alt="Logo" className="h-full w-full object-cover" />
                </div>
                <span className="text-lg font-semibold whitespace-nowrap">Game Manager</span>
              </div>
            ) : (
              <div className="h-8 w-8 mx-auto rounded-lg overflow-hidden flex items-center justify-center">
                <img src="/icon.png" alt="Logo" className="h-full w-full object-cover" />
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-0.5 p-3 overflow-y-auto">
            {/* Main nav items */}
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
                  {!sidebarCollapsed && <span>{t(`nav.${item.name}`)}</span>}
                </NavLink>
              );
            })}

            {/* Divider before Settings */}
            <div className="my-2 border-t border-border/40" />

            {/* Settings Group Header */}
            {sidebarCollapsed ? (
              // When collapsed: just show Settings icon linking to /settings/appearance
              <NavLink
                to="/settings/appearance"
                className={() =>
                  cn(
                    'flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isSettingsActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )
                }
                title={t('settings.title', 'Settings')}
              >
                <Settings className="h-5 w-5 flex-shrink-0" />
              </NavLink>
            ) : (
              <>
                {/* Expandable Settings group header */}
                <button
                  onClick={toggleSettings}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isSettingsActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Settings className={cn('h-5 w-5 flex-shrink-0 transition-colors', isSettingsActive && 'text-primary')} />
                  <span className="flex-1 text-left">{t('settings.title', 'Settings')}</span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 transition-transform duration-200',
                      settingsOpen ? 'rotate-180' : ''
                    )}
                  />
                </button>

                {/* Settings sub-navigation */}
                <div
                  className={cn(
                    'ml-2 pl-4 border-l-2 border-border/50 space-y-0.5 overflow-hidden transition-all duration-300',
                    settingsOpen ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'
                  )}
                >
                  {settingsNavigation.map(item => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.name}
                        to={item.href}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                            isActive
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                          )
                        }
                      >
                        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>{t(item.labelKey, item.name)}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </>
            )}
          </nav>

          {/* Bottom Actions */}
          <div className="mt-auto flex flex-col border-t bg-card/50 backdrop-blur-md p-3 gap-2">
            <Button
              variant={completedSidebarOpen ? 'secondary' : 'ghost'}
              onClick={toggleCompletedSidebar}
              className={cn(
                'w-full justify-start transition-all overflow-hidden',
                sidebarCollapsed ? 'px-0 justify-center h-10' : 'px-3 bg-secondary/30 hover:bg-secondary/60'
              )}
              title={t('dailyTasks.completedToday', 'Completed Today')}
            >
              <CheckCircle className={cn('h-5 w-5 flex-shrink-0', !sidebarCollapsed ? 'mr-3 text-primary' : (completedSidebarOpen ? 'text-primary' : 'text-muted-foreground'))} />
              {!sidebarCollapsed && <span className="font-medium tracking-wide">{t('dailyTasks.completed', 'Completed')}</span>}
            </Button>

            {/* Collapse toggle */}
            <div className="pt-1 mt-1 border-t border-border/40">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSidebar}
                className={cn('w-full text-muted-foreground hover:text-foreground h-8', sidebarCollapsed && 'px-0')}
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

      {/* Completed Tasks Panel */}
      <CompletedTasksSidebar isOpen={completedSidebarOpen} onClose={toggleCompletedSidebar} />

      {/* ═══════════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════════════*/}
      <main
        className={cn(
          'transition-all duration-300 min-h-screen flex flex-col',
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64',
          completedSidebarOpen ? 'lg:pr-96' : 'pr-0',
        )}
        style={{
          paddingTop:    'calc(3.5rem + env(safe-area-inset-top))',   // below mobile header
          paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))',  // above mobile bottom nav
        }}
      >
        <div
          className="w-full xl:max-w-[1920px] mx-auto py-2 lg:py-4 flex-1"
          style={{
            paddingLeft:  'env(safe-area-inset-left)',
            paddingRight: 'env(safe-area-inset-right)',
          }}
        >
          {children}
        </div>
      </main>

      {/* ═══════════════════════════════════════════════
          MOBILE BOTTOM NAVIGATION BAR  (hidden on md+)
      ══════════════════════════════════════════════════*/}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex items-stretch bg-background/80 backdrop-blur-xl border-t border-border/40 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft:   'env(safe-area-inset-left)',
          paddingRight:  'env(safe-area-inset-right)',
        }}
      >
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.name}
              to={item.href}
              end
              className={({ isActive }) =>
                cn(
                  'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-w-0 relative transition-colors duration-200',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active glow pill behind icon */}
                  {isActive && (
                    <span className="absolute top-1.5 h-7 w-10 rounded-full bg-primary/15 ring-1 ring-primary/20" />
                  )}
                  <Icon className={cn('h-[1.15rem] w-[1.15rem] relative z-10 transition-transform duration-200', isActive && 'scale-110')} strokeWidth={isActive ? 2.4 : 1.8} />
                  <span className={cn('text-[9px] font-medium tracking-tight leading-none relative z-10 truncate w-full text-center px-0.5', isActive ? 'text-primary' : 'text-muted-foreground')}>
                    {t(`nav.${item.name}`)}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}