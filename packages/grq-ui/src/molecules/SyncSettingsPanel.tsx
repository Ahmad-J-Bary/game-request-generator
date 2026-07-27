import { useState, useEffect } from 'react';
import { Database, Loader2, Save, FolderOpen, Clock, HardDrive, CheckCircle2 } from 'lucide-react';
import { Button } from '@grq/ui/atoms/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@grq/ui/atoms/card';
import { toast } from 'sonner';
import { Badge } from '@grq/ui/atoms/badge';
import { cn } from '@grq/ui/lib/utils';
import { useTranslation } from 'react-i18next';
import { TauriService } from '@grq/core/services/tauri.service';

interface BackupConfig {
  useSameLocation: boolean;
  customPath: string | null;
  backupDir: string | null;
  lastCleanupDate: string | null;
  latestBackupTime: number | null;
}

export function SyncSettingsPanel() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [useSameLocation, setUseSameLocation] = useState(true);
  const [customPath, setCustomPath] = useState('');
  const [backupDir, setBackupDir] = useState<string | null>(null);
  const [latestBackupTime, setLatestBackupTime] = useState<number | null>(null);
  const [backingUp, setBackingUp] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const config: BackupConfig = await TauriService.getBackupConfig();
      setUseSameLocation(config.useSameLocation);
      setCustomPath(config.customPath || '');
      setBackupDir(config.backupDir);
      setLatestBackupTime(config.latestBackupTime);
    } catch (error) {
      console.error('Failed to load backup config:', error);
      toast.error(t('errors.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await TauriService.setBackupConfig(useSameLocation, useSameLocation ? null : customPath || null);
      toast.success(t('common.success'));
      // Reload to show updated backupDir
      await loadConfig();
    } catch (error) {
      console.error('Failed to save backup config:', error);
      toast.error(t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleBackupNow = async () => {
    try {
      setBackingUp(true);
      await TauriService.backupDatabaseLocalNow();
      toast.success(t('settings.sync.backupSuccess'));
      await loadConfig();
    } catch (error: any) {
      console.error('Backup failed:', error);
      toast.error(`${t('settings.sync.backupFailed')}: ${error}`);
    } finally {
      setBackingUp(false);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('settings.sync.selectFolder'),
      });
      if (selected) {
        setCustomPath(selected);
      }
    } catch (error) {
      console.error('Failed to open folder picker:', error);
    }
  };

  const formatBackupTime = (timestamp: number | null): string => {
    if (!timestamp) return t('common.none');
    const d = new Date(timestamp * 1000);
    return d.toLocaleString();
  };

  if (loading) return (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  return (
    <Card className="border-emerald-500/20 bg-emerald-500/5 backdrop-blur-sm shadow-xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Database className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <CardTitle className="text-lg">{t('settings.sync.title')}</CardTitle>
              <CardDescription className="text-[10px] mt-0.5">
                {t('settings.sync.subtitle')}
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="rounded-lg text-emerald-600 border-emerald-500/30">
            <HardDrive className="h-3 w-3 mr-1" /> {t('settings.sync.local')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {t('settings.sync.backupLocation')}
          </label>

          <label className={cn(
            "flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200",
            useSameLocation
              ? "bg-emerald-500/10 border-emerald-500/30 shadow-inner"
              : "bg-background/40 border-border/40 hover:border-emerald-500/20"
          )}>
            <input
              type="radio"
              name="backupLocation"
              checked={useSameLocation}
              onChange={() => setUseSameLocation(true)}
              className="h-4 w-4 accent-emerald-500"
            />
            <div className="space-y-0.5">
              <div className="text-sm font-bold">{t('settings.sync.sameAsDb')}</div>
              <div className="text-[10px] text-muted-foreground">{t('settings.sync.sameAsDbDesc')}</div>
            </div>
          </label>

          <label className={cn(
            "flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200",
            !useSameLocation
              ? "bg-emerald-500/10 border-emerald-500/30 shadow-inner"
              : "bg-background/40 border-border/40 hover:border-emerald-500/20"
          )}>
            <input
              type="radio"
              name="backupLocation"
              checked={!useSameLocation}
              onChange={() => setUseSameLocation(false)}
              className="h-4 w-4 accent-emerald-500"
            />
            <div className="space-y-0.5 flex-1">
              <div className="text-sm font-bold">{t('settings.sync.customPath')}</div>
              <div className="text-[10px] text-muted-foreground">{t('settings.sync.customPathDesc')}</div>
            </div>
          </label>

          {!useSameLocation && (
            <div className="flex items-center gap-2 pl-8">
              <div className="flex-1 px-3 py-2 rounded-xl bg-background/40 border border-border/40 text-xs text-muted-foreground truncate">
                {customPath || t('settings.sync.noFolderSelected')}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectFolder}
                className="shrink-0 h-9 rounded-xl"
              >
                <FolderOpen className="h-4 w-4 mr-1" /> {t('settings.sync.browse')}
              </Button>
            </div>
          )}
        </div>

        {backupDir && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-background/40 border border-border/40">
            <HardDrive className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="space-y-0.5 min-w-0">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {t('settings.sync.currentBackupDir')}
              </div>
              <div className="text-xs truncate">{backupDir}</div>
            </div>
          </div>
        )}

        {latestBackupTime && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-background/40 border border-border/40">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="space-y-0.5">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {t('settings.sync.latestBackup')}
              </div>
              <div className="text-xs">{formatBackupTime(latestBackupTime)}</div>
            </div>
          </div>
        )}

        {!latestBackupTime && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <Clock className="h-4 w-4 text-amber-600 shrink-0" />
            <div className="text-[11px] text-amber-700 font-medium">
              {t('settings.sync.noBackupYet')}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-emerald-500/10">
          <Button
            className="rounded-xl h-11 font-bold shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 transition-all active:scale-95"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin ltr:mr-2 rtl:ml-2" /> : <Save className="h-4 w-4 ltr:mr-2 rtl:ml-2" />}
            {t('common.save')}
          </Button>
          <Button
            variant="outline"
            className="rounded-xl h-11 font-bold border-emerald-500/30 hover:bg-emerald-500/5 text-emerald-600 transition-all active:scale-95"
            onClick={handleBackupNow}
            disabled={backingUp}
          >
            {backingUp ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin ltr:mr-2 rtl:ml-2" />
                {t('settings.sync.backupInProgress')}
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
                {t('settings.sync.backupNow')}
              </>
            )}
          </Button>
        </div>

        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex gap-3 items-start backdrop-blur-sm">
          <Database className="h-4 w-4 text-emerald-600 mt-1 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-[11px] text-emerald-800 font-medium leading-tight">
              {t('settings.sync.backupHint')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
