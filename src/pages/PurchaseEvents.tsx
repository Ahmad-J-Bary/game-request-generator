import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { PurchaseEventForm } from '../features/purchase-events/PurchaseEventForm';
import { PurchaseEventList } from '../features/purchase-events/PurchaseEventList';
import { usePurchaseEvents } from '../hooks/usePurchaseEvents';
import { useGames } from '../hooks/useGames';
import { useAccounts } from '../hooks/useAccounts';
import type { PurchaseEvent, CreatePurchaseEventRequest, UpdatePurchaseEventRequest } from '../types';

export default function PurchaseEvents() {
  const { t } = useTranslation();
  const { games, loading: gamesLoading } = useGames();
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const { accounts, loading: accountsLoading } = useAccounts(selectedGameId || undefined);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const { purchaseEvents, loading, addPurchaseEvent, updatePurchaseEvent, deletePurchaseEvent } = usePurchaseEvents(selectedAccountId || undefined);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<PurchaseEvent | undefined>(undefined);

  useEffect(() => {
    if (games.length > 0 && !selectedGameId) {
      setSelectedGameId(games[0].id);
    }
  }, [games]);

  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts]);

  const handleSubmit = async (request: CreatePurchaseEventRequest | UpdatePurchaseEventRequest) => {
    if ('id' in request) {
      await updatePurchaseEvent(request);
    } else {
      await addPurchaseEvent(request);
    }
    setIsDialogOpen(false);
    setEditingEvent(undefined);
  };

  const handleEdit = (event: PurchaseEvent) => {
    setEditingEvent(event);
    setIsDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingEvent(undefined);
    setIsDialogOpen(true);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('purchaseEvents.title')}</h1>
          <p className="text-muted-foreground">{t('purchaseEvents.description')}</p>
        </div>
        <Button onClick={handleAdd} disabled={!selectedAccountId}>
          <Plus className="h-4 w-4 mr-2" />
          {t('purchaseEvents.addEvent')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('purchaseEvents.selectAccount')}</CardTitle>
          <CardDescription>{t('purchaseEvents.selectAccountDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('games.selectGame')}</label>
              <Select
                value={selectedGameId?.toString()}
                onValueChange={(value) => {
                  setSelectedGameId(parseInt(value));
                  setSelectedAccountId(null);
                }}
                disabled={gamesLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('games.selectGame')} />
                </SelectTrigger>
                <SelectContent>
                  {games.map((game) => (
                    <SelectItem key={game.id} value={game.id.toString()}>
                      {game.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('accounts.selectAccount')}</label>
              <Select
                value={selectedAccountId?.toString()}
                onValueChange={(value) => setSelectedAccountId(parseInt(value))}
                disabled={accountsLoading || !selectedGameId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('accounts.selectAccount')} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedAccountId && (
        <PurchaseEventList
          events={purchaseEvents}
          onEdit={handleEdit}
          onDelete={deletePurchaseEvent}
          loading={loading}
        />
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingEvent ? t('purchaseEvents.editEvent') : t('purchaseEvents.addEvent')}
            </DialogTitle>
          </DialogHeader>
          {selectedAccountId && (
            <PurchaseEventForm
              accountId={selectedAccountId}
              event={editingEvent}
              onSubmit={handleSubmit}
              onCancel={() => {
                setIsDialogOpen(false);
                setEditingEvent(undefined);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}