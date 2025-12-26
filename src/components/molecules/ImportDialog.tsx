// src/components/molecules/ImportDialog.tsx

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { ExcelService } from '../../services/excel.service';
import { TauriService } from '../../services/tauri.service';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameId?: number;
}

export function ImportDialog({ open, onOpenChange, gameId }: ImportDialogProps) {
  const { t } = useTranslation();
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    message: string;
    imported: any;
  } | null>(null);
  const queryClient = useQueryClient();

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const result = await ExcelService.importFromExcel();
      setImportResult(result);
    } catch (error) {
      console.error('Import failed:', error);
      toast.error(t('import.failed', 'Import failed'));
    } finally {
      setIsImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importResult || !gameId) return;

    setIsImporting(true);
    try {
      let importedCount = 0;

      console.log('Importing data:', {
        levels: importResult.imported.levels.length,
        purchaseEvents: importResult.imported.purchaseEvents.length,
        accounts: importResult.imported.accounts.length
      });

      // Import levels
      for (const level of importResult.imported.levels) {
        try {
          console.log('Importing level:', level);
          await TauriService.addLevel({
            ...level,
            game_id: gameId,
            is_bonus: level.is_bonus || false, // Ensure is_bonus is always set
          } as any);
          importedCount++;
          console.log('Successfully imported level');
        } catch (error) {
          console.error('Failed to import level:', level, error);
        }
      }

      // Import purchase events
      for (const event of importResult.imported.purchaseEvents) {
        try {
          console.log('Importing purchase event:', event);
          await TauriService.addPurchaseEvent({
            ...event,
            game_id: gameId,
            is_restricted: event.is_restricted || false, // Ensure is_restricted is always set
          } as any);
          importedCount++;
          console.log('Successfully imported purchase event');
        } catch (error) {
          console.error('Failed to import purchase event:', event, error);
        }
      }

      // Import accounts
      for (const account of importResult.imported.accounts) {
        try {
          console.log('Importing account:', account);
          await TauriService.addAccount({
            ...account,
            game_id: gameId,
            request_template: account.request_template || 'Needs to be filled in - imported from Excel export',
          } as any);
          importedCount++;
          console.log('Successfully imported account');
        } catch (error) {
          console.error('Failed to import account:', account, error);
        }
      }

      // Refresh data
      queryClient.invalidateQueries();

      toast.success(t('import.success', `Successfully imported ${importedCount} items`));
      onOpenChange(false);
      setImportResult(null);
    } catch (error) {
      console.error('Confirm import failed:', error);
      toast.error(t('import.confirmFailed', 'Failed to save imported data'));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('import.title', 'Import Data')}</DialogTitle>
          <DialogDescription>
            {t('import.description', 'Import levels, purchase events, and accounts from an Excel file.')}
          </DialogDescription>
        </DialogHeader>

        {!importResult ? (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {t('import.instructions', 'Select an Excel file (.xlsx or .xls) with the following sheets:')}
            </div>
            <ul className="text-sm space-y-1 ml-4">
              <li>• <strong>Levels:</strong> Event Token, Level Name, Days Offset, Time Spent, Bonus</li>
              <li>• <strong>Purchase Events:</strong> Event Token, Restricted, Max Days Offset</li>
              <li>• <strong>Accounts:</strong> Account, Start Date, Start Time</li>
            </ul>
          </div>
        ) : (
          <div className="space-y-4">
            <div className={`p-4 rounded-lg ${importResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              <div className="font-medium">
                {importResult.success ? '✅ Preview' : '❌ Error'}
              </div>
              <div className="text-sm mt-1">{importResult.message}</div>
            </div>

            {importResult.success && (
              <div className="space-y-2">
                <div className="text-sm">
                  <strong>{importResult.imported.levels.length}</strong> levels found
                </div>
                <div className="text-sm">
                  <strong>{importResult.imported.purchaseEvents.length}</strong> purchase events found
                </div>
                <div className="text-sm">
                  <strong>{importResult.imported.accounts.length}</strong> accounts found
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {!importResult ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleImport} disabled={isImporting}>
                {isImporting ? t('common.loading') : t('import.selectFile', 'Select File')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setImportResult(null)}>
                {t('common.back')}
              </Button>
              <Button
                onClick={handleConfirmImport}
                disabled={isImporting || !importResult.success}
              >
                {isImporting ? t('common.saving') : t('import.confirm', 'Import Data')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
