import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { EmptyState } from '../../components/daily-tasks/EmptyState';
import { BatchDisplay } from '../../components/daily-tasks/BatchDisplay';
import { useDailyTasks } from '../../hooks/useDailyTasks';
import { checkTaskReadiness } from '../../utils/daily-tasks.utils';
import type { GameBatch, DailyTask } from '../../types/daily-tasks.types';

export default function DailyTasksPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const {
    batches,
    loading,
    games,
    currentTime,
    accountCompletionRecords,
    accountTaskAssignments,
    accountStartStates,
    generateTodaysTasks,
    completeTask,
    copyToClipboard,
  } = useDailyTasks();


  // Generate today's tasks on mount and when games change
  useEffect(() => {
    if (games.length === 0) return;

    const today = new Date().toISOString().split('T')[0];
    // Always generate/refresh tasks to catch new additions
    generateTodaysTasks();
    localStorage.setItem('dailyTasks_lastGenerated', today);
  }, [games]); // Re-run when games are loaded

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('dailyTasks.title')}</h1>
          <p className="text-muted-foreground">{t('dailyTasks.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/daily-tasks/unready')}>
            <Clock className="mr-2 h-4 w-4" />
            {t('dailyTasks.viewDeferred', 'View Deferred Tasks')}
          </Button>
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
              <span>{t('dailyTasks.generateTasksLoading')}</span>
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

                {/* Deferred Tasks Section Removed - Moved to separate page */}
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}