// src/pages/progress/AccountsDetailPage.tsx

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../components/ui/card';
import { LayoutToggle, Layout } from '../../components/molecules/LayoutToggle';
import { GameSelector } from '../../components/molecules/GameSelector';
import { BackButton } from '../../components/molecules/BackButton';
import { AccountsDataTable } from '../../components/tables/AccountsDataTable';

import { useAccounts } from '../../hooks/useAccounts';
import { useLevels } from '../../hooks/useLevels';
import { usePurchaseEvents } from '../../hooks/usePurchaseEvents';
import { ProgressProvider } from '../../components/progress/ProgressProvider';
import { TauriService } from '../../services/tauri.service';

import type { PurchaseEvent } from '../../types';

function parseDate(input?: string): Date | null {
  if (!input) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

function formatDateShort(date: Date | null): string {
  if (!date) return '-';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${date.getDate()}-${months[date.getMonth()]}`;
}

function daysBetween(start: Date, target: Date) {
  const ms = target.getTime() - start.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export default function AccountsDetailPage() {
  const { t } = useTranslation();
  const [layout, setLayout] = useState<Layout>('vertical');
  const [selectedGameId, setSelectedGameId] = useState<number | undefined>();

  const { accounts = [] } = useAccounts(selectedGameId);
  const { levels = [] } = useLevels(selectedGameId);
  const { events: purchaseEvents = [] } = usePurchaseEvents(selectedGameId);

  const [peDates, setPeDates] = useState<Record<string, string>>({});

  const columns = useMemo(() => {
    const levelCols = levels.map((l) => ({
      kind: 'level' as const,
      id: l.id,
      token: l.event_token,
      name: l.level_name,
      daysOffset: l.days_offset,
      timeSpent: l.time_spent,
      isBonus: l.is_bonus,
    }));

    const peCols = purchaseEvents.map((p: PurchaseEvent) => ({
      kind: 'purchase' as const,
      id: p.id,
      token: p.event_token,
      name: '$$$',
      isRestricted: (p as any).is_restricted ?? false,
      maxDaysOffset: p.max_days_offset != null ? `${t('purchaseEvents.lessThan')} ${p.max_days_offset}` : '-',
    }));

    return [...levelCols, ...peCols];
  }, [levels, purchaseEvents]);

  const matrix = useMemo(() => {
    return accounts.map((acc) => {
      const start = parseDate(acc.start_date);
      return columns.map((c) => {
        if (c.kind === 'level' && start) {
          return formatDateShort(addDays(start, Number(c.daysOffset || 0)));
        }
        return '-';
      });
    });
  }, [accounts, columns]);

  const handlePurchaseDateChange = async (accountId: number, peId: number, isoDate: string) => {
    const key = `${accountId}_${peId}`;
    setPeDates((prev) => ({ ...prev, [key]: isoDate }));

    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return;
    const start = parseDate(acc.start_date);
    const target = parseDate(isoDate);
    if (!start || !target) return;
    const daysOffset = daysBetween(start, target);

    try {
      await (TauriService as any).createPurchaseEventProgress({
        account_id: accountId,
        purchase_event_id: peId,
        days_offset: daysOffset,
        time_spent: 0,
      } as any);
      window.dispatchEvent(new CustomEvent('progress-updated', { detail: { accountId } }));
    } catch (err) {
      console.error('Failed to save purchase-event date/progress', err);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Accounts Detail</h2>

        <div className="flex gap-3">
          <LayoutToggle layout={layout} onLayoutChange={setLayout} />

          <GameSelector selectedGameId={selectedGameId} onGameChange={setSelectedGameId} />

          <BackButton />
        </div>
      </div>

      <Card>
        <CardContent className="overflow-auto">
          <ProgressProvider accounts={accounts}>
            {({ levelsProgress, purchaseProgress }) => (
              <AccountsDataTable
                accounts={accounts}
                columns={columns}
                matrix={matrix}
                layout={layout}
                peDates={peDates}
                onPurchaseDateChange={handlePurchaseDateChange}
                levelsProgress={levelsProgress}
                purchaseProgress={purchaseProgress}
              />
            )}
          </ProgressProvider>
        </CardContent>
      </Card>
    </div>
  );
}

