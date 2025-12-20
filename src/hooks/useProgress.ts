// src/hooks/useProgress.ts
import { useState, useEffect, useCallback } from 'react';
import { TauriService } from '../services/tauri.service';
import type {
  AccountLevelProgress,
  CreateAccountLevelProgressRequest,
  UpdateAccountLevelProgressRequest,
  AccountPurchaseEventProgress,
  CreateAccountPurchaseEventProgressRequest,
  UpdateAccountPurchaseEventProgressRequest
} from '../types';
import { toast } from 'sonner';

function extractErrorMessage(err: any): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err?.message === 'string') return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}

export const useProgress = (accountId?: number) => {
  const [levelsProgress, setLevelsProgress] = useState<AccountLevelProgress[]>([]);
  const [purchaseProgress, setPurchaseProgress] = useState<AccountPurchaseEventProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accountId) {
      setLevelsProgress([]);
      setPurchaseProgress([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [lp, pp] = await Promise.all([
        TauriService.getAccountLevelProgress(accountId),
        TauriService.getAccountPurchaseEventProgress(accountId),
      ]);
      setLevelsProgress(lp);
      setPurchaseProgress(pp);
    } catch (err) {
      const msg = extractErrorMessage(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    load();
    const handler = (e: any) => {
      // refresh on progress-updated events
      const detailAccountId = e?.detail?.accountId;
      if (detailAccountId === undefined || detailAccountId === accountId) load();
    };
    window.addEventListener('progress-updated', handler);
    return () => window.removeEventListener('progress-updated', handler);
  }, [accountId, load]);

  const createOrEnsureLevelProgress = async (req: CreateAccountLevelProgressRequest) => {
    try {
      await TauriService.createLevelProgress(req);
      window.dispatchEvent(new CustomEvent('progress-updated', { detail: { accountId: req.account_id } }));
      await load();
    } catch (err) {
      const msg = extractErrorMessage(err);
      toast.error(msg);
      throw err;
    }
  };

  const updateLevelProgress = async (req: UpdateAccountLevelProgressRequest) => {
    try {
      const ok = await TauriService.updateLevelProgress(req);
      if (ok) {
        window.dispatchEvent(new CustomEvent('progress-updated', { detail: { accountId: req.account_id } }));
        await load();
      }
      return ok;
    } catch (err) {
      const msg = extractErrorMessage(err);
      toast.error(msg);
      throw err;
    }
  };

  const createOrUpdatePurchaseProgress = async (req: CreateAccountPurchaseEventProgressRequest) => {
    try {
      await TauriService.createPurchaseEventProgress(req);
      window.dispatchEvent(new CustomEvent('progress-updated', { detail: { accountId: req.account_id } }));
      await load();
    } catch (err) {
      const msg = extractErrorMessage(err);
      toast.error(msg);
      throw err;
    }
  };

  const updatePurchaseProgress = async (req: UpdateAccountPurchaseEventProgressRequest) => {
    try {
      const ok = await TauriService.updatePurchaseEventProgress(req);
      if (ok) {
        window.dispatchEvent(new CustomEvent('progress-updated', { detail: { accountId: req.account_id } }));
        await load();
      }
      return ok;
    } catch (err) {
      const msg = extractErrorMessage(err);
      toast.error(msg);
      throw err;
    }
  };

  return {
    levelsProgress,
    purchaseProgress,
    loading,
    error,
    refresh: load,
    createOrEnsureLevelProgress,
    updateLevelProgress,
    createOrUpdatePurchaseProgress,
    updatePurchaseProgress,
  };
};
