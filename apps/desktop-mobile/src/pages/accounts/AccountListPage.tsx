import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAccounts } from '@grq/core/hooks/useAccounts';
import { formatTimeAMPM } from '@grq/core/services/excel/excel-date-utils';
import { Button } from '@grq/ui/atoms/button';
import { Card, CardContent, CardHeader, CardTitle } from '@grq/ui/atoms/card';
import { GameSelector } from '@grq/ui/molecules/GameSelector';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@grq/ui/atoms/alert-dialog';
import { Plus, Pencil, Trash2, Eye, Download, Upload, MoreVertical } from 'lucide-react';
import { ImportDialog } from '@grq/ui/molecules/ImportDialog';
import { ExportDialog } from '@grq/ui/molecules/ExportDialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@grq/ui/atoms/popover';
import { Label } from '@grq/ui/atoms/label';
import { Account } from '@grq/api-bindings';

export default function AccountListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { selectedGameId?: number } | null;
  const [selectedGameId, setSelectedGameId] = useState<number | undefined>(
    locationState?.selectedGameId
  );
  const { accounts, loading, deleteAccount } = useAccounts(selectedGameId);
  const [showDelete, setShowDelete] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);

  const handleEditNavigate = (account: Account) => {
    navigate(`/accounts/edit/${account.id}`, { state: { account } });
  };

  const handleAddNavigate = () => {
    if (selectedGameId) {
      navigate(`/accounts/new?gameId=${selectedGameId}`);
    }
  };

  const handleViewNavigate = (account: Account) => {
    navigate(`/accounts/${account.id}`, { state: { account } });
  };

  const confirmDelete = (account: Account) => {
    setDeletingAccount(account);
    setShowDelete(true);
  };

  const doDelete = async () => {
    if (deletingAccount) {
      await deleteAccount(deletingAccount.id);
      window.dispatchEvent(new CustomEvent('data-changed'));
    }
    setShowDelete(false);
    setDeletingAccount(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t('accounts.title')}</h1>
        <div className="flex items-center gap-2 self-end md:self-auto">
          <GameSelector selectedGameId={selectedGameId} onGameChange={setSelectedGameId} />

          {selectedGameId && (
            <>
              {/* Desktop Import/Export */}
              <div className="hidden md:flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowImportDialog(true)}>
                    <Upload className="mr-2 h-4 w-4" />
                    {t('common.import', 'Import')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowExportDialog(true)}>
                    <Download className="mr-2 h-4 w-4" />
                    {t('common.export', 'Export')}
                </Button>
              </div>

              {/* Mobile More Actions */}
              <div className="md:hidden">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 w-9 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2 space-y-2" align="end">
                    <Label className="text-[10px] uppercase text-muted-foreground font-bold px-2">{t('common.actions')}</Label>
                    <div className="flex flex-col gap-1">
                      <Button variant="ghost" size="sm" className="justify-start w-full" onClick={() => setShowImportDialog(true)}>
                        <Upload className="mr-2 h-4 w-4" />
                        {t('common.import')}
                      </Button>
                      <Button variant="ghost" size="sm" className="justify-start w-full" onClick={() => setShowExportDialog(true)}>
                        <Download className="mr-2 h-4 w-4" />
                        {t('common.export')}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}

          <Button size="sm" onClick={handleAddNavigate} disabled={!selectedGameId} className="h-9">
            <Plus className="mr-1 md:mr-2 h-4 w-4" />
            <span className="hidden xs:inline">{t('accounts.addAccount')}</span>
            <span className="xs:hidden">{t('common.add', 'Add')}</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">{t('common.loading')}</div>
      ) : !selectedGameId ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">{t('games.noGames')}</CardContent>
        </Card>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">{t('accounts.noAccounts')}</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {[...accounts]
            .sort((a, b) => {
              try {
                // Combine date and time for comparison
                // Assuming start_date is YYYY-MM-DD and start_time is HH:mm or HH:mm:ss
                const dateA = new Date(`${a.start_date}T${a.start_time}`);
                const dateB = new Date(`${b.start_date}T${b.start_time}`);
                
                if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
                  // Fallback to simple string comparison if parsing fails
                  if (a.start_date !== b.start_date) {
                    return a.start_date.localeCompare(b.start_date);
                  }
                  return a.start_time.localeCompare(b.start_time);
                }
                
                return dateA.getTime() - dateB.getTime();
              } catch (e) {
                return 0;
              }
            })
            .map((account) => (
            <Card key={account.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{account.name}</span>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleViewNavigate(account)}
                      title={t('accounts.viewDetails')}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditNavigate(account)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => confirmDelete(account)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-2">
                <p className="text-sm">
                  <span className="font-medium">{t('accounts.startDate')}:</span>{' '}
                  {account.start_date}
                </p>
                <p className="text-sm">
                  <span className="font-medium">{t('accounts.startTime')}:</span>{' '}
                  {formatTimeAMPM(account.start_time)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={showDelete} onOpenChange={() => setShowDelete(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('accounts.deleteAccount')}</AlertDialogTitle>
            <AlertDialogDescription>{t('accounts.deleteConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDelete(false)}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        gameId={selectedGameId}
      />

      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        gameId={selectedGameId}
        exportType="game"
      />
    </div>
  );
}
