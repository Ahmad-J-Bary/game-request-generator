// src/features/accounts/AccountDetail.tsx
import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { Level, Account, PurchaseEvent } from '../../types';
import { useAccounts } from '../../hooks/useAccounts';
import { useLevels } from '../../hooks/useLevels';
import { usePurchaseEvents } from '../../hooks/usePurchaseEvents';
import { AccountLevelProgressList } from '../progress/AccountLevelProgressList';
import { PurchaseEventProgressList } from '../progress/PurchaseEventProgressList';
import { cn } from '../../lib/utils';

type Layout = 'horizontal' | 'vertical';

function parseDateFlexible(input: string): Date | null {
  if (!input) return null;
  // try native parse (ISO etc.)
  const d = new Date(input);
  if (!Number.isNaN(d.getTime())) return d;
  // try D-MMM like "5-Dec"
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
  // try dd/mm/yyyy
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

export function AccountDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();

  // fast-path state
  const state = (location.state as any) || {};
  const stateAccount: Account | undefined = state.account;
  const stateLevels: Level[] | undefined = state.levels;

  // fetch accounts (fallback)
  const { accounts } = useAccounts(undefined as any);
  const account = stateAccount ?? accounts?.find((a) => String(a.id) === String(id));
  const gameIdForLevels = account?.game_id ?? undefined;

  // levels + purchase events for the game
  const { levels: fetchedLevels = [] } = useLevels(gameIdForLevels);
  const { events: purchaseEvents = [] } = usePurchaseEvents(gameIdForLevels);

  const levels = stateLevels ?? fetchedLevels;

  const [layout, setLayout] = useState<Layout>('vertical');

  const startDateObj = useMemo(() => {
    return parseDateFlexible(account?.start_date ?? '') || new Date();
  }, [account]);

  // computed date for each level (for this account)
  const computedLevelDates = useMemo(() => {
    return levels.map((l) => {
      const dd = addDays(startDateObj, Number(l.days_offset || 0));
      return formatDateShort(dd);
    });
  }, [levels, startDateObj]);

  if (!account) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> {t('common.back') ?? 'Back'}
        </Button>
        <Card>
          <CardContent className="p-6 text-center">Account not found</CardContent>
        </Card>
      </div>
    );
  }

  /**
   * columns: levels first, then purchase events
   */
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
      maxDaysOffset: p.max_days_offset != null ? `Less Than ${p.max_days_offset}` : null,
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
          <Select value={layout} onValueChange={(v) => setLayout(v as Layout)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t('levels.view') ?? 'View'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="horizontal">{t('levels.viewHorizontal') ?? 'Horizontal'}</SelectItem>
              <SelectItem value="vertical">{t('levels.viewVertical') ?? 'Vertical'}</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> {t('common.back') ?? 'Back'}
          </Button>
        </div>
      </div>

      {/* Combined table */}
      <Card>
        <CardContent className="overflow-auto">
          {columns.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No levels or purchase events</div>
          ) : layout === 'horizontal' ? (
            // Horizontal: rows = each column (level or purchase event), last column = account date (for levels)
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('levels.eventToken') ?? 'Event Token'}</TableHead>
                  <TableHead>{t('levels.levelName') ?? 'Level Name'}</TableHead>
                  <TableHead>{t('levels.daysOffset') ?? 'Days Offset'}</TableHead>
                  <TableHead>{t('levels.timeSpent') ?? 'Time Spent (seconds)'}</TableHead>
                  <TableHead>{'Account Date'}</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {columns.map((col, idx) => {
                  const colorClass =
                    col.kind === 'level'
                      ? col.isBonus ? 'bg-green-50' : 'bg-blue-50'
                      : col.isRestricted ? 'bg-yellow-50' : 'bg-gray-50';

                  return (
                    <TableRow key={`${col.kind}-${col.id}`}>
                      <TableCell className={cn('font-mono', colorClass)}>{col.token}</TableCell>

                      <TableCell className={colorClass}>
                        {col.kind === 'level' ? col.name : col.name}
                      </TableCell>

                      <TableCell className={cn('text-center', colorClass)}>
                        {col.kind === 'level' ? col.daysOffset : (col.isRestricted ? (col.maxDaysOffset ?? 'less than') : '-')}
                      </TableCell>

                      <TableCell className={cn('text-center', colorClass)}>
                        {col.kind === 'level' ? col.timeSpent : '-'}
                      </TableCell>

                      <TableCell className={cn('text-center', colorClass)}>
                        {col.kind === 'level' ? computedLevelDates[idx] : '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            // Vertical pivot: labels at first column, columns = tokens
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('levels.eventToken') ?? 'Event Token'}</TableHead>
                  {columns.map((col) => (
                    <TableHead
                      key={`${col.kind}-${col.id}`}
                      className={cn('text-center font-mono',
                        col.kind === 'level' ? (col.isBonus ? 'bg-green-50' : 'bg-blue-50') :
                        (col.isRestricted ? 'bg-yellow-50' : 'bg-gray-50')
                      )}
                    >
                      {col.token}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                <TableRow>
                  <TableHead>{t('levels.levelName')}</TableHead>
                  {columns.map((col) => (
                    <TableCell
                      key={`name-${col.kind}-${col.id}`}
                      className={cn('text-center',
                        col.kind === 'level' ? (col.isBonus ? 'bg-green-50' : 'bg-blue-50') :
                        (col.isRestricted ? 'bg-yellow-50' : 'bg-gray-50')
                      )}
                    >
                      {col.kind === 'level' ? col.name : col.name}
                    </TableCell>
                  ))}
                </TableRow>

                <TableRow>
                  <TableHead>{t('levels.daysOffset') ?? 'Days Offset'}</TableHead>
                  {columns.map((col) => (
                    <TableCell
                      key={`offset-${col.kind}-${col.id}`}
                      className={cn('text-center',
                        col.kind === 'level' ? (col.isBonus ? 'bg-green-50' : 'bg-blue-50') :
                        (col.isRestricted ? 'bg-yellow-50' : 'bg-gray-50')
                      )}
                    >
                      {col.kind === 'level' ? col.daysOffset : (col.isRestricted ? (col.maxDaysOffset ?? 'less than') : '-')}
                    </TableCell>
                  ))}
                </TableRow>

                <TableRow>
                  <TableHead>{t('levels.timeSpent') ?? 'Time Spent (seconds)'}</TableHead>
                  {columns.map((col) => (
                    <TableCell
                      key={`time-${col.kind}-${col.id}`}
                      className={cn('text-center',
                        col.kind === 'level' ? (col.isBonus ? 'bg-green-50' : 'bg-blue-50') :
                        (col.isRestricted ? 'bg-yellow-50' : 'bg-gray-50')
                      )}
                    >
                      {col.kind === 'level' ? col.timeSpent : '-'}
                    </TableCell>
                  ))}
                </TableRow>

                <TableRow>
                  <TableHead>{'Account Date'}</TableHead>
                  {columns.map((col, idx) => (
                    <TableCell
                      key={`accdate-${col.kind}-${col.id}`}
                      className={cn('text-center',
                        col.kind === 'level' ? (col.isBonus ? 'bg-green-50' : 'bg-blue-50') :
                        (col.isRestricted ? 'bg-yellow-50' : 'bg-gray-50')
                      )}
                    >
                      {col.kind === 'level' ? computedLevelDates[idx] : '-'}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Progress lists */}
      <div className="grid gap-4 md:grid-cols-2">
        <AccountLevelProgressList accountId={account.id} levels={levels} />
        <PurchaseEventProgressList accountId={account.id} purchaseEvents={purchaseEvents as PurchaseEvent[]} />
      </div>
    </div>
  );
}
