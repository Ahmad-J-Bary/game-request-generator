// src/components/molecules/ImportDialog.tsx

import { useState, useEffect } from 'react';
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
import { TauriService, ImportService } from '../../services/tauri.service';
import { useQueryClient } from '@tanstack/react-query';
import { NotificationService } from '../../utils/notifications';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameId?: number;
}

export function ImportDialog({ open, onOpenChange, gameId }: ImportDialogProps) {
  const { t } = useTranslation();
  const [isImporting, setIsImporting] = useState(false);
  const [detectedImportType, setDetectedImportType] = useState<'excel' | 'request-templates' | null>(null);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    message: string;
    imported?: any;
    imported_templates?: Array<{
      account_name: string;
      filename: string;
      status: string;
    }>;
    errors?: string[];
    total_processed?: number;
    successful_imports?: number;
    cancelled?: boolean;
  } | null>(null);
  const queryClient = useQueryClient();

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setImportResult(null);
      setDetectedImportType(null);
    }
  }, [open]);

  const handleExcelImport = async () => {
    setIsImporting(true);
    try {
      const result = await ExcelService.importFromExcel();
      setDetectedImportType('excel');
      setImportResult(result);
    } catch (error) {
      console.error('Excel import failed:', error);
      NotificationService.error(t('import.failed'));
      setDetectedImportType(null);
    } finally {
      setIsImporting(false);
    }
  };

  const handleTemplateImport = async () => {
    setIsImporting(true);
    try {
      if (!gameId) {
        throw new Error('Game ID is required for template import');
      }

      const result = await ImportService.importRequestTemplates(gameId);
      setDetectedImportType('request-templates');
      setImportResult({
        success: !result.cancelled && result.errors.length === 0,
        message: result.cancelled ? 'Import cancelled' : `Processed ${result.total_processed} files, ${result.successful_imports} successful`,
        ...result
      });
    } catch (error) {
      console.error('Template import failed:', error);
      NotificationService.error(t('import.failed'));
      setDetectedImportType(null);
    } finally {
      setIsImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importResult) return;

    setIsImporting(true);
    try {
      if (detectedImportType === 'request-templates') {
        // Request templates are already imported by the Tauri command
        // Just refresh data and show results
        queryClient.invalidateQueries();

        const successfulImports = importResult.successful_imports || 0;
        const totalProcessed = importResult.total_processed || 0;

        if (successfulImports > 0) {
          NotificationService.success(`Successfully imported ${successfulImports} of ${totalProcessed} templates`);
        }

        // Show errors if any
        if (importResult.errors && importResult.errors.length > 0) {
          console.warn('Import errors:', importResult.errors);
          NotificationService.warning(`${importResult.errors.length} templates had errors`);
        }
      } else {
        // Excel import logic
        if (!gameId) return;

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

        NotificationService.success(t('import.success', { count: importedCount }));
      }

      onOpenChange(false);
      setImportResult(null);
    } catch (error) {
      console.error('Confirm import failed:', error);
      NotificationService.error(t('import.confirmFailed'));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('import.comprehensiveTitle', 'Import Data & Templates')}</DialogTitle>
          <DialogDescription>
            {t('import.comprehensiveDescription', 'Import Excel files with game data or text files with request templates.')}
          </DialogDescription>
        </DialogHeader>

        {!importResult ? (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {t('import.comprehensiveInstructions', 'Choose what you want to import:')}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📊</span>
                  <h4 className="font-medium">Excel Data Import</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  Import levels, purchase events, and accounts from Excel spreadsheets.
                </p>
                <Button
                  onClick={handleExcelImport}
                  disabled={isImporting}
                  className="w-full"
                  variant="outline"
                >
                  {isImporting ? t('common.loading') : 'Import Excel Data'}
                </Button>
              </div>

              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📄</span>
                  <h4 className="font-medium">Request Templates</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  Import request templates from text files or folders.
                </p>
                <Button
                  onClick={handleTemplateImport}
                  disabled={isImporting}
                  className="w-full"
                  variant="outline"
                >
                  {isImporting ? t('common.loading') : 'Import Templates'}
                </Button>
              </div>
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-medium text-sm mb-2">Template File Naming</h4>
              <p className="text-sm text-muted-foreground mb-2">
                Text files should be named exactly like the account they belong to:
              </p>
              <div className="text-sm bg-background p-2 rounded border">
                <strong>Example:</strong>
                <ul className="ml-4 mt-1 space-y-1">
                  <li>• <code>1- IN21 Word Trip.txt</code> → Account: "1- IN21 Word Trip"</li>
                  <li>• <code>SA.17 Word Trip.txt</code> → Account: "SA.17 Word Trip"</li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className={`p-4 rounded-lg ${importResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              <div className="font-medium">
                {importResult.success ? '✅ Preview' : '❌ Error'}
              </div>
              <div className="text-sm mt-1">{importResult.message}</div>
            </div>

            {importResult.success && detectedImportType === 'excel' && (
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

            {detectedImportType === 'request-templates' && !importResult.cancelled && (
              <div className="space-y-2">
                <div className="text-sm">
                  <strong>{importResult.total_processed || 0}</strong> files processed
                </div>
                <div className="text-sm">
                  <strong>{importResult.successful_imports || 0}</strong> templates imported successfully
                </div>
                {importResult.imported_templates && importResult.imported_templates.length > 0 && (
                  <div className="text-sm">
                    <div className="font-medium mb-1">Imported templates:</div>
                    <ul className="ml-4 space-y-1 max-h-32 overflow-y-auto">
                      {importResult.imported_templates.map((template: any, idx: number) => (
                        <li key={idx} className="text-green-600">
                          ✓ {template.account_name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {importResult.errors && importResult.errors.length > 0 && (
                  <div className="text-sm">
                    <div className="font-medium mb-1 text-red-600">Errors:</div>
                    <ul className="ml-4 space-y-1 max-h-32 overflow-y-auto">
                      {importResult.errors.map((error: string, idx: number) => (
                        <li key={idx} className="text-red-600">
                          ✗ {error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {!importResult ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setImportResult(null)}>
                {t('common.back')}
              </Button>
              <Button
                onClick={handleConfirmImport}
                disabled={isImporting || (!importResult.success && detectedImportType !== 'request-templates') || importResult.cancelled}
              >
                {isImporting ? t('common.saving') :
                  detectedImportType === 'request-templates'
                    ? 'Apply Templates'
                    : 'Import Data'
                }
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
