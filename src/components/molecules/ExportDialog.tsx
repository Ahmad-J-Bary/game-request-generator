// src/components/molecules/ExportDialog.tsx

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { ExcelService } from '../../services/excel.service';
import { NotificationService } from '../../utils/notifications';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameId?: number;
  accountId?: number;
  exportType: 'game' | 'account' | 'all';
  layout?: 'horizontal' | 'vertical';
  colorSettings?: any;
  theme?: 'light' | 'dark';
  source?: 'game-detail' | 'account-detail' | 'accounts-detail';
  mode?: 'event-only' | 'all';
  data?: any[];
  levelsProgress?: any;
  purchaseProgress?: any;
}

export function ExportDialog({ open, onOpenChange, gameId, accountId, exportType, layout = 'vertical', colorSettings, theme = 'light', source, mode = 'event-only', data, levelsProgress, purchaseProgress }: ExportDialogProps) {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);

  const getExportDescription = () => {
    switch (source) {
      case 'game-detail':
        return t('export.gameDetailDescription', 'Export levels and purchase events for this game.');
      case 'account-detail':
        return t('export.accountDetailDescription', 'Export account data with level and purchase event dates.');
      case 'accounts-detail':
        if (exportType === 'game') {
          return t('export.gameAccountsDescription', 'Export all accounts for this game with progress data.');
        } else if (exportType === 'all') {
          return t('export.allGamesDescription', 'Export all accounts from all games with full details (levels, purchase events, and account progress).');
        }
        break;
      default:
        // Legacy behavior
        switch (exportType) {
          case 'game':
            return t('export.gameDescription', 'Export all levels, purchase events, and accounts for this game.');
          case 'account':
            return t('export.accountDescription', 'Export data for this account.');
          case 'all':
            return t('export.allDescription', 'Export all games with full details (levels, purchase events, and account progress).');
        }
    }
    return '';
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      let success = false;

      switch (source) {
        case 'game-detail':
          if (gameId) {
            success = await ExcelService.exportGameDetailData(gameId, layout, colorSettings, theme, data);
          }
          break;
        case 'account-detail':
          if (accountId) {
            success = await ExcelService.exportAccountDetailData(accountId, layout, colorSettings, theme, data, levelsProgress, purchaseProgress);
          }
          break;
        case 'accounts-detail':
          switch (exportType) {
            case 'game':
              if (gameId) {
                success = await ExcelService.exportGameData(gameId, layout, colorSettings, theme, data, levelsProgress, purchaseProgress);
              }
              break;
            case 'all':
              success = await ExcelService.exportAllGamesData(layout, colorSettings, theme, mode);
              break;
          }
          break;
        default:
          // Legacy behavior
          switch (exportType) {
            case 'game':
              if (gameId) {
                success = await ExcelService.exportGameData(gameId, layout, colorSettings, theme);
              }
              break;
            case 'account':
              if (accountId) {
                success = await ExcelService.exportAccountData(accountId, layout, colorSettings, theme);
              }
              break;
            case 'all':
              success = await ExcelService.exportAllGamesData(layout, colorSettings, theme, mode);
              break;
          }
      }

      if (success) {
        NotificationService.success(t('export.success'));
        onOpenChange(false);
      } else {
        NotificationService.error(t('export.failed'));
      }
    } catch (error) {
      console.error('Export failed:', error);
      NotificationService.error(t('export.failed'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{t('export.title', 'Export Data')}</DialogTitle>
          <DialogDescription>
            {getExportDescription()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {t('export.format', 'Data will be exported as an Excel file (.xlsx) with separate sheets for different data types.')}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? t('common.loading') : t('export.confirm', 'Export')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
