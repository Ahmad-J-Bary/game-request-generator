import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { GameSelector } from '../../components/molecules/GameSelector';
import { LayoutToggle, Layout } from '../../components/molecules/LayoutToggle';
import { PurchaseEventDataTable } from '../../components/tables/PurchaseEventDataTable';
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
import { usePurchaseEvents } from '../../hooks/usePurchaseEvents';
import type { PurchaseEvent, CreatePurchaseEventRequest, UpdatePurchaseEventRequest } from '../../types';
import { PurchaseEventForm } from './PurchaseEventForm';

export default function PurchaseEventListPage() {
  const { t } = useTranslation();
  const [selectedGameId, setSelectedGameId] = useState<number | undefined>();
  const [layout, setLayout] = useState<Layout>('vertical');
  const { events, loading, addPurchaseEvent, updatePurchaseEvent, deletePurchaseEvent } =
    usePurchaseEvents(selectedGameId);

  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<PurchaseEvent | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<PurchaseEvent | null>(null);

  const handleEdit = (event: PurchaseEvent) => {
    setEditingEvent(event);
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (deletingEvent) {
      await deletePurchaseEvent(deletingEvent.id);
      setDeletingEvent(null);
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingEvent(null);
  };

  if (showForm && selectedGameId) {
    return (
      <PurchaseEventForm
        event={editingEvent}
        gameId={selectedGameId}
        onSubmit={async (req: CreatePurchaseEventRequest | UpdatePurchaseEventRequest) => {
          if ('id' in req) {
            await updatePurchaseEvent(req as UpdatePurchaseEventRequest);
          } else {
            await addPurchaseEvent(req as CreatePurchaseEventRequest);
          }
        }}
        onClose={handleCloseForm}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-2xl font-bold">{t('purchaseEvents.title')}</h3>
        <div className="flex items-center gap-2">
          <GameSelector selectedGameId={selectedGameId} onGameChange={setSelectedGameId} />
          <LayoutToggle layout={layout} onLayoutChange={setLayout} />
          <Button onClick={() => setShowForm(true)} disabled={!selectedGameId}>
            <Plus className="mr-2 h-4 w-4" />
            {t('purchaseEvents.addEvent')}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">{t('common.loading')}</div>
      ) : !selectedGameId ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('games.noGames')}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <PurchaseEventDataTable
              events={events}
              layout={layout}
              onEdit={handleEdit}
              onDelete={setDeletingEvent}
            />
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deletingEvent} onOpenChange={() => setDeletingEvent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('purchaseEvents.deleteEvent')}</AlertDialogTitle>
            <AlertDialogDescription>{t('purchaseEvents.deleteConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
