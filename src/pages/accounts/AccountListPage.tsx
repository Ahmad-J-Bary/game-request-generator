import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAccounts } from '../../hooks/useAccounts';
import { useLevels } from '../../hooks/useLevels';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { GameSelector } from '../../components/molecules/GameSelector';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Eye, Download, Upload } from 'lucide-react';
import { ImportDialog } from '../../components/molecules/ImportDialog';
import { ExportDialog } from '../../components/molecules/ExportDialog';
import { Account } from '../../types';

export default function AccountListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedGameId, setSelectedGameId] = useState<number | undefined>();

  // Handle navigation state for pre-selected game
  useEffect(() => {
    const state = location.state as { selectedGameId?: number };
    if (state?.selectedGameId) {
      setSelectedGameId(state.selectedGameId);
    }
  }, [location.state]);
  const { accounts, loading, deleteAccount } = useAccounts(selectedGameId);
  const { levels } = useLevels(selectedGameId);
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
    navigate(`/accounts/${account.id}`, { state: { account, levels } });
  };

  const confirmDelete = (account: Account) => {
    setDeletingAccount(account);
    setShowDelete(true);
  };

  const doDelete = async () => {
    if (deletingAccount) {
      await deleteAccount(deletingAccount.id);
    }
    setShowDelete(false);
    setDeletingAccount(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-2xl font-bold">{t('accounts.title')}</h3>
        <div className="flex items-center gap-2">
          <GameSelector selectedGameId={selectedGameId} onGameChange={setSelectedGameId} />

          {selectedGameId && (
            <>
              <Button variant="outline" onClick={() => setShowImportDialog(true)}>
                <Upload className="mr-2 h-4 w-4" />
                {t('common.import', 'Import')}
              </Button>
              <Button variant="outline" onClick={() => setShowExportDialog(true)}>
                <Download className="mr-2 h-4 w-4" />
                {t('common.export', 'Export')}
              </Button>
            </>
          )}

          <Button onClick={handleAddNavigate} disabled={!selectedGameId}>
            <Plus className="mr-2 h-4 w-4" />
            {t('accounts.addAccount')}
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
          {accounts.map((account) => (
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
                  {account.start_time}
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
