// src/features/progress/PurchaseEventProgressList.tsx
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import type { PurchaseEvent } from '../../types';
import { useProgress } from '../../hooks/useProgress';
import { useTranslation } from 'react-i18next';

interface Props {
  accountId: number;
  purchaseEvents: PurchaseEvent[];
}

export function PurchaseEventProgressList({ accountId, purchaseEvents }: Props) {
  const { t } = useTranslation();
  const { purchaseProgress, createOrUpdatePurchaseProgress, updatePurchaseProgress, loading } = useProgress(accountId);

  const progMap = new Map(purchaseProgress.map(p => [p.purchase_event_id, p]));
  const [local, setLocal] = useState<Record<number, {days_offset: string; time_spent: string}>>({});

  const ensureAndOpen = async (ev: PurchaseEvent) => {
    // ensure progress row exists with default values (0,0)
    await createOrUpdatePurchaseProgress({
      account_id: accountId,
      purchase_event_id: ev.id,
      days_offset: progMap.get(ev.id)?.days_offset ?? 0,
      time_spent: progMap.get(ev.id)?.time_spent ?? 0,
    });
  };

  const save = async (ev: PurchaseEvent) => {
    const cur = local[ev.id];
    const days = cur?.days_offset !== undefined ? Number(cur.days_offset) : (progMap.get(ev.id)?.days_offset ?? 0);
    const time = cur?.time_spent !== undefined ? Number(cur.time_spent) : (progMap.get(ev.id)?.time_spent ?? 0);
    await updatePurchaseProgress({
      account_id: accountId,
      purchase_event_id: ev.id,
      days_offset: days,
      time_spent: time,
    });
  };

  return (
    <div>
      <h4 className="text-lg font-medium mb-2">{t('progress.purchaseTitle') ?? 'Purchase Events Progress'}</h4>
      {loading ? <div>{t('common.loading')}</div> : (
        <Card>
          <CardContent>
            <div className="space-y-3">
              {purchaseEvents.map(ev => {
                const p = progMap.get(ev.id);
                const d = local[ev.id]?.days_offset ?? String(p?.days_offset ?? '');
                const tval = local[ev.id]?.time_spent ?? String(p?.time_spent ?? '');
                return (
                  <div key={ev.id} className="flex items-center gap-4">
                    <div className="font-mono w-40">{ev.event_token}</div>
                    <div className="w-32">
                      <input
                        className="w-full border rounded px-2 py-1"
                        placeholder="Days"
                        value={d}
                        onChange={e => setLocal(prev => ({ ...prev, [ev.id]: { ...(prev[ev.id]||{days_offset:'',time_spent:''}), days_offset: e.target.value } }))}
                      />
                    </div>
                    <div className="w-32">
                      <input
                        className="w-full border rounded px-2 py-1"
                        placeholder="Seconds"
                        value={tval}
                        onChange={e => setLocal(prev => ({ ...prev, [ev.id]: { ...(prev[ev.id]||{days_offset:'',time_spent:''}), time_spent: e.target.value } }))}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => ensureAndOpen(ev)} variant="outline">{t('progress.ensure') ?? 'Ensure'}</Button>
                      <Button onClick={() => save(ev)}>{t('common.save')}</Button>
                    </div>
                    <div className="ml-auto text-sm text-muted-foreground">
                      {p?.is_completed ? (t('common.yes') ?? 'Yes') : (t('common.no') ?? 'No')}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
