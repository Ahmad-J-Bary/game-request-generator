// src/components/templates/MainLayout.tsx
import { ReactNode, useState, useEffect } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@grq/ui/atoms/dropdown-menu';
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
  { name: 'appearance', href: '/settings/appearance', icon: Palette,      labelKey: 'settings.appearance.title' },
  { name: 'database',   href: '/settings/database',   icon: Database,     labelKey: 'settings.database.title'   },
  { name: 'proxy',      href: '/settings/proxy',      icon: Network,      labelKey: 'settings.proxy.title' },
  { name: 'telegram',   href: '/settings/telegram',   icon: MessageSquare,labelKey: 'settings.telegram.title'   },
  { name: 'sync',       href: '/settings/sync',       icon: Database,     labelKey: 'settings.sync.title' },
];

export function MainLayout({ children }: MainLayoutProps) {
  const { t, i18n } = useTranslation();
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
      // Silently fail or log sparingly for background checks to avoid console spam
      if ((import.meta as any).env?.DEV) {
        console.warn('Telegram background check failed (likely network or invalid token).');
      }
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
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl overflow-hidden bg-background shadow-md">
            <img src="/icon.png" alt="Logo" className="h-full w-full object-cover" />
          </div>
          <span className="font-bold text-base tracking-tight bg-gradient-to-r from-primary via-primary/80 to-primary/50 bg-clip-text text-transparent">
            {t('nav.gameManager')}
          </span>
        </div>

        {/* Header right actions: Proxy shortcut + Completed shortcut + Drawer trigger */}
        <div className="flex items-center gap-1.5">
          {/* Quick Proxy button */}
          <button
            onClick={() => setProxySheetOpen(true)}
            className="relative h-9 w-9 flex items-center justify-center rounded-xl hover:bg-emerald-500/10 transition-colors group"
            title={t('settings.proxy.title')}
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
            title={t('dailyTasks.completed')}
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
            title={t('settings.telegramImport.title')}
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
          'fixed top-0 bottom-0 z-50 w-72 flex flex-col lg:hidden',
          'bg-card/95 backdrop-blur-2xl border-inline-end border-border/40 shadow-2xl',
          'transition-all duration-300 ease-out',
          'end-0',
          drawerOpen 
            ? 'translate-x-0' 
            : 'translate-x-full rtl:-translate-x-full'
        )}
        style={{
          paddingTop:   'env(safe-area-inset-top)',
          paddingInlineEnd: 'env(safe-area-inset-right)',
          paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))',
        }}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <div className="flex items-center gap-3">
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
                {t('common.open', 'Open')}
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
          'hidden lg:flex fixed inset-y-0 z-50 flex-col border-inline-end bg-card start-0 transition-all duration-300',
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
                <span className="text-lg font-semibold whitespace-nowrap">{t('nav.gameManager')}</span>
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

            {/* Spacer to push items to the middle */}
            <div className="py-8" />
            
            {/* Secondary Action Items (Middle) */}
            <div className="pt-4 mt-2 border-t border-border/20 space-y-1">
              {/* Telegram Import Button (Now in Middle) */}
              <button
                onClick={() => setTelegramImportOpen(true)}
                className={cn(
                  'w-full flex items-center transition-all px-3 py-2 rounded-xl text-sm font-medium group relative active:scale-[0.98]',
                  telegramImportOpen ? 'bg-primary/10 text-primary shadow-sm' : 'text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground',
                  sidebarCollapsed && 'justify-center px-0'
                )}
                title={sidebarCollapsed ? t('settings.telegramImport.title') : undefined}
              >
                 <MessageSquare className={cn('h-5 w-5 flex-shrink-0 transition-colors', !sidebarCollapsed ? 'me-3' : '', telegramImportOpen ? 'text-primary' : 'group-hover:text-primary')} />
                 {!sidebarCollapsed && <span className="flex-1 ltr:text-left rtl:text-right">{t('settings.telegramImport.title')}</span>}
                 {pendingImportsCount > 0 && (
                  <span className={cn(
                    "flex h-2 w-2 rounded-full bg-red-500 ring-2 ring-background",
                    sidebarCollapsed ? "absolute top-1.5 right-1.5" : "ms-2"
                  )}>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  </span>
                 )}
              </button>

              {/* Completed Tasks Quick Access (Now in Middle) */}
              <button
                onClick={toggleCompletedSidebar}
                className={cn(
                  'w-full flex items-center transition-all px-3 py-2 rounded-xl text-sm font-medium active:scale-[0.98]',
                  completedSidebarOpen ? 'bg-secondary/40 text-primary shadow-sm' : 'text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground',
                  sidebarCollapsed && 'justify-center px-0'
                )}
                title={sidebarCollapsed ? t('dailyTasks.completed') : undefined}
              >
                <CheckCircle className={cn('h-5 w-5 flex-shrink-0 transition-colors', !sidebarCollapsed ? 'ltr:mr-3 rtl:ml-3' : '', completedSidebarOpen ? 'text-primary' : '')} />
                {!sidebarCollapsed && <span className="flex-1 ltr:text-left rtl:text-right">{t('dailyTasks.completed')}</span>}
              </button>
            </div>
          </nav>

          {/* Bottom Control Bar - Unified & Modernized */}
          <div className="mt-auto p-3 border-t border-border/40 bg-card/60 backdrop-blur-xl relative">
            <div className={cn(
              "flex items-center gap-2",
              sidebarCollapsed ? "flex-col" : "justify-between"
            )}>
              {/* Settings Group - Anchored in corner, expands UPWARDS */}
              <div className="relative group">
                {sidebarCollapsed ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-xl transition-all active:scale-90 outline-none hover:bg-accent/70',
                          isSettingsActive ? 'bg-primary/10 text-primary shadow-lg ring-1 ring-primary/20' : 'text-muted-foreground'
                        )}
                      >
                        <Settings className="h-5 w-5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent 
                      side={sidebarCollapsed ? (i18n.dir() === 'rtl' ? "left" : "right") : "bottom"} 
                      align="end" 
                      sideOffset={14} 
                      className={cn(
                        "w-48 bg-card/85 backdrop-blur-xl border-border/40 shadow-2xl p-1.5 duration-200",
                        "animate-in slide-in-from-inline-start-2"
                      )}
                    >
                      <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 px-2 pb-1.5">
                        {t('settings.title', 'Settings')}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator className="bg-border/40 mb-1" />
                      {settingsNavigation.map((item) => {
                        const Icon = item.icon;
                        const isProxy = item.name === 'proxy';
                        const isActive = location.pathname === item.href;
                        
                        return (
                          <DropdownMenuItem
                            key={item.name}
                            onClick={() => isProxy ? setProxySheetOpen(true) : undefined}
                            asChild={!isProxy}
                            className={cn(
                              "flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-pointer text-xs font-semibold transition-all",
                              isActive ? "bg-primary/10 text-primary" : "text-muted-foreground focus:bg-accent/50 focus:text-foreground"
                            )}
                          >
                            {isProxy ? (
                              <div className="w-full flex items-center gap-2.5">
                                <Icon className="h-4 w-4 text-emerald-500" />
                                <span className="flex-1 ltr:text-left rtl:text-right">{t(item.labelKey, item.name)}</span>
                                <span className="text-[8px] font-bold text-emerald-500 bg-emerald-500/10 px-1 py-0.5 rounded-full border border-emerald-500/20">{t('common.live')}</span>
                              </div>
                            ) : (
                              <Link to={item.href} className="w-full h-full flex items-center gap-2.5">
                                <Icon className="h-4 w-4" />
                                <span className="flex-1 ltr:text-left rtl:text-right">{t(item.labelKey, item.name)}</span>
                              </Link>
                            )}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <div className="relative">
                    {/* The Upward Expanding Panel */}
                    <div className={cn(
                      'absolute bottom-full mb-3 w-52 overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] origin-bottom',
                      'start-0',
                      settingsOpen ? 'max-h-[30rem] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
                    )}>
                      <div className="bg-card/95 backdrop-blur-2xl border border-border/40 rounded-2xl p-2 shadow-2xl shadow-primary/10 ps-0.5 mb-1.5">
                        <div className="px-2 pb-2 mb-2 border-b border-border/40">
                             <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">{t('settings.systemManagement')}</span>
                        </div>
                        <div className="space-y-1">
                          {settingsNavigation.map(item => {
                            const Icon = item.icon;
                            const isProxy = item.name === 'proxy';
                            const isActive = location.pathname === item.href;
                            
                            const ItemContent = (
                              <>
                                <div className={cn(
                                  "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-all border shadow-sm",
                                  isActive 
                                    ? "bg-primary text-primary-foreground border-primary/50 shadow-primary/20" 
                                    : "bg-background/80 text-muted-foreground border-border/40 group-hover:bg-accent/50 group-hover:text-primary"
                                )}>
                                  <Icon className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                  <span className={cn(
                                    "text-xs font-bold tracking-tight truncate",
                                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                                  )}>
                                    {t(item.labelKey, item.name)}
                                  </span>
                                  {isProxy && <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                                </div>
                              </>
                            );

                            if (isProxy) {
                              return (
                                <button key={item.name} onClick={() => setProxySheetOpen(true)} className="w-full group flex items-center gap-3 rounded-xl p-1.5 transition-all hover:bg-white/5 outline-none active:scale-[0.98]">
                                  {ItemContent}
                                </button>
                              );
                            }
                            return (
                              <NavLink key={item.name} to={item.href} className={({ isActive }) => cn('group flex items-center gap-3 rounded-xl p-1.5 transition-all outline-none active:scale-[0.98]', isActive ? 'bg-primary/5' : 'hover:bg-white/5')}>
                                {ItemContent}
                              </NavLink>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Footer Settings Trigger */}
                    <button
                      onClick={toggleSettings}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-black uppercase tracking-widest transition-all active:scale-95 outline-none',
                        isSettingsActive ? 'bg-primary/10 text-primary shadow-sm' : 'text-muted-foreground/60 hover:text-primary'
                      )}
                    >
                      <Settings className={cn('h-5 w-5 transition-colors', isSettingsActive && 'animate-spin-slow')} />
                      <span>{t('settings.title', 'Settings')}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Modern Collapse Toggle */}
              <button
                onClick={toggleSidebar}
                className={cn(
                  'h-10 w-10 flex items-center justify-center rounded-xl transition-all text-muted-foreground hover:bg-accent hover:text-primary group active:scale-90',
                  !sidebarCollapsed && 'hover:shadow-md border border-transparent hover:border-primary/20'
                )}
                title={sidebarCollapsed ? t('nav.expand') : t('nav.collapse')}
              >
                {sidebarCollapsed ? (
                  <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5 rtl:-translate-x-0.5 rtl:rotate-180" />
                ) : (
                  <ChevronLeft className="h-5 w-5 transition-transform group-hover:-translate-x-0.5 rtl:translate-x-0.5 rtl:rotate-180" />
                )}
              </button>
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
          'hidden lg:flex fixed inset-y-0 z-40 flex-col bg-card/95 backdrop-blur-xl border-inline-start border-border/40 shadow-2xl transition-all duration-300',
          'w-[26rem] xl:w-[30rem] 2xl:w-[34rem]',
          'end-0',
          proxyPinned ? 'translate-x-0' : 'ltr:translate-x-full rtl:-translate-x-full'
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
              <p className="text-sm font-bold leading-tight truncate">{t('settings.proxy.title')}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t('settings.proxy.subtitle')}</p>
            </div>
          </div>

          {/* Action buttons row — clearly separated */}
          <div className="flex items-center gap-2 px-5 pb-3">
            <button
              onClick={() => setProxyPinned(false)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
            >
              <PinOff className="h-3.5 w-3.5" />
              {t('settings.proxy.unpin')}
            </button>
            <div className="h-4 w-px bg-border/60" />
            <button
              onClick={() => { setProxyPinned(false); setProxySheetOpen(true); }}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              {t('common.close')}
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
          sidebarCollapsed ? 'lg:ps-16' : 'lg:ps-64',
          completedSidebarOpen
            ? 'lg:pe-96'
            : proxyPinned
              ? 'lg:pe-[26rem] xl:pe-[30rem] 2xl:pe-[34rem]'
              : ''
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
                <SheetTitle className="text-base font-bold ltr:text-left rtl:text-right">
                  {t('settings.proxy.title')}
                </SheetTitle>
                <SheetDescription className="ltr:text-left rtl:text-right">
                  {t('settings.proxy.subtitle')}
                </SheetDescription>
              </div>
            </div>

            {/* Pin action — desktop only, placed below title clearly */}
            <div className="hidden lg:flex items-center mt-3 pt-3 border-t border-border/40">
              <button
                onClick={handlePinProxy}
                className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors group"
              >
                <Pin className="h-3.5 w-3.5 group-hover:scale-110 transition-transform ltr:rotate-0 rtl:-rotate-90" />
                {t('settings.proxy.pinToScreen')}
              </button>
              <p className="mx-3 text-[10px] text-muted-foreground">{t('settings.proxy.splitScreen')}</p>
            </div>
          </SheetHeader>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 pb-8">
            <ProxySettingsPanel />
          </div>
        </SheetContent>
      </Sheet>

      {/* Import Accounts Dialog */}
      <TelegramImportDialog 
        open={telegramImportOpen} 
        onOpenChange={setTelegramImportOpen} 
      />
    </div>
  );
}