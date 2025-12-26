// src/hooks/usePurchaseEvents.ts

import { useState, useEffect, useCallback } from 'react';
import { TauriService } from '../services/tauri.service';
import type { PurchaseEvent, CreatePurchaseEventRequest, UpdatePurchaseEventRequest } from '../types';
import { NotificationService } from '../utils/notifications';

function extractErrorMessage(err: any): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err?.payload === 'string') return err.payload;
  if (typeof err?.message === 'string') return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}

export const usePurchaseEvents = (gameId?: number) => {
  const [events, setEvents] = useState<PurchaseEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!gameId) {
      setEvents([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await TauriService.getGamePurchaseEvents(gameId);
      setEvents(data);
    } catch (err) {
      const msg = extractErrorMessage(err);
      setError(msg);
      NotificationService.error(msg);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    load();
    const handler = (e: any) => {
      const detailGameId = e?.detail?.gameId;
      if (detailGameId === undefined || detailGameId === gameId) load();
    };
    window.addEventListener('purchase-events-updated', handler);
    return () => window.removeEventListener('purchase-events-updated', handler);
  }, [gameId, load]);

  const add = async (request: CreatePurchaseEventRequest) => {
    setLoading(true);
    setError(null);
    try {
      const id = await TauriService.addPurchaseEvent(request);
      NotificationService.success('Purchase event added');
      window.dispatchEvent(new CustomEvent('purchase-events-updated', { detail: { gameId: request.game_id, id } }));
      await load();
      return id;
    } catch (err) {
      const msg = extractErrorMessage(err);
      setError(msg);
      NotificationService.error(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const update = async (request: UpdatePurchaseEventRequest & { game_id?: number }) => {
    setLoading(true);
    setError(null);
    try {
      const ok = await TauriService.updatePurchaseEvent(request);
      if (ok) {
        NotificationService.success('Purchase event updated');
        const detailGameId = request.game_id ?? gameId;
        window.dispatchEvent(new CustomEvent('purchase-events-updated', { detail: { gameId: detailGameId, id: request.id } }));
        await load();
      }
      return ok;
    } catch (err) {
      const msg = extractErrorMessage(err);
      setError(msg);
      NotificationService.error(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const ok = await TauriService.deletePurchaseEvent(id);
      if (ok) {
        NotificationService.success('Purchase event deleted');
        window.dispatchEvent(new CustomEvent('purchase-events-updated', { detail: { gameId } }));
        await load();
      }
      return ok;
    } catch (err) {
      const msg = extractErrorMessage(err);
      setError(msg);
      NotificationService.error(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    events,
    loading,
    error,
    addPurchaseEvent: add,
    updatePurchaseEvent: update,
    deletePurchaseEvent: remove,
    refresh: load,
  };
};
