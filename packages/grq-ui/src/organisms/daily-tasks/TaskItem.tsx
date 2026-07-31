import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@grq/ui/atoms/card';
import { Badge } from '@grq/ui/atoms/badge';
import { RequestItem } from './RequestItem';
import { calculateTimerState, getTimerMessage, formatRemainingTime } from '@grq/core/utils/timer.utils';
import { TaskItemProps } from '@grq/api-bindings/types/daily-tasks.types';
import { useTimer } from '@grq/core/hooks/useTimer';
import { cn } from '@grq/ui/lib/utils';

interface TaskRequestListProps {
  task: TaskItemProps['task'];
  batchIndex: number | string;
  isReady: boolean;
  accountTaskIndex: number;
  accountTaskTotal: number;
  onCompleteTask: TaskItemProps['onCompleteTask'];
  onCopyRequest: TaskItemProps['onCopyRequest'];
}

const TaskRequestList = React.memo(({
  task,
  batchIndex,
  isReady,
  accountTaskIndex,
  accountTaskTotal,
  onCompleteTask,
  onCopyRequest,
}: TaskRequestListProps) => {
  return (
    <div className="space-y-3">
      {task.requests.map((request, index) => {
        return (
          <RequestItem
            key={index}
            index={accountTaskIndex}
            total={accountTaskTotal}
            request={request}
            isCompleted={task.completedTasks.has(index.toString())}
            isReady={isReady}
            onComplete={() => onCompleteTask(task.account.id, index, batchIndex, task)}
            onCopy={(content, eventToken, timeSpent) =>
              onCopyRequest(content, eventToken, timeSpent)}
          />
        );
      })}
    </div>
  );
});

