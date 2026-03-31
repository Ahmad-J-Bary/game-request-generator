// src/components/molecules/DatabaseSettingsPanel.tsx

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, FolderOpen, RefreshCcw, Upload, Download } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { Button } from '@grq/ui/atoms/button';
import { Input } from '@grq/ui/atoms/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@grq/ui/atoms/card';
import { toast } from 'sonner';
import { Badge } from '@grq/ui/atoms/badge';

export function DatabaseSettingsPanel() {
  const { t } = useTranslation();
  const [dbPath, setDbPath] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadDbPath();
  }, []);

  const loadDbPath = async () => {
    try {
      const path = await invoke<string>('get_db_path');
      setDbPath(path);
    } catch (error) {
      console.error('Failed to load DB path:', error);
      toast.error(t('settings.database.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      await invoke('set_db_path', { path: null });
      const defaultPath = await invoke<string>('get_db_path');
      setDbPath(defaultPath);
      toast.success(t('settings.database.resetSuccess'));
    } catch (error) {
      console.error('Failed to reset DB path:', error);
      toast.error(t('settings.database.resetFailed'));
    }
  };

  /** Import: pick an external .sqlite file and overwrite the internal DB */
  const handleImport = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }],
        title: t('settings.database.importTitle'),
      });

      if (!selected || typeof selected !== 'string') return;

      const confirmMsg = t('settings.database.importConfirm', { path: selected });
      if (!window.confirm(confirmMsg)) return;

      setImporting(true);
      const fileBytes = await readFile(selected);
      await invoke('import_database_from_bytes', { bytes: fileBytes });
      toast.success(t('settings.database.importSuccess'), { duration: 6000 });
    } catch (error: unknown) {
      console.error('Import error:', error);
      toast.error(t('settings.database.importFailed', { error: String(error) }));
    } finally {
      setImporting(false);
    }
  };

  /** Export: save a copy of the internal DB to a user-chosen location */
  const handleExport = async () => {
    try {
      const dest = await save({
        filters: [{ name: 'SQLite Database', extensions: ['sqlite'] }],
        defaultPath: 'game-request-backup.sqlite',
        title: t('settings.database.exportTitle'),
      });

      if (!dest) return;

      setExporting(true);
      const dbBytes = await invoke<number[]>('export_database_to_bytes');
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

  if (loading) return <div>{t('common.loading')}</div>;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <CardTitle>{t('settings.database.title')}</CardTitle>
        </div>
        <CardDescription>
          {t('settings.database.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Current Path (read-only) */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium flex items-center gap-2">
            {t('settings.database.location')}
            <Badge variant="secondary" className="text-[10px]">{t('settings.database.readOnly')}</Badge>
          </label>
          <div className="flex gap-2">
            <Input
              value={dbPath}
              readOnly
              className="bg-muted flex-1 font-mono text-xs"
            />
            <Button variant="ghost" size="icon" onClick={handleReset} title={t('settings.database.resetTitle')}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground italic">
            {t('settings.database.managedAuto')}
          </p>
        </div>

        {/* Import / Export */}
        <div className="flex flex-col gap-3 pt-2 border-t">
          <p className="text-sm font-medium">{t('settings.database.backupRestore')}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Import */}
            <div className="flex flex-col gap-1.5 p-3 rounded-lg border bg-muted/30">
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
                onClick={handleImport}
                disabled={importing}
                className="w-full border-primary/30 hover:border-primary hover:bg-primary/5"
              >
                <FolderOpen className="h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5" />
                {importing ? t('settings.database.importBtnLoading') : t('settings.database.importBtn')}
              </Button>
            </div>

            {/* Export */}
            <div className="flex flex-col gap-1.5 p-3 rounded-lg border bg-muted/30">
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
                <Download className="h-3.5 w-3.5 pe-1.5" />
                {exporting ? t('settings.database.exportBtnLoading') : t('settings.database.exportBtn')}
              </Button>
            </div>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
