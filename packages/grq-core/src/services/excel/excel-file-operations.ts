// ===== Excel File Operations =====

import { writeFile, mkdir, BaseDirectory, readFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';

/**
 * Replaces characters that are invalid in file names on common filesystems
 * (Linux forbids `/`; Windows also forbids `<>:"/\|?*` and control chars) and
 * trims trailing dots/spaces that Windows rejects. Guards against empty names.
 */
export function sanitizeFilename(name: string): string {
  const sanitized = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .trim()
    .replace(/[. ]+$/g, '');
  return sanitized || 'unnamed';
}

/**
 * Helper to save file with filesystem attempt and browser fallback
 */
export async function saveExcelFile(filename: string, buffer: any): Promise<boolean> {
  const uint8Array = new Uint8Array(buffer);
  filename = sanitizeFilename(filename);

  try {
    // 1. Try using the Dialog plugin to let the user choose the save location
    // This is the most reliable way on Android to save to "Unprotected" public folders.
    const filePath = await save({
      defaultPath: filename,
      filters: [{
        name: 'Excel Workbook',
        extensions: ['xlsx']
      }]
    });

    if (filePath) {
      await writeFile(filePath, uint8Array);
      console.log(`File saved to: ${filePath}`);
      return true;
    }
    
    // User cancelled the dialog, don't try fallbacks
    return false;
  } catch (error) {
    console.error('Dialog save failed, attempting background save:', error);

    try {
      const appDir = 'Game Request Generator';
      await mkdir(appDir, { recursive: true, baseDir: BaseDirectory.Download });
      const filePath = `${appDir}/${filename}`;
      await writeFile(filePath, uint8Array, { baseDir: BaseDirectory.Download });
      console.log(`File saved to fallback: ${appDir}/${filename} in Downloads directory`);
      return true;
    } catch (fsError) {
      console.error('Filesystem fallback failed, trying browser blob:', fsError);

      try {
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
      } catch (fallbackError) {
        console.error('All save methods failed:', fallbackError);
        return false;
      }
    }
  }
}

/**
 * Read Excel file from filesystem
 */
export async function readExcelFile(filePath: string): Promise<Uint8Array> {
  return await readFile(filePath);
}

