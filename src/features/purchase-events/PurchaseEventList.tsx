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
  const [layout] = useState<Layout>('horizontal');

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

  // Horizontal layout
  if (layout === 'horizontal') {
    return (
      <Card>
        <CardContent className="p-0">
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
              {events.map(event => (
                <TableRow key={event.id}>
                  <TableCell className="font-mono">
                    {event.event_token}
                  </TableCell>
                  <TableCell>
                    {event.is_restricted ? t('common.yes') : t('common.no')}
                  </TableCell>
                  <TableCell>{event.max_days_offset ?? '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(event)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(event.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  // Vertical / pivot layout
  return (
    <Card>
      <CardContent className="p-0 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('purchaseEvents.eventToken')}</TableHead>
              {events.map(ev => (
                <TableHead key={ev.id} className="text-center font-mono">
                  {ev.event_token}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            <TableRow>
              <TableHead>{t('purchaseEvents.isRestricted')}</TableHead>
              {events.map(ev => (
                <TableCell key={ev.id} className="text-center">
                  {ev.is_restricted ? t('common.yes') : t('common.no')}
                </TableCell>
              ))}
            </TableRow>

            <TableRow>
              <TableHead>{t('purchaseEvents.maxDaysOffset')}</TableHead>
              {events.map(ev => (
                <TableCell key={ev.id} className="text-center">
                  {ev.max_days_offset ?? '-'}
                </TableCell>
              ))}
            </TableRow>

            <TableRow>
              <TableHead>{t('common.actions')}</TableHead>
              {events.map(ev => (
                <TableCell key={ev.id} className="text-center">
                  <div className="flex justify-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(ev)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(ev.id)}
                    >
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
