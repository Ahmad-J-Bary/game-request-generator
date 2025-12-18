import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import type { PurchaseEvent, CreatePurchaseEventRequest, UpdatePurchaseEventRequest } from '../../types';

interface PurchaseEventFormProps {
  accountId: number;
  event?: PurchaseEvent;
  onSubmit: (request: CreatePurchaseEventRequest | UpdatePurchaseEventRequest) => Promise<void>;
  onCancel: () => void;
}

export function PurchaseEventForm({ accountId, event, onSubmit, onCancel }: PurchaseEventFormProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    event_token: event?.event_token || '',
    event_name: event?.event_name || '',
    target_date: event?.target_date || new Date().toISOString().split('T')[0],
    time_spent: event?.time_spent || 0,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (event) {
      setFormData({
        event_token: event.event_token,
        event_name: event.event_name,
        target_date: event.target_date,
        time_spent: event.time_spent,
      });
    }
  }, [event]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (event) {
        await onSubmit({
          id: event.id,
          ...formData,
        } as UpdatePurchaseEventRequest);
      } else {
        await onSubmit({
          account_id: accountId,
          ...formData,
        } as CreatePurchaseEventRequest);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="event_token">{t('purchaseEvents.eventToken')}</Label>
        <Input
          id="event_token"
          value={formData.event_token}
          onChange={(e) => setFormData({ ...formData, event_token: e.target.value })}
          placeholder={t('purchaseEvents.eventTokenPlaceholder')}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="event_name">{t('purchaseEvents.eventName')}</Label>
        <Input
          id="event_name"
          value={formData.event_name}
          onChange={(e) => setFormData({ ...formData, event_name: e.target.value })}
          placeholder={t('purchaseEvents.eventNamePlaceholder')}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="target_date">{t('purchaseEvents.targetDate')}</Label>
        <Input
          id="target_date"
          type="date"
          value={formData.target_date}
          onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="time_spent">{t('purchaseEvents.timeSpent')}</Label>
        <Input
          id="time_spent"
          type="number"
          value={formData.time_spent}
          onChange={(e) => setFormData({ ...formData, time_spent: parseInt(e.target.value) || 0 })}
          placeholder={t('purchaseEvents.timeSpentPlaceholder')}
          required
          min="0"
        />
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? t('common.saving') : event ? t('common.update') : t('common.add')}
        </Button>
      </div>
    </form>
  );
}