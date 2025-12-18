import { useState, useEffect, useCallback } from 'react';
import { TauriService } from '../services/tauri.service';
import { Account, CreateAccountRequest, UpdateAccountRequest } from '../types';
import { toast } from 'sonner';

function extractErrorMessage(err: any): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err?.payload === 'string') return err.payload;
  if (typeof err?.message === 'string') return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}

export const useAccounts = (gameId?: number) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    if (!gameId) {
      setAccounts([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await TauriService.getAccounts(gameId);
      setAccounts(data);
    } catch (err) {
      const msg = extractErrorMessage(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    loadAccounts();

    const handler = (e: any) => {
      const detailGameId = e?.detail?.gameId;
      if (detailGameId === undefined || detailGameId === gameId) {
        loadAccounts();
      }
    };

    window.addEventListener('accounts-updated', handler);
    return () => window.removeEventListener('accounts-updated', handler);
  }, [loadAccounts, gameId]);

  const addAccount = async (request: CreateAccountRequest) => {
    setLoading(true);
    setError(null);
    try {
      const id = await TauriService.addAccount(request);
      toast.success('Account added successfully');
      window.dispatchEvent(
        new CustomEvent('accounts-updated', {
          detail: { gameId: request.game_id, id },
        })
      );
      await loadAccounts();
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

  const updateAccount = async (request: UpdateAccountRequest) => {
    setLoading(true);
    setError(null);
    try {
      const success = await TauriService.updateAccount(request);
      if (success) {
        toast.success('Account updated successfully');
        window.dispatchEvent(
          new CustomEvent('accounts-updated', {
            detail: { gameId, id: request.id },
          })
        );
        await loadAccounts();
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

  const deleteAccount = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const success = await TauriService.deleteAccount(id);
      if (success) {
        toast.success('Account deleted successfully');
        window.dispatchEvent(
          new CustomEvent('accounts-updated', {
            detail: { gameId, id },
          })
        );
        await loadAccounts();
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
    accounts,
    loading,
    error,
    addAccount,
    updateAccount,
    deleteAccount,
    refreshAccounts: loadAccounts,
  };
};