export const TaskItem = React.memo(({ task, onCompleteTask, onCopyRequest, accountCompletionRecords, accountTaskAssignments: _accountTaskAssignments, accountStartStates, batchIndex, allBatches, completedTasks, deferredTasks = [], disableAnimation = false }: TaskItemProps) => {
  const { t } = useTranslation();
  const currentTime = useTimer(1000);

  const accountId = task.account.id;
  const completionRecord = accountCompletionRecords[accountId];

  // Determine if this is a purchase task (level_id is null for all requests in a purchase event)
  const isPurchaseTask = useMemo(() => 
    task.requests.some(req => req.level_id === null || req.level_id === undefined)
  , [task.requests]);

  // Determine if this is a Session Only task (all requests are Session Only)
  const isSessionOnlyTask = useMemo(() => 
    task.requests.every(req => req.request_type === 'Session Only')
  , [task.requests]);

  // Compute account task metadata and previousTask for O(1) timer lookup
  const accountTaskMeta = useMemo(() => {
    const flatReadyTasks = allBatches.flatMap((batch) => batch.tasks);
    const allDailyTasks = [...flatReadyTasks, ...deferredTasks];
    const accountTasks = allDailyTasks.filter((dailyTask) => dailyTask.account.id === accountId);

    const makeTaskKey = (dailyTask: typeof task) => {
      const group = dailyTask.requestGroups?.[0];
      return [
        dailyTask.account.id,
        group?.event_token || dailyTask.requests?.[0]?.event_token || '',
        group?.time_spent || dailyTask.requests?.[0]?.time_spent || 0,
        dailyTask.targetDate,
      ].join('::');
    };

    const currentTaskKey = makeTaskKey(task);
    const currentTaskIndex = accountTasks.findIndex((dailyTask) => makeTaskKey(dailyTask) === currentTaskKey);

    return {
      accountTaskTotal: accountTasks.length,
      accountTaskIndex: currentTaskIndex >= 0 ? currentTaskIndex + 1 : 1,
      previousTask: currentTaskIndex > 0 ? accountTasks[currentTaskIndex - 1] : null,
    };
  }, [accountId, allBatches, deferredTasks, task]);

  // Use centralized timer logic (pre-computed previousTask for O(1) lookup)
  const timerState = calculateTimerState(
    task,
    batchIndex,
    allBatches,
    currentTime,
    accountCompletionRecords,
    accountStartStates,
    completedTasks,
    deferredTasks,
    accountTaskMeta.previousTask
  );

  const { isReady, isBlocked, remainingTime } = timerState;

  // Session Only tasks can always be completed regardless of timer state
  const effectiveIsReady = isSessionOnlyTask || isReady;

  // Calculate progress percentage for the cooldown (if applicable)
  const progressPercent = useMemo(() => {
    if (isReady || isBlocked) return 100;
    const totalWait = timerState.totalWaitSec;
    if (totalWait <= 0) return 100;
    return Math.max(0, Math.min(100, ((totalWait - remainingTime) / totalWait) * 100));
  }, [isReady, isBlocked, remainingTime, timerState.totalWaitSec]);

  const getStatusBadge = () => {
    if (effectiveIsReady) {
      return (
        <Badge variant="default" className="text-xs bg-emerald-500 shadow-sm shadow-emerald-500/20">
          {t('dailyTasks.ready')}
        </Badge>
      );
    }

    if (isBlocked) {
      return (
        <Badge variant="destructive" className="text-xs shadow-sm shadow-red-500/20">
          {t('dailyTasks.waitingPrevious', 'Pending Previous')}
        </Badge>
      );
    }

    // Waiting status (cooldown or initial delay)
    return (
      <Badge variant="secondary" className="text-xs bg-amber-500 text-white animate-premium-pulse shadow-sm shadow-amber-500/20">
        {t('dailyTasks.waiting')} {formatRemainingTime(remainingTime)}
      </Badge>
    );
  };

  const card = (
      <Card
          key={task.account.id}
          className={cn(
              "overflow-hidden transition-all duration-500",
              isPurchaseTask
                  ? "glass-amber"
                  : isSessionOnlyTask
                      ? "glass-emerald"
                      : !effectiveIsReady ? "glass border-amber-200/30 dark:border-amber-800/20 bg-amber-50/10 dark:bg-amber-900/5" : "glass"
          )}
      >
        {/* Animated Progress Bar at top of card */}
        <div className="h-1 w-full bg-border/20">
          <motion.div 
            className={cn(
               "h-full",
               effectiveIsReady ? "bg-emerald-500" : "bg-amber-500"
            )}
            initial={{ width: "0%" }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ type: "spring", stiffness: 50, damping: 20 }}
          />
        </div>

        <CardHeader className="p-3 sm:p-4 pb-2 sm:pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex flex-wrap items-center gap-2 text-lg font-bold tracking-tight">
                <div className="flex items-center gap-2">
                  {task.account.name}
                  {task.account.proxy_state && (
                    <Badge variant="outline" className={cn(
                      "text-[10px] font-bold uppercase tracking-wider px-2 py-0 border-2",
                      task.account.proxy_state === 'FLORIDA' && "border-orange-500/50 text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400",
                      task.account.proxy_state === 'CALIFORNIA' && "border-blue-500/50 text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400",
                      task.account.proxy_state === 'TEXAS' && "border-red-500/50 text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400",
                      task.account.proxy_state === 'New York' && "border-slate-500/50 text-slate-600 bg-slate-50 dark:bg-slate-900/20 dark:text-slate-400",
                      task.account.proxy_state === 'UK' && "border-teal-500/50 text-teal-600 bg-teal-50 dark:bg-teal-900/20 dark:text-teal-400",
                    )}>
                      {task.account.proxy_state}
                    </Badge>
                  )}
                </div>
                <Badge variant="outline" className="font-normal opacity-70">
                  {t('dailyTasks.taskCount', {
                    count: task.requests.length,
                    plural: task.requests.length === 1 ? '' : 's'
                  })}
                </Badge>
                {getStatusBadge()}
              </CardTitle>
              <CardDescription className="flex flex-col gap-0.5">
                <span className="text-xs opacity-70">
                  {task.account.start_date} • {t('dailyTasks.targetDateLabel', { date: task.targetDate })}
                </span>
                
                <AnimatePresence mode="wait">
                  {completionRecord && (
                    <motion.span 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-[10px] text-muted-foreground italic"
                    >
                      {t('dailyTasks.lastCompletion', {
                        timeSpent: Math.round(completionRecord.timeSpent / 1000),
                        completedAt: new Date(completionRecord.completionTime).toLocaleString()
                      })}
                    </motion.span>
                  )}
                </AnimatePresence>

                {!effectiveIsReady && !isBlocked && (
                  <motion.span 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="mt-2 text-xs text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 p-2 rounded-md border border-amber-500/20 inline-block w-fit"
                  >
                    {getTimerMessage(timerState, t)}
                  </motion.span>
                )}
                
                {isBlocked && (
                  <span className="mt-2 text-xs text-red-500/70 font-medium inline-block w-fit italic">
                     {getTimerMessage(timerState, t)}
                  </span>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
          <TaskRequestList
            task={task}
            batchIndex={batchIndex}
            isReady={effectiveIsReady}
            accountTaskIndex={accountTaskMeta.accountTaskIndex}
            accountTaskTotal={accountTaskMeta.accountTaskTotal}
            onCompleteTask={onCompleteTask}
            onCopyRequest={onCopyRequest}
          />
        </CardContent>
      </Card>
  );

  if (disableAnimation) return card;

  return (
    <motion.div
      layout
      transition={{ layout: { duration: 0.2, ease: "easeOut" } }}
    >
      {card}
    </motion.div>
  );
});
