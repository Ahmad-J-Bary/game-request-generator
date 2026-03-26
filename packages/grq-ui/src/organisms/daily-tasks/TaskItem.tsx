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

export const TaskItem = React.memo(({ task, onCompleteTask, onCopyRequest, accountCompletionRecords, accountTaskAssignments: _accountTaskAssignments, accountStartStates, batchIndex, allBatches }: TaskItemProps) => {
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

  // Calculate progress percentage for the cooldown (if applicable)
  const progressPercent = useMemo(() => {
    if (isReady || isBlocked) return 100;
    // We assume a standard wait of 3000s (or whatever is in time_spent)
    const totalWait = (task.requests[0]?.time_spent || 3000);
    if (totalWait <= 0) return 100;
    return Math.max(0, Math.min(100, ((totalWait - remainingTime) / totalWait) * 100));
  }, [isReady, isBlocked, remainingTime, task.requests]);

  // Determine status badge
  const getStatusBadge = () => {
    if (isReady) {
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
        {t('dailyTasks.waiting', 'Wait')} {formatRemainingTime(remainingTime)}
      </Badge>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      layout
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <Card
          key={task.account.id}
          className={cn(
              "overflow-hidden transition-all duration-500",
              isPurchaseTask
                  ? "glass-amber"
                  : isSessionOnlyTask
                      ? "glass-emerald"
                      : !isReady ? "glass border-amber-200/30 dark:border-amber-800/20 bg-amber-50/10 dark:bg-amber-900/5" : "glass"
          )}
      >
        {/* Animated Progress Bar at top of card */}
        <div className="h-1 w-full bg-border/20">
          <motion.div 
            className={cn(
               "h-full",
               isReady ? "bg-emerald-500" : "bg-amber-500"
            )}
            initial={{ width: "0%" }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ type: "spring", stiffness: 50, damping: 20 }}
          />
        </div>

        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
                {task.account.name}
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
                        timeSpent: completionRecord.timeSpent,
                        completedAt: new Date(completionRecord.completionTime).toLocaleString()
                      })}
                    </motion.span>
                  )}
                </AnimatePresence>

                {!isReady && !isBlocked && (
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
        <CardContent>
          <div className="space-y-3">
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
    </motion.div>
  );
});