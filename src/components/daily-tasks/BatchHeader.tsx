// src/components/daily-tasks/BatchHeader.tsx
import { useTranslation } from 'react-i18next';

interface BatchHeaderProps {
  batchIndex: number;
  taskCount: number;
  isReady?: boolean;
}

export const BatchHeader: React.FC<BatchHeaderProps> = ({
  batchIndex,
  taskCount,
  isReady = true
}) => {
  const { t } = useTranslation();

  return (
    <div className="mb-4">
      <h3 className="text-lg font-semibold text-primary">
        {t('dailyTasks.batchLabel', { batch: batchIndex + 1 })}
      </h3>
      <p className="text-sm text-muted-foreground">
        {taskCount} {taskCount === 1 ? t('dailyTasks.accountLabel') : t('dailyTasks.accountsLabel')}
      </p>
      {isReady && (
        <div className="mt-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm text-green-800 dark:text-green-200">
              {t('dailyTasks.batchReady')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
