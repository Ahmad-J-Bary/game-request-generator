// src/components/daily-tasks/BatchDisplay.tsx
import { BatchHeader } from './BatchHeader';
import { BatchTasks } from './BatchTasks';
import { ProxyChangeNotice } from './ProxyChangeNotice';
import type { GameBatch, AccountCompletionRecord, AccountStartState, AccountTaskAssignment } from '../../types/daily-tasks.types';

interface BatchDisplayProps {
  batch: GameBatch;
  allBatches: GameBatch[];
  accountCompletionRecords: { [accountId: number]: AccountCompletionRecord };
  accountTaskAssignments: { [accountId: number]: AccountTaskAssignment[] };
  accountStartStates: { [accountId: number]: AccountStartState };
  currentTime: number;
  onCompleteTask: (accountId: number, requestIndex: number) => void;
  onCopyRequest: (content: string, eventToken?: string, timeSpent?: number) => void;
  showProxyNotice?: boolean;
  isLastBatch?: boolean;
}

export const BatchDisplay: React.FC<BatchDisplayProps> = ({
  batch,
  allBatches,
  accountCompletionRecords,
  accountTaskAssignments,
  accountStartStates,
  currentTime,
  onCompleteTask,
  onCopyRequest,
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
        currentTime={currentTime}
        onCompleteTask={onCompleteTask}
        onCopyRequest={onCopyRequest}
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
