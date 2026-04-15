import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock } from 'lucide-react';

import { EmptyState } from '@grq/ui/organisms/daily-tasks/EmptyState';
import { BatchDisplay } from '@grq/ui/organisms/daily-tasks/BatchDisplay';
import { TaskItem } from '@grq/ui/organisms/daily-tasks/TaskItem';
import { useDailyTasks } from '@grq/core/hooks/useDailyTasks';
import type { GameBatch, DailyTask } from '@grq/api-bindings/types/daily-tasks.types';

export default function DailyTasksPage() {
  const { t } = useTranslation();

  const {
    batches,
    deferredTasks: hookDeferredTasks,
    loading,
    games,
    accountCompletionRecords,
    accountTaskAssignments,
    accountStartStates,
    generateTodaysTasks,
    completeTask,
    copyToClipboard,
    completedTasks,
    updateTaskResponse,
  } = useDailyTasks();

  const { readyBatches, pageDeferredTasks } = useMemo(() => {
    const rBatches: GameBatch[] = [];
    const pDeferred: { task: DailyTask; batchIndex: number }[] = [];

    // KEEP ALL ACTIVE BATCHES IN THE READY SECTION
    // This allows the user to see their progress as tasks stay in place after completion.
    // The "Deferred" section will be strictly for tasks that were not generated as part of today's initial batches.
    batches.forEach(batch => {
      rBatches.push(batch);
    });

    // Also add tasks that were originally deferred by the generator
    hookDeferredTasks.forEach(task => {
      pDeferred.push({ task, batchIndex: -1 });
    });

    return { readyBatches: rBatches, pageDeferredTasks: pDeferred };
  }, [batches, hookDeferredTasks]);

  // Generate today's tasks on mount and when games change
  useEffect(() => {
    if (games.length === 0) return;

    const today = new Date().toISOString().split('T')[0];
    // Always generate/refresh tasks to catch new additions
    generateTodaysTasks();
    localStorage.setItem('dailyTasks_lastGenerated', today);
  }, [games]); // Re-run when games are loaded

  return (
    <div className="w-full px-1 sm:px-2 space-y-4 lg:space-y-6">
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

      <div className="w-full min-h-[400px]">
        <div className="space-y-12">
          {/* Ready Batches */}
          <div className="space-y-6">
            <AnimatePresence mode="popLayout" initial={false}>
              {readyBatches.map((batch, idx) => (
                <motion.div
                  key={`ready-batch-${batch.batchIndex}`}
                  layout
                  transition={{ layout: { duration: 0.2, ease: "easeOut" } }}
                >
                  <BatchDisplay
                    batch={batch}
                    allBatches={batches}
                    accountCompletionRecords={accountCompletionRecords}
                    accountTaskAssignments={accountTaskAssignments}
                    accountStartStates={accountStartStates}
                    onCompleteTask={completeTask}
                    onUpdateResponse={updateTaskResponse}
                    onCopyRequest={copyToClipboard}
                    completedTasks={completedTasks}
                    deferredTasks={hookDeferredTasks}
                    showProxyNotice={idx < readyBatches.length - 1}
                    isLastBatch={idx === readyBatches.length - 1}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Deferred Tasks Section */}
          <AnimatePresence mode="popLayout">
            {pageDeferredTasks.length > 0 && (
              <motion.div 
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6 pt-8 border-t"
              >
                <div className="flex items-center gap-2 border-b pb-2">
                    <Clock className="h-5 w-5 text-amber-500" />
                    <h2 className="text-xl font-semibold">{t('dailyTasks.deferredTasksTitle', 'Deferred Tasks')}</h2>
                </div>
                
                <div className="space-y-6">
                  {pageDeferredTasks.map(({ task, batchIndex }) => (
                    <motion.div
                      key={`deferred-${task.account.id}-${batchIndex}`}
                      layout
                    >
                      <TaskItem
                        task={task}
                        batchIndex={batchIndex}
                        allBatches={batches}
                        accountCompletionRecords={accountCompletionRecords}
                        accountStartStates={accountStartStates}
                        accountTaskAssignments={accountTaskAssignments}
                        onCompleteTask={completeTask}
                        onUpdateResponse={updateTaskResponse}
                        onCopyRequest={copyToClipboard}
                        completedTasks={completedTasks}
                        deferredTasks={hookDeferredTasks}
                      />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
