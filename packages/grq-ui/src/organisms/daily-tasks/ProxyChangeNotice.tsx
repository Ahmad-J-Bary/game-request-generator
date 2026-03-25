// src/components/daily-tasks/ProxyChangeNotice.tsx
import { useTranslation } from 'react-i18next';

export const ProxyChangeNotice: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
        <h4 className="font-semibold text-yellow-800 dark:text-yellow-200">
          {t('dailyTasks.proxyChangeTitle', 'Proxy Change Required')}
        </h4>
      </div>
      <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
        {t('dailyTasks.proxyChangeMessage', 'Please change your proxy settings before proceeding to the next batch.')}
      </p>
    </div>
  );
};
