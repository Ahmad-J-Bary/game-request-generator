// src/pages/daily-tasks/DailyTasksPage.tsx

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Clock, Copy } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { TauriService, RequestProcessor } from '../../services/tauri.service';
import { ApiService } from '../../services/api.service';
import { NotificationService } from '../../utils/notifications';
import type { Account, DailyRequestsResponse } from '../../types';

// ===== Task Item Component =====
interface TaskItemProps {
  task: DailyTask;
  onCompleteTask: (accountId: number, requestIndex: number) => void;
  onCopyRequest: (content: string, eventToken?: string, timeSpent?: number) => void;
  accountLastRequestTime?: { [accountId: number]: number };
}

function TaskItem({ task, onCompleteTask, onCopyRequest, accountLastRequestTime }: TaskItemProps) {
  const { t } = useTranslation();

  // Calculate timing status
  const lastRequestTime = accountLastRequestTime?.[task.account.id] || 0;
  const currentTime = Date.now();
  const timeSinceLastRequest = currentTime - lastRequestTime;
  const maxTimeSpent = Math.max(...task.requests.map(r => r.time_spent));
  const minimumWaitTime = Math.max(30000, maxTimeSpent * 1000 * 0.1); // At least 30s or 10% of max time_spent in milliseconds
  const canSendRequest = lastRequestTime === 0 || timeSinceLastRequest >= minimumWaitTime;

  return (
    <Card key={task.account.id}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {task.account.name}
              <Badge variant="outline">
                {t('dailyTasks.taskCount', {
                  count: task.requests.length,
                  plural: task.requests.length === 1 ? '' : 's'
                })}
              </Badge>
              {!canSendRequest && (
                <Badge variant="secondary" className="text-xs">
                  {t('dailyTasks.waitingTime', {
                    seconds: Math.ceil((minimumWaitTime - timeSinceLastRequest) / 1000)
                  })}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {task.account.start_date} • {t('dailyTasks.targetDateLabel', { date: task.targetDate })}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {task.requests.map((request, index) => (
            <RequestItem
              key={index}
              request={request}
              isCompleted={task.completedTasks.has(index.toString())}
              onComplete={() => onCompleteTask(task.account.id, index)}
              onCopy={(content, eventToken, timeSpent) =>
                onCopyRequest(content, eventToken, timeSpent)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Request Item Component =====
interface RequestItemProps {
  request: DailyRequestsResponse['requests'][0];
  isCompleted: boolean;
  onComplete: () => void;
  onCopy: (content: string, eventToken?: string, timeSpent?: number) => void;
}

function RequestItem({ request, isCompleted, onComplete, onCopy }: RequestItemProps) {
  const { t } = useTranslation();

  const getRequestTypeLabel = (type: string) => {
    switch (type) {
      case 'session':
        return 'Session';
      case 'event':
        return 'Event';
      case 'purchase_event':
        return 'Purchase Event';
      default:
        return type;
    }
  };

  const getRequestTypeBadgeVariant = (type: string): 'default' | 'secondary' | 'destructive' => {
    switch (type) {
      case 'session':
        return 'default';
      case 'event':
        return 'secondary';
      case 'purchase_event':
        return 'destructive';
      default:
        return 'default';
    }
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Badge variant={getRequestTypeBadgeVariant(request.request_type)}>
            {getRequestTypeLabel(request.request_type)}
          </Badge>
          {request.event_token && (
            <span className="text-xs text-muted-foreground font-mono">
              {request.event_token}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {request.time_spent}s
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCopy(request.content, request.event_token, request.time_spent)}
          >
            <Copy className="h-4 w-4 mr-1" />
            {t('dailyTasks.copyRequest')}
          </Button>
          {!isCompleted && (
            <Button
              variant="default"
              size="sm"
              onClick={onComplete}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              {t('dailyTasks.completeTask')}
            </Button>
          )}
          {isCompleted && (
            <Badge variant="secondary">
              <CheckCircle className="h-3 w-3 mr-1" />
              Completed
            </Badge>
          )}
        </div>
      </div>

      <div className="bg-muted p-3 rounded text-xs font-mono overflow-x-auto max-h-48 overflow-y-auto">
        {RequestProcessor.processRequestContent(request.content, request.event_token || '', request.time_spent).split('\n').map((line, i) => (
          <div key={i} className="whitespace-nowrap">
            {line || <br />}
          </div>
        ))}
      </div>
    </div>
  );
}

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

// ===== Utility Functions =====

interface RequestGroup {
  event_token: string;
  time_spent: number;
  requests: DailyRequestsResponse['requests'];
}

interface DailyTask {
  account: Account;
  requests: DailyRequestsResponse['requests'];
  requestGroups?: RequestGroup[]; // Groups of related requests (Session + Event pairs)
  targetDate: string;
  completedTasks: Set<string>; // Track completed tasks by index
}

interface GameBatch {
  batchIndex: number;
  tasks: DailyTask[];
}

// ===== Utility Functions =====

export default function DailyTasksPage() {
  const { t } = useTranslation();
  const [batches, setBatches] = useState<GameBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [games, setGames] = useState<any[]>([]);
  const [accountLastRequestTime, setAccountLastRequestTime] = useState<{ [accountId: number]: number }>({});
  const [batchCompletionTime, setBatchCompletionTime] = useState<number>(0);

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

  // Generate today's tasks with round-robin batching by game
  const generateTodaysTasks = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const gameTasksMap: { [gameId: number]: DailyTask[] } = {};

      // Collect all tasks grouped by game
      for (const game of games) {
        try {
          const accounts = await TauriService.getAccounts(game.id);
          const gameTasks: DailyTask[] = [];

          for (const account of accounts) {
            try {
              const response = await TauriService.getDailyRequests(account.id, today);
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
                // Check timing constraints between logical units (request groups)
                const lastRequestTime = accountLastRequestTime[accountId] || 0;
                const currentTime = Date.now();
                const timeSinceLastRequest = currentTime - lastRequestTime;

                // Calculate minimum wait time based on time_spent progression between groups
                let minimumWaitTime = 30000; // 30 seconds minimum

                if (currentGroupIndex > 0 && task.requestGroups[currentGroupIndex - 1]) {
                  const prevGroup = task.requestGroups[currentGroupIndex - 1];
                  const currentGroup = task.requestGroups[currentGroupIndex];
                  const timeDifference = currentGroup.time_spent - prevGroup.time_spent;

                  // Require at least 10% of the time difference as minimum spacing
                  minimumWaitTime = Math.max(minimumWaitTime, timeDifference * 100);
                }

                if (timeSinceLastRequest >= minimumWaitTime) {
                  // Create a task with only the current request group
                  const currentGroup = task.requestGroups[currentGroupIndex];
                  const groupTask: DailyTask = {
                    account: task.account,
                    requests: currentGroup.requests,
                    targetDate: task.targetDate,
                    completedTasks: new Set(),
                  };

                  currentBatchTasks.push(groupTask);
                  accountGroupIndex[accountId] = currentGroupIndex + 1;
                  hasAnyGroups = true;
                  break; // Found a suitable group for this game, move to next game
                }
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

      setBatches(batches);
      NotificationService.success(t('dailyTasks.generateTasksSuccess', { count: batches.length }));
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

      await TauriService.createLevelProgress(createRequest);

      // Now update the progress
      const updateRequest = {
        account_id: accountId,
        level_id: request.level_id,
        is_completed: true,
      };

      const result = await ApiService.updateLevelProgress(updateRequest);

      if (result.success) {
        // Update the last request time for this account
        const now = Date.now();
        setAccountLastRequestTime(prev => ({
          ...prev,
          [accountId]: now
        }));

        // Check if this batch is now complete
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

        // Check if the current batch is complete
        const currentBatch = updatedBatches.find(b => b.batchIndex === foundBatch!.batchIndex);
        if (currentBatch) {
          const isBatchComplete = currentBatch.tasks.every(task =>
            task.requests.every((_, idx) => task.completedTasks.has(idx.toString()))
          );

          if (isBatchComplete) {
            setBatchCompletionTime(now);
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
        <Button onClick={generateTodaysTasks} disabled={loading || games.length === 0}>
          {loading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          ) : (
            <Clock className="h-4 w-4 mr-2" />
          )}
          {loading ? t('dailyTasks.generateTasksLoading') : t('dailyTasks.generateTasks')}
        </Button>
      </div>

      {batches.length === 0 && !loading && (
        <EmptyState />
      )}

      <div className="space-y-6">
        {batches.map((batch, batchIndex) => (
          <div key={`batch-${batch.batchIndex}`}>
            {/* Batch Header */}
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-primary">
                {t('dailyTasks.batchLabel', { batch: batchIndex + 1 })}
              </h3>
              <p className="text-sm text-muted-foreground">
                {batch.tasks.length} {batch.tasks.length === 1 ? t('dailyTasks.accountLabel') : t('dailyTasks.accountsLabel')}
              </p>

              {/* Batch Timing Status */}
              {batchIndex > 0 && (
                <div className="mt-2">
                  {(() => {
                    const timeSinceBatchCompletion = Date.now() - batchCompletionTime;
                    const requiredWaitTime = 30000; // 30 seconds between batches

                    if (timeSinceBatchCompletion < requiredWaitTime) {
                      const remainingTime = Math.ceil((requiredWaitTime - timeSinceBatchCompletion) / 1000);
                      return (
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                          <span className="text-sm text-yellow-800 dark:text-yellow-200">
                            {t('dailyTasks.batchWaitMessage', { seconds: remainingTime })}
                          </span>
                        </div>
                      );
                    } else {
                      return (
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="text-sm text-green-800 dark:text-green-200">
                            {t('dailyTasks.batchReady')}
                          </span>
                        </div>
                      );
                    }
                  })()}
                </div>
              )}
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
                    accountLastRequestTime={accountLastRequestTime}
                  />
                </div>
              ))}
            </div>

            {/* Separator and proxy change notice for non-last batches */}
            {batchIndex < batches.length - 1 && (
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
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                    {t('dailyTasks.pauseMessage', 'Take a moment to update your proxy configuration.')}
                  </p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
