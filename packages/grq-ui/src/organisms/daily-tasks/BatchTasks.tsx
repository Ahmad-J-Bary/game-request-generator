// src/components/daily-tasks/BatchTasks.tsx
import React from 'react';
import { TaskItem } from './TaskItem';
import { VirtualizedTaskList } from './VirtualizedTaskList';
import type { GameBatch, DailyTask, AccountCompletionRecord, AccountStartState, AccountTaskAssignment } from '@grq/api-bindings/types/daily-tasks.types';

interface BatchTasksProps {
  batch: GameBatch;
  allBatches: GameBatch[];
  accountCompletionRecords: { [accountId: number]: AccountCompletionRecord };
  accountTaskAssignments: { [accountId: number]: AccountTaskAssignment[] };
  accountStartStates: { [accountId: number]: AccountStartState };
  onCompleteTask: (accountId: number, requestIndex: number, batchIndex: number, task: DailyTask) => void;
  onCopyRequest: (content: string, eventToken?: string, timeSpent?: number) => void;
  completedTasks: any[];
  deferredTasks?: DailyTask[];
  enableVirtualization?: boolean;
  regionColorMap?: Record<string, string>;
}

const TaskItemWrapper = React.memo(({ task, batchIndex, ...rest }: {
  task: DailyTask;
  batchIndex: number | string;
  onCompleteTask: BatchTasksProps['onCompleteTask'];
  onCopyRequest: BatchTasksProps['onCopyRequest'];
  accountCompletionRecords: BatchTasksProps['accountCompletionRecords'];
  accountTaskAssignments: BatchTasksProps['accountTaskAssignments'];
  accountStartStates: BatchTasksProps['accountStartStates'];
  allBatches: BatchTasksProps['allBatches'];
  completedTasks: BatchTasksProps['completedTasks'];
  deferredTasks: BatchTasksProps['deferredTasks'];
  regionColorMap: BatchTasksProps['regionColorMap'];
}) => (
  <TaskItem
    task={task}
    onCompleteTask={rest.onCompleteTask}
    onCopyRequest={rest.onCopyRequest}
    accountCompletionRecords={rest.accountCompletionRecords}
    accountTaskAssignments={rest.accountTaskAssignments}
    accountStartStates={rest.accountStartStates}
    batchIndex={batchIndex}
    allBatches={rest.allBatches}
    completedTasks={rest.completedTasks}
    deferredTasks={rest.deferredTasks}
    regionColorMap={rest.regionColorMap}
    disableAnimation
  />
));

export const BatchTasks = React.memo(({
  batch,
  allBatches,
  accountCompletionRecords,
  accountTaskAssignments,
  accountStartStates,
  onCompleteTask,
  onCopyRequest,
  completedTasks,
  deferredTasks = [],
  enableVirtualization = false,
  regionColorMap = {},
}: BatchTasksProps) => {
  const itemProps = {
    onCompleteTask,
    onCopyRequest,
    accountCompletionRecords,
    accountTaskAssignments,
    accountStartStates,
    allBatches,
    completedTasks,
    deferredTasks,
    regionColorMap,
  };

  return (
    <VirtualizedTaskList
      items={batch.tasks}
      enabled={enableVirtualization}
      getItemKey={(task) => `${task.account.id}-${batch.batchIndex}-${task.requests[0]?.event_token || ''}-${task.requests[0]?.time_spent || 0}`}
      renderItem={(task) => (
        <TaskItemWrapper
          task={task}
          batchIndex={batch.batchIndex}
          {...itemProps}
        />
      )}
      className="space-y-6"
    />
  );
});
