// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { TauriService } from '@grq/core/services/tauri.service';
import { NotificationService } from '@grq/core/utils/notifications';
import { TaskGenerator } from '@grq/core/utils/taskGenerator';
import { TaskCompletionHandler } from '@grq/core/utils/taskCompletion';
import { RequestProcessor } from '@grq/core/services/tauri.service';
import type { GameBatch, DailyTask, AccountCompletionRecord, AccountStartState, AccountTaskAssignment, CompletedDailyTask } from '@grq/api-bindings';

import { asyncStorageService } from '@grq/core/services/storage.service';

export interface UseDailyTasksReturn {
  // State
  batches: GameBatch[];
  deferredTasks: DailyTask[];
  loading: boolean;
  isGenerating: boolean;
  games: any[];
  completedTasks: any[];

  // Account state
  accountCompletionRecords: { [accountId: number]: AccountCompletionRecord };
  accountTaskAssignments: { [accountId: number]: AccountTaskAssignment[] };
  accountStartStates: { [accountId: number]: AccountStartState };

  // Actions
  generateTodaysTasks: () => Promise<void>;
  completeTask: (accountId: number, requestIndex: number, batchIndex: number, task: DailyTask) => Promise<void>;
  copyToClipboard: (content: string, eventToken?: string, timeSpent?: number) => void;

  // Utilities
  refreshGames: () => Promise<void>;
}

