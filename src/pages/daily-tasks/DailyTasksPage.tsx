import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { TauriService, RequestProcessor } from '../../services/tauri.service';
import { ApiService } from '../../services/api.service';
import { NotificationService } from '../../utils/notifications';
import { TaskItem } from '../../components/daily-tasks/TaskItem';
import { checkTaskReadiness, calculateFirstRequestAllowedTime, getInterpolatedTimeSpent } from '../../utils/daily-tasks.utils';
import type { Account } from '../../types';
import type { DailyTask, GameBatch, AccountCompletionRecord, AccountStartState, AccountTaskAssignment, CompletedDailyTask } from '../../types/daily-tasks.types';

// ===== Empty State Component =====
function EmptyState() {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="p-8 text-center">
        <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">{t('dailyTasks.noTasks')}</h3>
        <p className="text-muted-foreground mb-4">
          {t('dailyTasks.noTasksDescription')}
        </p>
      </CardContent>
    </Card>
  );
}

export default function DailyTasksPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [batches, setBatches] = useState<GameBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [games, setGames] = useState<any[]>([]);
  const [accountScheduledTime, setAccountScheduledTime] = useState<{ [accountId: number]: number[] }>({});
  const [accountCompletionRecords, setAccountCompletionRecords] = useState<{ [accountId: number]: AccountCompletionRecord }>({});
  const [accountTaskAssignments, setAccountTaskAssignments] = useState<{ [accountId: number]: AccountTaskAssignment[] }>({});
  const [accountStartStates, setAccountStartStates] = useState<{ [accountId: number]: AccountStartState }>({});
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update current time every second for real-time UI updates
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Load games on mount
  useEffect(() => {
    const loadGames = async () => {
      try {
        const gameList = await TauriService.getGames();
        setGames(gameList);
      } catch (error) {
        console.error('Error loading games:', error);
      }
    };
    loadGames();
  }, []);

  // Auto-generate tasks once per day
  useEffect(() => {
    if (games.length === 0) return; // Wait for games to load

    const today = new Date().toISOString().split('T')[0];
    // Always load tasks from storage first if available
    const storedTasks = localStorage.getItem(`dailyTasks_batches_${today}`);
    if (storedTasks) {
      try {
        const parsed = JSON.parse(storedTasks);
        const loadedBatches = (parsed.batches || []).map((batch: any) => ({
          ...batch,
          tasks: batch.tasks.map((task: any) => ({
            ...task,
            completedTasks: new Set(task.completedTasks || [])
          }))
        }));
        setBatches(loadedBatches);
        setAccountScheduledTime(parsed.accountScheduledTime || {});
      } catch (error) {
        console.error('Error loading stored tasks:', error);
      }
    }

    // Always generate/refresh tasks to catch new additions
    generateTodaysTasks();
    localStorage.setItem('dailyTasks_lastGenerated', today);
  }, [games]); // Re-run when games are loaded

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
        // Filter out old start states (keep them as they represent account creation)
        setAccountStartStates(parsedStartStates);
      }
    } catch (error) {
      console.error('Error loading account data:', error);
    }
  }, []);

  // Save account task assignments to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('accountTaskAssignments', JSON.stringify(accountTaskAssignments));
    } catch (error) {
      console.error('Error saving account task assignments:', error);
    }
  }, [accountTaskAssignments]);

  // Save account completion records to localStorage whenever they change
  useEffect(() => {
    try {
      const today = new Date().toISOString().split('T')[0];
      localStorage.setItem(`dailyTasks_completionRecords_${today}`, JSON.stringify(accountCompletionRecords));
      // Also save to generic key for backward compatibility
      localStorage.setItem('accountCompletionRecords', JSON.stringify(accountCompletionRecords));
    } catch (error) {
      console.error('Error saving account completion records:', error);
    }
  }, [accountCompletionRecords]);

  // Save account start states to localStorage whenever they change
  useEffect(() => {
    try {
      const today = new Date().toISOString().split('T')[0];
      localStorage.setItem(`dailyTasks_startStates_${today}`, JSON.stringify(accountStartStates));
      // Also save to generic key for backward compatibility
      localStorage.setItem('accountStartStates', JSON.stringify(accountStartStates));
    } catch (error) {
      console.error('Error saving account start states:', error);
    }
  }, [accountStartStates]);

  // Generate today's tasks with round-robin batching by game
  const generateTodaysTasks = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. Fetch current accounts to validate existing tasks
      const validAccountsMap = new Map<number, Account>();
      for (const game of games) {
        try {
          const accounts = await TauriService.getAccounts(game.id);
          accounts.forEach(acc => validAccountsMap.set(acc.id, acc));
        } catch (e) {
          console.error(`Error fetching accounts for game ${game.id}:`, e);
        }
      }

      // 2. Load and filter existing batches
      let existingBatches: GameBatch[] = [];
      let existingScheduledTimes: { [accountId: number]: number[] } = {};
      const storedTasks = localStorage.getItem(`dailyTasks_batches_${today}`);

      if (storedTasks) {
        try {
          const parsed = JSON.parse(storedTasks);
          const rawBatches = (parsed.batches || []);

          // Filter and update tasks
          existingBatches = rawBatches.reduce((accBatches: GameBatch[], batch: any) => {
            const validTasks = batch.tasks.reduce((accTasks: DailyTask[], task: any) => {
              const currentAccount = validAccountsMap.get(task.account.id);
              if (currentAccount) {
                // Update account details in case they changed (e.g. name)
                accTasks.push({
                  ...task,
                  account: currentAccount,
                  completedTasks: new Set(task.completedTasks || [])
                });
              }
              return accTasks;
            }, []);

            if (validTasks.length > 0) {
              accBatches.push({
                ...batch,
                tasks: validTasks
              });
            }
            return accBatches;
          }, []);

          existingScheduledTimes = parsed.accountScheduledTime || {};
          // Clean up scheduled times for deleted accounts
          Object.keys(existingScheduledTimes).forEach(key => {
            if (!validAccountsMap.has(parseInt(key))) {
              delete existingScheduledTimes[parseInt(key)];
            }
          });

        } catch (e) { console.error(e); }
      }

      // Load completed tasks to check for duplicates
      // We'll filter out accounts that are already in existing batches or have completed tasks
      const existingAccountIds = new Set<number>();
      existingBatches.forEach(batch => {
        batch.tasks.forEach(task => existingAccountIds.add(task.account.id));
      });

      // Also filter out accounts that have completed tasks today
      const completedKey = `dailyTasks_completed_${today}`;
      const storedCompleted = localStorage.getItem(completedKey);
      if (storedCompleted) {
        try {
          const completedList = JSON.parse(storedCompleted);
          completedList.forEach((t: any) => existingAccountIds.add(t.accountId));
        } catch (e) { console.error(e); }
      }

      const gameTasksMap: { [gameId: number]: DailyTask[] } = {};

      // Collect all tasks grouped by game
      for (const game of games) {
        try {
          // We already fetched accounts above, use the map
          const accounts = Array.from(validAccountsMap.values()).filter(a => a.game_id === game.id);
          const gameLevels = await TauriService.getGameLevels(game.id);
          const gameTasks: DailyTask[] = [];

          for (const account of accounts) {
            if (existingAccountIds.has(account.id)) continue;

            try {
              // Initialize or update account start state
              // We recalculate it to ensure it uses the latest precise logic and combines start_date/start_time
              const response = await TauriService.getDailyRequests(account.id, today);

              // Calculate midpoint time_spent for purchase events
              const datePart = account.start_date.includes('T') ? account.start_date.split('T')[0] : account.start_date;
              const start = new Date(datePart);
              const target = new Date(today);
              if (start && !isNaN(target.getTime())) {
                const currentDay = Math.round((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                const timeToday = getInterpolatedTimeSpent(currentDay, gameLevels);
                const timeTomorrow = getInterpolatedTimeSpent(currentDay + 1, gameLevels);

                if (timeToday > 0 || timeTomorrow > 0) {
                  const variation = Math.floor(Math.random() * 3) - 1; // -1, 0, or +1
                  const midpointTimeSpent = Math.round((timeToday + timeTomorrow) / 2) + variation;

                  const newRequests: any[] = [];
                  for (const req of response.requests) {
                    const isLevel = gameLevels.some(l => l.event_token === req.event_token);
                    const isPurchase = req.request_type === 'event' && !isLevel;

                    if (isPurchase) {
                      // Ensure both Session and Event exist for purchase
                      // We create a pair with the same token and midpoint time_spent
                      const sessionReq = { ...req, request_type: 'session', time_spent: midpointTimeSpent };
                      const eventReq = { ...req, request_type: 'event', time_spent: midpointTimeSpent };
                      newRequests.push(sessionReq, eventReq);
                    } else {
                      newRequests.push(req);
                    }
                  }
                  // Remove duplicates if the backend already returned both (though unlikely given the user's report)
                  // We group by type, token, and time_spent to be safe
                  const uniqueRequests: any[] = [];
                  const seen = new Set();
                  for (const r of newRequests) {
                    const key = `${r.request_type}_${r.event_token}_${r.time_spent}`;
                    if (!seen.has(key)) {
                      uniqueRequests.push(r);
                      seen.add(key);
                    }
                  }
                  response.requests = uniqueRequests;
                }
              }

              if (response.requests.length > 0) {
                // Find the first event (smallest time_spent)
                const firstEvent = response.requests
                  .filter(r => r.request_type === 'session' || r.request_type === 'event')
                  .sort((a, b) => a.time_spent - b.time_spent)[0];

                if (firstEvent) {
                  const firstRequestAllowedAt = calculateFirstRequestAllowedTime(account, firstEvent.time_spent);

                  setAccountStartStates(prev => ({
                    ...prev,
                    [account.id]: {
                      accountId: account.id,
                      startTime: `${account.start_date} ${account.start_time}`,
                      firstRequestAllowedAt,
                      isInitialized: true,
                    }
                  }));
                }
              }

              // Use the response from the first call to avoid redeclaration
              if (response.requests.length > 0) {
                // Group related requests (Session + Event pairs) by event_token and time_spent
                const requestGroups: { event_token: string; time_spent: number; requests: any[] }[] = [];

                for (const request of response.requests) {
                  const eventToken = request.event_token || '';
                  const existingGroup = requestGroups.find(g =>
                    g.event_token === eventToken && g.time_spent === request.time_spent
                  );

                  if (existingGroup) {
                    existingGroup.requests.push(request);
                  } else {
                    requestGroups.push({
                      event_token: eventToken,
                      time_spent: request.time_spent,
                      requests: [request]
                    });
                  }
                }

                // Sort groups by time_spent for proper sequencing
                requestGroups.sort((a, b) => a.time_spent - b.time_spent);

                gameTasks.push({
                  account,
                  requests: requestGroups.flatMap(g => g.requests), // Flatten back for compatibility
                  requestGroups, // Keep grouped structure for timing logic
                  targetDate: response.target_date,
                  completedTasks: new Set(),
                });
              }
            } catch (accountError) {
              console.error(`Error generating tasks for account ${account.name}:`, accountError);
            }
          }

          if (gameTasks.length > 0) {
            gameTasksMap[game.id] = gameTasks;
          }
        } catch (error) {
          console.error(`Error getting accounts for game ${game.name}:`, error);
        }
      }

      // Implement logical unit batching with timing constraints
      const gameIds = Object.keys(gameTasksMap).map(id => parseInt(id));
      const batches: GameBatch[] = [];
      let batchIndex = 0;

      // Track scheduled execution time for each account's request groups
      const scheduledTimes: { [accountId: number]: number[] } = {};

      // Pre-calculate scheduled times for all request groups based on timing constraints
      for (const gameId of gameIds) {
        const gameTasks = gameTasksMap[gameId];
        if (gameTasks && gameTasks.length > 0) {
          for (const task of gameTasks) {
            const accountId = task.account.id;
            if (task.requestGroups && task.requestGroups.length > 0) {
              scheduledTimes[accountId] = [];
              let currentScheduledTime = Date.now(); // Start from now

              for (let i = 0; i < task.requestGroups.length; i++) {
                const group = task.requestGroups[i];

                if (i > 0) {
                  const prevGroup = task.requestGroups[i - 1];
                  const timeDifference = group.time_spent - prevGroup.time_spent;
                  // Use full time difference
                  const minimumWaitTime = timeDifference * 1000;
                  currentScheduledTime += minimumWaitTime;
                }

                scheduledTimes[accountId].push(currentScheduledTime);
              }
            }
          }
        }
      }

      // Track which request group index each account is on
      const accountGroupIndex: { [accountId: number]: number } = {};

      // Continue until all request groups are assigned to batches
      while (true) {
        const currentBatchTasks: DailyTask[] = [];
        let hasAnyGroups = false;

        // Take one request group from each game/account for this batch
        for (const gameId of gameIds) {
          const gameTasks = gameTasksMap[gameId];
          if (gameTasks && gameTasks.length > 0) {
            // Find an account in this game that has an available request group
            for (const task of gameTasks) {
              const accountId = task.account.id;
              const currentGroupIndex = accountGroupIndex[accountId] || 0;

              if (task.requestGroups && currentGroupIndex < task.requestGroups.length) {
                // Check if this account is ready for a new request
                const currentTime = Date.now();
                let isAccountReady = true;

                // Check completion record cooldown
                const completionRecord = accountCompletionRecords[accountId];
                if (completionRecord) {
                  // Account has completed a previous request, check if cooldown has elapsed
                  // Calculate required wait time
                  const currentGroup = task.requestGroups[currentGroupIndex];
                  const diff = Math.max(0, currentGroup.time_spent - completionRecord.timeSpent);
                  const nextRequestAllowedAt = completionRecord.completionTime + (diff * 1000);
                  isAccountReady = currentTime >= nextRequestAllowedAt;
                }

                // Check account start state (for first request only)
                if (currentGroupIndex === 0 && isAccountReady) {
                  const startState = accountStartStates[accountId];
                  if (startState && startState.firstRequestAllowedAt) {
                    isAccountReady = currentTime >= startState.firstRequestAllowedAt;
                  }
                }

                // Only assign to batch if the account is ready
                if (!isAccountReady) {
                  continue; // Skip this account, try next one
                }

                // Create a task with only the current request group
                const currentGroup = task.requestGroups[currentGroupIndex];
                const groupTask: DailyTask = {
                  account: task.account,
                  requests: currentGroup.requests,
                  requestGroups: [currentGroup], // Include the group for timing calculations
                  targetDate: task.targetDate,
                  completedTasks: new Set(),
                };

                // Record the task assignment
                const assignment: AccountTaskAssignment = {
                  accountId,
                  assignedTime: Date.now(),
                  eventToken: currentGroup.event_token,
                  timeSpent: currentGroup.time_spent,
                };

                setAccountTaskAssignments(prev => ({
                  ...prev,
                  [accountId]: [...(prev[accountId] || []), assignment]
                }));

                currentBatchTasks.push(groupTask);
                accountGroupIndex[accountId] = currentGroupIndex + 1;
                hasAnyGroups = true;
                break; // Found a suitable group for this game, move to next game
              }
            }
          }
        }

        // If we got any groups for this batch, add it
        if (currentBatchTasks.length > 0) {
          batches.push({
            batchIndex: batchIndex++,
            tasks: currentBatchTasks,
          });
        }

        // If no groups were added in this iteration, we're done
        if (!hasAnyGroups) {
          break;
        }
      }

      // Merge with existing batches
      let nextBatchIndex = existingBatches.length > 0
        ? Math.max(...existingBatches.map(b => b.batchIndex)) + 1
        : 0;

      const adjustedBatches = batches.map(b => ({
        ...b,
        batchIndex: nextBatchIndex++
      }));

      const finalBatches = [...existingBatches, ...adjustedBatches];
      const finalScheduledTimes = { ...existingScheduledTimes, ...scheduledTimes };

      setBatches(finalBatches);
      setAccountScheduledTime(finalScheduledTimes);

      // Save to localStorage for persistence
      const serializedBatches = finalBatches.map(batch => ({
        ...batch,
        tasks: batch.tasks.map(task => ({
          ...task,
          completedTasks: Array.from(task.completedTasks)
        }))
      }));
      localStorage.setItem(`dailyTasks_batches_${today}`, JSON.stringify({
        batches: serializedBatches,
        accountScheduledTime: finalScheduledTimes
      }));

      if (adjustedBatches.length > 0) {
        NotificationService.success(t('dailyTasks.generateTasksSuccess', { count: adjustedBatches.length }));
      }
    } catch (error) {
      NotificationService.error(t('dailyTasks.generateTasksError'));
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Complete a task
  const completeTask = async (accountId: number, requestIndex: number) => {
    try {
      // Find the task across all batches
      let foundTask: DailyTask | null = null;
      let foundBatch: GameBatch | null = null;
      for (const batch of batches) {
        foundTask = batch.tasks.find(t => t.account.id === accountId) || null;
        if (foundTask) {
          foundBatch = batch;
          break;
        }
      }

      if (!foundTask) return;

      const request = foundTask.requests[requestIndex];
      if (!request.level_id) {
        NotificationService.error(t('dailyTasks.completeTaskError'));
        return;
      }

      // Ensure progress record exists, then update it
      const createRequest = {
        account_id: accountId,
        level_id: request.level_id,
      };

      try {
        await TauriService.createLevelProgress(createRequest);
      } catch (error) {
        console.warn('Failed to create level progress (likely FK constraint for session event), proceeding to update:', error);
      }

      // Now update the progress
      const updateRequest = {
        account_id: accountId,
        level_id: request.level_id,
        is_completed: true,
      };

      const result = await ApiService.updateLevelProgress(updateRequest);

      if (result.success) {
        const now = Date.now();

        // Update task completion status
        const updatedBatches = batches.map(batch => ({
          ...batch,
          tasks: batch.tasks.map(task => {
            if (task.account.id === accountId) {
              const newCompletedTasks = new Set(task.completedTasks);
              newCompletedTasks.add(requestIndex.toString());
              return { ...task, completedTasks: newCompletedTasks };
            }
            return task;
          })
        }));

        // Check if this completes a Session+Event pair (both requests in the group)
        if (foundTask && foundTask.requestGroups) {
          // Find which group this request belongs to
          for (const group of foundTask.requestGroups) {
            const groupIndices = group.requests.map((_, idx) =>
              foundTask!.requests.indexOf(group.requests[idx])
            );

            // Check if all requests in this group are now completed
            const allGroupCompleted = groupIndices.every(idx =>
              updatedBatches
                .find(b => b.batchIndex === foundBatch!.batchIndex)
                ?.tasks.find(t => t.account.id === accountId)
                ?.completedTasks.has(idx.toString())
            );

            if (allGroupCompleted && groupIndices.includes(requestIndex)) {
              // Record the completion of this Session+Event pair

              const completionRecord: AccountCompletionRecord = {
                accountId,
                timeSpent: group.time_spent,
                completionTime: now,
                levelId: request.level_id,
                eventToken: group.event_token,
              };

              setAccountCompletionRecords(prev => ({
                ...prev,
                [accountId]: completionRecord
              }));

              // Clear task assignments for this account since the pair is completed
              setAccountTaskAssignments(prev => ({
                ...prev,
                [accountId]: []
              }));

              // Add to completed tasks
              const completedTask: CompletedDailyTask = {
                id: `${accountId}_${group.event_token}_${now}`,
                accountId,
                accountName: foundTask!.account.name,
                gameId: foundTask!.account.game_id,
                gameName: games.find(g => g.id === foundTask!.account.game_id)?.name || 'Unknown',
                eventToken: group.event_token,
                timeSpent: group.time_spent,
                completionTime: now,
                completionDate: new Date().toISOString().split('T')[0],
                levelId: request.level_id,
              };

              // Save to localStorage
              const completedDate = new Date().toISOString().split('T')[0];
              const completedKey = `dailyTasks_completed_${completedDate}`;
              const existingCompleted = localStorage.getItem(completedKey);
              const completedList: CompletedDailyTask[] = existingCompleted ? JSON.parse(existingCompleted) : [];
              completedList.push(completedTask);
              localStorage.setItem(completedKey, JSON.stringify(completedList));

              // Dispatch event to update sidebar
              window.dispatchEvent(new CustomEvent('daily-task-completed'));

              // Remove this task from batches
              const filteredBatches = updatedBatches.map(batch => ({
                ...batch,
                tasks: batch.tasks.filter(task => task.account.id !== accountId)
              })).filter(batch => batch.tasks.length > 0);

              setBatches(filteredBatches);

              // Update localStorage
              const serializedFilteredBatches = filteredBatches.map(batch => ({
                ...batch,
                tasks: batch.tasks.map(task => ({
                  ...task,
                  completedTasks: Array.from(task.completedTasks)
                }))
              }));
              localStorage.setItem(`dailyTasks_batches_${completedDate}`, JSON.stringify({
                batches: serializedFilteredBatches,
                accountScheduledTime
              }));

              // Dispatch progress-updated event
              window.dispatchEvent(new CustomEvent('progress-updated', { detail: { accountId } }));

              return; // Exit early since we've handled everything
            }
          }
        }

        // Check if the current batch is complete
        const currentBatch = updatedBatches.find(b => b.batchIndex === foundBatch!.batchIndex);
        if (currentBatch) {
          const isBatchComplete = currentBatch.tasks.every(task =>
            task.requests.every((_, idx) => task.completedTasks.has(idx.toString()))
          );

          if (isBatchComplete) {
            // Batch completed - user can manually regenerate tasks to see next ready batch
            // Automatic regeneration is disabled to prevent issues with already completed tasks
          }
        }

        setBatches(updatedBatches);

        // Dispatch progress-updated event to refresh other components
        window.dispatchEvent(new CustomEvent('progress-updated', { detail: { accountId } }));
      } else {
        throw new Error(result.error || 'Failed to update progress');
      }
    } catch (error) {
      console.error(error);
    }
  };

  const copyToClipboard = (content: string, eventToken?: string, timeSpent?: number) => {
    const processedContent = eventToken && timeSpent !== undefined
      ? RequestProcessor.processRequestContent(content, eventToken, timeSpent)
      : content;
    navigator.clipboard.writeText(processedContent);
    NotificationService.success(t('dailyTasks.requestCopied'));
  };



  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('dailyTasks.title')}</h1>
          <p className="text-muted-foreground">{t('dailyTasks.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/daily-tasks/unready')}>
            <Clock className="mr-2 h-4 w-4" />
            {t('dailyTasks.viewDeferred', 'View Deferred Tasks')}
          </Button>
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
              <span>{t('dailyTasks.generateTasksLoading')}</span>
            </div>
          )}
        </div>
      </div>

      {batches.length === 0 && !loading && (
        <EmptyState />
      )}

      {(() => {
        const readyBatches: GameBatch[] = [];
        const deferredTasks: { task: DailyTask; batchIndex: number }[] = [];
        // Use the state currentTime instead of shadowing it

        batches.forEach(batch => {
          const readyTasksInBatch: DailyTask[] = [];
          batch.tasks.forEach(task => {
            if (checkTaskReadiness(task, batch.batchIndex, batches, currentTime, accountCompletionRecords, accountStartStates)) {
              readyTasksInBatch.push(task);
            } else {
              deferredTasks.push({ task, batchIndex: batch.batchIndex });
            }
          });
          if (readyTasksInBatch.length > 0) {
            readyBatches.push({ ...batch, tasks: readyTasksInBatch });
          }
        });

        return (
          <div className="space-y-12">
            {/* Ready Batches */}
            <div className="space-y-6">
              {readyBatches.map((batch, idx) => (
                <div key={`ready-batch-${batch.batchIndex}`}>
                  {/* Batch Header */}
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-primary">
                      {t('dailyTasks.batchLabel', { batch: batch.batchIndex + 1 })}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {batch.tasks.length} {batch.tasks.length === 1 ? t('dailyTasks.accountLabel') : t('dailyTasks.accountsLabel')}
                    </p>
                    <div className="mt-2">
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-sm text-green-800 dark:text-green-200">
                          {t('dailyTasks.batchReady')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tasks in this batch */}
                  <div className="space-y-4">
                    {batch.tasks.map((task, taskIndex) => (
                      <div key={task.account.id}>
                        <div className="mb-2">
                          <span className="text-sm font-medium text-muted-foreground">
                            {taskIndex + 1}- {task.account.name}
                          </span>
                        </div>
                        <TaskItem
                          task={task}
                          onCompleteTask={completeTask}
                          onCopyRequest={copyToClipboard}
                          accountCompletionRecords={accountCompletionRecords}
                          accountTaskAssignments={accountTaskAssignments}
                          accountStartStates={accountStartStates}
                          batchIndex={batch.batchIndex}
                          allBatches={batches}
                          currentTime={currentTime}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Separator and proxy change notice */}
                  {idx < readyBatches.length - 1 && (
                    <div className="mt-8 mb-8">
                      <div className="border-t-2 border-dashed border-muted-foreground/30 my-4"></div>
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                          <h4 className="font-semibold text-yellow-800 dark:text-yellow-200">
                            {t('dailyTasks.proxyChangeTitle', 'Proxy Change Required')}
                          </h4>
                        </div>
                        <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                          {t('dailyTasks.proxyChangeMessage', 'Please change your proxy settings before proceeding to the next batch.')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Deferred Tasks Section Removed - Moved to separate page */}
          </div>
        );
      })()}
    </div>
  );
}
