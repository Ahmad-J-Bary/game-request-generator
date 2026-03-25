import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { Card, CardContent } from '@grq/ui/atoms/card';
import { EmptyState } from '@grq/ui/organisms/daily-tasks/EmptyState';
import { BatchDisplay } from '@grq/ui/organisms/daily-tasks/BatchDisplay';
import { TaskItem } from '@grq/ui/organisms/daily-tasks/TaskItem';
import { useDailyTasks } from '@grq/core/hooks/useDailyTasks';
import { checkTaskReadiness } from '@grq/core/utils/daily-tasks.utils';
import type { GameBatch, DailyTask } from '@grq/api-bindings/types/daily-tasks.types';

export default function DailyTasksPage() {
  const { t } = useTranslation();

  const {
    batches,
    loading,
    games,
    currentTime,
    accountCompletionRecords,
    accountTaskAssignments,
    accountStartStates,
    completeTask,
    copyToClipboard,
  } = useDailyTasks();


  // Generate today's tasks on mount and when games change
  useEffect(() => {
    if (games.length === 0) return;

    const today = new Date().toISOString().split('T')[0];
    // Always generate/refresh tasks to catch new additions
    localStorage.setItem('dailyTasks_lastGenerated', today);
  }, [games]); // Re-run when games are loaded

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t('dailyTasks.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('dailyTasks.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground bg-accent/20 px-2 py-1 rounded border">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              <span className="text-xs font-medium">{t('dailyTasks.generateTasksLoading')}</span>
            </div>
          )}
        </div>
      </div>

      {batches.length === 0 && !loading && (
        <EmptyState />
      )}

      <Card>
        <CardContent className="overflow-auto">
          {(() => {
            const readyBatches: GameBatch[] = [];
            const deferredTasks: { task: DailyTask; batchIndex: number }[] = [];

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
                    <BatchDisplay
                      key={`ready-batch-${batch.batchIndex}`}
                      batch={batch}
                      allBatches={batches}
                      accountCompletionRecords={accountCompletionRecords}
                      accountTaskAssignments={accountTaskAssignments}
                      accountStartStates={accountStartStates}
                      currentTime={currentTime}
                      onCompleteTask={completeTask}
                      onCopyRequest={copyToClipboard}
                      showProxyNotice={idx < readyBatches.length - 1}
                      isLastBatch={idx === readyBatches.length - 1}
                    />
                  ))}
                </div>

                {/* Deferred Tasks Section */}
                {deferredTasks.length > 0 && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 border-b pb-2">
                        <Clock className="h-5 w-5 text-amber-500" />
                        <h2 className="text-xl font-semibold">{t('dailyTasks.deferredTasksTitle', 'Deferred Tasks')}</h2>
                    </div>
                    
                    {deferredTasks.map(({ task, batchIndex }) => (
                      <TaskItem
                        key={`${task.account.id}-${batchIndex}`}
                        task={task}
                        batchIndex={batchIndex}
                        allBatches={batches}
                        currentTime={currentTime}
                        accountCompletionRecords={accountCompletionRecords}
                        accountStartStates={accountStartStates}
                        accountTaskAssignments={accountTaskAssignments}
                        onCompleteTask={completeTask}
                        onCopyRequest={copyToClipboard}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}