export const useDailyTasks = (): UseDailyTasksReturn => {
  const { t } = useTranslation();
  const [batches, setBatches] = useState<GameBatch[]>([]);
  const [deferredTasks, setDeferredTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true); // Default to true while hydrating
  const [isGenerating, setIsGenerating] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [games, setGames] = useState<any[]>([]);
  // @ts-expect-error - used for internal state management and persistence
  const [accountScheduledTime, setAccountScheduledTime] = useState<{ [accountId: number]: number[] }>({});
  const [accountCompletionRecords, setAccountCompletionRecords] = useState<{ [accountId: number]: AccountCompletionRecord }>({});
  const [accountTaskAssignments, setAccountTaskAssignments] = useState<{ [accountId: number]: AccountTaskAssignment[] }>({});
  const [accountStartStates, setAccountStartStates] = useState<{ [accountId: number]: AccountStartState }>({});
  const [completedTasks, setCompletedTasks] = useState<any[]>([]);
  const [regenerationTrigger, setRegenerationTrigger] = useState(0);

  // Listen for completed tasks event to refresh
  useEffect(() => {
    const handleTaskCompleted = async () => {
      const history = await TauriService.getTaskHistory(100);
      setCompletedTasks(history);
    };

    window.addEventListener('daily-task-completed', handleTaskCompleted);
    return () => window.removeEventListener('daily-task-completed', handleTaskCompleted);
  }, []);

  // When an account is updated (template/start time changed), clear cached state and regenerate
  useEffect(() => {
    const handleAccountUpdated = (e: Event) => {
      const { accountId } = (e as CustomEvent).detail;
      if (accountId == null) return;

      setAccountStartStates(prev => {
        const next = { ...prev };
        delete next[accountId];
        asyncStorageService.set('accountStartStates', next);
        return next;
      });

      setRegenerationTrigger(n => n + 1);
    };

    window.addEventListener('account-updated', handleAccountUpdated);
    return () => window.removeEventListener('account-updated', handleAccountUpdated);
  }, []);

  // Load games on mount
  const refreshGames = useCallback(async () => {
    try {
      const gameList = await TauriService.getGames();
      setGames(gameList);
    } catch (error) {
      console.error('Error loading games:', error);
    }
  }, []);

  useEffect(() => {
    refreshGames();
  }, [refreshGames]);

  // Load persisted account data on mount
  useEffect(() => {
    let mounted = true;
    const hydrateData = async () => {
      try {
        setLoading(true);
        // Load task assignments
        const parsedAssignments = await asyncStorageService.get('accountTaskAssignments') as any;
        if (parsedAssignments) {
          // Filter out old assignments (older than 24 hours)
          const currentTime = Date.now();
          const filteredAssignments: { [accountId: number]: AccountTaskAssignment[] } = {};

          Object.entries(parsedAssignments).forEach(([accountId, assignments]) => {
            const validAssignments = (assignments as AccountTaskAssignment[]).filter(
              assignment => (currentTime - assignment.assignedTime) < (24 * 60 * 60 * 1000) // 24 hours
            );
            if (validAssignments.length > 0) {
              filteredAssignments[parseInt(accountId)] = validAssignments;
            }
          });

          if (mounted) setAccountTaskAssignments(filteredAssignments);
        }

      // Load completion records
      const parsedCompletions = await asyncStorageService.get('accountCompletionRecords') as any;
      if (parsedCompletions) {
        // Filter out old completion records (older than 7 days)
        const currentTime = Date.now();
        const filteredCompletions: { [accountId: number]: AccountCompletionRecord } = {};

        Object.entries(parsedCompletions).forEach(([accountId, completion]) => {
          const completionRecord = completion as AccountCompletionRecord;
          if ((currentTime - completionRecord.completionTime) < (7 * 24 * 60 * 60 * 1000)) { // 7 days
            filteredCompletions[parseInt(accountId)] = completionRecord;
          }
        });

        if (mounted) setAccountCompletionRecords(filteredCompletions);
      }

      // Load account start states
      const parsedStartStates = await asyncStorageService.get('accountStartStates') as any;
      if (parsedStartStates && mounted) {
        setAccountStartStates(parsedStartStates);
      }

      // Load completed tasks from SQLite
      const history = await TauriService.getTaskHistory(100); // Load last 100 tasks for the daily view
      if (mounted) {
        setCompletedTasks(history);
      }
      
      // We no longer load batches from storage to ensure fresh random numbers on every entry.
      // The generateTodaysTasks() call in DailyTasksPage will handle fetching fresh data.

      if (mounted) {
        setLoading(false);
        setIsHydrated(true);
      }
    } catch (error) {
      console.error('Error loading account data:', error);
      if (mounted) {
        setLoading(false);
        setIsHydrated(true);
      }
    }
  };
  hydrateData();
  return () => { mounted = false; };
  }, []);

  // Debounced persistence — merge all 4 storage writes into 1 effect (500ms debounce)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(async () => {
      try {
        const writes: Promise<void>[] = [];
        if (Object.keys(accountTaskAssignments).length > 0) {
          writes.push(asyncStorageService.set('accountTaskAssignments', accountTaskAssignments));
        }
        if (Object.keys(accountCompletionRecords).length > 0) {
          writes.push(asyncStorageService.set('accountCompletionRecords', accountCompletionRecords));
        }
        if (Object.keys(accountStartStates).length > 0) {
          writes.push(asyncStorageService.set('accountStartStates', accountStartStates));
        }
        if (!loading) {
          writes.push(asyncStorageService.set('dailyTasks_scheduledTime', { accountScheduledTime }));
        }
        await Promise.all(writes);
      } catch (error) {
        console.error('Error persisting daily tasks state:', error);
      }
    }, 500);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [accountTaskAssignments, accountCompletionRecords, accountStartStates, accountScheduledTime, loading]);

  // Generate today's tasks using the TaskGenerator utility
  const generateTodaysTasks = useCallback(async () => {
    // Avoid double generation
    if (isGenerating) return;

    // Only show full page spinner on very first mount/hydration
    const isInitialLoad = !isHydrated;
    
    if (isInitialLoad) {
      setLoading(true);
    } else {
      setIsGenerating(true);
    }

    try {
      const taskGenerator = new TaskGenerator({
        games,
        accountCompletionRecords,
        accountStartStates,
        setAccountStartStates,
        setAccountTaskAssignments,
        currentTime: Date.now(),
        completedTasks,
      });

      const { batches: generatedBatches, deferredTasks: generatedDeferred, accountScheduledTime: generatedScheduledTime } = await taskGenerator.generateTodaysTasks();

      setBatches(generatedBatches);
      setDeferredTasks(generatedDeferred);
      setAccountScheduledTime(generatedScheduledTime);

      if (generatedBatches.length > 0 && isInitialLoad) {
        NotificationService.success(t('dailyTasks.generateTasksSuccess', { count: generatedBatches.length }));
      }
    } catch (error) {
      NotificationService.error(t('dailyTasks.generateTasksError'));
      console.error(error);
    } finally {
      setLoading(false);
      setIsGenerating(false);
    }
  }, [games, accountCompletionRecords, accountStartStates, isGenerating, isHydrated, batches.length, deferredTasks.length, completedTasks, t]);

  // Regenerate tasks when an account is updated (template/start time changed)
  useEffect(() => {
    if (regenerationTrigger > 0 && isHydrated && !isGenerating) {
      generateTodaysTasks();
    }
  }, [regenerationTrigger, isHydrated, isGenerating, generateTodaysTasks]);

  // Complete a task using the TaskCompletionHandler utility
  const completeTask = useCallback(async (accountId: number, requestIndex: number, batchIndex: number, task: DailyTask) => {
    try {
      const completionHandler = new TaskCompletionHandler({
        batches,
        setBatches,
        deferredTasks,
        setDeferredTasks,
        games,
        accountCompletionRecords,
        setAccountCompletionRecords,
        setAccountTaskAssignments,
      });

      const result = await completionHandler.completeTask(accountId, requestIndex, batchIndex, task);
      
      if (result && result.success && result.message) {
        NotificationService.success(result.message);
      } else if (result && result.success) {
        NotificationService.success('Task completed successfully');
      }

      // TRIGGER REFRESH to ensure filtering logic (TaskGenerator) is in sync with fresh DB data
      // This is crucial for the "first-time" completion where a new level is created.
      // WE NO LONGER REFRESH HERE to avoid random jitter shifts and excessive loading states.
      // The state is kept stable until manual refresh or navigation.

      // Refresh completed tasks from SQLite
      const history = await TauriService.getTaskHistory(100);
      setCompletedTasks(history);
    } catch (error: any) {
      console.error('Error completing task:', error);
      const errorMessage = error.message || 'Error completing task';
      NotificationService.error(errorMessage);
    }
  }, [batches, deferredTasks, games, accountCompletionRecords]);

  const copyToClipboard = useCallback((content: string, eventToken?: string, timeSpent?: number) => {
    const processedContent = eventToken && timeSpent !== undefined
      ? RequestProcessor.processRequestContent(content, eventToken, timeSpent)
      : content;
    navigator.clipboard.writeText(processedContent);
    NotificationService.success(t('dailyTasks.requestCopied'));
  }, [t]);

  return {
    // State
    batches,
    deferredTasks,
    loading,
    isGenerating,
    games,
    completedTasks,

    // Account state
    accountCompletionRecords,
    accountTaskAssignments,
    accountStartStates,

    // Actions
    generateTodaysTasks,
    completeTask,
    copyToClipboard,

    // Utilities
    refreshGames,
  };
};
