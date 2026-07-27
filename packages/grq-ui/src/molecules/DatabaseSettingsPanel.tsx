import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Database, FolderOpen, RefreshCcw, Upload, Download, HardDrive,
  ArrowLeft, CheckCircle2, AlertTriangle, FileText, ExternalLink,
} from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { Button } from '@grq/ui/atoms/button';
import { Input } from '@grq/ui/atoms/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@grq/ui/atoms/card';
import { toast } from 'sonner';
import { Badge } from '@grq/ui/atoms/badge';
import { TauriService } from '@grq/core/services/tauri.service';

interface BackupFile {
  name: string;
  path: string;
  label: string;
  size: number;
}

export function DatabaseSettingsPanel() {
  const { t } = useTranslation();
  const [dbPath, setDbPath] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backupFiles, setBackupFiles] = useState<BackupFile[]>([]);
  const [backupFilesLoading, setBackupFilesLoading] = useState(false);
  const [pointerPath, setPointerPath] = useState<string | null>(null);

  useEffect(() => {
    loadDbPath();
    loadPointerInfo();
    loadBackupFiles();
  }, []);

  const loadDbPath = async () => {
    try {
      const path = await TauriService.getDbPath();
      setDbPath(path);
    } catch (error) {
      console.error('Failed to load DB path:', error);
      toast.error(t('settings.database.loadFailed'));
    } finally {
      setLoading(false);
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
    const confirmMsg = t('settings.database.importConfirm', { path: selected });
    if (!window.confirm(confirmMsg)) return;
    await doImport(selected);
  };

  const handleImportBackup = async (file: BackupFile) => {
    const confirmMsg = t('settings.database.importConfirm', { path: file.label || file.name });
    if (!window.confirm(confirmMsg)) return;
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
      const uint8Array = new Uint8Array(dbBytes);
      await writeFile(dest, uint8Array);
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

  if (loading) return <div>{t('common.loading')}</div>;

  return (
    <Card className="border-emerald-500/20 bg-emerald-500/5 backdrop-blur-sm shadow-xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Database className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <CardTitle className="text-lg">{t('settings.database.title')}</CardTitle>
            <CardDescription className="text-[10px] mt-0.5">
              {t('settings.database.description')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Current Path */}
        <div className="flex flex-col gap-2">
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
          <p className="text-[10px] text-muted-foreground italic">{t('settings.database.managedAuto')}</p>
        </div>

        {/* Backup Files Browser */}
        <div className="flex flex-col gap-2 pt-2 border-t border-emerald-500/10">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5" />
              {t('settings.database.backupFiles')}
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadBackupFiles}
              className="h-7 text-[10px] rounded-lg"
              disabled={backupFilesLoading}
            >
              <RefreshCcw className={`h-3 w-3 ltr:mr-1 rtl:ml-1 ${backupFilesLoading ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </Button>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {backupFilesLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 w-full rounded-xl bg-background/40 border border-border/40 animate-pulse" />
              ))
            ) : backupFiles.length === 0 ? (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-background/40 border border-border/40">
                <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-[11px] text-muted-foreground">{t('settings.database.noBackupFiles')}</span>
              </div>
            ) : (
              backupFiles.map((file) => (
                <div
                  key={file.name}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-background/40 border border-border/40 hover:bg-emerald-500/5 hover:border-emerald-500/20 transition-all group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <FileText className="h-3.5 w-3.5 text-emerald-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{file.label}</div>
                      <div className="text-[10px] text-muted-foreground">{formatSize(file.size)}</div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleImportBackup(file)}
                    disabled={importing}
                    className="h-8 w-8 p-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    title={t('settings.database.importBtn')}
                  >
                    <Upload className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* Choose another file button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleImportFromPicker}
            disabled={importing}
            className="w-full h-9 rounded-xl text-xs border-dashed border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/5"
          >
            <ExternalLink className="h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5" />
            {importing ? t('settings.database.importBtnLoading') : t('settings.database.chooseAnotherFile')}
          </Button>
        </div>

        {/* Pointer Status */}
        {pointerPath && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <div className="text-[11px] font-semibold text-amber-700">{t('settings.database.pointerActive')}</div>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-background/40 rounded-lg p-2">
              <FileText className="h-3 w-3 shrink-0" />
              <span className="truncate">{pointerPath}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRestore}
                disabled={restoring}
                className="rounded-xl h-9 text-xs border-amber-500/30 hover:bg-amber-500/5 text-amber-700"
              >
                <ArrowLeft className={`h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5 ${restoring ? 'animate-spin' : ''}`} />
                {restoring ? t('settings.database.restoring') : t('settings.database.restoreBtn')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAcceptAsLatest}
                className="rounded-xl h-9 text-xs border-emerald-500/30 hover:bg-emerald-500/5 text-emerald-700"
              >
                <CheckCircle2 className="h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5" />
                {t('settings.database.acceptBtn')}
              </Button>
            </div>
          </div>
        )}

        {/* Import / Export */}
        <div className="flex flex-col gap-3 pt-2 border-t border-emerald-500/10">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {t('settings.database.backupRestore')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5 p-3 rounded-xl border bg-background/40">
              <div className="flex items-center gap-2 mb-1">
                <Upload className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">{t('settings.database.importTitle')}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">
                {t('settings.database.importDesc')}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleImportFromPicker}
                disabled={importing}
                className="w-full border-primary/30 hover:border-primary hover:bg-primary/5"
              >
                <FolderOpen className="h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5" />
                {importing ? t('settings.database.importBtnLoading') : t('settings.database.importBtn')}
              </Button>
            </div>
            <div className="flex flex-col gap-1.5 p-3 rounded-xl border bg-background/40">
              <div className="flex items-center gap-2 mb-1">
                <Download className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-semibold">{t('settings.database.exportTitle')}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">
                {t('settings.database.exportDesc')}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={exporting}
                className="w-full border-green-500/30 hover:border-green-500 hover:bg-green-500/5 text-green-700 dark:text-green-400"
              >
                <Download className="h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5" />
                {exporting ? t('settings.database.exportBtnLoading') : t('settings.database.exportBtn')}
              </Button>
            </div>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
