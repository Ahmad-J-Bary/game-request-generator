// src/components/daily-tasks/BatchTasks.tsx
import React from 'react';
import { TaskItem } from './TaskItem';
import { VirtualizedTaskList } from './VirtualizedTaskList';
import type { GameBatch, DailyTask, AccountCompletionRecord, AccountStartState, AccountTaskAssignment, RepeaterResponse } from '@grq/api-bindings/types/daily-tasks.types';

interface BatchTasksProps {
  batch: GameBatch;
  allBatches: GameBatch[];
  accountCompletionRecords: { [accountId: number]: AccountCompletionRecord };
  accountTaskAssignments: { [accountId: number]: AccountTaskAssignment[] };
  accountStartStates: { [accountId: number]: AccountStartState };
  onCompleteTask: (accountId: number, requestIndex: number, batchIndex: number, task: DailyTask, response?: RepeaterResponse) => void;
  onUpdateResponse: (accountId: number, requestIndex: number, response: RepeaterResponse) => void;
  onCopyRequest: (content: string, eventToken?: string, timeSpent?: number) => void;
  completedTasks: any[];
  deferredTasks?: DailyTask[];
  enableVirtualization?: boolean;
}

export const BatchTasks = React.memo(({
  batch,
  allBatches,
  accountCompletionRecords,
  accountTaskAssignments,
  accountStartStates,
  onCompleteTask,
  onUpdateResponse,
  onCopyRequest,
  completedTasks,
  deferredTasks = [],
  enableVirtualization = false,
}: BatchTasksProps) => {
  return (
    <VirtualizedTaskList
      items={batch.tasks}
      enabled={enableVirtualization}
      className="space-y-6"
      itemClassName={enableVirtualization ? 'pb-6' : undefined}
      getItemKey={(task, idx) => `${task.account.id}-${batch.batchIndex}-${idx}`}
      renderItem={(task) => {
        return (
          <div key={`${task.account.id}-${batch.batchIndex}`}>
            <TaskItem
              task={task}
              onCompleteTask={onCompleteTask}
              onCopyRequest={onCopyRequest}
              accountCompletionRecords={accountCompletionRecords}
              accountTaskAssignments={accountTaskAssignments}
              accountStartStates={accountStartStates}
              batchIndex={batch.batchIndex}
              allBatches={allBatches}
              onUpdateResponse={onUpdateResponse}
              completedTasks={completedTasks}
              deferredTasks={deferredTasks}
            />
          </div>
        );
      }}
    />
  );
});
