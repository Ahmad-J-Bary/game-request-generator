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
} from '@grq/ui/atoms/dialog';
import { Button } from '@grq/ui/atoms/button';
import { Card, CardContent } from '@grq/ui/atoms/card';
import { ScrollArea } from '@grq/ui/atoms/scroll-area';
import { 
  Table, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  XCircle,
  Upload,
  Download,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { cn } from '@grq/ui/lib/utils';
import { ExcelService } from '@grq/core/services/excel.service';
import { ImportService } from '@grq/core/services/import-template.service';
import { ImportPersistenceService } from '@grq/core/services/import-persistence.service';
import { useQueryClient } from '@tanstack/react-query';
import { NotificationService } from '@grq/core/utils/notifications';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameId?: number;
  branchId?: number;
}

export function ImportDialog({ open, onOpenChange, gameId, branchId }: ImportDialogProps) {
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
        message: result.cancelled 
          ? t('common.cancel') 
          : t('import.requestTemplatesSuccess', { 
              successful: result.successful_imports, 
              total: result.total_processed 
            }),
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
        queryClient.invalidateQueries();

        const successfulImports = importResult.successful_imports || 0;
        const totalProcessed = importResult.total_processed || 0;

        if (successfulImports > 0) {
          NotificationService.success(t('import.requestTemplatesSuccess', { successful: successfulImports, total: totalProcessed }));
        }

        if (importResult.errors && importResult.errors.length > 0) {
          NotificationService.warning(t('import.requestTemplatesPartial', { errors: importResult.errors.length }));
        }
      } else if (importResult.imported) {
        const result = await ImportPersistenceService.persistAll(importResult.imported, gameId, branchId);

        queryClient.invalidateQueries();
        window.dispatchEvent(new CustomEvent('data-changed'));

        if (result.errors.length > 0) {
          console.warn('Import errors:', result.errors);
          NotificationService.warning(t('import.partial', { errors: result.errors.length }));
        } else {
          NotificationService.success(t('import.success', { count: result.importedCount }));
        }
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

  const ResultIcon = importResult?.success ? CheckCircle2 : XCircle;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px] w-[calc(100vw-1.5rem)] max-h-[90dvh] flex flex-col p-0 overflow-hidden border-none shadow-2xl bg-background/80 backdrop-blur-2xl">
        <DialogHeader className="p-6 pb-3 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Upload className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">
                {t('import.comprehensiveTitle', 'Import Data & Templates')}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {t('import.comprehensiveDescription', 'Import Excel files with game data or text files with request templates.')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
        {!importResult ? (
          <div className="space-y-5">
            <p className="text-xs font-medium text-muted-foreground">
              {t('import.comprehensiveInstructions', 'Choose what you want to import:')}
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Excel Import Card */}
              <Card className={cn(
                "group cursor-pointer transition-all border-border/40 hover:border-primary/40 hover:bg-primary/5",
                isImporting && "pointer-events-none opacity-60"
              )}>
                <CardContent className="p-5 flex flex-col items-center text-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Table className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">{t('import.title', 'Import Data')}</h4>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                      {t('import.description', 'Import levels, purchase events, accounts from Excel')}
                    </p>
                  </div>
                  <Button
                    onClick={handleExcelImport}
                    disabled={isImporting}
                    className="w-full rounded-xl gap-2 h-9 text-xs"
                    size="sm"
                  >
                    {isImporting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {isImporting ? t('common.loading') : t('common.select', 'Select File')}
                  </Button>
                </CardContent>
              </Card>

              {/* Template Import Card */}
              <Card className={cn(
                "group cursor-pointer transition-all border-border/40 hover:border-primary/40 hover:bg-primary/5",
                (isImporting || !gameId) && "pointer-events-none opacity-60"
              )}>
                <CardContent className="p-5 flex flex-col items-center text-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-amber-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <FileText className="h-7 w-7 text-amber-500" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">{t('import.requestTemplatesTitle', 'Request Templates')}</h4>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                      {t('import.requestTemplatesDescription', 'Import text files and match them to accounts')}
                    </p>
                  </div>
                  <Button
                    onClick={handleTemplateImport}
                    disabled={isImporting || !gameId}
                    className="w-full rounded-xl gap-2 h-9 text-xs"
                    size="sm"
                    variant="secondary"
                  >
                    {isImporting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                    {isImporting ? t('common.loading') : t('import.requestTemplates', 'Select Templates')}
                  </Button>
                  {!gameId && (
                    <p className="text-[9px] text-muted-foreground/60 italic">
                      {t('import.selectGameFirst', 'Select a game first')}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Instructions */}
            <Card className="bg-primary/5 border-primary/10 overflow-hidden">
              <div className="px-4 py-2.5 bg-primary/5 border-b border-primary/10 flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                  {t('import.requestTemplatesInstructions', 'How to name your template files')}
                </span>
              </div>
              <CardContent className="p-4 space-y-3">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {t('import.example', 'Name your .txt file with the account name — the system will match it automatically.')}
                </p>
                <div className="bg-background/80 rounded-xl p-3 border border-border/40 text-[11px] font-mono space-y-2">
                  <div className="flex items-center gap-2 text-foreground/80">
                    <span className="text-primary">1.</span>
                    <code className="bg-primary/5 px-1.5 py-0.5 rounded text-[10px]">1- IN21 Word Trip.txt</code>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground text-[10px]">{t('accounts.account')}: "1- IN21 Word Trip"</span>
                  </div>
                  <div className="flex items-center gap-2 text-foreground/80">
                    <span className="text-primary">2.</span>
                    <code className="bg-primary/5 px-1.5 py-0.5 rounded text-[10px]">SA.17 Word Trip.txt</code>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground text-[10px]">{t('accounts.account')}: "SA.17 Word Trip"</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Result Banner */}
            <Card className={cn(
              "overflow-hidden border-2",
              importResult.success ? "border-emerald-500/25 bg-emerald-500/5" : "border-red-500/25 bg-red-500/5"
            )}>
              <CardContent className="p-5 flex items-start gap-4">
                <div className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                  importResult.success ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                )}>
                  <ResultIcon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={cn(
                    "font-bold text-sm",
                    importResult.success ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                  )}>
                    {importResult.success ? t('common.success') : t('common.error')}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">{importResult.message}</p>
                </div>
              </CardContent>
            </Card>

            {/* Excel Import Summary */}
            {importResult.success && detectedImportType === 'excel' && importResult.imported && (
              <Card className="border-border/40">
                <CardContent className="p-4 space-y-3">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    {t('import.importSummary', 'Import Summary')}
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: t('levels.title', 'Levels'), count: importResult.imported.levels.length, color: 'text-primary' },
                      { label: t('purchaseEvents.title', 'Events'), count: importResult.imported.purchaseEvents.length, color: 'text-amber-500' },
                      { label: t('accounts.title', 'Accounts'), count: importResult.imported.accounts.length, color: 'text-emerald-500' },
                    ].map(item => (
                      <div key={item.label} className="bg-accent/50 rounded-xl p-3 text-center">
                        <p className={cn("text-lg font-black", item.color)}>{item.count}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{item.label}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Template Import Details */}
            {detectedImportType === 'request-templates' && !importResult.cancelled && (
              <Card className="border-border/40">
                <CardContent className="p-4 space-y-3">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    {t('import.importSummary', 'Import Summary')}
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-accent/50 rounded-xl p-3 text-center">
                      <p className="text-lg font-black text-primary">{importResult.total_processed || 0}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{t('import.filesProcessed', 'Files Processed')}</p>
                    </div>
                    <div className="bg-accent/50 rounded-xl p-3 text-center">
                      <p className="text-lg font-black text-emerald-500">{importResult.successful_imports || 0}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{t('import.templatesImportedSuccessfully', 'Imported')}</p>
                    </div>
                  </div>

                  {importResult.imported_templates && importResult.imported_templates.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                        {t('import.importedTemplatesLabel', 'Imported Templates')}
                      </p>
                      <ScrollArea className="max-h-28">
                        <div className="space-y-1">
                          {importResult.imported_templates.map((template: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 rounded-lg px-3 py-1.5">
                              <CheckCircle2 className="h-3 w-3 shrink-0" />
                              <span className="truncate">{template.account_name}</span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {importResult.errors && importResult.errors.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                        {t('import.errorsLabel', 'Errors')}
                      </p>
                      <ScrollArea className="max-h-28">
                        <div className="space-y-1">
                          {importResult.errors.map((error: string, idx: number) => (
                            <div key={idx} className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-500/5 rounded-lg px-3 py-1.5">
                              <XCircle className="h-3 w-3 shrink-0 mt-0.5" />
                              <span className="truncate">{error}</span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
        </ScrollArea>

        <DialogFooter className="p-4 pt-3 border-t border-border/40 gap-2">
          {!importResult ? (
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl text-xs h-9">
              {t('common.cancel')}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setImportResult(null)} className="rounded-xl text-xs h-9">
                <ArrowRight className="h-3.5 w-3.5 ltr:rotate-180 rtl:rotate-0" />
                {t('common.back')}
              </Button>
              <Button
                onClick={handleConfirmImport}
                disabled={isImporting || (!importResult.success && detectedImportType !== 'request-templates') || importResult.cancelled}
                className="rounded-xl text-xs h-9 gap-1.5"
              >
                {isImporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {isImporting ? t('common.saving') :
                  detectedImportType === 'request-templates'
                    ? t('import.confirmTemplates', 'Confirm Templates')
                    : t('import.confirm', 'Confirm Import')
                }
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
