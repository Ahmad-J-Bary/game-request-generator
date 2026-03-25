// src/components/molecules/DatabaseSettingsPanel.tsx

import { useState, useEffect } from 'react';
import { Database, FolderOpen, RefreshCcw, Save } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '@grq/ui/atoms/button';
import { Input } from '@grq/ui/atoms/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@grq/ui/atoms/card';
import { toast } from 'sonner';

export function DatabaseSettingsPanel() {
  const [dbPath, setDbPath] = useState<string>('');
  const [loading, setLoading] = useState(true);

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

  const handleBrowse = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }],
        title: 'Select Database File'
      });

      if (selected && typeof selected === 'string') {
        setDbPath(selected);
      }
    } catch (error) {
      console.error('Failed to open dialog:', error);
    }
  };

  const handleSave = async () => {
    try {
      await invoke('set_db_path', { path: dbPath });
      toast.success('Database path saved! Please restart the application for changes to take effect.', {
        duration: 5000,
      });
    } catch (error) {
      console.error('Failed to save DB path:', error);
      toast.error('Failed to save database path');
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

  if (loading) return <div>Loading...</div>;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <CardTitle>Database Settings</CardTitle>
        </div>
        <CardDescription>
          Configure the location of your database file. This is useful for synchronization via cloud services like Google Drive.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Database File Path</label>
          <div className="flex gap-2">
            <Input 
              value={dbPath} 
              readOnly 
              className="bg-muted flex-1 font-mono text-xs" 
            />
            <Button variant="outline" size="icon" onClick={handleBrowse} title="Browse">
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground italic">
            Note: The database must be a .sqlite file.
          </p>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs">
            <RefreshCcw className="h-3.5 w-3.5 mr-1" />
            Reset to Default
          </Button>
          <Button size="sm" onClick={handleSave} className="text-xs">
            <Save className="h-3.5 w-3.5 mr-1" />
            Save Path
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
