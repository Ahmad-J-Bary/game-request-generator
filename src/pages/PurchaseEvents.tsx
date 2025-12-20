// src/pages/PurchaseEvents.tsx

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { PurchaseEventForm } from '../features/purchase-events/PurchaseEventForm';
import { PurchaseEventList } from '../features/purchase-events/PurchaseEventList';
import { usePurchaseEvents } from '../hooks/usePurchaseEvents';
import { useGames } from '../hooks/useGames';
import type { PurchaseEvent } from '../types';

export default function PurchaseEvents() {
  const { t } = useTranslation();
  const { games } = useGames();

  const [selectedGameId, setSelectedGameId] = useState<number | undefined>();
  const { events, loading, addPurchaseEvent, updatePurchaseEvent, deletePurchaseEvent } =
    usePurchaseEvents(selectedGameId);

  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<PurchaseEvent | null>(null);

  useEffect(() => {
    if (games.length > 0 && !selectedGameId) {
      setSelectedGameId(games[0].id);
    }
  }, [games, selectedGameId]);

  if (showForm && selectedGameId) {
    return (
      <PurchaseEventForm
        event={editingEvent}
        gameId={selectedGameId}
        onSubmit={async req => {
          if ('id' in req) {
            await updatePurchaseEvent(req);
          } else {
            await addPurchaseEvent(req);
          }
        }}
        onClose={() => {
          setShowForm(false);
          setEditingEvent(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-2xl font-bold">{t('purchaseEvents.title')}</h3>

        <div className="flex items-center gap-2">
          <Select
            value={selectedGameId?.toString()}
            onValueChange={val => setSelectedGameId(Number(val))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('games.selectGame')} />
            </SelectTrigger>
            <SelectContent>
              {games.map(game => (
                <SelectItem key={game.id} value={game.id.toString()}>
                  {game.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={() => setShowForm(true)} disabled={!selectedGameId}>
            <Plus className="mr-2 h-4 w-4" />
            {t('purchaseEvents.addEvent')}
          </Button>
        </div>
      </div>

      {!selectedGameId ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('games.noGames')}
          </CardContent>
        </Card>
      ) : (
        <PurchaseEventList
          events={events}
          loading={loading}
          onEdit={event => {
            setEditingEvent(event);
            setShowForm(true);
          }}
          onDelete={deletePurchaseEvent}
        />
      )}
    </div>
  );
}
