import { useState, useEffect } from 'react';
import { Database, ShieldCheck, Loader2, Save, CloudUpload, History, CloudDownload } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@grq/ui/atoms/button';
import { Input } from '@grq/ui/atoms/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@grq/ui/atoms/card';
import { toast } from 'sonner';
import { Badge } from '@grq/ui/atoms/badge';
import { cn } from '@grq/ui/lib/utils';
import { useTranslation } from 'react-i18next';

export function SyncSettingsPanel() {
  const { t } = useTranslation();
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const config = await invoke<any>('get_sync_config');
      setBotToken(config.bot_token || '');
      setChatId(config.chat_id || '');
      setEnabled(config.enabled || false);
    } catch (error) {
      console.error('Failed to load Sync config:', error);
      toast.error(t('errors.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await invoke('set_sync_config', {
        botToken: botToken || null,
        chatId: chatId || null,
        enabled
      });
      toast.success(t('common.success'));
    } catch (error) {
      console.error('Failed to save Sync config:', error);
      toast.error(t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleBackupNow = async () => {
    if (!botToken || !chatId) {
      toast.error(t('settings.sync.backupFailed'));
      return;
    }
    try {
      setBackingUp(true);
      await invoke('backup_database_now');
      toast.success(t('settings.sync.backupSuccess'));
    } catch (error: any) {
      console.error('Backup failed:', error);
      toast.error(`${t('settings.sync.backupFailed')}: ${error}`);
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = async () => {
    if (!botToken || !chatId) {
      toast.error(t('settings.sync.restoreFailed'));
      return;
    }

    // Safety confirmation as this is destructive
    const confirmed = window.confirm(t('settings.sync.restoreConfirm'));
    if (!confirmed) return;

    try {
      setRestoring(true);
      await invoke('restore_database_from_telegram');
      toast.success(t('settings.sync.restoreSuccess'), {
        duration: 6000,
      });
    } catch (error: any) {
      console.error('Restore failed:', error);
      toast.error(`${t('settings.sync.restoreFailed')}: ${error}`);
    } finally {
      setRestoring(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  return (
    <Card className="border-sky-500/20 bg-sky-500/5 backdrop-blur-sm shadow-xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-sky-500/10 flex items-center justify-center">
              <Database className="h-5 w-5 text-sky-500" />
            </div>
            <div>
              <CardTitle className="text-lg">{t('settings.sync.title')}</CardTitle>
              <CardDescription className="text-[10px] mt-0.5">
                {t('settings.sync.subtitle')}
              </CardDescription>
            </div>
          </div>
          <Badge variant={enabled ? "default" : "secondary"} className={cn("rounded-lg", enabled ? "bg-sky-500 hover:bg-sky-600" : "")}>
            {enabled ? t('common.yes') : t('common.no')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('settings.sync.botToken')}</label>
            <Input
              type="password"
              placeholder="123456:ABC-DEF..."
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              className="bg-background/40 border-sky-500/20 focus:border-sky-500 rounded-xl h-11"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('settings.sync.chatId')}</label>
            <Input
              placeholder="-100..."
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              className="bg-background/40 border-sky-500/20 focus:border-sky-500 rounded-xl h-11"
            />
          </div>
        </div>

        <div className="flex flex-col gap-4 py-2">
          <div className={cn(
            "flex items-center justify-between p-4 rounded-2xl transition-all duration-300 border-2",
            enabled ? "bg-sky-500/10 border-sky-500/20 shadow-inner" : "bg-background/40 border-border/40"
          )}>
            <div className="space-y-0.5">
              <div className="text-sm font-bold flex items-center gap-2">
                {t('settings.sync.enabled')}
                {enabled && <ShieldCheck className="h-3.5 w-3.5 text-sky-500" />}
              </div>
              <div className="text-[10px] text-muted-foreground">Toggle connectivity for database sync bot</div>
            </div>
            <button
               onClick={() => setEnabled(!enabled)}
               className={cn(
                 "relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2",
                 enabled ? "bg-sky-500 shadow-lg shadow-sky-500/20" : "bg-muted"
               )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-all duration-300 shadow-sm",
                enabled ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-sky-500/10">
          <Button 
            className="rounded-xl h-11 font-bold shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 transition-all active:scale-95"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            {t('common.save')}
          </Button>
          <Button 
            variant="outline" 
            className="rounded-xl h-11 font-bold border-sky-500/30 hover:bg-sky-500/5 text-sky-600 transition-all active:scale-95"
            onClick={handleBackupNow}
            disabled={backingUp || restoring || !botToken || !chatId}
          >
            {backingUp ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t('settings.sync.backupInProgress')}
              </>
            ) : (
              <>
                <CloudUpload className="h-4 w-4 mr-2" />
                {t('settings.sync.backupNow')}
              </>
            )}
          </Button>
          <Button 
            variant="outline" 
            className="rounded-xl h-11 font-bold border-amber-500/30 hover:bg-amber-500/5 text-amber-600 transition-all active:scale-95"
            onClick={handleRestore}
            disabled={restoring || backingUp || !botToken || !chatId}
          >
            {restoring ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t('settings.sync.restoreInProgress')}
              </>
            ) : (
              <>
                <CloudDownload className="h-4 w-4 mr-2" />
                {t('settings.sync.restoreNow')}
              </>
            )}
          </Button>
        </div>

        <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex gap-3 items-start backdrop-blur-sm">
          <History className="h-4 w-4 text-sky-600 mt-1 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-[11px] text-sky-800 font-medium leading-tight">
              {t('settings.sync.subtitle')}
            </p>
            <p className="text-[10px] text-sky-600/70 leading-relaxed italic">
              Your database will be sent as a .sqlite file. Recommended for daily backups to avoid data loss.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
