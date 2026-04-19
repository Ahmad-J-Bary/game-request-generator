import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock } from 'lucide-react';

import { EmptyState } from '@grq/ui/organisms/daily-tasks/EmptyState';
import { BatchDisplay } from '@grq/ui/organisms/daily-tasks/BatchDisplay';
import { TaskItem } from '@grq/ui/organisms/daily-tasks/TaskItem';
import { VirtualizedTaskList } from '@grq/ui/organisms/daily-tasks/VirtualizedTaskList';
import { useDailyTasks } from '@grq/core/hooks/useDailyTasks';
import type { GameBatch, DailyTask } from '@grq/api-bindings/types/daily-tasks.types';

export default function DailyTasksPage() {
  const { t } = useTranslation();

  const {
    batches,
    deferredTasks: hookDeferredTasks,
    loading,
    isGenerating,
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

  const shouldVirtualizeTasks = useMemo(() => {
    const readyTaskCount = readyBatches.reduce((count, batch) => count + batch.tasks.length, 0);
    return (readyTaskCount + pageDeferredTasks.length) > 50;
  }, [pageDeferredTasks.length, readyBatches]);

  // Generate today's tasks on mount and when games change
  useEffect(() => {
    if (games.length === 0) return;
    
    // Always generate/refresh tasks on mount to get fresh random numbers
    generateTodaysTasks();
  }, [games]);

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
          {!loading && isGenerating && (
            <div className="flex items-center gap-2 text-muted-foreground bg-accent/10 px-2 py-1 rounded border border-dashed animate-pulse">
              <div className="h-4 w-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin"></div>
              <span className="text-xs font-medium italic opacity-80">{t('dailyTasks.refreshingTasks', 'Updating tasks...')}</span>
            </div>
          )}
        </div>
      </div>

      {batches.length === 0 && !loading && !isGenerating && (
        <EmptyState />
      )}

      <div className="w-full min-h-[400px]">
        <div className="space-y-12">
          {/* Ready Batches */}
          <div className="space-y-6">
            <AnimatePresence mode="popLayout" initial={false}>
              {readyBatches.map((batch, idx) => (
                <motion.div
                  key={`ready-batch-${batch.batchIndex}-${batch.tasks[0]?.account?.id || 'unknown'}`}
                  layout
                  transition={{ layout: { duration: 0.2, ease: "easeOut" } }}
                >
                  <BatchDisplay
                    key={`display-batch-${batch.batchIndex}-${batch.tasks[0]?.account?.id || 'unknown'}`}
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
                    enableVirtualization={shouldVirtualizeTasks}
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
                
                <VirtualizedTaskList
                  items={pageDeferredTasks}
                  enabled={shouldVirtualizeTasks}
                  className="space-y-6"
                  itemClassName={shouldVirtualizeTasks ? 'pb-6' : undefined}
                  getItemKey={({ task, batchIndex }, idx) =>
                    `deferred-${task.account?.id || 'no-acc'}-${task.targetDate}-${batchIndex}-${idx}`
                  }
                  renderItem={({ task, batchIndex }, idx) => (
                    <motion.div
                      key={`deferred-${task.account?.id || 'no-acc'}-${task.targetDate}-${batchIndex}-${idx}`}
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
                  )}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
