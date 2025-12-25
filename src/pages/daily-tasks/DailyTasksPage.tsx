// src/pages/daily-tasks/DailyTasksPage.tsx

import { useState, useEffect } from 'react';
import { CheckCircle, Clock, Copy } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { TauriService } from '../../services/tauri.service';
import { toast } from 'sonner';
import type { Account, DailyRequestsResponse } from '../../types';

interface DailyTask {
  account: Account;
  requests: DailyRequestsResponse['requests'];
  targetDate: string;
  completedTasks: Set<string>; // Track completed tasks by index
}

export default function DailyTasksPage() {
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
      toast.success(`Generated ${todaysTasks.length} account tasks`);
    } catch (error) {
      toast.error('Error generating daily tasks');
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
        toast.error('Cannot complete task: missing level information');
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

      const success = await TauriService.updateLevelProgress(updateRequest);

      if (success) {
        // Dispatch progress-updated event to refresh other components
        window.dispatchEvent(new CustomEvent('progress-updated', { detail: { accountId } }));
      } else {
        throw new Error('Failed to update progress');
      }

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

      toast.success('Task marked as completed');
    } catch (error) {
      toast.error('Error completing task');
      console.error(error);
    }
  };

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success('Request copied to clipboard');
  };

  const getRequestTypeLabel = (type: string) => {
    switch (type) {
      case 'session':
        return 'Session';
      case 'event':
        return 'Event';
      case 'purchase_event':
        return 'Purchase';
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
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Daily Tasks</h1>
          <p className="text-muted-foreground">Automatically generated requests for today's scheduled tasks</p>
        </div>
        <Button onClick={generateTodaysTasks} disabled={loading || games.length === 0}>
          {loading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          ) : (
            <Clock className="h-4 w-4 mr-2" />
          )}
          Generate Today's Tasks
        </Button>
      </div>

      {tasks.length === 0 && !loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Daily Tasks</h3>
            <p className="text-muted-foreground mb-4">
              Click "Generate Today's Tasks" to see all scheduled requests for your accounts.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {tasks.map((task) => (
          <Card key={task.account.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {task.account.name}
                    <Badge variant="outline">{task.requests.length} tasks</Badge>
                  </CardTitle>
                  <CardDescription>
                    {task.account.start_date} • Target: {task.targetDate}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {task.requests.map((request, index) => (
                  <div key={index} className="border rounded-lg p-4">
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
                          onClick={() => copyToClipboard(request.content)}
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </Button>
                        {!task.completedTasks.has(index.toString()) && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => completeTask(task.account.id, index)}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Complete
                          </Button>
                        )}
                        {task.completedTasks.has(index.toString()) && (
                          <Badge variant="secondary">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Completed
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="bg-muted p-3 rounded text-xs font-mono overflow-x-auto max-h-48 overflow-y-auto">
                      {request.content.split('\n').map((line, i) => (
                        <div key={i} className="whitespace-nowrap">
                          {line || <br />}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
