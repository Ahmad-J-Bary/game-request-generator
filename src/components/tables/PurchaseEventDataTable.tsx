// src/components/tables/PurchaseEventDataTable.tsx
import { useTranslation } from 'react-i18next';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Button } from '../ui/button';
import { useSettings } from '../../contexts/SettingsContext';
import { DataTableCell } from './DataTableCell';
import { Pencil, Trash2 } from 'lucide-react';
import type { PurchaseEvent } from '../../types';

interface PurchaseEventDataTableProps {
  events: PurchaseEvent[];
  layout: 'horizontal' | 'vertical';
  onEdit: (event: PurchaseEvent) => void;
  onDelete: (event: PurchaseEvent) => void;
}

export function PurchaseEventDataTable({ events, layout, onEdit, onDelete }: PurchaseEventDataTableProps) {
  const { t } = useTranslation();
  const { colors } = useSettings();

  const getEventStyle = (isRestricted: boolean): React.CSSProperties => {
    return {
      backgroundColor: isRestricted ? colors.purchaseRestricted : colors.purchaseUnrestricted,
    };
  };

  const headerStyle: React.CSSProperties = {
    backgroundColor: colors.headerColor,
    fontWeight: 'bold',
  };

  if (events.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        {t('purchaseEvents.noEvents')}
      </div>
    );
  }

  if (layout === 'horizontal') {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead style={headerStyle}>{t('purchaseEvents.eventToken')}</TableHead>
            <TableHead style={headerStyle}>{t('purchaseEvents.isRestricted')}</TableHead>
            <TableHead style={headerStyle}>{t('purchaseEvents.maxDaysOffset')}</TableHead>
            <TableHead style={headerStyle} className="text-right">{t('common.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => {
            const eventStyle = getEventStyle(event.is_restricted);
            const combinedStyle = { ...eventStyle };

            return (
              <TableRow key={event.id}>
                <TableCell className="font-mono" style={combinedStyle}>
                  {event.event_token}
                </TableCell>
                <DataTableCell style={combinedStyle}>
                  {event.is_restricted ? t('common.yes') : t('common.no')}
                </DataTableCell>
                <DataTableCell style={combinedStyle} className="text-center">
                  {event.max_days_offset ?? '-'}
                </DataTableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(event)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(event)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  // Vertical layout
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead style={headerStyle}>{t('purchaseEvents.eventToken')}</TableHead>
          {events.map((event) => {
            const eventStyle = getEventStyle(event.is_restricted);
            const combinedStyle = { ...headerStyle, ...eventStyle };

            return (
              <TableHead
                key={event.id}
                className="text-center font-mono"
                style={combinedStyle}
              >
                {event.event_token}
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableHead style={headerStyle}>{t('purchaseEvents.isRestricted')}</TableHead>
          {events.map((event) => {
            const eventStyle = getEventStyle(event.is_restricted);
            const combinedStyle = { ...eventStyle };

            return (
              <DataTableCell key={event.id} style={combinedStyle} className="text-center">
                {event.is_restricted ? t('common.yes') : t('common.no')}
              </DataTableCell>
            );
          })}
        </TableRow>

        <TableRow>
          <TableHead style={headerStyle}>{t('purchaseEvents.maxDaysOffset')}</TableHead>
          {events.map((event) => {
            const eventStyle = getEventStyle(event.is_restricted);
            const combinedStyle = { ...eventStyle };

            return (
              <DataTableCell key={event.id} style={combinedStyle} className="text-center">
                {event.max_days_offset ?? '-'}
              </DataTableCell>
            );
          })}
        </TableRow>

        <TableRow>
          <TableHead style={headerStyle}>{t('common.actions')}</TableHead>
          {events.map((event) => (
            <TableCell key={event.id} className="text-center">
              <div className="flex justify-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => onEdit(event)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(event)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          ))}
        </TableRow>
      </TableBody>
    </Table>
  );
}
