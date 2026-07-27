import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Database, FolderOpen, RefreshCcw, Upload, Download, HardDrive,
  ArrowLeft, CheckCircle2, AlertTriangle, FileText, ExternalLink,
  Loader2, Save, Clock,
} from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { Button } from '@grq/ui/atoms/button';
import { Input } from '@grq/ui/atoms/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@grq/ui/atoms/card';
import { toast } from 'sonner';
import { Badge } from '@grq/ui/atoms/badge';
import { cn } from '@grq/ui/lib/utils';
import { TauriService } from '@grq/core/services/tauri.service';

interface BackupFile {
  name: string;
  path: string;
  label: string;
  size: number;
}

interface BackupConfig {
  useSameLocation: boolean;
  customPath: string | null;
  backupDir: string | null;
  lastCleanupDate: string | null;
  latestBackupTime: number | null;
}

export function StorageSettingsPanel() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [dbPath, setDbPath] = useState('');

  const [useSameLocation, setUseSameLocation] = useState(true);
  const [customPath, setCustomPath] = useState('');
  const [backupDir, setBackupDir] = useState<string | null>(null);
  const [latestBackupTime, setLatestBackupTime] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [backupFiles, setBackupFiles] = useState<BackupFile[]>([]);
  const [backupFilesLoading, setBackupFilesLoading] = useState(false);

  const [pointerPath, setPointerPath] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  useEffect(() => {
    Promise.all([
      loadDbPath(),
      loadPointerInfo(),
      loadBackupFiles(),
      loadConfig(),
    ]).finally(() => setLoading(false));
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
    }
  };

  const loadDbPath = async () => {
    try {
      const path = await TauriService.getDbPath();
      setDbPath(path);
    } catch (error) {
      console.error('Failed to load DB path:', error);
      toast.error(t('settings.database.loadFailed'));
    }
  };

  const loadPointerInfo = async () => {
    try {
      const info = await TauriService.getPointerInfo();
      setPointerPath(info.pointerPath);
    } catch (error) {
      console.error('Failed to load pointer info:', error);
    }
  };

  const loadBackupFiles = async () => {
    try {
      setBackupFilesLoading(true);
      const files = await TauriService.listBackupFiles();
      setBackupFiles(files);
    } catch (error) {
      console.error('Failed to list backup files:', error);
    } finally {
      setBackupFilesLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await TauriService.setBackupConfig(useSameLocation, useSameLocation ? null : customPath || null);
      toast.success(t('common.success'));
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
      await loadBackupFiles();
    } catch (error: unknown) {
      console.error('Backup failed:', error);
      toast.error(`${t('settings.sync.backupFailed')}: ${error}`);
    } finally {
      setBackingUp(false);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('settings.sync.selectFolder'),
      });
      if (selected) setCustomPath(selected);
    } catch (error) {
      console.error('Failed to open folder picker:', error);
    }
  };

  const handleReset = async () => {
    try {
      await TauriService.setDbPath(null);
      const defaultPath = await TauriService.getDbPath();
      setDbPath(defaultPath);
      toast.success(t('settings.database.resetSuccess'));
    } catch (error) {
      console.error('Failed to reset DB path:', error);
      toast.error(t('settings.database.resetFailed'));
    }
  };

  const doImport = async (filePath: string) => {
    try {
      setImporting(true);
      await TauriService.importDatabaseWithPointer(filePath);
      toast.success(t('settings.database.importSuccess'), { duration: 6000 });
      await loadPointerInfo();
      await loadBackupFiles();
    } catch (error: unknown) {
      console.error('Import error:', error);
      toast.error(t('settings.database.importFailed', { error: String(error) }));
    } finally {
      setImporting(false);
    }
  };

  const handleImportFromPicker = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }],
      title: t('settings.database.importTitle'),
    });
    if (!selected || typeof selected !== 'string') return;
    if (!window.confirm(t('settings.database.importConfirm', { path: selected }))) return;
    await doImport(selected);
  };

  const handleImportBackup = async (file: BackupFile) => {
    if (!window.confirm(t('settings.database.importConfirm', { path: file.label || file.name }))) return;
    await doImport(file.path);
  };

  const handleRestore = async () => {
    try {
      setRestoring(true);
      await TauriService.restoreFromAutoBackup();
      toast.success(t('settings.database.restoreSuccess'), { duration: 6000 });
      setPointerPath(null);
      await loadBackupFiles();
    } catch (error: unknown) {
      console.error('Restore error:', error);
      toast.error(t('settings.database.restoreFailed', { error: String(error) }));
    } finally {
      setRestoring(false);
    }
  };

  const handleAcceptAsLatest = async () => {
    try {
      await TauriService.acceptCurrentAsLatest();
      toast.success(t('settings.database.acceptSuccess'));
      setPointerPath(null);
    } catch (error: unknown) {
      console.error('Accept error:', error);
      toast.error(t('settings.database.acceptFailed', { error: String(error) }));
    }
  };

  const handleExport = async () => {
    try {
      const dest = await save({
        filters: [{ name: 'SQLite Database', extensions: ['sqlite'] }],
        defaultPath: 'game-request-backup.sqlite',
        title: t('settings.database.exportTitle'),
      });
      if (!dest) return;
      setExporting(true);
      const dbBytes = await TauriService.exportDatabaseToBytes();
      await writeFile(dest, new Uint8Array(dbBytes));
      toast.success(t('settings.database.exportSuccess', { path: dest }), { duration: 5000 });
    } catch (error: unknown) {
      console.error('Export error:', error);
      toast.error(t('settings.database.exportFailed', { error: String(error) }));
    } finally {
      setExporting(false);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatBackupTime = (timestamp: number | null): string => {
    if (!timestamp) return t('common.none');
    return new Date(timestamp * 1000).toLocaleString();
  };

  if (loading) return <div>{t('common.loading')}</div>;

  return (
    <Card className="border-emerald-500/20 bg-emerald-500/5 backdrop-blur-sm shadow-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Database className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <CardTitle className="text-lg">{t('settings.storage.title', 'Database & Backup')}</CardTitle>
            <CardDescription className="text-[10px] mt-0.5">
              {t('settings.storage.subtitle', 'Manage database location, backups, and restore')}
            </CardDescription>
          </div>
          <Badge variant="outline" className="rounded-lg text-emerald-600 border-emerald-500/30 ml-auto">
            <HardDrive className="h-3 w-3 mr-1" /> {t('settings.sync.local')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Database Location */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            {t('settings.database.location')}
            <Badge variant="secondary" className="text-[9px] rounded-full px-2">{t('settings.database.readOnly')}</Badge>
          </label>
          <div className="flex gap-2">
            <Input value={dbPath} readOnly className="bg-background/60 flex-1 font-mono text-xs" />
            <Button variant="ghost" size="icon" onClick={handleReset} title={t('settings.database.resetTitle')}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Backup Location */}
        <div className="space-y-2 pt-2 border-t border-emerald-500/10">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {t('settings.sync.backupLocation')}
          </label>

          <label className={cn(
            'flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all duration-200',
            useSameLocation
              ? 'bg-emerald-500/10 border-emerald-500/30 shadow-inner'
              : 'bg-background/40 border-border/40 hover:border-emerald-500/20'
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
            'flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all duration-200',
            !useSameLocation
              ? 'bg-emerald-500/10 border-emerald-500/30 shadow-inner'
              : 'bg-background/40 border-border/40 hover:border-emerald-500/20'
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
              <Button variant="outline" size="sm" onClick={handleSelectFolder} className="shrink-0 h-9 rounded-xl">
                <FolderOpen className="h-4 w-4 mr-1" /> {t('settings.sync.browse')}
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {backupDir && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-background/40 border border-border/40">
                <HardDrive className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('settings.sync.currentBackupDir')}</div>
                  <div className="text-[11px] truncate">{backupDir}</div>
                </div>
              </div>
            )}
            {latestBackupTime ? (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-background/40 border border-border/40">
                <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('settings.sync.latestBackup')}</div>
                  <div className="text-[11px]">{formatBackupTime(latestBackupTime)}</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <div className="text-[11px] text-amber-700 font-medium">{t('settings.sync.noBackupYet')}</div>
              </div>
            )}
          </div>
        </div>

        {/* Backup Files Browser */}
        <div className="flex flex-col gap-2 pt-2 border-t border-emerald-500/10">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5" />
              {t('settings.database.backupFiles')}
            </label>
            <Button variant="ghost" size="sm" onClick={loadBackupFiles} className="h-7 text-[10px] rounded-lg" disabled={backupFilesLoading}>
              <RefreshCcw className={`h-3 w-3 ltr:mr-1 rtl:ml-1 ${backupFilesLoading ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </Button>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1">
            {backupFilesLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-11 w-full rounded-xl bg-background/40 border border-border/40 animate-pulse" />
              ))
            ) : backupFiles.length === 0 ? (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-background/40 border border-border/40">
                <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-[11px] text-muted-foreground">{t('settings.database.noBackupFiles')}</span>
              </div>
            ) : (
              backupFiles.map((file) => (
                <div
                  key={file.name}
                  className="flex items-center justify-between p-2 rounded-xl bg-background/40 border border-border/40 hover:bg-emerald-500/5 hover:border-emerald-500/20 transition-all group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-6 w-6 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <FileText className="h-3 w-3 text-emerald-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium truncate">{file.label}</div>
                      <div className="text-[10px] text-muted-foreground">{formatSize(file.size)}</div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleImportBackup(file)}
                    disabled={importing}
                    className="h-7 w-7 p-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    title={t('settings.database.importBtn')}
                  >
                    <Upload className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleImportFromPicker}
            disabled={importing}
            className="w-full h-8 rounded-xl text-xs border-dashed border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/5"
          >
            <ExternalLink className="h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5" />
            {importing ? t('settings.database.importBtnLoading') : t('settings.database.chooseAnotherFile')}
          </Button>
        </div>

        {/* Pointer Status */}
        {pointerPath && (
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <div className="text-[11px] font-semibold text-amber-700">{t('settings.database.pointerActive')}</div>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-background/40 rounded-lg p-2">
              <FileText className="h-3 w-3 shrink-0" />
              <span className="truncate">{pointerPath}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={handleRestore} disabled={restoring} className="rounded-xl h-8 text-xs border-amber-500/30 hover:bg-amber-500/5 text-amber-700">
                <ArrowLeft className={`h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5 ${restoring ? 'animate-spin' : ''}`} />
                {restoring ? t('settings.database.restoring') : t('settings.database.restoreBtn')}
              </Button>
              <Button variant="outline" size="sm" onClick={handleAcceptAsLatest} className="rounded-xl h-8 text-xs border-emerald-500/30 hover:bg-emerald-500/5 text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5" />
                {t('settings.database.acceptBtn')}
              </Button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-emerald-500/10">
          <Button className="rounded-xl h-10 font-bold shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 transition-all active:scale-95" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin ltr:mr-2 rtl:ml-2" /> : <Save className="h-4 w-4 ltr:mr-2 rtl:ml-2" />}
            {t('common.save')}
          </Button>
          <Button variant="outline" className="rounded-xl h-10 font-bold border-emerald-500/30 hover:bg-emerald-500/5 text-emerald-600 transition-all active:scale-95" onClick={handleBackupNow} disabled={backingUp}>
            {backingUp ? (
              <><Loader2 className="h-4 w-4 animate-spin ltr:mr-2 rtl:ml-2" />{t('settings.sync.backupInProgress')}</>
            ) : (
              <><CheckCircle2 className="h-4 w-4 ltr:mr-2 rtl:ml-2" />{t('settings.sync.backupNow')}</>
            )}
          </Button>
          <Button variant="outline" className="rounded-xl h-10 font-bold border-green-500/30 hover:bg-green-500/5 text-green-700 dark:text-green-400 transition-all active:scale-95" onClick={handleExport} disabled={exporting}>
            <Download className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
            {exporting ? t('settings.database.exportBtnLoading') : t('settings.database.exportBtn')}
          </Button>
        </div>

        {/* Hint */}
        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex gap-3 items-start backdrop-blur-sm">
          <Database className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-[11px] text-emerald-800 font-medium leading-tight">
            {t('settings.sync.backupHint')}
          </p>
        </div>

      </CardContent>
    </Card>
  );
}
