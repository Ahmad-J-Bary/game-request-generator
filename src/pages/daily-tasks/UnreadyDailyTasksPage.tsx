import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { TaskItem } from '../../components/daily-tasks/TaskItem';
import { getTaskReadinessDetails } from '../../utils/daily-tasks.utils';
import { GameBatch, AccountCompletionRecord, AccountStartState } from '../../types/daily-tasks.types';
import { NotificationService } from '../../utils/notifications';
import { RequestProcessor } from '../../services/tauri.service';

export default function UnreadyDailyTasksPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [batches, setBatches] = useState<GameBatch[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [loading, setLoading] = useState(true);

    const [accountCompletionRecords, setAccountCompletionRecords] = useState<{ [accountId: number]: AccountCompletionRecord }>({});
    const [accountStartStates, setAccountStartStates] = useState<{ [accountId: number]: AccountStartState }>({});
    const [currentTime, setCurrentTime] = useState(Date.now());

    useEffect(() => {
        const loadData = () => {
            const today = new Date().toISOString().split('T')[0];
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
                } catch (error) {
                    console.error('Error loading tasks:', error);
                }
            }

            const storedRecords = localStorage.getItem(`dailyTasks_completionRecords_${today}`);
            if (storedRecords) {
                setAccountCompletionRecords(JSON.parse(storedRecords));
            }

            const storedStartStates = localStorage.getItem(`dailyTasks_startStates_${today}`);
            if (storedStartStates) {
                setAccountStartStates(JSON.parse(storedStartStates));
            }

            setLoading(false);
        };

        loadData();

        const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    const unreadyTasks = useMemo(() => {
        return batches.flatMap(batch =>
            batch.tasks.map(task => {
                const details = getTaskReadinessDetails(
                    task,
                    batch.batchIndex,
                    batches,
                    currentTime,
                    accountCompletionRecords,
                    accountStartStates
                );
                return { task, batchIndex: batch.batchIndex, details };
            })
        ).filter(item => !item.details.isReady)
            .sort((a, b) => {
                const priorityA = (a.task.totalDailyRequests || 0) > 1;
                const priorityB = (b.task.totalDailyRequests || 0) > 1;
                if (priorityA && !priorityB) return -1;
                if (!priorityA && priorityB) return 1;

                if (a.details.isBlocked && !b.details.isBlocked) return 1;
                if (!a.details.isBlocked && b.details.isBlocked) return -1;
                if (a.details.remainingTime !== b.details.remainingTime) {
                    return a.details.remainingTime - b.details.remainingTime;
                }
                // Secondary sort: More daily requests first
                return (b.task.totalDailyRequests || 0) - (a.task.totalDailyRequests || 0);
            });
    }, [batches, currentTime, accountCompletionRecords, accountStartStates]);

    const handleCopy = (content: string, eventToken?: string, timeSpent?: number) => {
        const processedContent = eventToken && timeSpent !== undefined
            ? RequestProcessor.processRequestContent(content, eventToken, timeSpent)
            : content;
        navigator.clipboard.writeText(processedContent);
        NotificationService.success(t('dailyTasks.requestCopied'));
    };

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" onClick={() => navigate('/daily-tasks')}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {t('common.back')}
                </Button>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                    <Clock className="h-8 w-8 text-amber-500" />
                    {t('dailyTasks.deferredTasksTitle', 'Deferred Tasks')}
                </h1>
            </div>

            <div className="space-y-6">
                {loading ? (
                    <div className="flex justify-center p-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : (
                    <>
                        {unreadyTasks.map(({ task, batchIndex }) => (
                            <div key={`${task.account.id}-${batchIndex}`}>
                                <TaskItem
                                    task={task}
                                    batchIndex={batchIndex}
                                    allBatches={batches}
                                    currentTime={currentTime}
                                    accountCompletionRecords={accountCompletionRecords}
                                    accountStartStates={accountStartStates}
                                    accountTaskAssignments={{}}
                                    onCompleteTask={() => { }}
                                    onCopyRequest={handleCopy}
                                />
                            </div>
                        ))}
                        {unreadyTasks.length === 0 && (
                            <div className="text-center text-muted-foreground p-12">
                                {t('dailyTasks.noDeferredTasks', 'No deferred tasks.')}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
