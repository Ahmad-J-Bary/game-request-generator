import { Card, CardContent } from '../components/ui/card';
import { useTranslation } from 'react-i18next';

export default function Events() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{t('events.title')}</h2>
      </div>

      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t('events.noEvents')}
        </CardContent>
      </Card>
    </div>
  );
}