import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { PlayCircle, Layers, Flag } from "lucide-react";

import { EmptyState } from "@grq/ui/organisms/daily-tasks/EmptyState";
import { BatchDisplay } from "@grq/ui/organisms/daily-tasks/BatchDisplay";
import { useDailyTasks } from "@grq/core/hooks/useDailyTasks";
import {
  TASK_LEVEL_ORDER,
  taskLevel,
  buildLevelBatches,
  type TaskLevel,
} from "@grq/core/utils/task-level.utils";
import type {
  GameBatch,
  DailyTask,
} from "@grq/api-bindings/types/daily-tasks.types";

const LEVEL_META: Record<TaskLevel, { icon: typeof PlayCircle; titleKey: string; iconClass: string }> = {
  first: {
    icon: PlayCircle,
    titleKey: "dailyTasks.level1Title",
    iconClass: "text-emerald-600 dark:text-emerald-400",
  },
  middle: {
    icon: Layers,
    titleKey: "dailyTasks.level2Title",
    iconClass: "text-sky-600 dark:text-sky-400",
  },
  last: {
    icon: Flag,
    titleKey: "dailyTasks.level3Title",
    iconClass: "text-slate-600 dark:text-slate-400",
  },
};

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
    regionColorMap,
  } = useDailyTasks();

  const { levelSections, hasTasks } = useMemo(() => {
    const sections: Record<TaskLevel, GameBatch[]> = {
      first: [],
      middle: [],
      last: [],
    };

    // Partition ALL displayed tasks (ready + deferred) by level, preserving the
    // generator's ordering (ready batches first, then the deferred list).
    const tasksByLevel: Record<TaskLevel, DailyTask[]> = {
      first: [],
      middle: [],
      last: [],
    };
    batches.forEach((batch) => {
      batch.tasks.forEach((task) => {
        tasksByLevel[taskLevel(task)].push(task);
      });
    });
    hookDeferredTasks.forEach((task) => {
      tasksByLevel[taskLevel(task)].push(task);
    });

    // Rebuild the batch system WITHIN each level using the generator's exact
    // mechanism (group by region, then by game, one task per game per batch).
    // Batch numbering continues across levels (global sequential counter), so
    // the numbering stays continuous as it was in the original batch system.
    let batchCounter = 0;
    TASK_LEVEL_ORDER.forEach((level) => {
      sections[level] = buildLevelBatches(tasksByLevel[level], batchCounter);
      batchCounter += sections[level].length;
    });

    const hasTasks = TASK_LEVEL_ORDER.some((level) => sections[level].length > 0);

    return { levelSections: sections, hasTasks };
  }, [batches, hookDeferredTasks]);

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
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {t("dailyTasks.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("dailyTasks.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground bg-accent/20 px-2 py-1 rounded border">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              <span className="text-xs font-medium">
                {t("dailyTasks.generateTasksLoading")}
              </span>
            </div>
          )}
          {!loading && isGenerating && (
            <div className="flex items-center gap-2 text-muted-foreground bg-accent/10 px-2 py-1 rounded border border-dashed animate-pulse">
              <div className="h-4 w-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin"></div>
              <span className="text-xs font-medium italic opacity-80">
                {t("dailyTasks.refreshingTasks", "Updating tasks...")}
              </span>
            </div>
          )}
        </div>
      </div>

      {!hasTasks && !loading && !isGenerating && <EmptyState />}

      <div className="w-full min-h-[400px]">
        <div className="space-y-12">
          {/* Three task levels: Level 1 (n=1) on top, middle (1<n<N), last (n=N) at the bottom */}
          {TASK_LEVEL_ORDER.map((level) => {
            const levelBatches = levelSections[level];
            if (levelBatches.length === 0) {
              return null;
            }

            const meta = LEVEL_META[level];
            const LevelIcon = meta.icon;

            return (
              <div key={level} className="space-y-6">
                <div className="flex items-center gap-2 border-b pb-2">
                  <LevelIcon className={`h-5 w-5 ${meta.iconClass}`} />
                  <h2 className="text-xl font-semibold leading-tight">
                    {t(meta.titleKey)}
                  </h2>
                </div>

                <div className="space-y-6">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {levelBatches.map((batch) => (
                      <motion.div
                        key={`${level}-batch-${batch.batchIndex}`}
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
                          onCopyRequest={copyToClipboard}
                          completedTasks={completedTasks}
                          deferredTasks={hookDeferredTasks}
                          regionColorMap={regionColorMap}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
