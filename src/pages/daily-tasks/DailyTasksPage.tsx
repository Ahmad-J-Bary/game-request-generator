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
import type { Account, DailyRequestsResponse, Level } from '../../types';

// ===== Interfaces =====
interface AccountCompletionRecord {
  accountId: number;
  timeSpent: number;
  completionTime: number; // timestamp when both Session and Event were completed
  levelId: number;
  eventToken: string;
}

interface AccountTaskAssignment {
  accountId: number;
  assignedTime: number; // timestamp when task was first assigned
  eventToken: string;
  timeSpent: number;
}

interface AccountStartState {
  accountId: number;
  startTime: string; // account start_time
  firstRequestAllowedAt: number; // calculated timestamp when first request is allowed
  isInitialized: boolean; // whether the initial delay has been calculated
}

// ===== Task Item Component =====
interface TaskItemProps {
  task: DailyTask;
  onCompleteTask: (accountId: number, requestIndex: number) => void;
  onCopyRequest: (content: string, eventToken?: string, timeSpent?: number) => void;
  accountLastRequestTime?: { [accountId: number]: number };
  accountScheduledTime: { [accountId: number]: number[] };
  accountCompletionRecords: { [accountId: number]: AccountCompletionRecord };
  accountTaskAssignments: { [accountId: number]: AccountTaskAssignment[] };
  accountStartStates: { [accountId: number]: AccountStartState };
  batchIndex: number;
  allBatches: GameBatch[];
}

