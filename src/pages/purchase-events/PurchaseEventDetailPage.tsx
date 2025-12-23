import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { useTranslation } from 'react-i18next';
import { TauriService } from '../../services/tauri.service';
import type { PurchaseEvent } from '../../types';
import { BackButton } from '../../components/molecules/BackButton';

export default function PurchaseEventDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<PurchaseEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const ev = await TauriService.getPurchaseEventById(Number(id));
        setEvent(ev);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <div className="p-6">
      <div className="mb-4">
        <BackButton />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('purchaseEvents.detail') ?? 'Purchase Event Detail'}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div>{t('common.loading')}</div>
          ) : !event ? (
            <div>Not found</div>
          ) : (
            <div>
              <p><strong>{t('purchaseEvents.eventToken')}:</strong> {event.event_token}</p>
              <p><strong>{t('purchaseEvents.isRestricted')}:</strong> {event.is_restricted ? 'Yes' : 'No'}</p>
              <p><strong>{t('purchaseEvents.maxDaysOffset')}:</strong> {event.max_days_offset ?? '-'}</p>
              <p><strong>{t('common.createdAt')}:</strong> {event.created_at ?? '-'}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

