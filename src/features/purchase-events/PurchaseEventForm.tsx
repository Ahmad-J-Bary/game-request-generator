// src/features/purchase-events/PurchaseEventForm.tsx

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { ArrowLeft } from 'lucide-react';
import type { PurchaseEvent, CreatePurchaseEventRequest, UpdatePurchaseEventRequest } from '../../types';
import { toast } from 'sonner';

interface Props {
  event?: PurchaseEvent | null;
  gameId: number;
  onSubmit: (req: CreatePurchaseEventRequest | UpdatePurchaseEventRequest) => Promise<void>;
  onClose: () => void;
}

export function PurchaseEventForm({ event, gameId, onSubmit, onClose }: Props) {
  const { t } = useTranslation();

  const [eventToken, setEventToken] = useState(event?.event_token ?? '');
  const [isRestricted, setIsRestricted] = useState<boolean>(!!event?.is_restricted);
  const [maxDaysOffset, setMaxDaysOffset] = useState(
    event?.max_days_offset?.toString() ?? ''
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!eventToken.trim()) {
      toast.error(t('purchaseEvents.errors.emptyToken'));
      return;
    }

    if (isRestricted && maxDaysOffset === '') {
      toast.error(t('purchaseEvents.errors.missingMaxDays'));
      return;
    }

    setLoading(true);
    try {
      if (event) {
        await onSubmit({
          id: event.id,
          event_token: eventToken,
          is_restricted: isRestricted,
          max_days_offset: isRestricted ? Number(maxDaysOffset) : null,
        });
      } else {
        await onSubmit({
          game_id: gameId,
          event_token: eventToken,
          is_restricted: isRestricted,
          max_days_offset: isRestricted ? Number(maxDaysOffset) : null,
        });
      }
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onClose}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t('common.back')}
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>
            {event ? t('purchaseEvents.editEvent') : t('purchaseEvents.addEvent')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('purchaseEvents.eventToken')}</Label>
              <Input
                value={eventToken}
                onChange={e => setEventToken(e.target.value)}
                required
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isRestricted}
                onChange={e => setIsRestricted(e.target.checked)}
              />
              <Label>{t('purchaseEvents.isRestricted')}</Label>
            </div>

            {isRestricted && (
              <div className="space-y-2">
                <Label>{t('purchaseEvents.maxDaysOffset')}</Label>
                <Input
                  type="number"
                  min="0"
                  value={maxDaysOffset}
                  onChange={e => setMaxDaysOffset(e.target.value)}
                />
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? t('common.loading') : t('common.save')}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
