import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { join } from '@tauri-apps/api/path';
import { TauriService } from './tauri.service';

interface ExportResult {
  success: boolean;
  path?: string;
  count?: number;
}

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'unnamed';
}

export async function exportRequestTemplates(gameId?: number, owner?: string): Promise<ExportResult> {
  try {
    const picked = await open({ directory: true, multiple: false });
    if (!picked) return { success: false };
    const root = typeof picked === 'string' ? picked : picked[0];
    const rootDir = await join(root, 'Game Requests');

    const allGames = await TauriService.getGames();
    const games = gameId ? allGames.filter((g) => g.id === gameId) : allGames;

    let count = 0;
    let hadError = false;

    for (const game of games) {
      let accounts;
      try {
        accounts = (await TauriService.getAccounts(game.id))
          .filter((a) => !owner || (a.owner?.trim() || '') === owner);
      } catch (err) {
        console.error(`Failed to fetch accounts for game "${game.name}":`, err);
        continue;
      }
      if (accounts.length === 0) continue;

      const gameDir = await join(rootDir, sanitize(game.name));

      for (const account of accounts) {
        const filePath = await join(gameDir, `${sanitize(account.name)}.txt`);
        const content = account.request_template || '';
        try {
          await invoke('write_export_file', { path: filePath, content });
          count++;
        } catch (err) {
          console.error(`Failed to write file for account "${account.name}" in game "${game.name}":`, err);
          hadError = true;
        }
      }
    }

    return { success: !hadError, path: rootDir, count };
  } catch (error) {
    console.error('Failed to export request templates:', error);
    return { success: false };
  }
}
