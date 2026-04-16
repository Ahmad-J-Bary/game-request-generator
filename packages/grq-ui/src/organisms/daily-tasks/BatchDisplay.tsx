import React from 'react';
import { BatchHeader } from './BatchHeader';
import { BatchTasks } from './BatchTasks';
import { ProxyChangeNotice } from './ProxyChangeNotice';
import type { GameBatch, DailyTask, AccountCompletionRecord, AccountStartState, AccountTaskAssignment, RepeaterResponse } from '@grq/api-bindings/types/daily-tasks.types';

interface BatchDisplayProps {
  batch: GameBatch;
  allBatches: GameBatch[];
  accountCompletionRecords: { [accountId: number]: AccountCompletionRecord };
  accountTaskAssignments: { [accountId: number]: AccountTaskAssignment[] };
  accountStartStates: { [accountId: number]: AccountStartState };
  onCompleteTask: (accountId: number, requestIndex: number, batchIndex: number, task: DailyTask, response?: RepeaterResponse) => void;
  onUpdateResponse: (accountId: number, requestIndex: number, response: RepeaterResponse) => void;
  onCopyRequest: (content: string, eventToken?: string, timeSpent?: number) => void;
  completedTasks?: any[];
  deferredTasks?: DailyTask[];
  showProxyNotice?: boolean;
  isLastBatch?: boolean;
}

export const BatchDisplay = React.memo(({
  batch,
  allBatches,
  accountCompletionRecords,
  accountTaskAssignments,
  accountStartStates,
  onCompleteTask,
  onUpdateResponse,
  onCopyRequest,
  completedTasks = [],
  deferredTasks = [],
  showProxyNotice = false,
  isLastBatch = false,
}: BatchDisplayProps) => {
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
        onUpdateResponse={onUpdateResponse}
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
});
