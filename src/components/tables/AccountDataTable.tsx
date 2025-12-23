// src/components/tables/AccountDataTable.tsx
import { useTranslation } from 'react-i18next';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { useSettings } from '../../contexts/SettingsContext';
import { DataTableCell } from './DataTableCell';

type ColumnData = 
  | { kind: 'level'; id: number; token: string; name: string; daysOffset: number; timeSpent: number; isBonus: boolean }
  | { kind: 'purchase'; id: number; token: string; name: string; isRestricted: boolean; maxDaysOffset: string | null };

interface AccountDataTableProps {
  columns: ColumnData[];
  computedLevelDates: string[];
  layout: 'horizontal' | 'vertical';
  levelsProgress?: { level_id: number; is_completed: boolean }[];
  purchaseProgress?: { purchase_event_id: number; is_completed: boolean }[];
}

export function AccountDataTable({ columns, computedLevelDates, layout, levelsProgress = [], purchaseProgress = [] }: AccountDataTableProps) {
  const { t } = useTranslation();
  const { colors } = useSettings();

  const renderCellContent = (col: ColumnData, field: 'token' | 'name' | 'daysOffset' | 'timeSpent' | 'accountDate', idx?: number) => {
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
      case 'accountDate':
        return col.kind === 'level' && idx !== undefined ? computedLevelDates[idx] : '-';
      default:
        return '-';
    }
  };

  const getColumnSpecificStyle = (col: ColumnData): React.CSSProperties => {
    let backgroundColor: string;
    
    if (col.kind === 'level') {
      backgroundColor = col.isBonus ? colors.levelBonus : colors.levelNormal;
    } else {
      backgroundColor = col.isRestricted ? colors.purchaseRestricted : colors.purchaseUnrestricted;
    }
    
    return { backgroundColor };
  };

  const headerStyle: React.CSSProperties = {
    backgroundColor: colors.headerColor,
    fontWeight: 'bold',
  };

  const dataRowStyle: React.CSSProperties = {
    backgroundColor: colors.dataRowColor,
  };

  const incompleteScheduledStyle: React.CSSProperties = {
    backgroundColor: colors.incompleteScheduledStyle,
    fontStyle: 'italic',
    opacity: 0.8
  };

  const completeScheduledStyle: React.CSSProperties = {
    backgroundColor: colors.completeScheduledStyle,
    fontStyle: 'italic',
    opacity: 0.8
  };

  // التحقق من حالة التقدم
  const isItemCompleted = (col: ColumnData): boolean => {
    if (col.kind === 'level') {
      const progress = levelsProgress.find(p => p.level_id === col.id);
      return progress ? progress.is_completed : false;
    } else {
      const progress = purchaseProgress.find(p => p.purchase_event_id === col.id);
      return progress ? progress.is_completed : false;
    }
  };

  const getDateCellStyle = (col: ColumnData): React.CSSProperties => {
    return isItemCompleted(col) ? completeScheduledStyle : incompleteScheduledStyle;
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
            <TableHead style={headerStyle}>{t('levels.accountDate')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {columns.map((col, idx) => {
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
                <DataTableCell style={combinedStyle}>
                  {renderCellContent(col, 'accountDate', idx)}
                </DataTableCell>
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
          <TableHead style={headerStyle}>{t('levels.eventToken')}</TableHead>
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
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableHead style={headerStyle}>{t('levels.levelName')}</TableHead>
          {columns.map((col) => {
            const columnStyle = getColumnSpecificStyle(col);
            const combinedStyle = { ...dataRowStyle, ...columnStyle };
            
            return (
              <DataTableCell key={`name-${col.kind}-${col.id}`} style={combinedStyle}>
                {renderCellContent(col, 'name')}
              </DataTableCell>
            );
          })}
        </TableRow>

        <TableRow>
          <TableHead style={headerStyle}>{t('levels.daysOffset')}</TableHead>
          {columns.map((col) => {
            const columnStyle = getColumnSpecificStyle(col);
            const combinedStyle = { ...dataRowStyle, ...columnStyle };
            
            return (
              <DataTableCell key={`offset-${col.kind}-${col.id}`} style={combinedStyle}>
                {renderCellContent(col, 'daysOffset')}
              </DataTableCell>
            );
          })}
        </TableRow>

        <TableRow>
          <TableHead style={headerStyle}>{t('levels.timeSpent')}</TableHead>
          {columns.map((col) => {
            const columnStyle = getColumnSpecificStyle(col);
            const combinedStyle = { ...dataRowStyle, ...columnStyle };
            
            return (
              <DataTableCell key={`time-${col.kind}-${col.id}`} style={combinedStyle}>
                {renderCellContent(col, 'timeSpent')}
              </DataTableCell>
            );
          })}
        </TableRow>

        <TableRow>
          <TableHead style={headerStyle}>{t('levels.accountDate')}</TableHead>
          {columns.map((col, idx) => {
            
            return (
              <DataTableCell 
                key={`accdate-${col.kind}-${col.id}`} 
                style={getDateCellStyle(col)}
              >
                {renderCellContent(col, 'accountDate', idx)}
              </DataTableCell>
            );
          })}
        </TableRow>
      </TableBody>
    </Table>
  );
}