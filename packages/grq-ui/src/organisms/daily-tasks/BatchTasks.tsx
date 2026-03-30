// src/components/daily-tasks/BatchTasks.tsx
import { TaskItem } from './TaskItem';
import type { GameBatch, AccountCompletionRecord, AccountStartState, AccountTaskAssignment } from '@grq/api-bindings/types/daily-tasks.types';

interface BatchTasksProps {
  batch: GameBatch;
  allBatches: GameBatch[];
  accountCompletionRecords: { [accountId: number]: AccountCompletionRecord };
  accountTaskAssignments: { [accountId: number]: AccountTaskAssignment[] };
  accountStartStates: { [accountId: number]: AccountStartState };
  onCompleteTask: (accountId: number, requestIndex: number, batchIndex: number) => void;
  onCopyRequest: (content: string, eventToken?: string, timeSpent?: number) => void;
  completedTasks: any[];
}

export const BatchTasks: React.FC<BatchTasksProps> = ({
  batch,
  allBatches,
  accountCompletionRecords,
  accountTaskAssignments,
  accountStartStates,
  onCompleteTask,
  onCopyRequest,
  completedTasks = [],
}) => {
  const totalTasks = allBatches.reduce((acc, b) => acc + b.tasks.length, 0);
  const previousTasksCount = allBatches.slice(0, batch.batchIndex).reduce((acc, b) => acc + b.tasks.length, 0);

  return (
    <div className="space-y-4">
      {batch.tasks.map((task, taskIndex) => (
        <div key={task.account.id}>
          <div className="mb-2">
            <span className="text-sm font-medium text-muted-foreground">
              {previousTasksCount + taskIndex + 1}- {task.account.name}
            </span>
          </div>
          <TaskItem
            task={task}
            onCompleteTask={onCompleteTask}
            onCopyRequest={onCopyRequest}
            accountCompletionRecords={accountCompletionRecords}
            accountTaskAssignments={accountTaskAssignments}
            accountStartStates={accountStartStates}
            batchIndex={batch.batchIndex}
            allBatches={allBatches}
            completedTasks={completedTasks}
            globalIndex={previousTasksCount + taskIndex + 1}
            totalTasks={totalTasks}
          />
        </div>
      ))}
    </div>
  );
};
