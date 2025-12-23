// src/components/tables/GameDataTable.tsx
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
  | { kind: 'level'; id: number | string; token: string; name: string; daysOffset: number | string | null; timeSpent: number | null; isBonus: boolean; synthetic?: boolean }
  | { kind: 'purchase'; id: number; token: string; name: string; isRestricted: boolean; daysOffset: string | null; timeSpent: null; synthetic?: boolean };

interface GameDataTableProps {
  columns: ColumnData[];
  layout: 'horizontal' | 'vertical';
}

export function GameDataTable({ columns, layout }: GameDataTableProps) {
  const { t } = useTranslation();
  const { colors } = useSettings();

  const renderCellContent = (col: ColumnData, field: 'token' | 'name' | 'daysOffset' | 'timeSpent') => {
    switch (field) {
      case 'token':
        return col.token;
      case 'name':
        return col.name;
      case 'daysOffset':
        if (col.kind === 'level') {
          return col.daysOffset != null ? col.daysOffset : '-';
        }
        return col.daysOffset || '-';
      case 'timeSpent':
        return col.kind === 'level' ? (col.timeSpent != null ? col.timeSpent : '-') : '-';
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

    return { 
      backgroundColor,
      opacity: col.synthetic ? 0.6 : 1,
      fontStyle: col.synthetic ? 'italic' : 'normal'
    };
  };

  const headerStyle: React.CSSProperties = {
    backgroundColor: colors.headerColor,
    fontWeight: 'bold',
  };

  const dataRowStyle: React.CSSProperties = {
    backgroundColor: colors.dataRowColor,
  };

  if (columns.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        {t('games.noDetails')}
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {columns.map((col) => {
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
      </TableBody>
    </Table>
  );
}
