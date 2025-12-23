// src/components/tables/LevelDataTable.tsx
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
import { Level } from '../../types';

interface LevelDataTableProps {
  levels: Level[];
  layout: 'horizontal' | 'vertical';
  onEdit: (level: Level) => void;
  onDelete: (level: Level) => void;
}

export function LevelDataTable({ levels, layout, onEdit, onDelete }: LevelDataTableProps) {
  const { t } = useTranslation();
  const { colors } = useSettings();

  const getLevelStyle = (isBonus: boolean): React.CSSProperties => {
    return {
      backgroundColor: isBonus ? colors.levelBonus : colors.levelNormal,
    };
  };

  const headerStyle: React.CSSProperties = {
    backgroundColor: colors.headerColor,
    fontWeight: 'bold',
  };

  if (levels.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        {t('levels.noLevels')}
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
            <TableHead style={headerStyle}>{t('levels.isBonus')}</TableHead>
            <TableHead style={headerStyle} className="text-right">{t('common.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {levels.map((level) => {
            const levelStyle = getLevelStyle(level.is_bonus);
            const combinedStyle = { ...levelStyle };

            return (
              <TableRow key={level.id}>
                <TableCell className="font-mono" style={combinedStyle}>
                  {level.event_token}
                </TableCell>
                <DataTableCell style={combinedStyle}>
                  {level.level_name}
                </DataTableCell>
                <DataTableCell style={combinedStyle} className="text-center">
                  {level.days_offset}
                </DataTableCell>
                <DataTableCell style={combinedStyle} className="text-center">
                  {level.time_spent}
                </DataTableCell>
                <DataTableCell style={combinedStyle} className="text-center">
                  {level.is_bonus ? (t('levels.bonusYes')) : (t('levels.bonusNo'))}
                </DataTableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(level)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(level)}>
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
          <TableHead style={headerStyle}>{t('levels.eventToken')}</TableHead>
          {levels.map((level) => {
            const levelStyle = getLevelStyle(level.is_bonus);
            const combinedStyle = { ...headerStyle, ...levelStyle };

            return (
              <TableHead
                key={level.id}
                className="text-center font-mono"
                style={combinedStyle}
              >
                {level.event_token}
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableHead style={headerStyle}>{t('levels.levelName')}</TableHead>
          {levels.map((level) => {
            const levelStyle = getLevelStyle(level.is_bonus);
            const combinedStyle = { ...levelStyle };

            return (
              <DataTableCell key={level.id} style={combinedStyle} className="text-center">
                {level.level_name}
              </DataTableCell>
            );
          })}
        </TableRow>

        <TableRow>
          <TableHead style={headerStyle}>{t('levels.daysOffset')}</TableHead>
          {levels.map((level) => {
            const levelStyle = getLevelStyle(level.is_bonus);
            const combinedStyle = { ...levelStyle };

            return (
              <DataTableCell key={level.id} style={combinedStyle} className="text-center">
                {level.days_offset}
              </DataTableCell>
            );
          })}
        </TableRow>

        <TableRow>
          <TableHead style={headerStyle}>{t('levels.timeSpent')}</TableHead>
          {levels.map((level) => {
            const levelStyle = getLevelStyle(level.is_bonus);
            const combinedStyle = { ...levelStyle };

            return (
              <DataTableCell key={level.id} style={combinedStyle} className="text-center">
                {level.time_spent}
              </DataTableCell>
            );
          })}
        </TableRow>

        <TableRow>
          <TableHead style={headerStyle}>{t('levels.isBonus')}</TableHead>
          {levels.map((level) => {
            const levelStyle = getLevelStyle(level.is_bonus);
            const combinedStyle = { ...levelStyle };

            return (
              <DataTableCell key={level.id} style={combinedStyle} className="text-center">
                {level.is_bonus ? (t('levels.bonusYes')) : (t('levels.bonusNo'))}
              </DataTableCell>
            );
          })}
        </TableRow>

        <TableRow>
          <TableHead style={headerStyle}>{t('common.actions')}</TableHead>
          {levels.map((level) => (
            <TableCell key={level.id} className="text-center">
              <div className="flex justify-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => onEdit(level)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(level)}>
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
