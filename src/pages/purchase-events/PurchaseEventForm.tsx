import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { PurchaseEvent, CreatePurchaseEventRequest, UpdatePurchaseEventRequest } from '../../types';

interface PurchaseEventFormProps {
  event?: PurchaseEvent | null;
  gameId: number;
  onSubmit: (request: CreatePurchaseEventRequest | UpdatePurchaseEventRequest) => Promise<void>;
  onClose: () => void;
}

export function PurchaseEventForm({ event, gameId, onSubmit, onClose }: PurchaseEventFormProps) {
  const { t } = useTranslation();
  const [eventToken, setEventToken] = useState(event?.event_token || '');
  const [isRestricted, setIsRestricted] = useState(event?.is_restricted || false);
  const [maxDaysOffset, setMaxDaysOffset] = useState(event?.max_days_offset?.toString() || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (event) {
      setEventToken(event.event_token);
      setIsRestricted(event.is_restricted);
      setMaxDaysOffset(event.max_days_offset?.toString() || '');
    }
  }, [event]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventToken.trim()) return;

    setLoading(true);
    try {
      if (event) {
        const request: UpdatePurchaseEventRequest = {
          id: event.id,
          event_token: eventToken,
          is_restricted: isRestricted,
          max_days_offset: maxDaysOffset ? parseInt(maxDaysOffset, 10) : null,
        };
        await onSubmit(request);
      } else {
        const request: CreatePurchaseEventRequest = {
          game_id: gameId,
          event_token: eventToken,
          is_restricted: isRestricted,
          max_days_offset: maxDaysOffset ? parseInt(maxDaysOffset, 10) : null,
        };
        await onSubmit(request);
      }
      onClose();
    } catch (err) {
      console.error('Failed to save purchase event', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{event ? t('purchaseEvents.editEvent') : t('purchaseEvents.addEvent')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="eventToken">{t('purchaseEvents.eventToken')}</Label>
              <Input
                id="eventToken"
                value={eventToken}
                onChange={(e) => setEventToken(e.target.value)}
                placeholder={t('purchaseEvents.eventTokenPlaceholder')}
                required
              />
            </div>

            {isRestricted && (
              <div className="space-y-2">
                <Label htmlFor="maxDaysOffset">{t('purchaseEvents.maxDaysOffset')}</Label>
                <Input
                  id="maxDaysOffset"
                  type="number"
                  value={maxDaysOffset}
                  onChange={(e) => setMaxDaysOffset(e.target.value)}
                  placeholder={t('purchaseEvents.maxDaysOffsetPlaceholder')}
                />
              </div>
            )}

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isRestricted"
                checked={isRestricted}
                onChange={(e) => setIsRestricted(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="isRestricted">{t('purchaseEvents.isRestricted')}</Label>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={loading || !eventToken.trim()}>
                {event ? t('common.update') : t('common.add')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

