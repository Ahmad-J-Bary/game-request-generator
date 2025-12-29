// src/components/daily-tasks/EmptyState.tsx
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { Card, CardContent } from '../ui/card';

export const EmptyState: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="p-8 text-center">
        <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">{t('dailyTasks.noTasks')}</h3>
        <p className="text-muted-foreground mb-4">
          {t('dailyTasks.noTasksDescription')}
        </p>
      </CardContent>
    </Card>
  );
};
