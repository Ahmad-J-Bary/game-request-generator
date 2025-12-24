// src/components/tables/AccountsDataTable.tsx
import { useTranslation } from 'react-i18next';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { useSettings, useColorStyle } from '../../contexts/SettingsContext';
import { useTheme } from '../../contexts/ThemeContext';
import { DataTableCell } from './DataTableCell';

type ColumnData =
  | { kind: 'level'; id: number | string; token: string; name: string; daysOffset: number; timeSpent: number; isBonus: boolean; synthetic?: boolean }
  | { kind: 'purchase'; id: number; token: string; name: string; isRestricted: boolean; maxDaysOffset: string | null; synthetic?: boolean };

interface Account {
  id: number;
  name: string;
  start_date: string;
  start_time: string;
}

interface AccountsDataTableProps {
  accounts: Account[];
  columns: ColumnData[];
  matrix: string[][];
  layout: 'horizontal' | 'vertical';
  peDates: Record<string, string>;
  onPurchaseDateChange: (accountId: number, peId: number, isoDate: string) => void;
  levelsProgress?: Record<string, { level_id: number; is_completed: boolean }>;
  purchaseProgress?: Record<string, { purchase_event_id: number; is_completed: boolean }>;
}

export function AccountsDataTable({
  accounts,
  columns,
  matrix,
  layout,
  peDates,
  onPurchaseDateChange,
  levelsProgress = {},
  purchaseProgress = {}
}: AccountsDataTableProps) {
  const { t } = useTranslation();
  const { colors } = useSettings();
  const { theme } = useTheme();
  const getColorStyle = useColorStyle();

  const renderCellContent = (col: ColumnData, field: 'token' | 'name' | 'daysOffset' | 'timeSpent' | 'accountDate') => {
    switch (field) {
      case 'token':
        return col.token;
      case 'name':
        return col.name;
      case 'daysOffset':
        if (col.kind === 'level') {
          return col.daysOffset;
        }
        return col.isRestricted ? (col.maxDaysOffset) : '-';
      case 'timeSpent':
        return col.kind === 'level' ? col.timeSpent : '-';
      default:
        return '-';
    }
  };

  const getColumnSpecificStyle = (col: ColumnData): React.CSSProperties => {
    let style: React.CSSProperties;
    if (col.kind === 'level') {
      style = getColorStyle('level', col.isBonus, undefined, theme);
    } else {
      style = getColorStyle('purchase', undefined, col.isRestricted, theme);
    }

    return {
      ...style,
      opacity: col.synthetic ? 0.6 : 1,
      fontStyle: col.synthetic ? 'italic' : 'normal'
    };
  };

  const headerStyle: React.CSSProperties = {
    backgroundColor: colors.headerColor,
    color: theme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)',
    fontWeight: 'bold',
  };

  const dataRowStyle: React.CSSProperties = {
    backgroundColor: colors.dataRowColor,
    color: theme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)',
  };

  const incompleteScheduledStyle: React.CSSProperties = {
    backgroundColor: colors.incompleteScheduledStyle,
    color: theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(0, 0, 0)',
    fontStyle: 'italic',
    opacity: 0.8
  };

  const completeScheduledStyle: React.CSSProperties = {
    backgroundColor: colors.completeScheduledStyle,
    color: theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(0, 0, 0)',
    fontStyle: 'italic',
    opacity: 0.8
  };

  // التحقق من حالة التقدم وتحديد النمط المناسب
  const getDateCellStyle = (accountId: number, col: ColumnData): React.CSSProperties => {
    if (col.kind === 'level') {
      // البحث عن تقدم المستوى المحدد لهذا الحساب
      const progressKey = `${accountId}_${col.id}`;
      const progress = levelsProgress[progressKey];
      return progress && progress.is_completed ? completeScheduledStyle : incompleteScheduledStyle;
    } else {
      // البحث عن تقدم حدث الشراء المحدد لهذا الحساب
      const progressKey = `${accountId}_${col.id}`;
      const progress = purchaseProgress[progressKey];
      return progress && progress.is_completed ? completeScheduledStyle : incompleteScheduledStyle;
    }
  };

  if (columns.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No levels or purchase events
      </div>
    );
  }

  if (layout === 'horizontal') {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead style={headerStyle}>{t('levels.eventToken')}</TableHead>
            <TableHead style={headerStyle}>{t('levels.levelName')}</TableHead>
            <TableHead style={headerStyle}>{t('levels.daysOffset')}</TableHead>
            <TableHead style={headerStyle}>{t('levels.timeSpent')}</TableHead>
            <TableHead style={headerStyle}>{t('accounts.account')}</TableHead>
            <TableHead style={headerStyle}>{t('accounts.startDate')}</TableHead>
            <TableHead style={headerStyle}>{t('accounts.startTime')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {columns.map((col, colIdx) => {
            const columnStyle = getColumnSpecificStyle(col);
            const combinedStyle = { ...dataRowStyle, ...columnStyle };

            return (
              <TableRow key={`${col.kind}-${col.id}`}>
                <TableCell className="font-mono" style={combinedStyle}>
                  {renderCellContent(col, 'token')}
                </TableCell>
                <DataTableCell style={combinedStyle}>
                  {renderCellContent(col, 'name')}
                </DataTableCell>
                <DataTableCell style={combinedStyle}>
                  {renderCellContent(col, 'daysOffset')}
                </DataTableCell>
                <DataTableCell style={combinedStyle}>
                  {renderCellContent(col, 'timeSpent')}
                </DataTableCell>

                {accounts.map((acc) => {
                  if (col.kind === 'purchase') {
                    const key = `${acc.id}_${col.id}`;
                    return (
                      <TableCell key={acc.id} className="text-center">
                        <input
                          type="date"
                          className="border rounded px-1 text-xs mb-1"
                          value={peDates[key] ?? ''}
                          onChange={(e) => onPurchaseDateChange(acc.id, col.id, e.target.value)}
                        />
                      </TableCell>
                    );
                  }
                  const accIdx = accounts.findIndex(a => a.id === acc.id);
                  return (
                    <TableCell key={acc.id} className="text-center">
                      {matrix[accIdx]?.[colIdx]}
                    </TableCell>
                  );
                })}
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
          <TableHead colSpan={3} style={headerStyle}>{t('levels.eventToken')}</TableHead>
          {columns.map((col) => {
            const columnStyle = getColumnSpecificStyle(col);
            const combinedStyle = { ...headerStyle, ...columnStyle };

            return (
              <TableHead
                key={`${col.kind}-${col.id}`}
                className="text-center font-mono"
                style={combinedStyle}
              >
                {col.token}
              </TableHead>
            );
          })}
        </TableRow>

        <TableRow>
          <TableHead colSpan={3} style={headerStyle}>{t('levels.levelName')}</TableHead>
          {columns.map((col) => {
            const columnStyle = getColumnSpecificStyle(col);
            const combinedStyle = { ...headerStyle, ...columnStyle };

            return (
              <TableHead
                key={`name-${col.kind}-${col.id}`}
                className="text-center"
                style={combinedStyle}
              >
                {renderCellContent(col, 'name')}
              </TableHead>
            );
          })}
        </TableRow>

        <TableRow>
          <TableHead colSpan={3} style={headerStyle}>{t('levels.daysOffset')}</TableHead>
          {columns.map((col) => {
            const columnStyle = getColumnSpecificStyle(col);
            const combinedStyle = { ...headerStyle, ...columnStyle };

            return (
              <TableHead
                key={`offset-${col.kind}-${col.id}`}
                className="text-center"
                style={combinedStyle}
              >
                {renderCellContent(col, 'daysOffset')}
              </TableHead>
            );
          })}
        </TableRow>

        <TableRow>
          <TableHead colSpan={3} style={headerStyle}>{t('levels.timeSpent')}</TableHead>
          {columns.map((col) => {
            const columnStyle = getColumnSpecificStyle(col);
            const combinedStyle = { ...headerStyle, ...columnStyle };

            return (
              <TableHead
                key={`time-${col.kind}-${col.id}`}
                className="text-center"
                style={combinedStyle}
              >
                {renderCellContent(col, 'timeSpent')}
              </TableHead>
            );
          })}
        </TableRow>

        <TableRow>
          <TableHead style={headerStyle}>{t('accounts.account')}</TableHead>
          <TableHead style={headerStyle}>{t('accounts.startDate')}</TableHead>
          <TableHead style={headerStyle}>{t('accounts.startTime')}</TableHead>
          {columns.map((col) => <TableHead key={col.id} />)}
        </TableRow>
      </TableHeader>

      <TableBody>
        {accounts.map((acc, accIdx) => (
          <TableRow key={acc.id}>
            <TableCell style={dataRowStyle}>{acc.name}</TableCell>
            <TableCell style={dataRowStyle}>{formatDateShort(acc.start_date)}</TableCell>
            <TableCell style={dataRowStyle}>{acc.start_time}</TableCell>

            {columns.map((c, colIdx) => {
              if (c.kind === 'purchase') {
                const key = `${acc.id}_${c.id}`;
                return (
                  <TableCell key={colIdx} className="text-center" style={getDateCellStyle(acc.id, c)}>
                    <input
                      type="date"
                      className="border rounded px-1 text-xs"
                      value={peDates[key] ?? ''}
                      onChange={(e) => onPurchaseDateChange(acc.id, c.id, e.target.value)}
                    />
                  </TableCell>
                );
              }
              return (
                <TableCell
                  key={colIdx}
                  className="text-center"
                  style={getDateCellStyle(acc.id, c)}
                >
                  {matrix[accIdx][colIdx]}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Helper functions moved from the parent component
function formatDateShort(input?: string): string {
  if (!input) return '-';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '-';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()}-${months[d.getMonth()]}`;
}