function TaskItem({ task, onCompleteTask, onCopyRequest, accountScheduledTime, accountCompletionRecords, accountTaskAssignments: _accountTaskAssignments, accountStartStates, batchIndex, allBatches, currentTime }: TaskItemProps & { currentTime: number }) {
  const { t } = useTranslation();

  // Calculate timing status based on completion records and scheduled times
  const accountId = task.account.id;
  const completionRecord = accountCompletionRecords[accountId];

  // Check scheduled time readiness
  let groupIndex = 0;
  for (const otherBatch of allBatches.slice(0, batchIndex)) {
    for (const otherTask of otherBatch.tasks) {
      if (otherTask.account.id === accountId) {
        groupIndex++;
      }
    }
  }

  const scheduledTime = accountScheduledTime[accountId]?.[groupIndex] || 0;
  const isScheduledReady = currentTime >= scheduledTime;

  // Check completion record readiness
  let isCompletionReady = true;
  let completionRemainingTime = 0;
  let completionComeBackTime: Date | null = null;

  if (completionRecord) {
    // Sequential timing: wait for the CURRENT task's time_spent after the previous completion
    // Find the current group's time_spent
    const currentGroup = task.requestGroups?.[0] || { time_spent: task.requests[0]?.time_spent || 0 };
    const requiredCooldown = currentGroup.time_spent * 1000;
    const timeSinceCompletion = currentTime - completionRecord.completionTime;
    isCompletionReady = timeSinceCompletion >= requiredCooldown;

    if (!isCompletionReady) {
      completionRemainingTime = Math.ceil((requiredCooldown - timeSinceCompletion) / 1000);
      completionComeBackTime = new Date(currentTime + (requiredCooldown - timeSinceCompletion));
    }
  }

  // Check account start state (new accounts have initial delay)
  const startState = accountStartStates[accountId];
  let isStartReady = true;
  let startRemainingTime = 0;
  let startComeBackTime: Date | null = null;

  if (groupIndex === 0) { // Only check for first request group
    let firstRequestAllowedAt = startState?.firstRequestAllowedAt;

    // If startState is missing, try to calculate it locally for robustness
    if (!firstRequestAllowedAt && task.requests.length > 0) {
      const firstEvent = task.requests
        .filter(r => r.request_type === 'session' || r.request_type === 'event')
        .sort((a, b) => a.time_spent - b.time_spent)[0];

      if (firstEvent) {
        firstRequestAllowedAt = calculateFirstRequestAllowedTime(task.account, firstEvent.time_spent);
      }
    }

    if (firstRequestAllowedAt) {
      isStartReady = currentTime >= firstRequestAllowedAt;

      if (!isStartReady) {
        startRemainingTime = Math.ceil((firstRequestAllowedAt - currentTime) / 1000);
        startComeBackTime = new Date(firstRequestAllowedAt);
      }
    }
  }

  // Account is ready only if all checks pass
  const isReady = isScheduledReady && isCompletionReady && isStartReady;
  const remainingTime = Math.max(
    Math.ceil((scheduledTime - currentTime) / 1000),
    completionRemainingTime,
    startRemainingTime
  );
  const comeBackTime = startComeBackTime || completionComeBackTime || (scheduledTime > currentTime ? new Date(scheduledTime) : null);

  return (
    <Card key={task.account.id} className={!isReady ? "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10" : ""}>
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
              {!isReady && (
                <Badge variant="destructive" className="text-xs animate-pulse">
                  {t('dailyTasks.waitingTime', {
                    seconds: remainingTime
                  })}
                </Badge>
              )}
              {isReady && (
                <Badge variant="default" className="text-xs bg-green-500">
                  {t('dailyTasks.ready')}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {task.account.start_date} • {t('dailyTasks.targetDateLabel', { date: task.targetDate })}
              {completionRecord && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {t('dailyTasks.lastCompletion', {
                    timeSpent: completionRecord.timeSpent,
                    completedAt: new Date(completionRecord.completionTime).toLocaleString()
                  })}
                </div>
              )}
              {!isReady && comeBackTime && (
                <div className="mt-1 text-xs text-amber-600 dark:text-amber-400 font-bold bg-amber-100 dark:bg-amber-900/30 p-2 rounded border border-amber-200 dark:border-amber-800">
                  {!isStartReady && startComeBackTime ? t('dailyTasks.accountInitializing', {
                    time: startComeBackTime.toLocaleString()
                  }) : t('dailyTasks.returnAfter', {
                    time: comeBackTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    date: comeBackTime.toLocaleDateString()
                  })}
                </div>
              )}
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
              isReady={isReady}
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
  isReady: boolean;
  onComplete: () => void;
  onCopy: (content: string, eventToken?: string, timeSpent?: number) => void;
}

function RequestItem({ request, isCompleted, isReady, onComplete, onCopy }: RequestItemProps) {
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
    <div className={`border rounded-lg p-4 transition-all duration-300 ${!isReady ? "bg-gray-100/50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800 opacity-60 grayscale-[0.5]" : "bg-card border-border shadow-sm"}`}>
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
            disabled={!isReady}
            onClick={() => isReady && onCopy(request.content, request.event_token, request.time_spent)}
            className={!isReady ? "opacity-30 cursor-not-allowed grayscale" : "hover:bg-primary hover:text-primary-foreground transition-colors"}
          >
            <Copy className="h-4 w-4 mr-1" />
            {t('dailyTasks.copyRequest')}
          </Button>
          {!isCompleted && (
            <Button
              variant="default"
              size="sm"
              disabled={!isReady}
              onClick={() => isReady && onComplete()}
              className={!isReady ? "opacity-30 cursor-not-allowed grayscale" : "transition-all active:scale-95"}
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

const calculateFirstRequestAllowedTime = (account: Account, firstEventTimeSpent: number): number => {
  try {
    // Combine start_date and start_time for a precise base timestamp
    // Assuming start_date is YYYY-MM-DD and start_time is HH:mm
    let baseDate: Date;

    if (account.start_date && account.start_time) {
      // Try to combine them. If start_date is already a full ISO string, we might need to extract the date part.
      const datePart = account.start_date.includes('T') ? account.start_date.split('T')[0] : account.start_date;
      baseDate = new Date(`${datePart}T${account.start_time}`);
    } else {
      baseDate = new Date(account.start_date);
    }

    if (isNaN(baseDate.getTime())) {
      console.warn(`Could not parse start time for account ${account.id}. Falling back to current time.`);
      return Date.now();
    }

    // Calculate delay based on first event's time_spent
    // Use time_spent as seconds, convert to milliseconds. NO RANDOMIZATION.
    const delayMs = firstEventTimeSpent * 1000;

    return baseDate.getTime() + delayMs;
  } catch (error) {
    console.error(`Error calculating first request time for account ${account.id}:`, error);
    return Date.now();
  }
};

const getInterpolatedTimeSpent = (day: number, gameLevels: Level[]): number => {
  if (gameLevels.length === 0) return 0;

  const numeric = gameLevels
    .filter((l) => typeof l.days_offset === 'number')
    .sort((a, b) => a.days_offset - b.days_offset);

  if (numeric.length === 0) return 0;

  // Find exact match
  const exact = numeric.find((l) => l.days_offset === day);
  if (exact) return exact.time_spent;

  // Find surrounding real levels
  const prevReal = [...numeric].reverse().find((l) => l.days_offset < day);
  const nextReal = numeric.find((l) => l.days_offset > day);

  if (nextReal && !prevReal) {
    // Before first real level
    const firstRealDay = nextReal.days_offset;
    const increment = nextReal.time_spent / (firstRealDay + 1);
    return Math.round((day + 1) * increment);
  }

  if (prevReal && nextReal) {
    // Between two real levels
    const ratio = (day - prevReal.days_offset) / (nextReal.days_offset - prevReal.days_offset);
    return Math.round(prevReal.time_spent + ratio * (nextReal.time_spent - prevReal.time_spent));
  }

  if (prevReal && !nextReal) {
    // After last real level - assume it stays the same or grows slightly? 
    // For now, just return the last real level's time_spent
    return prevReal.time_spent;
  }

  return 0;
};

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

const checkTaskReadiness = (
  task: DailyTask,
  batchIndex: number,
  allBatches: GameBatch[],
  currentTime: number,
  accountScheduledTime: { [accountId: number]: number[] },
  accountCompletionRecords: { [accountId: number]: AccountCompletionRecord },
  accountStartStates: { [accountId: number]: AccountStartState }
): boolean => {
  const accountId = task.account.id;
  const completionRecord = accountCompletionRecords[accountId];

  // Check scheduled time readiness
  let groupIndex = 0;
  for (const otherBatch of allBatches.slice(0, batchIndex)) {
    for (const otherTask of otherBatch.tasks) {
      if (otherTask.account.id === accountId) {
        groupIndex++;
      }
    }
  }

  const scheduledTime = accountScheduledTime[accountId]?.[groupIndex] || 0;
  const isScheduledReady = currentTime >= scheduledTime;

  // Check completion record readiness
  let isCompletionReady = true;
  if (completionRecord) {
    // Sequential timing: wait for the CURRENT task's time_spent after the previous completion
    const currentGroup = task.requestGroups?.[0] || { time_spent: task.requests[0]?.time_spent || 0 };
    const requiredCooldown = currentGroup.time_spent * 1000;
    const timeSinceCompletion = currentTime - completionRecord.completionTime;
    isCompletionReady = timeSinceCompletion >= requiredCooldown;
  }

  // Check account start state
  const startState = accountStartStates[accountId];
  let isStartReady = true;
  if (groupIndex === 0) {
    let firstRequestAllowedAt = startState?.firstRequestAllowedAt;
    if (!firstRequestAllowedAt && task.requests.length > 0) {
      const firstEvent = task.requests
        .filter(r => r.request_type === 'session' || r.request_type === 'event')
        .sort((a, b) => a.time_spent - b.time_spent)[0];
      if (firstEvent) {
        // We need calculateFirstRequestAllowedTime here
        // Assuming it's available in the scope or imported
        firstRequestAllowedAt = calculateFirstRequestAllowedTime(task.account, firstEvent.time_spent);
      }
    }
    if (firstRequestAllowedAt) {
      isStartReady = currentTime >= firstRequestAllowedAt;
    }
  }

  return isScheduledReady && isCompletionReady && isStartReady;
};

export default function DailyTasksPage() {
  const { t } = useTranslation();
  const [batches, setBatches] = useState<GameBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [games, setGames] = useState<any[]>([]);
  const [accountLastRequestTime, setAccountLastRequestTime] = useState<{ [accountId: number]: number }>({});
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
      localStorage.setItem('accountCompletionRecords', JSON.stringify(accountCompletionRecords));
    } catch (error) {
      console.error('Error saving account completion records:', error);
    }
  }, [accountCompletionRecords]);

  // Save account start states to localStorage whenever they change
  useEffect(() => {
    try {
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
      const gameTasksMap: { [gameId: number]: DailyTask[] } = {};

      // Collect all tasks grouped by game
      for (const game of games) {
        try {
          const accounts = await TauriService.getAccounts(game.id);
          const gameLevels = await TauriService.getGameLevels(game.id);
          const gameTasks: DailyTask[] = [];

          for (const account of accounts) {
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
                  // Require at least 10% of the time difference as minimum spacing, minimum 30 seconds
                  const minimumWaitTime = Math.max(30000, timeDifference * 1000 * 0.1); // 10% of time difference in ms
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
                // We remove the readiness check here so that all tasks are assigned to batches
                // and visible to the user, even if they are not yet ready.
                // The TaskItem component will handle the "Not Ready" UI and countdown.

                // Create a task with only the current request group
                const currentGroup = task.requestGroups[currentGroupIndex];
                const groupTask: DailyTask = {
                  account: task.account,
                  requests: currentGroup.requests,
                  targetDate: task.targetDate,
                  completedTasks: new Set(),
                };

                // Record the task assignment (for internal tracking, though we show it anyway)
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

      setBatches(batches);
      setAccountScheduledTime(scheduledTimes);
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

              break;
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
            // Batch completed - scheduled times will handle subsequent batch timing
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

      {(() => {
        const readyBatches: GameBatch[] = [];
        const deferredTasks: { task: DailyTask; batchIndex: number }[] = [];
        // Use the state currentTime instead of shadowing it

        batches.forEach(batch => {
          const readyTasksInBatch: DailyTask[] = [];
          batch.tasks.forEach(task => {
            if (checkTaskReadiness(task, batch.batchIndex, batches, currentTime, accountScheduledTime, accountCompletionRecords, accountStartStates)) {
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
                          accountLastRequestTime={accountLastRequestTime}
                          accountScheduledTime={accountScheduledTime}
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

            {/* Deferred Tasks Section */}
            {deferredTasks.length > 0 && (
              <div className="pt-8 border-t-2 border-primary/20">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2">
                    <Clock className="h-6 w-6" />
                    {t('dailyTasks.deferredTasksTitle', 'Deferred Tasks')}
                  </h2>
                  <p className="text-muted-foreground">
                    {t('dailyTasks.deferredTasksSubtitle', 'These tasks are waiting for their scheduled time or cooldown period.')}
                  </p>
                </div>

                <div className="space-y-6">
                  {deferredTasks.map((item, idx) => (
                    <div key={`deferred-${item.task.account.id}-${idx}`}>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">
                          {idx + 1}- {item.task.account.name}
                        </span>
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                          {t('dailyTasks.originalBatch', { batch: item.batchIndex + 1 })}
                        </Badge>
                      </div>
                      <TaskItem
                        task={item.task}
                        onCompleteTask={completeTask}
                        onCopyRequest={copyToClipboard}
                        accountLastRequestTime={accountLastRequestTime}
                        accountScheduledTime={accountScheduledTime}
                        accountCompletionRecords={accountCompletionRecords}
                        accountTaskAssignments={accountTaskAssignments}
                        accountStartStates={accountStartStates}
                        batchIndex={item.batchIndex}
                        allBatches={batches}
                        currentTime={currentTime}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
