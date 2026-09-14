import { useEffect, useMemo, useState } from "react";
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
  buildEffectiveTaskLevelMap,
  type TaskLevel,
} from "@grq/core/utils/task-level.utils";
import type {
  GameBatch,
  DailyTask,
} from "@grq/api-bindings/types/daily-tasks.types";
import type { Owner } from "@grq/api-bindings";
import { TauriService } from "@grq/core/services/tauri.service";
import { Label } from "@grq/ui/atoms/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@grq/ui/atoms/select";

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
  const { t, i18n } = useTranslation();

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

  const [owners, setOwners] = useState<Owner[]>([]);
  const [ownerFilter, setOwnerFilter] = useState("");

  useEffect(() => {
    let active = true;
    TauriService.getOwners()
      .then((data) => { if (active) setOwners(data || []); })
      .catch(console.error);
    return () => { active = false; };
  }, []);

  // Derive a safe ownerFilter: clear it if the selected owner no longer exists.
  const safeOwnerFilter =
    ownerFilter && owners.length > 0 && !owners.some((o) => o.name === ownerFilter)
      ? ""
      : ownerFilter;

  const { filteredBatches, filteredDeferred } = useMemo(() => {
    if (!safeOwnerFilter) return { filteredBatches: batches, filteredDeferred: hookDeferredTasks };
    const match = (task: DailyTask) => (task.account.owner?.trim() || "") === safeOwnerFilter;
    return {
      filteredBatches: batches
        .map((b) => ({ ...b, tasks: b.tasks.filter(match) }))
        .filter((b) => b.tasks.length > 0),
      filteredDeferred: hookDeferredTasks.filter(match),
    };
  }, [batches, hookDeferredTasks, safeOwnerFilter]);

  const { levelSections, hasTasks } = useMemo(() => {
    const sections: Record<TaskLevel, GameBatch[]> = {
      first: [],
      middle: [],
      last: [],
    };

    // Partition ALL displayed tasks (ready + deferred) by effective level, preserving
    // the generator's ordering. The first active task for an account (where all
    // previous stages are completed) stays in Level 1 and does not demote.
    const tasksByLevel: Record<TaskLevel, DailyTask[]> = {
      first: [],
      middle: [],
      last: [],
    };

    const allDisplayedTasks: DailyTask[] = [];
    filteredBatches.forEach((batch) => {
      batch.tasks.forEach((task) => {
        allDisplayedTasks.push(task);
      });
    });
    filteredDeferred.forEach((task) => {
      allDisplayedTasks.push(task);
    });

    const levelMap = buildEffectiveTaskLevelMap(allDisplayedTasks);

    allDisplayedTasks.forEach((task) => {
      const lvl = levelMap.get(task) ?? taskLevel(task);
      tasksByLevel[lvl].push(task);
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
  }, [filteredBatches, filteredDeferred]);

  // Generate today's tasks on mount and when games change
  useEffect(() => {
    if (games.length === 0) return;

    // Always generate/refresh tasks on mount to get fresh random numbers
    generateTodaysTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games]);

  return (
    <div className="w-full px-1 sm:px-2 space-y-4 lg:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight whitespace-nowrap">
              {t("dailyTasks.title")}
            </h1>
            {owners.length >= 2 && (
              <div className="flex items-center gap-2">
                <Label className="text-muted-foreground whitespace-nowrap text-xs">
                  {t("accounts.owner", "Owner")}
                </Label>
                <Select value={safeOwnerFilter || "none"} onValueChange={(v) => setOwnerFilter(v === "none" ? "" : v)}>
                  <SelectTrigger dir={i18n.dir()} className="h-8 w-44 rounded-xl bg-background border border-border/40 text-sm">
                    <SelectValue placeholder={t("accounts.allOwners", "All owners")} />
                  </SelectTrigger>
                  <SelectContent dir={i18n.dir()}>
                    <SelectItem value="none">{t("accounts.allOwners", "All owners")}</SelectItem>
                    {owners.map((o) => (
                      <SelectItem key={o.id} value={o.name}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
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
                          allBatches={filteredBatches}
                          accountCompletionRecords={accountCompletionRecords}
                          accountTaskAssignments={accountTaskAssignments}
                          accountStartStates={accountStartStates}
                          onCompleteTask={completeTask}
                          onCopyRequest={copyToClipboard}
                          completedTasks={completedTasks}
                          deferredTasks={filteredDeferred}
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
