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
import { ExcelService } from '@grq/core/services/excel.service';
import { TauriService, ImportService } from '@grq/core/services/tauri.service';
import { useQueryClient } from '@tanstack/react-query';
import { NotificationService } from '@grq/core/utils/notifications';
import { asyncStorageService } from '@grq/core/services/storage.service';

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
        // Request templates are already imported by the Tauri command
        // Just refresh data and show results
        queryClient.invalidateQueries();

        const successfulImports = importResult.successful_imports || 0;
        const totalProcessed = importResult.total_processed || 0;

        if (successfulImports > 0) {
          NotificationService.success(t('import.requestTemplatesSuccess', { successful: successfulImports, total: totalProcessed }));
        }

        // Show errors if any
        if (importResult.errors && importResult.errors.length > 0) {
          console.warn('Import errors:', importResult.errors);
          NotificationService.warning(t('import.requestTemplatesPartial', { errors: importResult.errors.length }));
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

        // Cache for resolving branch IDs (key: "gameId_branchName")
        const branchCache: Record<string, number> = {};

        // Helper to get or create game ID and resolve its corresponding branch ID
        const getOrCreateGameAndBranch = async (name?: string, branchName?: string): Promise<{ targetGameId: number, targetBranchId: number } | null> => {
          let targetGame = gameId;
          
          if (name) {
            const lowerName = name.toLowerCase();
            if (gameCache[lowerName]) {
              targetGame = gameCache[lowerName];
            } else {
              console.log(`Creating new game: ${name}`);
              targetGame = await TauriService.addGame({ name });
              gameCache[lowerName] = targetGame;
            }
          }
          
          if (!targetGame) return null;

          // Resolve branch ID
          const branchKey = `${targetGame}_${branchName || ''}`;

          // 1. If we are importing directly into the open game and a branch was provided
          if (branchId && targetGame === gameId) {
            branchCache[branchKey] = branchId;
            return { targetGameId: targetGame, targetBranchId: branchId };
          }

          // 2. Already resolved this branch in this import loop
          if (branchCache[branchKey]) {
            return { targetGameId: targetGame, targetBranchId: branchCache[branchKey] };
          }

          // 3. Fetch branches
          const branches = await TauriService.getGameBranches(targetGame);

          // 4. If branchName is specified, find or create matching branch
          if (branchName) {
            const match = branches.find(b => b.name === branchName);
            if (match) {
              branchCache[branchKey] = match.id;
              return { targetGameId: targetGame, targetBranchId: match.id };
            }
            // Branch doesn't exist yet — create it
            const newBranchId = await TauriService.addBranch({ game_id: targetGame, name: branchName });
            branchCache[branchKey] = newBranchId;
            return { targetGameId: targetGame, targetBranchId: newBranchId };
          }

          // 5. Fall back to default branch
          const defaultBranch = branches.find(b => b.is_default) || branches[0];
          if (defaultBranch) {
            branchCache[branchKey] = defaultBranch.id;
            return { targetGameId: targetGame, targetBranchId: defaultBranch.id };
          }

          return null; // Should not happen realistically unless DB fails
        };

        console.log('Importing data:', {
          levels: importResult.imported.levels.length,
          purchaseEvents: importResult.imported.purchaseEvents.length,
          accounts: importResult.imported.accounts.length,
          progress: importResult.imported.progress.length
        });

        // Import levels
        const createdLevelKeys = new Set<string>(); // key: "gameId_branchId_eventToken"
        for (const level of importResult.imported.levels) {
          try {
            const ids = await getOrCreateGameAndBranch((level as any).gameName, (level as any).branchName);
            if (!ids) continue;
            
            const { targetGameId, targetBranchId } = ids;

            // Deduplicate: skip if same level already imported for this branch
            const levelKey = `${targetGameId}_${targetBranchId}_${(level.event_token || '').toLowerCase()}`;
            if (createdLevelKeys.has(levelKey)) continue;
            createdLevelKeys.add(levelKey);

            console.log(`Importing level into game ${targetGameId}:`, level);
            const levelId = await TauriService.addLevel({
              ...level,
              game_id: targetGameId,
              branch_id: targetBranchId,
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
        const createdPurchaseKeys = new Set<string>(); // key: "gameId_branchId_eventToken"
        for (const event of importResult.imported.purchaseEvents) {
          try {
            const ids = await getOrCreateGameAndBranch((event as any).gameName, (event as any).branchName);
            if (!ids) continue;

            const { targetGameId, targetBranchId } = ids;

            // Deduplicate: skip if same event already imported for this branch
            const purchaseKey = `${targetGameId}_${targetBranchId}_${(event.event_token || '').toLowerCase()}`;
            if (createdPurchaseKeys.has(purchaseKey)) continue;
            createdPurchaseKeys.add(purchaseKey);

            console.log(`Importing purchase event into game ${targetGameId}:`, event);
            const peId = await TauriService.addPurchaseEvent({
              ...event,
              game_id: targetGameId,
              branch_id: targetBranchId,
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
            const ids = await getOrCreateGameAndBranch((account as any).gameName, (account as any).branchName);
            if (!ids) continue;

            const { targetGameId, targetBranchId } = ids;

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
              branch_id: targetBranchId,
              request_template: account.request_template || 'Needs to be filled in - imported from Excel export',
              country: (account as any).country || 'UNITED STATES (US)',
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
            const ids = await getOrCreateGameAndBranch(p.gameName);
            if (!ids) continue;
            const { targetGameId: gid } = ids;
            
            const aid = accountCache[`${gid}_${p.accountName.toLowerCase()}`];
            if (!aid) continue;

            // Use token for matching instead of name
            const lowerToken = p.token.toLowerCase();

            // Find account start date to calculate offsets
            const accountInfo = importResult.imported.accounts.find((a: any) => 
              a.name?.toLowerCase() === p.accountName.toLowerCase() && 
              a.gameName === p.gameName
            );

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
                let calculatedDaysOffset = 0;
                
                // Calculate days_offset if completion date is provided
                if (p.completionDate && accountInfo?.start_date) {
                   try {
                     // Parse start date
                     const startDate = new Date(accountInfo.start_date);
                     
                     // Parse completion date (e.g. "5-Jan")
                     // Assuming current year if not specified, or same year as start date?
                     // Usually current year is safe for immediate re-import, but let's try to be smart.
                     // The export format is "D-MMM".
                     const m = p.completionDate.match(/^(\d{1,2})-([A-Za-z]{3})$/);
                     if (m) {
                       const day = parseInt(m[1], 10);
                       const monStr = m[2].toLowerCase();
                       const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                       const monthIndex = months.indexOf(monStr);
                       
                       if (monthIndex >= 0) {
                         const currentYear = new Date().getFullYear();
                         const compDate = new Date(currentYear, monthIndex, day);
                         
                         // Calculate difference
                         const diffTime = compDate.getTime() - startDate.getTime();
                         calculatedDaysOffset = Math.round(diffTime / (1000 * 60 * 60 * 24));
                       }
                     }
                   } catch (e) {
                     console.error("Error parsing date for offset calculation", e);
                   }
                }

                try {
                  await TauriService.createPurchaseEventProgress({
                    account_id: aid,
                    purchase_event_id: peid,
                    days_offset: calculatedDaysOffset,
                    time_spent: 0
                  });
                } catch (e) { /* Ignore if exists */ }
                
                await TauriService.updatePurchaseEventProgress({
                  account_id: aid,
                  purchase_event_id: peid,
                  is_completed: p.isCompleted,
                  days_offset: calculatedDaysOffset // Update offset as well
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
          const existingCompleted = await asyncStorageService.get<any[]>(completedKey);
          let completedList: any[] = existingCompleted ? existingCompleted : [];
          
          for (const newRecord of todayRecords) {
            // 1. Restore Sidebar Record
            if (!completedList.find(r => r.id === newRecord.id)) {
              completedList.push(newRecord);
            }

            // 2. Sync to Database
            try {
              const ids = await getOrCreateGameAndBranch(newRecord.gameName);
              if (!ids) continue;
              const { targetGameId: gid, targetBranchId } = ids;
              
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

                // Get all levels for this branch
                const gameLevels = await TauriService.getGameLevels(targetBranchId);

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
          
          await asyncStorageService.set(completedKey, completedList);
          window.dispatchEvent(new CustomEvent('daily-task-completed'));
        }

        queryClient.invalidateQueries();
        window.dispatchEvent(new CustomEvent('data-changed'));
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
                <Button
                  onClick={handleExcelImport}
                  disabled={isImporting}
                  className="w-full"
                  variant="outline"
                >
                  {isImporting ? t('common.loading') : t('import.title')}
                </Button>
              </div>

              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📄</span>
                  <h4 className="font-medium">{t('import.requestTemplatesTitle')}</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('import.requestTemplatesDescription')}
                </p>
                <Button
                  onClick={handleTemplateImport}
                  disabled={isImporting}
                  className="w-full"
                  variant="outline"
                >
                  {isImporting ? t('common.loading') : t('import.requestTemplates')}
                </Button>
              </div>
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-medium text-sm mb-2">{t('import.requestTemplatesInstructions')}</h4>
              <p className="text-sm text-muted-foreground mb-2">
                {t('import.example')}
              </p>
              <div className="text-sm bg-background p-2 rounded border">
                <strong>{t('import.example')}</strong>
                <ul className="ps-4 mt-1 space-y-1">
                  <li>• <code>1- IN21 Word Trip.txt</code> → {t('accounts.account')}: "1- IN21 Word Trip"</li>
                  <li>• <code>SA.17 Word Trip.txt</code> → {t('accounts.account')}: "SA.17 Word Trip"</li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className={`p-4 rounded-lg ${importResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              <div className="font-medium">
                {importResult.success ? `✅ ${t('common.success')}` : `❌ ${t('common.error')}`}
              </div>
              <div className="text-sm mt-1">{importResult.message}</div>
            </div>

            {importResult.success && detectedImportType === 'excel' && (
              <div className="space-y-2">
                <div className="text-sm">
                  <strong>{importResult.imported.levels.length}</strong> {t('levels.title')}
                </div>
                <div className="text-sm">
                  <strong>{importResult.imported.purchaseEvents.length}</strong> {t('purchaseEvents.title')}
                </div>
                <div className="text-sm">
                  <strong>{importResult.imported.accounts.length}</strong> {t('accounts.title')}
                </div>
              </div>
            )}

            {detectedImportType === 'request-templates' && !importResult.cancelled && (
              <div className="space-y-2">
                <div className="text-sm">
                  <strong>{importResult.total_processed || 0}</strong> {t('import.filesProcessed')}
                </div>
                <div className="text-sm">
                  <strong>{importResult.successful_imports || 0}</strong> {t('import.templatesImportedSuccessfully')}
                </div>
                {importResult.imported_templates && importResult.imported_templates.length > 0 && (
                  <div className="text-sm">
                    <div className="font-medium mb-2">{t('import.importedTemplatesLabel')}</div>
                    <ul className="ps-4 space-y-1 max-h-32 overflow-y-auto">
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
                    <div className="font-medium mb-1 text-red-600">{t('import.errorsLabel')}</div>
                    <ul className="ps-4 space-y-1 max-h-32 overflow-y-auto">
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
                    ? t('import.confirmTemplates')
                    : t('import.confirm')
                }
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
