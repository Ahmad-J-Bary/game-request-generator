// ===== Excel File Operations =====

import { writeFile, mkdir, BaseDirectory, readFile } from '@tauri-apps/plugin-fs';

/**
 * Helper to save file with filesystem attempt and browser fallback
 */
export async function saveExcelFile(filename: string, buffer: any): Promise<boolean> {
  const uint8Array = new Uint8Array(buffer);
  const appDir = 'GameRequestGenerator';

  try {
    // Try saving to filesystem using BaseDirectory.Download
    // This ensures files are easily accessible to the user (especially on Android)
    await mkdir(appDir, { recursive: true, baseDir: BaseDirectory.Download });
    const filePath = `${appDir}/${filename}`;
    await writeFile(filePath, uint8Array, { baseDir: BaseDirectory.Download });
    console.log(`File saved to: ${appDir}/${filename} in Downloads directory`);
    return true;
  } catch (error) {
    console.error('Failed to save file to filesystem, trying fallback:', error);

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
      console.error('Browser download fallback failed:', fallbackError);
      return false;
    }
  }
}

/**
 * Read Excel file from filesystem
 */
export async function readExcelFile(filePath: string): Promise<Uint8Array> {
  return await readFile(filePath);
}

