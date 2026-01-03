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
        let importedCount = 0;
        const gamesList = await TauriService.getGames();
        const gameCache: Record<string, number> = {};
        const levelCache: Record<string, number> = {}; // key: "gameId_levelName"
        const purchaseCache: Record<string, number> = {}; // key: "gameId_token"
        const accountCache: Record<string, number> = {}; // key: "gameId_accountName"
        
        // Pre-fill cache with existing games
        gamesList.forEach(g => {
          gameCache[g.name.toLowerCase()] = g.id;
        });

        // Helper to get or create game ID
        const getOrCreateGameId = async (name?: string): Promise<number> => {
          if (!name) return gameId || 0;
          const lowerName = name.toLowerCase();
          if (gameCache[lowerName]) return gameCache[lowerName];
          
          console.log(`Creating new game: ${name}`);
          const newId = await TauriService.addGame({ name });
          gameCache[lowerName] = newId;
          return newId;
        };

        console.log('Importing data:', {
          levels: importResult.imported.levels.length,
          purchaseEvents: importResult.imported.purchaseEvents.length,
          accounts: importResult.imported.accounts.length,
          progress: importResult.imported.progress.length
        });

        // Import levels
        for (const level of importResult.imported.levels) {
          try {
            const targetGameId = await getOrCreateGameId((level as any).gameName);
            if (!targetGameId) continue;

            console.log(`Importing level into game ${targetGameId}:`, level);
            const levelId = await TauriService.addLevel({
              ...level,
              game_id: targetGameId,
              is_bonus: level.is_bonus || false,
            } as any);
            
            // Mapping for 5-type system - all levels can be completed as sessions
            if (level.event_token) {
              const lowerToken = level.event_token.toLowerCase();
              // All levels can be completed as Session Only (even if they have events)
              levelCache[`${targetGameId}_${lowerToken}_Session Only`] = levelId;
              // Regular levels also support Level Session and Level Event types
              if (level.level_name !== '-') {
                levelCache[`${targetGameId}_${lowerToken}_Level Session`] = levelId;
                levelCache[`${targetGameId}_${lowerToken}_Level Event`] = levelId;
              }
            }
            importedCount++;
          } catch (error) {
            console.error('Failed to import level:', level, error);
          }
        }

        // Import purchase events
        for (const event of importResult.imported.purchaseEvents) {
          try {
            const targetGameId = await getOrCreateGameId((event as any).gameName);
            if (!targetGameId) continue;

            console.log(`Importing purchase event into game ${targetGameId}:`, event);
            const peId = await TauriService.addPurchaseEvent({
              ...event,
              game_id: targetGameId,
              is_restricted: event.is_restricted || false,
            } as any);
            
            if (event.event_token) {
              const lowerToken = event.event_token.toLowerCase();
              purchaseCache[`${targetGameId}_${lowerToken}_Purchase Session`] = peId;
              purchaseCache[`${targetGameId}_${lowerToken}_Purchase Event`] = peId;
            }
            importedCount++;
          } catch (error) {
            console.error('Failed to import purchase event:', event, error);
          }
        }

        // Game-level event sequence cache for backfilling
        const gameEventSequenceCache: Record<number, any[]> = {};

        // Import accounts
        for (const account of importResult.imported.accounts) {
          try {
            const targetGameId = await getOrCreateGameId((account as any).gameName);
            if (!targetGameId) continue;

            const lowerAccName = account.name?.toLowerCase() || '';
            const cacheKey = `${targetGameId}_${lowerAccName}`;

            // Deduplicate accounts - skip if already imported for this game
            if (accountCache[cacheKey]) {
              console.log(`Account ${account.name} already exists for game ${targetGameId}, skipping duplication.`);
              continue;
            }

            console.log(`Importing account into game ${targetGameId}:`, account);
            const accId = await TauriService.addAccount({
              ...account,
              game_id: targetGameId,
              request_template: account.request_template || 'Needs to be filled in - imported from Excel export',
            } as any);
            
            accountCache[cacheKey] = accId;
            importedCount++;

            // Progress restoration (Last Completed Token AND/OR Global Backfill Date)
            const lastCompletedToken = (account as any).lastCompletedToken;
            const globalBackfillDate = (importResult.imported as any).fullCompletionUpToDate;
            
            if ((lastCompletedToken || globalBackfillDate) && accId) {
              console.log(`Restoring progress for ${account.name}: milestone=${lastCompletedToken}, globalDate=${globalBackfillDate}`);
              
              const backfillDeadline = globalBackfillDate ? new Date(globalBackfillDate).getTime() : 0;
              const startDateStr = account.start_date ? (account.start_date.includes('T') ? account.start_date.split('T')[0] : account.start_date) : '';
              const startDateTime = startDateStr ? new Date(startDateStr).getTime() : 0;

              // Ensure sequence is cached
              if (!gameEventSequenceCache[targetGameId]) {
                const [lvls, evts] = await Promise.all([
                  TauriService.getGameLevels(targetGameId),
                  TauriService.getGamePurchaseEvents(targetGameId)
                ]);
                const sequence = [
                  ...lvls.map(l => ({ ...l, kind: 'level' })),
                  ...evts.map(e => ({ ...e, kind: 'purchase', days_offset: e.max_days_offset }))
                ].sort((a, b) => (a.days_offset || 0) - (b.days_offset || 0));
                gameEventSequenceCache[targetGameId] = sequence;
              }

              const sequence = gameEventSequenceCache[targetGameId];
              let foundMilestone = false;

              for (const item of sequence) {
                const offsetMs = (item.days_offset || 0) * 24 * 60 * 60 * 1000;
                const eventDate = startDateTime + offsetMs;
                
                const [mToken, mType] = (lastCompletedToken && lastCompletedToken.includes(':')) ? lastCompletedToken.split(':') : [lastCompletedToken, ''];
                
                const isMatch = item.event_token === mToken && (
                    !mType || 
                    (mType === 'Session Only' && item.kind === 'level' && item.level_name === '-') ||
                    (mType === 'Level Event' && item.kind === 'level' && item.level_name !== '-') ||
                    (mType === 'Purchase Event' && item.kind === 'purchase')
                );

                const isUnderMilestone = !foundMilestone && isMatch;
                const isUnderGlobalDate = backfillDeadline > 0 && eventDate <= backfillDeadline;

                if (isUnderMilestone || isUnderGlobalDate || foundMilestone) {
                  // Actually we only want to mark as completed if it's BELOW or AT the milestone
                  // If we already found the milestone, we stop (for milestone logic).
                  // But for global date, we continue as long as date matches.
                }

                // Simplified: Mark as completed if it matches either condition
                if ((isUnderMilestone) || (!foundMilestone && globalBackfillDate && eventDate <= backfillDeadline)) {
                  if (item.kind === 'level') {
                    try {
                      await TauriService.createLevelProgress({ account_id: accId, level_id: item.id });
                    } catch (e) { /* Ignore if exists */ }
                    await TauriService.updateLevelProgress({ account_id: accId, level_id: item.id, is_completed: true });
                  } else {
                    try {
                      await TauriService.createPurchaseEventProgress({ account_id: accId, purchase_event_id: item.id, days_offset: 0, time_spent: 0 });
                    } catch (e) { /* Ignore if exists */ }
                    await TauriService.updatePurchaseEventProgress({ account_id: accId, purchase_event_id: item.id, is_completed: true });
                  }
                }

                if (isUnderMilestone) {
                  foundMilestone = true;
                  // If we don't have a global date, we can stop here
                  if (!globalBackfillDate) break;
                }
              }
            }
          } catch (error) {
            console.error('Failed to import account:', account, error);
          }
        }

        // Import progress (completion status) - using matrix completion markers
        for (const p of importResult.imported.progress) {
          try {
            const gid = await getOrCreateGameId(p.gameName);
            const aid = accountCache[`${gid}_${p.accountName.toLowerCase()}`];
            if (!aid) continue;

            // Use token for matching instead of name
            const lowerToken = p.token.toLowerCase();

            if (p.levelName !== undefined) {
              const lid = levelCache[`${gid}_${lowerToken}`];
              if (lid) {
                try {
                  await TauriService.createLevelProgress({
                    account_id: aid,
                    level_id: lid
                  });
                } catch (e) { /* Ignore if exists */ }
                await TauriService.updateLevelProgress({
                  account_id: aid,
                  level_id: lid,
                  is_completed: p.isCompleted
                });
              }
            } else if (p.purchaseToken !== undefined) {
              const peid = purchaseCache[`${gid}_${lowerToken}`];
              if (peid) {
                try {
                  await TauriService.createPurchaseEventProgress({
                    account_id: aid,
                    purchase_event_id: peid,
                    days_offset: 0,
                    time_spent: 0
                  });
                } catch (e) { /* Ignore if exists */ }
                await TauriService.updatePurchaseEventProgress({
                  account_id: aid,
                  purchase_event_id: peid,
                  is_completed: p.isCompleted
                });
              }
            }
          } catch (error) {
            console.error('Failed to import progress:', p, error);
          }
        }

        // Restore "Completed Today" records
        const todayRecords = (importResult.imported as any).completedToday;
        if (Array.isArray(todayRecords) && todayRecords.length > 0) {
          console.log(`Restoring ${todayRecords.length} completion records for today`);
          const today = new Date().toISOString().split('T')[0];
          const completedKey = `dailyTasks_completed_${today}`;
          const existingCompleted = localStorage.getItem(completedKey);
          let completedList: any[] = existingCompleted ? JSON.parse(existingCompleted) : [];
          
          for (const newRecord of todayRecords) {
            // 1. Restore Sidebar Record
            if (!completedList.find(r => r.id === newRecord.id)) {
              completedList.push(newRecord);
            }

            // 2. Sync to Database
            try {
              const gid = await getOrCreateGameId(newRecord.gameName);
              const aid = accountCache[`${gid}_${newRecord.accountName.toLowerCase()}`];
              if (!aid) continue;

              const lowerToken = (newRecord.eventToken || '').toLowerCase();
              const type = newRecord.requestType; 

              if (type && type.includes('Purchase')) {
                const peid = purchaseCache[`${gid}_${lowerToken}_${type}`];
                if (peid) {
                    try { await TauriService.createPurchaseEventProgress({ account_id: aid, purchase_event_id: peid, days_offset: 0, time_spent: 0 }); } catch (e) {}
                    await TauriService.updatePurchaseEventProgress({ account_id: aid, purchase_event_id: peid, is_completed: true });
                }
              } else if (type) {
                // For completed today records, try to match by time_spent and event_token pattern
                let targetLevelId = null;

                // Get all levels for this game
                const gameLevels = await TauriService.getGameLevels(gid);

                // Calculate expected base time_spent from completion record
                // Completion time_spent is in milliseconds, level time_spent is in thousand seconds
                const completionTimeMs = newRecord.timeSpent || 0;
                const expectedBaseThousandSeconds = Math.round(completionTimeMs / 1000);

                // Find levels that match event_token pattern and have closest time_spent
                let bestMatch = null;
                let bestDiff = Infinity;

                for (const level of gameLevels) {
                  // Match event_tokens that start with the completion event_token (handles synthetic levels)
                  if (level.event_token.toLowerCase().startsWith(lowerToken)) {
                    const levelTimeThousandSeconds = level.time_spent;
                    const diff = Math.abs(levelTimeThousandSeconds - expectedBaseThousandSeconds);
                    // Allow for randomization (±2 thousand seconds) and some variance
                    if (diff < bestDiff && diff < 3) {
                      bestMatch = level;
                      bestDiff = diff;
                    }
                  }
                }

                if (bestMatch) {
                  targetLevelId = bestMatch.id;
                } else {
                  // Fallback: try exact event_token and level_name match
                  const matchingLevel = gameLevels.find(l =>
                    l.event_token.toLowerCase() === lowerToken &&
                    l.level_name === newRecord.levelName
                  );
                  if (matchingLevel) {
                    targetLevelId = matchingLevel.id;
                  } else {
                    // Final fallback to cache
                    targetLevelId = levelCache[`${gid}_${lowerToken}_${type}`];
                  }
                }

                if (targetLevelId) {
                    try { await TauriService.createLevelProgress({ account_id: aid, level_id: targetLevelId }); } catch (e) {}
                    await TauriService.updateLevelProgress({ account_id: aid, level_id: targetLevelId, is_completed: true });
                }
              }
            } catch (error) {
              console.error('Failed to sync today record to DB:', newRecord, error);
            }
          }
          
          localStorage.setItem(completedKey, JSON.stringify(completedList));
          window.dispatchEvent(new CustomEvent('daily-task-completed'));
        }

        queryClient.invalidateQueries();
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
