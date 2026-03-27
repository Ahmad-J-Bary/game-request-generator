// src/hooks/usePurchaseEvents.ts

import { useState, useEffect, useCallback } from 'react';
import { TauriService } from '@grq/core/services/tauri.service';
import type { PurchaseEvent, CreatePurchaseEventRequest, UpdatePurchaseEventRequest } from '@grq/api-bindings';
import { NotificationService } from '@grq/core/utils/notifications';

function extractErrorMessage(err: any): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err?.payload === 'string') return err.payload;
  if (typeof err?.message === 'string') return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}

export const usePurchaseEvents = (branchId?: number) => {
  const [events, setEvents] = useState<PurchaseEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) {
      setEvents([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await TauriService.getGamePurchaseEvents(branchId);
      setEvents(data);
    } catch (err) {
      const msg = extractErrorMessage(err);
      setError(msg);
      NotificationService.error(msg);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    load();
    const handler = (e: any) => {
      const detailBranchId = e?.detail?.branchId;
      if (detailBranchId === undefined || detailBranchId === branchId) load();
    };
    window.addEventListener('purchase-events-updated', handler);
    return () => window.removeEventListener('purchase-events-updated', handler);
  }, [branchId, load]);

  const add = useCallback(async (request: CreatePurchaseEventRequest) => {
    setLoading(true);
    setError(null);
    try {
      const id = await TauriService.addPurchaseEvent(request);
      NotificationService.success('Purchase event added');
      window.dispatchEvent(new CustomEvent('purchase-events-updated', { detail: { branchId: request.branch_id, id } }));
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
  }, [branchId, load]);

  const update = useCallback(async (request: UpdatePurchaseEventRequest & { branch_id?: number }) => {
    setLoading(true);
    setError(null);
    try {
      const ok = await TauriService.updatePurchaseEvent(request);
      if (ok) {
        NotificationService.success('Purchase event updated');
        const detailBranchId = request.branch_id ?? branchId;
        window.dispatchEvent(new CustomEvent('purchase-events-updated', { detail: { branchId: detailBranchId, id: request.id } }));
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
  }, [branchId, load]);

  const remove = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const ok = await TauriService.deletePurchaseEvent(id);
      if (ok) {
        NotificationService.success('Purchase event deleted');
        window.dispatchEvent(new CustomEvent('purchase-events-updated', { detail: { branchId } }));
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
  }, [branchId, load]);

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
