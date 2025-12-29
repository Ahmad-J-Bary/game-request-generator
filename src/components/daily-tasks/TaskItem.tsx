import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { RequestItem } from './RequestItem';
import { calculateFirstRequestAllowedTime } from '../../utils/daily-tasks.utils';
import { TaskItemProps } from '../../types/daily-tasks.types';

export function TaskItem({ task, onCompleteTask, onCopyRequest, accountCompletionRecords, accountTaskAssignments: _accountTaskAssignments, accountStartStates, batchIndex, allBatches, currentTime }: TaskItemProps & { currentTime: number }) {
    const { t } = useTranslation();

    const accountId = task.account.id;
    const completionRecord = accountCompletionRecords[accountId];

    // 1. Check for sequential dependency (Blocked)
    const isBlocked = allBatches.some(b =>
        b.batchIndex < batchIndex &&
        b.tasks.some(t => t.account.id === accountId)
    );

    // 2. Check completion record readiness (Cooldown)
    let isCompletionReady = true;
    let completionRemainingTime = 0;
    let completionComeBackTime: Date | null = null;

    if (completionRecord) {
        const currentGroup = task.requestGroups?.[0] || { time_spent: task.requests[0]?.time_spent || 0 };
        const diff = Math.max(0, currentGroup.time_spent - completionRecord.timeSpent);
        const requiredCooldown = diff * 1000;

        const timeSinceCompletion = currentTime - completionRecord.completionTime;
        isCompletionReady = timeSinceCompletion >= requiredCooldown;

        if (!isCompletionReady) {
            completionRemainingTime = Math.ceil((requiredCooldown - timeSinceCompletion) / 1000);
            completionComeBackTime = new Date(currentTime + (requiredCooldown - timeSinceCompletion));
        }
    }

    // 3. Check account start state
    const startState = accountStartStates[accountId];
    let isStartReady = true;
    let startRemainingTime = 0;
    let startComeBackTime: Date | null = null;

    if (!completionRecord) {
        let firstRequestAllowedAt = startState?.firstRequestAllowedAt;

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

    const isReady = !isBlocked && isCompletionReady && isStartReady;

    const remainingTime = Math.max(
        completionRemainingTime,
        startRemainingTime
    );

    const comeBackTime = startComeBackTime || completionComeBackTime;

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
                                    {isBlocked ? t('dailyTasks.waitingPrevious', 'Pending Previous') :
                                        t('dailyTasks.waitingTime', { seconds: remainingTime })}
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
                                <span className="mt-1 text-xs text-muted-foreground block">
                                    {t('dailyTasks.lastCompletion', {
                                        timeSpent: completionRecord.timeSpent,
                                        completedAt: new Date(completionRecord.completionTime).toLocaleString()
                                    })}
                                </span>
                            )}
                            {!isReady && comeBackTime && !isBlocked && (
                                <span className="mt-1 text-xs text-amber-600 dark:text-amber-400 font-bold bg-amber-100 dark:bg-amber-900/30 p-2 rounded border border-amber-200 dark:border-amber-800 block">
                                    {!isStartReady && startComeBackTime ? t('dailyTasks.accountInitializing', {
                                        time: startComeBackTime.toLocaleString()
                                    }) : t('dailyTasks.returnAfter', {
                                        time: comeBackTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                        date: comeBackTime.toLocaleDateString()
                                    })}
                                </span>
                            )}
                            {isBlocked && (
                                <span className="mt-1 text-xs text-amber-600 dark:text-amber-400 font-bold block">
                                    {t('dailyTasks.blockedByPrevious', 'Waiting for previous task to complete')}
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
