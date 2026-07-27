// src/pages/SettingsPage.tsx

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Settings, Database, MessageSquare, Palette } from 'lucide-react';
import { cn } from '@grq/ui/lib/utils';
import { StorageSettingsPanel } from '@grq/ui/molecules/StorageSettingsPanel';
import { TelegramSettingsPanel } from '@grq/ui/molecules/TelegramSettingsPanel';
import { AppearanceSettingsPanel } from '@grq/ui/molecules/AppearanceSettingsPanel';

type SettingTab = 'appearance' | 'storage' | 'telegram';

interface SettingsPageProps {
  section?: SettingTab;
}

export default function SettingsPage({ section }: SettingsPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeTab: SettingTab = section ?? 'appearance';

  const tabs = [
    { id: 'appearance' as const, label: t('settings.appearance.title', 'Appearance'),     icon: Palette,       href: '/settings/appearance', color: 'text-violet-500' },
    { id: 'storage'    as const, label: t('settings.storage.title', 'Database & Backup'), icon: Database,      href: '/settings/storage',    color: 'text-emerald-500' },
    { id: 'telegram'   as const, label: t('settings.telegram.title', 'Telegram Bot'),     icon: MessageSquare, href: '/settings/telegram',   color: 'text-amber-500'  },
  ];

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'appearance': return <AppearanceSettingsPanel />;
      case 'storage':    return <StorageSettingsPanel />;
      case 'telegram':   return <TelegramSettingsPanel />;
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-2 pt-1">
        <div className="h-10 w-10 bg-primary/10 text-primary flex items-center justify-center rounded-xl shadow-inner shrink-0">
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight leading-tight">
            {t('settings.title', 'Settings & Tools')}
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            {t('settings.description', 'Manage your app configuration and preferences.')}
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0">

        {/* ── MOBILE: 2×2 pill grid ── DESKTOP: vertical sidebar list ── */}
        <div className="shrink-0 md:w-52">
          {/* Mobile: 2-column grid */}
          <div className="grid grid-cols-2 gap-2 md:hidden px-1">
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => navigate(tab.href)}
                  className={cn(
                    'relative flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-xl text-xs font-semibold transition-all duration-200 border',
                    isActive
                      ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25 scale-[1.02]'
                      : 'bg-card text-muted-foreground border-border/60 hover:border-primary/40 hover:bg-accent/50 hover:text-foreground active:scale-95'
                  )}
                >
                  <div className={cn(
                    'h-8 w-8 rounded-lg flex items-center justify-center transition-colors',
                    isActive ? 'bg-primary-foreground/20' : 'bg-accent'
                  )}>
                    <Icon className={cn('h-4 w-4', isActive ? 'text-primary-foreground' : tab.color)} />
                  </div>
                  <span className="leading-none text-center">{tab.label}</span>
                  {isActive && (
                    <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 h-1 w-5 rounded-full bg-primary-foreground/50" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Desktop: vertical list */}
          <div className="hidden md:flex flex-col gap-1 px-1">
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => navigate(tab.href)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ltr:text-left rtl:text-right',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                  )}
                >
                  <div className={cn(
                    'h-7 w-7 rounded-md flex items-center justify-center shrink-0 transition-colors',
                    isActive ? 'bg-primary-foreground/20' : 'bg-accent'
                  )}>
                    <Icon className={cn('h-3.5 w-3.5', isActive ? 'text-primary-foreground' : tab.color)} />
                  </div>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Separator mobile */}
        <div className="h-px w-full bg-border/40 md:hidden" />

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto pb-6 min-h-0">
          <div key={activeTab} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {renderActivePanel()}
          </div>
        </div>
      </div>
    </div>
  );
}