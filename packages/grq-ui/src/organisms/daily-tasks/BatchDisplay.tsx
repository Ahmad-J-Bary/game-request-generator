// src/components/daily-tasks/BatchDisplay.tsx
import { BatchHeader } from './BatchHeader';
import { BatchTasks } from './BatchTasks';
import { ProxyChangeNotice } from './ProxyChangeNotice';
import type { GameBatch, DailyTask, AccountCompletionRecord, AccountStartState, AccountTaskAssignment } from '@grq/api-bindings/types/daily-tasks.types';

interface BatchDisplayProps {
  batch: GameBatch;
  allBatches: GameBatch[];
  accountCompletionRecords: { [accountId: number]: AccountCompletionRecord };
  accountTaskAssignments: { [accountId: number]: AccountTaskAssignment[] };
  accountStartStates: { [accountId: number]: AccountStartState };
  onCompleteTask: (accountId: number, requestIndex: number, batchIndex: number) => void;
  onCopyRequest: (content: string, eventToken?: string, timeSpent?: number) => void;
  completedTasks?: any[];
  deferredTasks?: DailyTask[];
  showProxyNotice?: boolean;
  isLastBatch?: boolean;
}

export const BatchDisplay: React.FC<BatchDisplayProps> = ({
  batch,
  allBatches,
  accountCompletionRecords,
  accountTaskAssignments,
  accountStartStates,
  onCompleteTask,
  onCopyRequest,
  completedTasks = [],
  deferredTasks = [],
  showProxyNotice = true,
  isLastBatch = false,
}) => {
  return (
    <div key={`ready-batch-${batch.batchIndex}`}>
      {/* Batch Header */}
      <BatchHeader
        batchIndex={batch.batchIndex}
        taskCount={batch.tasks.length}
        isReady={true}
      />

      {/* Tasks in this batch */}
      <BatchTasks
        batch={batch}
        allBatches={allBatches}
        accountCompletionRecords={accountCompletionRecords}
        accountTaskAssignments={accountTaskAssignments}
        accountStartStates={accountStartStates}
        onCompleteTask={onCompleteTask}
        onCopyRequest={onCopyRequest}
        completedTasks={completedTasks}
        deferredTasks={deferredTasks}
      />

      {/* Separator and proxy change notice */}
      {showProxyNotice && !isLastBatch && (
        <div className="mt-8 mb-8">
          <div className="border-t-2 border-dashed border-muted-foreground/30 my-4"></div>
          <ProxyChangeNotice />
        </div>
      )}
    </div>
  );
};
