// src/components/templates/MainLayout.tsx
import { ReactNode, useState, useEffect } from 'react';
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
  Pin,
  PinOff,
} from 'lucide-react';
import { cn } from '@grq/ui/lib/utils';
import { useSettings } from '@grq/ui/contexts/SettingsContext';
import { Button } from '@grq/ui/atoms/button';
import { CompletedTasksSidebar } from '@grq/ui/organisms/CompletedTasksSidebar';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@grq/ui/atoms/sheet';
import { ProxySettingsPanel } from '@grq/ui/molecules/ProxySettingsPanel';
import { TelegramImportDialog } from '@grq/ui/organisms/TelegramImportDialog';
import { TauriService } from '@grq/core/services/tauri.service';

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
  { name: 'proxy',      href: '/settings/proxy',      icon: Network,      labelKey: 'settings.proxy.title' },
  { name: 'telegram',   href: '/settings/telegram',   icon: MessageSquare,labelKey: 'settings.telegram'   },
];

export function MainLayout({ children }: MainLayoutProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar, completedSidebarOpen, toggleCompletedSidebar } = useSettings();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [proxySheetOpen, setProxySheetOpen] = useState(false);
  const [proxyPinned, setProxyPinned] = useState(false);
  const [telegramImportOpen, setTelegramImportOpen] = useState(false);
  const [pendingImportsCount, setPendingImportsCount] = useState(0);

  // Periodically check for Telegram updates
  const checkTelegramUpdates = async () => {
    try {
      const updates = await TauriService.getTelegramUpdates();
      setPendingImportsCount(updates.length);
    } catch (error) {
      console.error('Failed to check Telegram updates:', error);
    }
  };

  useEffect(() => {
    checkTelegramUpdates();
    const interval = setInterval(checkTelegramUpdates, 5 * 60 * 1000); // 5 mins
    return () => clearInterval(interval);
  }, []);

  const handlePinProxy = () => {
    setProxyPinned(true);
    setProxySheetOpen(false);
  };

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

        {/* Header right actions: Proxy shortcut + Completed shortcut + Drawer trigger */}
        <div className="flex items-center gap-1.5">
          {/* Quick Proxy button */}
          <button
            onClick={() => setProxySheetOpen(true)}
            className="relative h-9 w-9 flex items-center justify-center rounded-xl hover:bg-emerald-500/10 transition-colors group"
            title="Proxy Settings"
          >
            <Network className="h-4.5 w-4.5 text-emerald-500 group-hover:scale-110 transition-transform" />
          </button>

          {/* Quick Completed Tasks button */}
          <button
            onClick={toggleCompletedSidebar}
            className={cn(
              "relative h-9 w-9 flex items-center justify-center rounded-xl transition-colors group",
              completedSidebarOpen
                ? "bg-primary/10 hover:bg-primary/20"
                : "hover:bg-primary/10"
            )}
            title="Completed Tasks"
          >
            <CheckCircle className={cn(
              "h-4.5 w-4.5 group-hover:scale-110 transition-transform",
              completedSidebarOpen ? "text-primary" : "text-primary/70"
            )} />
          </button>

          {/* Telegram Import button */}
          <button
            onClick={() => setTelegramImportOpen(true)}
            className="relative h-9 w-9 flex items-center justify-center rounded-xl hover:bg-primary/10 transition-colors group"
            title="Telegram Imports"
          >
            <MessageSquare className="h-4.5 w-4.5 text-primary/70 group-hover:scale-110 transition-transform" />
            {pendingImportsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            )}
          </button>

          {/* Utility drawer trigger */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDrawerOpen(true)}
            className="h-9 w-9 rounded-xl hover:bg-accent relative"
          >
            <SlidersHorizontal className="h-5 w-5" />
          </Button>
        </div>
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

          {/* Settings sub-links in mobile drawer */}
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
          {/* Tools group label */}
          <div className="pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-1 mb-1">
              {t('settings.tools', 'Tools')}
            </p>
          </div>

          {/* Completed Tasks — styled like Settings sub-links */}
          <button
            onClick={() => {
              toggleCompletedSidebar();
              setDrawerOpen(false);
            }}
            className={cn(
              'w-full flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors text-left',
              completedSidebarOpen
                ? 'bg-primary text-primary-foreground'
                : 'bg-accent/40 hover:bg-accent text-foreground'
            )}
          >
            <CheckCircle className={cn('h-4 w-4 shrink-0', completedSidebarOpen ? 'text-primary-foreground' : 'text-emerald-500')} />
            <span className="flex-1">{t('dailyTasks.completed', 'Completed')}</span>
            {completedSidebarOpen && (
              <span className="text-[10px] font-bold bg-primary-foreground/20 text-primary-foreground px-1.5 py-0.5 rounded-full">
                Open
              </span>
            )}
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
                    const isProxy = item.name === 'proxy';
                    if (isProxy) {
                      return (
                        <button
                          key={item.name}
                          onClick={() => setProxySheetOpen(true)}
                          className="w-full flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        >
                          <Icon className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                          <span className="flex-1 text-left">{t(item.labelKey, item.name)}</span>
                          <span className="text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-1 py-0.5 rounded-full">Quick</span>
                        </button>
                      );
                    }
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
          PROXY PINNED PANEL  (desktop only, split-view)
      ══════════════════════════════════════════════════*/}
      <div
        className={cn(
          'hidden lg:flex fixed inset-y-0 right-0 z-40 flex-col bg-card/95 backdrop-blur-xl border-l border-border/40 shadow-2xl transition-all duration-300',
          'w-[26rem] xl:w-[30rem] 2xl:w-[34rem]',
          proxyPinned ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Pinned panel header */}
        <div className="flex flex-col border-b border-border/40 bg-card/80 backdrop-blur-md">
          {/* Title row */}
          <div className="flex items-center gap-3 px-5 pt-4 pb-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Network className="h-4.5 w-4.5 text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-tight truncate">{t('settings.proxy.title', 'Proxy Network')}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Configure and test your proxy connection</p>
            </div>
          </div>

          {/* Action buttons row — clearly separated */}
          <div className="flex items-center gap-2 px-5 pb-3">
            <button
              onClick={() => setProxyPinned(false)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
            >
              <PinOff className="h-3.5 w-3.5" />
              Unpin
            </button>
            <div className="h-4 w-px bg-border/60" />
            <button
              onClick={() => { setProxyPinned(false); setProxySheetOpen(true); }}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Close
            </button>
          </div>
        </div>

        {/* Pinned panel content — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 pb-8">
          <ProxySettingsPanel />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════════════*/}
      <main
        className={cn(
          'transition-all duration-300 min-h-screen flex flex-col',
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64',
          completedSidebarOpen
            ? 'lg:pr-96'
            : proxyPinned
              ? 'lg:pr-[26rem] xl:pr-[30rem] 2xl:pr-[34rem]'
              : 'pr-0',
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

      {/* ═══════════════════════════════════════════════
          PROXY QUICK-ACCESS SHEET
      ══════════════════════════════════════════════════*/}
      <Sheet open={proxySheetOpen} onOpenChange={setProxySheetOpen}>
        <SheetContent side="right" className="flex flex-col w-full sm:max-w-lg p-0">
          <SheetHeader>
            <div className="flex items-center gap-3 pr-8">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Network className="h-4.5 w-4.5 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-base font-bold">
                  {t('settings.proxy.title', 'Proxy Network')}
                </SheetTitle>
                <SheetDescription>
                  Configure and test your proxy connection
                </SheetDescription>
              </div>
            </div>

            {/* Pin action — desktop only, placed below title clearly */}
            <div className="hidden lg:flex items-center mt-3 pt-3 border-t border-border/40">
              <button
                onClick={handlePinProxy}
                className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors group"
              >
                <Pin className="h-3.5 w-3.5 group-hover:scale-110 transition-transform" />
                Pin to screen
              </button>
              <p className="ml-3 text-[10px] text-muted-foreground">Split screen with app</p>
            </div>
          </SheetHeader>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 pb-8">
            <ProxySettingsPanel />
          </div>
        </SheetContent>
      </Sheet>

      {/* Telegram Import Center Dialog */}
      <TelegramImportDialog 
        open={telegramImportOpen} 
        onOpenChange={setTelegramImportOpen} 
      />
    </div>
  );
}