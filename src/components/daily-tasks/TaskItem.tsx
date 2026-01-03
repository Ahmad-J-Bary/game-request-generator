import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { RequestItem } from './RequestItem';
import { calculateTimerState, getTimerMessage, formatRemainingTime } from '../../utils/timer.utils';
import { TaskItemProps } from '../../types/daily-tasks.types';
import { cn } from '../../lib/utils';

export function TaskItem({ task, onCompleteTask, onCopyRequest, accountCompletionRecords, accountTaskAssignments: _accountTaskAssignments, accountStartStates, batchIndex, allBatches, currentTime }: TaskItemProps & { currentTime: number }) {
  const { t } = useTranslation();

  const accountId = task.account.id;
  const completionRecord = accountCompletionRecords[accountId];

  // Determine if this is a purchase task (level_id is null for all requests in a purchase event)
  const isPurchaseTask = task.requests.some(req => req.level_id === null || req.level_id === undefined);

  // Determine if this is a Session Only task (all requests are Session Only)
  const isSessionOnlyTask = task.requests.every(req => req.request_type === 'Session Only');

  // Use centralized timer logic
  const timerState = calculateTimerState(
    task,
    batchIndex,
    allBatches,
    currentTime,
    accountCompletionRecords,
    accountStartStates
  );

  const { isReady, isBlocked, remainingTime } = timerState;

  // Determine status badge
  const getStatusBadge = () => {
    if (isReady) {
      return (
        <Badge variant="default" className="text-xs bg-green-500">
          {t('dailyTasks.ready')}
        </Badge>
      );
    }

    if (isBlocked) {
      return (
        <Badge variant="destructive" className="text-xs">
          {t('dailyTasks.waitingPrevious', 'Pending Previous')}
        </Badge>
      );
    }

    // Waiting status (cooldown or initial delay)
    return (
      <Badge variant="secondary" className="text-xs bg-amber-500 text-white">
        {t('dailyTasks.waiting', 'Wait')} {formatRemainingTime(remainingTime)}
      </Badge>
    );
  };

  return (
    <Card
        key={task.account.id}
        className={cn(
            isPurchaseTask
                ? "bg-amber-500/5 border-amber-500/20"
                : isSessionOnlyTask
                    ? "bg-green-500/3 border-green-500/10"
                    : !isReady ? "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10" : ""
        )}
    >
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
              {getStatusBadge()}
            </CardTitle>
            <CardDescription>
              {task.account.start_date} • {t('dailyTasks.targetDateLabel', { date: task.targetDate })}
              {completionRecord && (
                <span className="mt-1 text-xs text-muted-foreground block">
                  {t('dailyTasks.lastCompletion', {
                    timeSpent: completionRecord.timeSpent,
                    completedAt: new Date(completionRecord.completionTime).toLocaleString()
                  })}
                </span>
              )}
              {!isReady && !isBlocked && (
                <span className="mt-1 text-xs text-amber-600 dark:text-amber-400 font-bold bg-amber-100 dark:bg-amber-900/30 p-2 rounded border border-amber-200 dark:border-amber-800 block">
                  {getTimerMessage(timerState, t)}
                </span>
              )}
              {isBlocked && (
                <span className="mt-1 text-xs text-amber-600 dark:text-amber-400 font-bold block">
                   {getTimerMessage(timerState, t)}
                </span>
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
              onComplete={() => onCompleteTask(task.account.id, index, batchIndex)}
              onCopy={(content, eventToken, timeSpent) =>
                onCopyRequest(content, eventToken, timeSpent)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}