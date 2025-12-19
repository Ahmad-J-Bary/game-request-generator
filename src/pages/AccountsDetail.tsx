// src/pages/AccountsDetail.tsx
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { useGames } from '../hooks/useGames';
import { useAccounts } from '../hooks/useAccounts';
import { useLevels } from '../hooks/useLevels';

type Layout = 'vertical' | 'horizontal';

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

function formatTime12(timeStr?: string, dateStr?: string): string {
  if (!timeStr) return '-';
  try {
    let d: Date;
    if (dateStr) {
      d = new Date(`${dateStr}T${timeStr}`);
      if (Number.isNaN(d.getTime())) {
        const parts = timeStr.split(':');
        const now = new Date();
        d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(parts[0]), Number(parts[1] || 0));
      }
    } else {
      const parts = timeStr.split(':');
      const now = new Date();
      d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(parts[0]), Number(parts[1] || 0));
    }
    let hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const mm = minutes.toString().padStart(2, '0');
    return `${hours}:${mm} ${ampm}`;
  } catch {
    return timeStr;
  }
}

export default function AccountsDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [layout, setLayout] = useState<Layout>('vertical');
  const { games } = useGames();
  const [selectedGameId, setSelectedGameId] = useState<number | undefined>();

  const { accounts = [], loading: accountsLoading } = useAccounts(selectedGameId);
  const { levels = [], loading: levelsLoading } = useLevels(selectedGameId);

  useEffect(() => {
    if (games.length > 0 && !selectedGameId) {
      setSelectedGameId(games[0].id);
    }
  }, [games, selectedGameId]);

  const accountDates = useMemo(() => {
    return accounts.map((acc) => {
      const startDateObj = parseDateFlexible(acc.start_date ?? '') || null;
      return levels.map((l) => {
        if (!startDateObj) return '-';
        const dd = addDays(startDateObj, Number(l.days_offset || 0));
        return formatDateShort(dd);
      });
    });
  }, [accounts, levels]);

  const loading = accountsLoading || levelsLoading;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t('accounts.detailTitle') ?? 'Accounts Detail'}</h2>
          <p className="text-sm text-muted-foreground">{t('accounts.detailSubtitle') ?? 'عرض تفصيلي لمستويات الحسابات (Vertical / Horizontal)'}</p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={layout} onValueChange={(v) => setLayout(v as Layout)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t('levels.view') ?? 'View'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vertical">Vertical</SelectItem>
              <SelectItem value="horizontal">Horizontal</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedGameId?.toString()} onValueChange={(v) => setSelectedGameId(Number(v))}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('accounts.selectGame') ?? 'Select game'} />
            </SelectTrigger>
            <SelectContent>
              {games.map((g) => (
                <SelectItem key={g.id} value={g.id.toString()}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('common.back') ?? 'Back'}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="overflow-auto">
          {loading ? (
            <div className="py-8 text-center">{t('common.loading') ?? 'Loading...'}</div>
          ) : !selectedGameId ? (
            <div className="py-8 text-center text-muted-foreground">{t('games.noGames') ?? 'No games'}</div>
          ) : levels.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">{t('levels.noLevels') ?? 'No levels'}</div>
          ) : accounts.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">{t('accounts.noAccounts') ?? 'No accounts'}</div>
          ) : layout === 'vertical' ? (
            <Table>
              <TableHeader>
                {/* Event Token row: label spans 3 cols (for Account Name / Date / Time), then level tokens */}
                <TableRow>
                  <TableHead colSpan={3}>Event Token</TableHead>
                  {levels.map((l) => (
                    <TableHead key={l.id} className="text-center font-mono">{l.event_token}</TableHead>
                  ))}
                </TableRow>

                {/* Level Name row */}
                <TableRow>
                  <TableHead colSpan={3}>{t('levels.levelName') ?? 'Level Name'}</TableHead>
                  {levels.map((l) => (
                    <TableHead key={l.id} className="text-center">{l.level_name}</TableHead>
                  ))}
                </TableRow>

                {/* Days Offset row */}
                <TableRow>
                  <TableHead colSpan={3}>{t('levels.daysOffset') ?? 'Days Offset'}</TableHead>
                  {levels.map((l) => (
                    <TableHead key={l.id} className="text-center">{l.days_offset}</TableHead>
                  ))}
                </TableRow>

                {/* Time Spent row */}
                <TableRow>
                  <TableHead colSpan={3}>{t('levels.timeSpent') ?? 'Time Spent (seconds)'}</TableHead>
                  {levels.map((l) => (
                    <TableHead key={l.id} className="text-center">{l.time_spent}</TableHead>
                  ))}
                </TableRow>

                {/* Separator header row for accounts: Account Name | Date | Time (alone in its row),
                    then empty headers to align with levels columns */}
                <TableRow>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  {levels.map((l) => (
                    <TableHead key={l.id} /> // empty header cells to keep column alignment
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                {accounts.map((acc, idx) => {
                  const dates = accountDates[idx] ?? [];
                  const startDateObj = parseDateFlexible(acc.start_date ?? '') || null;
                  const displayStartDate = formatDateShort(startDateObj);
                  const displayTime = formatTime12(acc.start_time, acc.start_date);
                  return (
                    <TableRow key={acc.id}>
                      <TableCell>{`${acc.name}`}</TableCell>
                      <TableCell className="whitespace-nowrap">{displayStartDate}</TableCell>
                      <TableCell className="whitespace-nowrap">{displayTime}</TableCell>
                      {dates.map((d, j) => (
                        <TableCell key={j} className="text-center">{d}</TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            // =======================
            // Horizontal layout
            // =======================
            <Table>
            <TableHeader>
                {/* Row 1 */}
                <TableRow>
                <TableHead>Event Token</TableHead>
                <TableHead>Level Name</TableHead>
                <TableHead>Days Offset</TableHead>
                <TableHead>Time Spent (seconds)</TableHead>
                <TableHead>Account Name</TableHead>

                {accounts.map((acc, i) => (
                    <TableHead key={acc.id} className="text-center">
                    {`${i + 1}- ${acc.name}`}
                    </TableHead>
                ))}
                </TableRow>

                {/* Row 2 */}
                <TableRow>
                <TableHead />
                <TableHead />
                <TableHead />
                <TableHead />
                <TableHead>Date</TableHead>

                {accounts.map((acc) => {
                    const d = parseDateFlexible(acc.start_date ?? '');
                    return (
                    <TableHead key={acc.id} className="text-center">
                        {formatDateShort(d)}
                    </TableHead>
                    );
                })}
                </TableRow>

                {/* Row 3 */}
                <TableRow>
                <TableHead />
                <TableHead />
                <TableHead />
                <TableHead />
                <TableHead>Time</TableHead>

                {accounts.map((acc) => (
                    <TableHead key={acc.id} className="text-center">
                    {acc.start_time}
                    </TableHead>
                ))}
                </TableRow>
            </TableHeader>

            <TableBody>
                {levels.map((l, levelIdx) => (
                <TableRow key={l.id}>
                    <TableCell className="font-mono">{l.event_token}</TableCell>
                    <TableCell>{l.level_name}</TableCell>
                    <TableCell>{l.days_offset}</TableCell>
                    <TableCell>{l.time_spent}</TableCell>

                    {/* Empty cell under Account Name / Date / Time column */}
                    <TableCell />

                    {accounts.map((_, accIdx) => (
                    <TableCell key={accIdx} className="text-center">
                        {accountDates[accIdx]?.[levelIdx] ?? '-'}
                    </TableCell>
                    ))}
                </TableRow>
                ))}
            </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
