// src/features/purchase-events/PurchaseEventList.tsx
import { useState } from 'react';
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
import { Pencil, Trash2 } from 'lucide-react';
import type { PurchaseEvent } from '../../types';

import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '../../components/ui/select';

type Layout = 'horizontal' | 'vertical';

interface Props {
  events: PurchaseEvent[];
  loading: boolean;
  onEdit: (event: PurchaseEvent) => void;
  onDelete: (id: number) => Promise<boolean>;
}

export function PurchaseEventList({
  events,
  loading,
  onEdit,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  // default to vertical (same as LevelList)
  const [layout, setLayout] = useState<Layout>('vertical');

  if (loading) {
    return <div className="text-center py-8">{t('common.loading')}</div>;
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t('purchaseEvents.noEvents')}
        </CardContent>
      </Card>
    );
  }

  // Horizontal layout (rows = events) — color entire row per event
  if (layout === 'horizontal') {
    return (
      <Card>
        <CardContent className="p-0">
          {/* header control — same style as LevelList */}
          <div className="flex items-center justify-end p-4 gap-2">
            <div className="text-sm text-muted-foreground">{t('common.view')}</div>

            <Select value={layout} onValueChange={(v) => setLayout(v as Layout)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="horizontal">{t('levels.viewHorizontal') ?? 'Horizontal'}</SelectItem>
                <SelectItem value="vertical">{t('levels.viewVertical') ?? 'Vertical'}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('purchaseEvents.eventToken')}</TableHead>
                <TableHead>{t('purchaseEvents.isRestricted')}</TableHead>
                <TableHead>{t('purchaseEvents.maxDaysOffset')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {events.map((event) => {
                // same coloring convention as LevelList:
                // restricted -> yellow, unrestricted -> gray
                const rowColor = event.is_restricted ? 'bg-yellow-50' : 'bg-gray-50';
                return (
                  <TableRow key={event.id}>
                    <TableCell className={`font-mono ${rowColor}`}>{event.event_token}</TableCell>
                    <TableCell className={rowColor}>
                      {event.is_restricted ? t('common.yes') : t('common.no')}
                    </TableCell>
                    <TableCell className={`text-center ${rowColor}`}>{event.max_days_offset ?? '-'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => onEdit(event)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onDelete(event.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  // Vertical / pivot layout (columns = events) — color column cells for each event
  return (
    <Card>
      <CardContent className="p-0 overflow-auto">
        {/* header control — same style as LevelList */}
        <div className="flex items-center justify-end p-4 gap-2">
          <div className="text-sm text-muted-foreground">{t('common.view')}</div>

          <Select value={layout} onValueChange={(v) => setLayout(v as Layout)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vertical">{t('levels.viewVertical') ?? 'Vertical'}</SelectItem>
              <SelectItem value="horizontal">{t('levels.viewHorizontal') ?? 'Horizontal'}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('purchaseEvents.eventToken')}</TableHead>
              {events.map((ev) => (
                <TableHead
                  key={ev.id}
                  className={`text-center font-mono ${ev.is_restricted ? 'bg-yellow-50' : 'bg-gray-50'}`}
                >
                  {ev.event_token}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            <TableRow>
              <TableHead>{t('purchaseEvents.isRestricted')}</TableHead>
              {events.map((ev) => (
                <TableCell
                  key={ev.id}
                  className={`text-center ${ev.is_restricted ? 'bg-yellow-50' : 'bg-gray-50'}`}
                >
                  {ev.is_restricted ? t('common.yes') : t('common.no')}
                </TableCell>
              ))}
            </TableRow>

            <TableRow>
              <TableHead>{t('purchaseEvents.maxDaysOffset')}</TableHead>
              {events.map((ev) => (
                <TableCell
                  key={ev.id}
                  className={`text-center ${ev.is_restricted ? 'bg-yellow-50' : 'bg-gray-50'}`}
                >
                  {ev.max_days_offset ?? '-'}
                </TableCell>
              ))}
            </TableRow>

            <TableRow>
              <TableHead>{t('common.actions')}</TableHead>
              {events.map((ev) => (
                <TableCell
                  key={ev.id}
                  className={`text-center ${ev.is_restricted ? 'bg-yellow-50' : 'bg-gray-50'}`}
                >
                  <div className="flex justify-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(ev)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(ev.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
