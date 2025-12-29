// src/components/daily-tasks/BatchTasks.tsx
import { TaskItem } from './TaskItem';
import type { GameBatch, AccountCompletionRecord, AccountStartState, AccountTaskAssignment } from '../../types/daily-tasks.types';

interface BatchTasksProps {
  batch: GameBatch;
  allBatches: GameBatch[];
  accountCompletionRecords: { [accountId: number]: AccountCompletionRecord };
  accountTaskAssignments: { [accountId: number]: AccountTaskAssignment[] };
  accountStartStates: { [accountId: number]: AccountStartState };
  currentTime: number;
  onCompleteTask: (accountId: number, requestIndex: number) => void;
  onCopyRequest: (content: string, eventToken?: string, timeSpent?: number) => void;
}

export const BatchTasks: React.FC<BatchTasksProps> = ({
  batch,
  allBatches,
  accountCompletionRecords,
  accountTaskAssignments,
  accountStartStates,
  currentTime,
  onCompleteTask,
  onCopyRequest,
}) => {
  return (
    <div className="space-y-4">
      {batch.tasks.map((task, taskIndex) => (
        <div key={task.account.id}>
          <div className="mb-2">
            <span className="text-sm font-medium text-muted-foreground">
              {taskIndex + 1}- {task.account.name}
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
            currentTime={currentTime}
          />
        </div>
      ))}
    </div>
  );
};
