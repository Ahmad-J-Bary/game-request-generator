import { useState, useEffect, useCallback } from 'react';
import { TauriService } from '../services/tauri.service';
import { NotificationService } from '../utils/notifications';
import { TaskGenerator } from '../utils/taskGenerator';
import { TaskCompletionHandler } from '../utils/taskCompletion';
import { RequestProcessor } from '../services/tauri.service';
import type { GameBatch, AccountCompletionRecord, AccountStartState, AccountTaskAssignment } from '../types/daily-tasks.types';

export interface UseDailyTasksReturn {
  // State
  batches: GameBatch[];
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
  completeTask: (accountId: number, requestIndex: number, batchIndex: number) => Promise<void>;
  copyToClipboard: (content: string, eventToken?: string, timeSpent?: number) => void;

  // Utilities
  refreshGames: () => Promise<void>;
}

export const useDailyTasks = (): UseDailyTasksReturn => {
  const [batches, setBatches] = useState<GameBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [games, setGames] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(Date.now());
  // @ts-expect-error - used for internal state management and persistence
  const [accountScheduledTime, setAccountScheduledTime] = useState<{ [accountId: number]: number[] }>({});
  const [accountCompletionRecords, setAccountCompletionRecords] = useState<{ [accountId: number]: AccountCompletionRecord }>({});
  const [accountTaskAssignments, setAccountTaskAssignments] = useState<{ [accountId: number]: AccountTaskAssignment[] }>({});
  const [accountStartStates, setAccountStartStates] = useState<{ [accountId: number]: AccountStartState }>({});
  const [completedTasks, setCompletedTasks] = useState<any[]>([]);

  // Update current time every second
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
    try {
      // Load task assignments
      const savedAssignments = localStorage.getItem('accountTaskAssignments');
      if (savedAssignments) {
        const parsedAssignments = JSON.parse(savedAssignments);
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

        setAccountTaskAssignments(filteredAssignments);
      }

      // Load completion records
      const savedCompletions = localStorage.getItem('accountCompletionRecords');
      if (savedCompletions) {
        const parsedCompletions = JSON.parse(savedCompletions);
        // Filter out old completion records (older than 7 days)
        const currentTime = Date.now();
        const filteredCompletions: { [accountId: number]: AccountCompletionRecord } = {};

        Object.entries(parsedCompletions).forEach(([accountId, completion]) => {
          const completionRecord = completion as AccountCompletionRecord;
          if ((currentTime - completionRecord.completionTime) < (7 * 24 * 60 * 60 * 1000)) { // 7 days
            filteredCompletions[parseInt(accountId)] = completionRecord;
          }
        });

        setAccountCompletionRecords(filteredCompletions);
      }

      // Load account start states
      const savedStartStates = localStorage.getItem('accountStartStates');
      if (savedStartStates) {
        const parsedStartStates = JSON.parse(savedStartStates);
        setAccountStartStates(parsedStartStates);
      }

      // Load completed tasks
      const today = new Date().toISOString().split('T')[0];
      const savedCompleted = localStorage.getItem(`dailyTasks_completed_${today}`);
      if (savedCompleted) {
        setCompletedTasks(JSON.parse(savedCompleted));
      }
    } catch (error) {
      console.error('Error loading account data:', error);
    }
  }, []);

  // Save account data to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('accountTaskAssignments', JSON.stringify(accountTaskAssignments));
    } catch (error) {
      console.error('Error saving account task assignments:', error);
    }
  }, [accountTaskAssignments]);

  useEffect(() => {
    try {
      localStorage.setItem('accountCompletionRecords', JSON.stringify(accountCompletionRecords));
    } catch (error) {
      console.error('Error saving account completion records:', error);
    }
  }, [accountCompletionRecords]);

  useEffect(() => {
    try {
      localStorage.setItem('accountStartStates', JSON.stringify(accountStartStates));
    } catch (error) {
      console.error('Error saving account start states:', error);
    }
  }, [accountStartStates]);

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
      });

      const { batches, accountScheduledTime } = await taskGenerator.generateTodaysTasks();

      setBatches(batches);
      setAccountScheduledTime(accountScheduledTime);

      // Save to localStorage for persistence
      const today = new Date().toISOString().split('T')[0];
      const serializedBatches = batches.map(batch => ({
        ...batch,
        tasks: batch.tasks.map(task => ({
          ...task,
          completedTasks: Array.from(task.completedTasks)
        }))
      }));
      localStorage.setItem(`dailyTasks_batches_${today}`, JSON.stringify({
        batches: serializedBatches,
        accountScheduledTime
      }));

      if (batches.length > 0) {
        NotificationService.success(`Generated ${batches.length} batches`);
      }
    } catch (error) {
      NotificationService.error('Error generating daily tasks');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [games, accountCompletionRecords, accountStartStates]);

  // Complete a task using the TaskCompletionHandler utility
  const completeTask = useCallback(async (accountId: number, requestIndex: number, batchIndex: number) => {
    try {
      const completionHandler = new TaskCompletionHandler({
        batches,
        setBatches,
        games,
        accountCompletionRecords,
        setAccountCompletionRecords,
        setAccountTaskAssignments,
      });

      await completionHandler.completeTask(accountId, requestIndex, batchIndex);

      // Refresh completed tasks from localStorage
      const today = new Date().toISOString().split('T')[0];
      const savedCompleted = localStorage.getItem(`dailyTasks_completed_${today}`);
      if (savedCompleted) {
        setCompletedTasks(JSON.parse(savedCompleted));
      }
    } catch (error) {
      console.error('Error completing task:', error);
    }
  }, [batches, games, accountCompletionRecords]);

  const copyToClipboard = useCallback((content: string, eventToken?: string, timeSpent?: number) => {
    const processedContent = eventToken && timeSpent !== undefined
      ? RequestProcessor.processRequestContent(content, eventToken, timeSpent)
      : content;
    navigator.clipboard.writeText(processedContent);
    NotificationService.success('Request copied to clipboard');
  }, []);

  return {
    // State
    batches,
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

    // Utilities
    refreshGames,
  };
};
