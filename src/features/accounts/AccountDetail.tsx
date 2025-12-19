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
import { Level, Account } from '../../types';
import { useAccounts } from '../../hooks/useAccounts';
import { useLevels } from '../../hooks/useLevels';

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

function formatDateShort(date: Date): string {
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

  // try to get account & levels from location.state (fast path)
  const state = (location.state as any) || {};
  const stateAccount: Account | undefined = state.account;
  const stateLevels: Level[] | undefined = state.levels;

  // Fallback: fetch via hooks (we assume useAccounts/useLevels accept a gameId)
  // We don't know the gameId yet — so we attempt to find the account by searching accounts across the selected game if possible.
  // For simplicity, try to fetch accounts with no selected game (may depend on your hook implementation).
  const { accounts } = useAccounts(undefined as any); // if your hook requires param, adapt accordingly
  // find account by id if not in state
  const account = stateAccount ?? accounts?.find((a) => String(a.id) === String(id));

  // fetch levels for the account's game if stateLevels not provided
  const gameIdForLevels = (account && (account.game_id)) || undefined;
  const { levels: fetchedLevels = [] } = useLevels(gameIdForLevels);

  const levels = stateLevels ?? fetchedLevels;

  const [layout, setLayout] = useState<Layout>('vertical');

  const startDateObj = useMemo(() => {
    return parseDateFlexible(account?.start_date ?? '') || new Date();
  }, [account]);

  const computedDates = useMemo(() => {
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

  return (
    <div className="p-6">
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

      <Card>
        <CardContent className="overflow-auto">
          {levels.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No levels</div>
          ) : layout === 'horizontal' ? (
            // Horizontal: rows = levels; extra column Account Dates
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('levels.eventToken') ?? 'Event Token'}</TableHead>
                  <TableHead>{t('levels.levelName') ?? 'Level Name'}</TableHead>
                  <TableHead>{t('levels.daysOffset') ?? 'Days Offset'}</TableHead>
                  <TableHead>{t('levels.timeSpent') ?? 'Time Spent (seconds)'}</TableHead>
                  <TableHead>{'Account Dates'}</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {levels.map((l, idx) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono">{l.event_token}</TableCell>
                    <TableCell>{l.level_name}</TableCell>
                    <TableCell>{l.days_offset}</TableCell>
                    <TableCell>{l.time_spent}</TableCell>
                    <TableCell>{computedDates[idx]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            // Vertical / pivot: first column labels, columns = levels
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('levels.eventToken')}</TableHead>
                  {levels.map((l) => (
                    <TableHead key={l.id} className="text-center font-mono">
                      {l.event_token}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                <TableRow>
                  <TableHead>{t('levels.levelName')}</TableHead>
                  {levels.map((l) => (
                    <TableCell key={l.id} className="text-center">
                      {l.level_name}
                    </TableCell>
                  ))}
                </TableRow>

                <TableRow>
                  <TableHead>{t('levels.daysOffset') ?? 'Days Offset'}</TableHead>
                  {levels.map((l) => (
                    <TableCell key={l.id} className="text-center">
                      {l.days_offset}
                    </TableCell>
                  ))}
                </TableRow>

                <TableRow>
                  <TableHead>{t('levels.timeSpent') ?? 'Time Spent (seconds)'}</TableHead>
                  {levels.map((l) => (
                    <TableCell key={l.id} className="text-center">
                      {l.time_spent}
                    </TableCell>
                  ))}
                </TableRow>

                <TableRow>
                  <TableHead>{'Account Dates'}</TableHead>
                  {computedDates.map((d, idx) => (
                    <TableCell key={idx} className="text-center">
                      {d}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
