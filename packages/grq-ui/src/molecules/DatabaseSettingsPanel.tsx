// src/components/molecules/DatabaseSettingsPanel.tsx

import { useState, useEffect } from 'react';
import { Database, FolderOpen, RefreshCcw, Upload, Download } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Button } from '@grq/ui/atoms/button';
import { Input } from '@grq/ui/atoms/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@grq/ui/atoms/card';
import { toast } from 'sonner';
import { Badge } from '@grq/ui/atoms/badge';

export function DatabaseSettingsPanel() {
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
      toast.error('Failed to load database path');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      await invoke('set_db_path', { path: null });
      const defaultPath = await invoke<string>('get_db_path');
      setDbPath(defaultPath);
      toast.success('Database path reset to default');
    } catch (error) {
      console.error('Failed to reset DB path:', error);
      toast.error('Failed to reset database path');
    }
  };

  /** Import: pick an external .sqlite file and overwrite the internal DB */
  const handleImport = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }],
        title: 'Select Database File to Import',
      });

      if (!selected || typeof selected !== 'string') return;

      const confirmMsg = `This will REPLACE your current database with the selected file.\n\n"${selected}"\n\nThis action cannot be undone. Continue?`;
      if (!window.confirm(confirmMsg)) return;

      setImporting(true);
      await invoke('import_database', { sourcePath: selected });
      toast.success('Database imported successfully! Please restart the app for full effect.', { duration: 6000 });
    } catch (error: unknown) {
      console.error('Import error:', error);
      toast.error(`Import failed: ${error}`);
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
        title: 'Save Database Backup',
      });

      if (!dest) return;

      setExporting(true);
      await invoke('export_database', { destPath: dest });
      toast.success(`Database exported to:\n${dest}`, { duration: 5000 });
    } catch (error: unknown) {
      console.error('Export error:', error);
      toast.error(`Export failed: ${error}`);
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <CardTitle>Database Settings</CardTitle>
        </div>
        <CardDescription>
          Your database is stored securely in the app's internal storage. You can import a backup or export a copy without moving the file.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Current Path (read-only) */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium flex items-center gap-2">
            Database Location
            <Badge variant="secondary" className="text-[10px]">Read-only</Badge>
          </label>
          <div className="flex gap-2">
            <Input
              value={dbPath}
              readOnly
              className="bg-muted flex-1 font-mono text-xs"
            />
            <Button variant="ghost" size="icon" onClick={handleReset} title="Reset to default">
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground italic">
            The database file path is managed automatically and kept in secure storage.
          </p>
        </div>

        {/* Import / Export */}
        <div className="flex flex-col gap-3 pt-2 border-t">
          <p className="text-sm font-medium">Backup & Restore</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Import */}
            <div className="flex flex-col gap-1.5 p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2 mb-1">
                <Upload className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Import Database</span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">
                Replace current database with a backup file. The file must be a valid .sqlite database.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleImport}
                disabled={importing}
                className="w-full border-primary/30 hover:border-primary hover:bg-primary/5"
              >
                <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                {importing ? 'Importing...' : 'Choose File & Import'}
              </Button>
            </div>

            {/* Export */}
            <div className="flex flex-col gap-1.5 p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2 mb-1">
                <Download className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-semibold">Export Database</span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">
                Save a backup copy of the current database to a location of your choice (e.g., Downloads).
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={exporting}
                className="w-full border-green-500/30 hover:border-green-500 hover:bg-green-500/5 text-green-700 dark:text-green-400"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                {exporting ? 'Exporting...' : 'Export to File'}
              </Button>
            </div>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
