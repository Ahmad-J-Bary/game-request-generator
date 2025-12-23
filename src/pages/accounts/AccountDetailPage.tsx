// src/pages/accounts/AccountDetailPage.tsx

import { useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../components/ui/card';
import { LayoutToggle, Layout } from '../../components/molecules/LayoutToggle';
import { BackButton } from '../../components/molecules/BackButton';
import { Level, Account, PurchaseEvent } from '../../types';
import { useAccounts } from '../../hooks/useAccounts';
import { useLevels } from '../../hooks/useLevels';
import { usePurchaseEvents } from '../../hooks/usePurchaseEvents';
import { useProgress } from '../../hooks/useProgress';
import { AccountLevelProgressList } from '../../components/progress/AccountLevelProgressList';
import { PurchaseEventProgressList } from '../../components/progress/PurchaseEventProgressList';
import { AccountDataTable } from '../../components/tables/AccountDataTable';

function parseDateFlexible(input: string): Date | null {
  if (!input) return null;
  const d = new Date(input);
  if (!Number.isNaN(d.getTime())) return d;
  const m = input.trim().match(/^(\d{1,2})-([A-Za-z]{3,})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const monStr = m[2].toLowerCase();
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const monthIndex = months.indexOf(monStr);
    if (monthIndex >= 0) {
      const now = new Date();
      const year = now.getFullYear();
      return new Date(year, monthIndex, day);
    }
  }
  const parts = input.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

function formatDateShort(date: Date | null): string {
  if (!date) return '-';
  const day = date.getDate();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mon = months[date.getMonth()];
  return `${day}-${mon}`;
}

export default function AccountDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();

  const state = (location.state as any) || {};
  const stateAccount: Account | undefined = state.account;
  const stateLevels: Level[] | undefined = state.levels;

  const { accounts } = useAccounts(undefined as any);
  const account = stateAccount ?? accounts?.find((a) => String(a.id) === String(id));
  const gameIdForLevels = account?.game_id ?? undefined;

  const { levels: fetchedLevels = [] } = useLevels(gameIdForLevels);
  const { events: purchaseEvents = [] } = usePurchaseEvents(gameIdForLevels);

  // الحصول على بيانات التقدم
  const accountId = parseInt(id || '0', 10);
  const { levelsProgress, purchaseProgress } = useProgress(accountId);

  const levels = stateLevels ?? fetchedLevels;

  const [layout, setLayout] = useState<Layout>('vertical');

  const startDateObj = useMemo(() => {
    return parseDateFlexible(account?.start_date ?? '') || new Date();
  }, [account]);

  const computedLevelDates = useMemo(() => {
    return levels.map((l) => {
      const dd = addDays(startDateObj, Number(l.days_offset || 0));
      return formatDateShort(dd);
    });
  }, [levels, startDateObj]);

  if (!account) {
    return (
      <div className="p-6">
        <div className="mb-4">
          <BackButton />
        </div>
        <Card>
          <CardContent className="p-6 text-center">Account not found</CardContent>
        </Card>
      </div>
    );
  }

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

    const purchaseCols = purchaseEvents.map((p) => ({
      kind: 'purchase' as const,
      id: p.id,
      token: p.event_token,
      name: '$$$',
      isRestricted: p.is_restricted,
      maxDaysOffset: p.max_days_offset != null ? `${t('purchaseEvents.lessThan')} ${p.max_days_offset}` : null,
    }));

    return [...levelCols, ...purchaseCols];
  }, [levels, purchaseEvents]);

  return (
    <div className="p-6 space-y-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{account.name}</h2>
          <div className="text-sm text-muted-foreground">
            {account.start_date} • {account.start_time}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <LayoutToggle layout={layout} onLayoutChange={setLayout} />
          <BackButton />
        </div>
      </div>

      <Card>
        <CardContent className="overflow-auto">
          <AccountDataTable
            columns={columns}
            computedLevelDates={computedLevelDates}
            layout={layout}
            levelsProgress={levelsProgress}
            purchaseProgress={purchaseProgress}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <AccountLevelProgressList accountId={account.id} levels={levels} />
        <PurchaseEventProgressList accountId={account.id} purchaseEvents={purchaseEvents as PurchaseEvent[]} />
      </div>
    </div>
  );
}