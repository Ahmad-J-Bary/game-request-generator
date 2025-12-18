import { useState, useEffect, useCallback } from 'react';
import { TauriService } from '../services/tauri.service';
import type {
  PurchaseEvent,
  CreatePurchaseEventRequest,
  UpdatePurchaseEventRequest,
} from '../types';
import { toast } from 'sonner';

function extractErrorMessage(err: any): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err?.payload === 'string') return err.payload;
  if (typeof err?.message === 'string') return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}

export const usePurchaseEvents = (accountId?: number) => {
  const [purchaseEvents, setPurchaseEvents] = useState<PurchaseEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPurchaseEvents = useCallback(async () => {
    if (!accountId) {
      setPurchaseEvents([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const events = await TauriService.getPurchaseEvents(accountId);
      setPurchaseEvents(events);
    } catch (err) {
      const msg = extractErrorMessage(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    loadPurchaseEvents();

    const handler = (e: any) => {
      const detailAccountId = e?.detail?.accountId;
      if (detailAccountId === undefined || detailAccountId === accountId) {
        loadPurchaseEvents();
      }
    };

    window.addEventListener('purchase-events-updated', handler);
    return () => window.removeEventListener('purchase-events-updated', handler);
  }, [loadPurchaseEvents, accountId]);

  const addPurchaseEvent = async (request: CreatePurchaseEventRequest) => {
    setLoading(true);
    setError(null);
    try {
      const id = await TauriService.addPurchaseEvent(request);
      toast.success('Purchase event added successfully');
      window.dispatchEvent(
        new CustomEvent('purchase-events-updated', {
          detail: { accountId: request.account_id, id },
        })
      );
      await loadPurchaseEvents();
      return true;
    } catch (err) {
      const msg = extractErrorMessage(err);
      setError(msg);
      toast.error(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updatePurchaseEvent = async (request: UpdatePurchaseEventRequest) => {
    setLoading(true);
    setError(null);
    try {
      const success = await TauriService.updatePurchaseEvent(request);
      if (success) {
        toast.success('Purchase event updated successfully');
        window.dispatchEvent(
          new CustomEvent('purchase-events-updated', {
            detail: { accountId, id: request.id },
          })
        );
        await loadPurchaseEvents();
      }
      return success;
    } catch (err) {
      const msg = extractErrorMessage(err);
      setError(msg);
      toast.error(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deletePurchaseEvent = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const success = await TauriService.deletePurchaseEvent(id);
      if (success) {
        toast.success('Purchase event deleted successfully');
        window.dispatchEvent(
          new CustomEvent('purchase-events-updated', {
            detail: { accountId, id },
          })
        );
        await loadPurchaseEvents();
      }
      return success;
    } catch (err) {
      const msg = extractErrorMessage(err);
      setError(msg);
      toast.error(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    purchaseEvents,
    loading,
    error,
    addPurchaseEvent,
    updatePurchaseEvent,
    deletePurchaseEvent,
    refreshPurchaseEvents: loadPurchaseEvents,
  };
};
