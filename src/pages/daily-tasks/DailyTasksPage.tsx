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
}

function TaskItem({ task, onCompleteTask, onCopyRequest }: TaskItemProps) {
  const { t } = useTranslation();

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

interface DailyTask {
  account: Account;
  requests: DailyRequestsResponse['requests'];
  targetDate: string;
  completedTasks: Set<string>; // Track completed tasks by index
}

// ===== Utility Functions =====

export default function DailyTasksPage() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [games, setGames] = useState<any[]>([]);

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

  // Generate today's tasks for all accounts
  const generateTodaysTasks = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const todaysTasks: DailyTask[] = [];

      for (const game of games) {
        try {
          const accounts = await TauriService.getAccounts(game.id);
          for (const account of accounts) {
            try {
              const response = await TauriService.getDailyRequests(account.id, today);
              if (response.requests.length > 0) {
                todaysTasks.push({
                  account,
                  requests: response.requests,
                  targetDate: response.target_date,
                  completedTasks: new Set(),
                });
              }
            } catch (accountError) {
              console.error(`Error generating tasks for account ${account.name}:`, accountError);
            }
          }
        } catch (error) {
          console.error(`Error getting accounts for game ${game.name}:`, error);
        }
      }

      setTasks(todaysTasks);
      NotificationService.success(t('dailyTasks.generateTasksSuccess', { count: todaysTasks.length }));
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
      // Find the task and get the request details
      const task = tasks.find(t => t.account.id === accountId);
      if (!task) return;

      const request = task.requests[requestIndex];
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
        // Dispatch progress-updated event to refresh other components
        window.dispatchEvent(new CustomEvent('progress-updated', { detail: { accountId } }));

        // Mark as completed in the UI
        setTasks(prevTasks =>
          prevTasks.map(task => {
            if (task.account.id === accountId) {
              const newCompletedTasks = new Set(task.completedTasks);
              newCompletedTasks.add(requestIndex.toString());
              return { ...task, completedTasks: newCompletedTasks };
            }
            return task;
          })
        );
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

      {tasks.length === 0 && !loading && (
        <EmptyState />
      )}

      <div className="space-y-6">
        {tasks.map((task) => (
          <TaskItem
            key={task.account.id}
            task={task}
            onCompleteTask={completeTask}
            onCopyRequest={copyToClipboard}
          />
        ))}
      </div>
    </div>
  );
}
