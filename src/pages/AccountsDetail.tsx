// src/pages/AccountsDetail.tsx
import { useEffect, useMemo, useState } from 'react';
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
import { usePurchaseEvents } from '../hooks/usePurchaseEvents';
import { TauriService } from '../services/tauri.service';

import type { PurchaseEvent } from '../types';

type Layout = 'vertical' | 'horizontal';

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

export default function AccountsDetail() {
  const navigate = useNavigate();
  const [layout, setLayout] = useState<Layout>('vertical');

  const { games } = useGames();
  const [selectedGameId, setSelectedGameId] = useState<number | undefined>();

  const { accounts = [] } = useAccounts(selectedGameId);
  const { levels = [] } = useLevels(selectedGameId);
  const { events: purchaseEvents = [] } = usePurchaseEvents(selectedGameId);

  // local editable state for purchase-event dates per (accountId, purchaseEventId)
  const [peDates, setPeDates] = useState<Record<string, string>>({});

  useEffect(() => {
    if (games.length && !selectedGameId) setSelectedGameId(games[0].id);
  }, [games, selectedGameId]);

  const columns = useMemo(() => {
    const levelCols = levels.map((l) => ({
      kind: 'level' as const,
      id: l.id,
      token: l.event_token,
      name: l.level_name,
      daysOffset: l.days_offset,
      timeSpent: l.time_spent,
      color: l.is_bonus ? 'bg-green-50' : 'bg-blue-50',
    }));

    const peCols = purchaseEvents.map((p: PurchaseEvent) => ({
      kind: 'purchase' as const,
      id: p.id,
      token: p.event_token,
      name: '$$$',
      isRestricted: (p as any).is_restricted ?? false,
      maxDaysOffset: p.max_days_offset != null ? `Less Than ${p.max_days_offset}` : '-',
      color: (p as any).is_restricted ? 'bg-yellow-50' : 'bg-gray-50',
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
      // Save progress (create or update) via Tauri. Cast to any if types not defined.
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
      {/* header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Accounts Detail</h2>

        <div className="flex gap-3">
          <Select value={layout} onValueChange={(v) => setLayout(v as Layout)}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="vertical">Vertical</SelectItem>
              <SelectItem value="horizontal">Horizontal</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={selectedGameId?.toString()}
            onValueChange={(v) => setSelectedGameId(Number(v))}
          >
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Select Game" /></SelectTrigger>
            <SelectContent>
              {games.map((g) => <SelectItem key={g.id} value={g.id.toString()}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </div>
      </div>

      {/* table */}
      <Card>
        <CardContent className="overflow-auto">
          {layout === 'vertical' ? (
            /* VERTICAL */
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead colSpan={3}>Event Token</TableHead>
                  {columns.map((c) => (
                    <TableHead key={c.id} className={`text-center font-mono ${c.color}`}>{c.token}</TableHead>
                  ))}
                </TableRow>

                <TableRow>
                  <TableHead colSpan={3}>Level Name</TableHead>
                  {columns.map((c) => (
                    <TableHead key={c.id} className={`text-center ${c.color}`}>{c.name}</TableHead>
                  ))}
                </TableRow>

                <TableRow>
                  <TableHead colSpan={3}>Days Offset</TableHead>
                  {columns.map((c) => (
                    <TableHead key={c.id} className={`text-center ${c.color}`}>{c.kind === 'level' ? c.daysOffset : c.maxDaysOffset}</TableHead>
                  ))}
                </TableRow>

                <TableRow>
                  <TableHead colSpan={3}>Time Spent (seconds)</TableHead>
                  {columns.map((c) => (
                    <TableHead key={c.id} className={`text-center ${c.color}`}>{c.kind === 'level' ? c.timeSpent : '-'}</TableHead>
                  ))}
                </TableRow>

                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  {columns.map((c) => <TableHead key={c.id} />)}
                </TableRow>
              </TableHeader>

              <TableBody>
                {accounts.map((acc, accIdx) => (
                  <TableRow key={acc.id}>
                    <TableCell>{acc.name}</TableCell>
                    <TableCell>{formatDateShort(parseDate(acc.start_date))}</TableCell>
                    <TableCell>{acc.start_time}</TableCell>

                    {columns.map((c, colIdx) => {
                      if (c.kind === 'purchase') {
                        const key = `${acc.id}_${c.id}`;
                        return (
                          <TableCell key={colIdx} className="text-center">
                            <input
                              type="date"
                              className="border rounded px-1 text-xs"
                              value={peDates[key] ?? ''}
                              onChange={(e) => handlePurchaseDateChange(acc.id, c.id, e.target.value)}
                            />
                          </TableCell>
                        );
                      }
                      return <TableCell key={colIdx} className="text-center">{matrix[accIdx][colIdx]}</TableCell>;
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            /* HORIZONTAL - now with Date & Time header rows under Accounts */
            <Table>
              <TableHeader>
                {/* main header row: columns + accounts as headers */}
                <TableRow>
                  <TableHead>Event Token</TableHead>
                  <TableHead>Level Name</TableHead>
                  <TableHead>Days Offset</TableHead>
                  <TableHead>Time Spent</TableHead>
                  <TableHead>Account</TableHead>

                  {accounts.map((a) => <TableHead key={a.id} className="text-center">{a.name}</TableHead>)}
                </TableRow>

                {/* Date row under accounts */}
                <TableRow>
                  <TableHead />
                  <TableHead />
                  <TableHead />
                  <TableHead />
                  <TableHead>Date</TableHead>

                  {accounts.map((a) => (
                    <TableHead key={a.id} className="text-center">
                      {formatDateShort(parseDate(a.start_date))}
                    </TableHead>
                  ))}
                </TableRow>

                {/* Time row under accounts */}
                <TableRow>
                  <TableHead />
                  <TableHead />
                  <TableHead />
                  <TableHead />
                  <TableHead>Time</TableHead>

                  {accounts.map((a) => (
                    <TableHead key={a.id} className="text-center">
                      {a.start_time}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                {columns.map((c, colIdx) => (
                  <TableRow key={c.id}>
                    <TableCell className={`font-mono ${c.color}`}>{c.token}</TableCell>
                    <TableCell className={c.color}>{c.name}</TableCell>
                    <TableCell className={c.color}>{c.kind === 'level' ? c.daysOffset : c.maxDaysOffset}</TableCell>
                    <TableCell className={c.color}>{c.kind === 'level' ? c.timeSpent : '-'}</TableCell>
                    <TableCell />

                    {accounts.map((acc) => {
                      if (c.kind === 'purchase') {
                        const key = `${acc.id}_${c.id}`;
                        return (
                          <TableCell key={acc.id} className="text-center">
                            <input
                              type="date"
                              className="border rounded px-1 text-xs mb-1"
                              value={peDates[key] ?? ''}
                              onChange={(e) => handlePurchaseDateChange(acc.id, c.id, e.target.value)}
                            />
                            {/* optional inline time input (comment/uncomment if you want) */}
                            {/* <input type="time" className="border rounded px-1 text-xs" /> */}
                          </TableCell>
                        );
                      }
                      // level -> show computed date for this account/column
                      const accIdx = accounts.findIndex(a => a.id === acc.id);
                      return <TableCell key={acc.id} className="text-center">{matrix[accIdx]?.[colIdx]}</TableCell>;
                    })}
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
