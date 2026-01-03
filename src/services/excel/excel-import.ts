// ===== Excel Import Module =====

import { open } from '@tauri-apps/plugin-dialog';
import { parseExcelFile, type ImportData } from './excel-parser';

/**
 * Import data from Excel file
 */
export async function importFromExcel(): Promise<{ success: boolean; message: string; imported: ImportData }> {
  try {
    console.log('Opening file dialog...');
    const selected = await open({
      filters: [{
        name: 'Excel Files',
        extensions: ['xlsx', 'xls']
      }]
    });

    console.log('Selected file:', selected);

    if (!selected || Array.isArray(selected)) {
      return { success: false, message: 'No file selected', imported: { levels: [], purchaseEvents: [], accounts: [], progress: [] } };
    }

    console.log('Parsing Excel file:', selected);
    const importData = await parseExcelFile(selected as string);

    console.log('Parsed data:', importData);

    return {
      success: true,
      message: `Found ${importData.levels.length} levels, ${importData.purchaseEvents.length} purchase events, ${importData.accounts.length} accounts`,
      imported: importData
    };
  } catch (error) {
    console.error('Import error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      success: false,
      message: `Failed to import Excel file: ${errorMessage}`,
      imported: { levels: [], purchaseEvents: [], accounts: [], progress: [] }
    };
  }
}

