// src/pages/PurchaseEventDetail.tsx

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { useTranslation } from 'react-i18next';
import { TauriService } from '../services/tauri.service';
import type { PurchaseEvent } from '../types';
import { Button } from '../components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function PurchaseEventDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> {t('common.back')}
        </Button>
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
