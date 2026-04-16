// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { TauriService } from '@grq/core/services/tauri.service';
import { NotificationService } from '@grq/core/utils/notifications';
import { TaskGenerator } from '@grq/core/utils/taskGenerator';
import { TaskCompletionHandler } from '@grq/core/utils/taskCompletion';
import { RequestProcessor } from '@grq/core/services/tauri.service';
import type { GameBatch, DailyTask, AccountCompletionRecord, AccountStartState, AccountTaskAssignment, CompletedDailyTask, RepeaterResponse } from '@grq/api-bindings';

import { asyncStorageService } from '@grq/core/services/storage.service';

export interface UseDailyTasksReturn {
  // State
  batches: GameBatch[];
  deferredTasks: DailyTask[];
  loading: boolean;
  games: any[];
  currentTime: number;
  completedTasks: any[];

  // Account state
  accountCompletionRecords: { [accountId: number]: AccountCompletionRecord };
  accountTaskAssignments: { [accountId: number]: AccountTaskAssignment[] };
  accountStartStates: { [accountId: number]: AccountStartState };

  // Actions
  generateTodaysTasks: () => Promise<void>;
  completeTask: (accountId: number, requestIndex: number, batchIndex: number, task: DailyTask, response?: RepeaterResponse) => Promise<void>;
  copyToClipboard: (content: string, eventToken?: string, timeSpent?: number) => void;
  updateTaskResponse: (accountId: number, requestIndex: number, response: RepeaterResponse) => void;

  // Utilities
  refreshGames: () => Promise<void>;
}

export const useDailyTasks = (): UseDailyTasksReturn => {
  const { t } = useTranslation();
  const [batches, setBatches] = useState<GameBatch[]>([]);
  const [deferredTasks, setDeferredTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true); // Default to true while hydrating
  const [games, setGames] = useState<any[]>([]);
  // @ts-expect-error - used for internal state management and persistence
  const [accountScheduledTime, setAccountScheduledTime] = useState<{ [accountId: number]: number[] }>({});
  const [accountCompletionRecords, setAccountCompletionRecords] = useState<{ [accountId: number]: AccountCompletionRecord }>({});
  const [accountTaskAssignments, setAccountTaskAssignments] = useState<{ [accountId: number]: AccountTaskAssignment[] }>({});
  const [accountStartStates, setAccountStartStates] = useState<{ [accountId: number]: AccountStartState }>({});
  const [completedTasks, setCompletedTasks] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(Date.now());
 
  // Update current time every second for UI countdowns
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
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

      // Load completed tasks
      const today = new Date().toISOString().split('T')[0];
      const savedCompleted = await asyncStorageService.get(`dailyTasks_completed_${today}`) as any;
      if (savedCompleted && mounted) {
        setCompletedTasks(savedCompleted);
      }
      
      // We no longer load batches from storage to ensure fresh random numbers on every entry.
      // The generateTodaysTasks() call in DailyTasksPage will handle fetching fresh data.

      if (mounted) setLoading(false);
    } catch (error) {
      console.error('Error loading account data:', error);
      if (mounted) setLoading(false);
    }
  };
  hydrateData();
  return () => { mounted = false; };
  }, []);

  // Save account data to AsyncStorage whenever they change
  useEffect(() => {
    const save = async () => {
      try {
        if (Object.keys(accountTaskAssignments).length > 0) {
          await asyncStorageService.set('accountTaskAssignments', accountTaskAssignments);
        }
      } catch (error) {
        console.error('Error saving account task assignments:', error);
      }
    };
    save();
  }, [accountTaskAssignments]);

  useEffect(() => {
    const save = async () => {
      try {
        if (Object.keys(accountCompletionRecords).length > 0) {
          await asyncStorageService.set('accountCompletionRecords', accountCompletionRecords);
        }
      } catch (error) {
        console.error('Error saving account completion records:', error);
      }
    };
    save();
  }, [accountCompletionRecords]);

  useEffect(() => {
    const save = async () => {
      try {
        if (Object.keys(accountStartStates).length > 0) {
          await asyncStorageService.set('accountStartStates', accountStartStates);
        }
      } catch (error) {
        console.error('Error saving account start states:', error);
      }
    };
    save();
  }, [accountStartStates]);

  useEffect(() => {
    const saveTasksState = async () => {
      if (loading) return;

      try {
        // We only save accountScheduledTime now. Batches and DeferredTasks are generated fresh on every mount.
        await asyncStorageService.set(`dailyTasks_scheduledTime`, {
          accountScheduledTime
        });
      } catch (error) {
        console.error('Error saving daily tasks state:', error);
      }
    };

    saveTasksState();
  }, [accountScheduledTime, loading]);

  // Generate today's tasks using the TaskGenerator utility
  const generateTodaysTasks = useCallback(async () => {
    setLoading(true);
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

      // We no longer save batches to AsyncStorage here.
      
      if (generatedBatches.length > 0) {
        NotificationService.success(t('dailyTasks.generateTasksSuccess', { count: generatedBatches.length }));
      }
    } catch (error) {
      NotificationService.error(t('dailyTasks.generateTasksError'));
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [games, accountCompletionRecords, accountStartStates]);

  // Complete a task using the TaskCompletionHandler utility
  const completeTask = useCallback(async (accountId: number, requestIndex: number, batchIndex: number, task: DailyTask, response?: RepeaterResponse) => {
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

      const result = await completionHandler.completeTask(accountId, requestIndex, batchIndex, task, response);
      
      if (result && result.success && result.message) {
        NotificationService.success(result.message);
      } else if (result && result.success) {
        NotificationService.success('Task completed successfully');
      }

      // Refresh completed tasks from AsyncStorage
      const today = new Date().toISOString().split('T')[0];
      const savedCompleted = await asyncStorageService.get(`dailyTasks_completed_${today}`) as any;
      if (savedCompleted) {
        setCompletedTasks(savedCompleted);
      }
    } catch (error: any) {
      console.error('Error completing task:', error);
      const errorMessage = error.message || 'Error completing task';
      NotificationService.error(errorMessage);
    }
  }, [batches, deferredTasks, games, accountCompletionRecords]);

  const updateTaskResponse = useCallback((accountId: number, requestIndex: number, response: RepeaterResponse) => {
    setBatches(prev => prev.map(batch => ({
      ...batch,
      tasks: batch.tasks.map(task => {
        if (task.account.id === accountId) {
          return {
            ...task,
            lastResponses: {
              ...(task.lastResponses || {}),
              [requestIndex]: response
            }
          };
        }
        return task;
      })
    })));

    setDeferredTasks(prev => prev.map(task => {
      if (task.account.id === accountId) {
        return {
          ...task,
          lastResponses: {
            ...(task.lastResponses || {}),
            [requestIndex]: response
          }
        };
      }
      return task;
    }));
  }, []);

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
    games,
    currentTime,
    completedTasks,

    // Account state
    accountCompletionRecords,
    accountTaskAssignments,
    accountStartStates,

    // Actions
    generateTodaysTasks,
    completeTask,
    copyToClipboard,
    updateTaskResponse,

    // Utilities
    refreshGames,
  };
};
