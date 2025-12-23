import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { GameSelector } from '../../components/molecules/GameSelector';
import { LayoutToggle, Layout } from '../../components/molecules/LayoutToggle';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
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
import { Pencil, Trash2 } from 'lucide-react';
import { usePurchaseEvents } from '../../hooks/usePurchaseEvents';
import type { PurchaseEvent, CreatePurchaseEventRequest, UpdatePurchaseEventRequest } from '../../types';
import { PurchaseEventForm } from './PurchaseEventForm';
import { useColorClass } from '../../contexts/SettingsContext';

export default function PurchaseEventListPage() {
  const { t } = useTranslation();
  const [selectedGameId, setSelectedGameId] = useState<number | undefined>();
  const [layout, setLayout] = useState<Layout>('vertical');
  const { events, loading, addPurchaseEvent, updatePurchaseEvent, deletePurchaseEvent } =
    usePurchaseEvents(selectedGameId);

  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<PurchaseEvent | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<PurchaseEvent | null>(null);
  const getColorClass = useColorClass();

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
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('purchaseEvents.noEvents')}
          </CardContent>
        </Card>
      ) : layout === 'horizontal' ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('purchaseEvents.eventToken')}</TableHead>
                  <TableHead>{t('purchaseEvents.isRestricted')}</TableHead>
                  <TableHead>{t('purchaseEvents.maxDaysOffset')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => {
                  const rowColor = getColorClass('purchase', undefined, event.is_restricted);
                  return (
                    <TableRow key={event.id}>
                      <TableCell className={`font-mono ${rowColor}`}>{event.event_token}</TableCell>
                      <TableCell className={rowColor}>
                        {event.is_restricted ? t('common.yes') : t('common.no')}
                      </TableCell>
                      <TableCell className={`text-center ${rowColor}`}>
                        {event.max_days_offset ?? '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(event)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeletingEvent(event)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('purchaseEvents.eventToken')}</TableHead>
                  {events.map((ev) => (
                    <TableHead
                      key={ev.id}
                      className={`text-center font-mono ${getColorClass('purchase', undefined, ev.is_restricted)}`}
                    >
                      {ev.event_token}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                <TableRow>
                  <TableHead>{t('purchaseEvents.isRestricted')}</TableHead>
                  {events.map((ev) => {
                    const cellColor = getColorClass('purchase', undefined, ev.is_restricted);
                    return (
                      <TableCell
                        key={ev.id}
                        className={`text-center ${cellColor}`}
                      >
                        {ev.is_restricted ? t('common.yes') : t('common.no')}
                      </TableCell>
                    );
                  })}
                </TableRow>

                <TableRow>
                  <TableHead>{t('purchaseEvents.maxDaysOffset')}</TableHead>
                  {events.map((ev) => {
                    const cellColor = getColorClass('purchase', undefined, ev.is_restricted);
                    return (
                      <TableCell
                        key={ev.id}
                        className={`text-center ${cellColor}`}
                      >
                        {ev.max_days_offset ?? '-'}
                      </TableCell>
                    );
                  })}
                </TableRow>

                <TableRow>
                  <TableHead>{t('common.actions')}</TableHead>
                  {events.map((ev) => {
                    const cellColor = getColorClass('purchase', undefined, ev.is_restricted);
                    return (
                      <TableCell key={ev.id} className={`text-center ${cellColor}`}>
                        <div className="flex justify-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(ev)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeletingEvent(ev)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableBody>
            </Table>
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
