import { useState, useEffect, useCallback } from 'react';
import { TauriService } from '@grq/core/services/tauri.service';
import { Game, CreateGameRequest, UpdateGameRequest } from '@grq/api-bindings';
import { NotificationService } from '@grq/core/utils/notifications';

function extractErrorMessage(err: any): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err?.payload === 'string') return err.payload;
  if (typeof err?.message === 'string') return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}

export function useGames() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGames = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await TauriService.getGames();
      setGames(data);
    } catch (err) {
      const message = extractErrorMessage(err);
      setError(message);
      NotificationService.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Listen for global "games-updated" events so other components see changes immediately
  useEffect(() => {
    fetchGames();
    const handler = () => {
      fetchGames();
    };
    window.addEventListener('games-updated', handler);
    return () => {
      window.removeEventListener('games-updated', handler);
    };
  }, [fetchGames]);

  const addGame = async (request: CreateGameRequest) => {
    try {
      setLoading(true);
      setError(null);
      const id = await TauriService.addGame(request);
      NotificationService.success('Game added successfully');
      // notify other listeners to refresh
      window.dispatchEvent(new CustomEvent('games-updated', { detail: { id } }));
      // refresh local list
      await fetchGames();
      return id;
    } catch (err) {
      const message = extractErrorMessage(err);
      setError(message);
      NotificationService.error(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateGame = async (request: UpdateGameRequest) => {
    try {
      setLoading(true);
      setError(null);
      const success = await TauriService.updateGame(request);
      if (success) {
        NotificationService.success('Game updated successfully');
        window.dispatchEvent(new CustomEvent('games-updated', { detail: { id: request.id } }));
        await fetchGames();
      }
      return success;
    } catch (err) {
      const message = extractErrorMessage(err);
      setError(message);
      NotificationService.error(message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const deleteGame = async (id: number) => {
    try {
      setLoading(true);
      setError(null);
      const success = await TauriService.deleteGame(id);
      if (success) {
        NotificationService.success('Game deleted successfully');
        window.dispatchEvent(new CustomEvent('games-updated', { detail: { id } }));
        await fetchGames();
      }
      return success;
    } catch (err) {
      const message = extractErrorMessage(err);
      setError(message);
      NotificationService.error(message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // ========== Branch Methods ==========

  const fetchBranches = useCallback(async (gameId: number) => {
    try {
      setLoading(true);
      const data = await TauriService.getGameBranches(gameId);
      return data;
    } catch (err) {
      const message = extractErrorMessage(err);
      NotificationService.error(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const addBranch = useCallback(async (request: any) => {
    try {
      setLoading(true);
      const id = await TauriService.addBranch(request);
      NotificationService.success('Branch created successfully');
      window.dispatchEvent(new CustomEvent('branches-updated', { detail: { gameId: request.game_id } }));
      return id;
    } catch (err) {
      const message = extractErrorMessage(err);
      NotificationService.error(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateBranch = useCallback(async (request: any) => {
    try {
      setLoading(true);
      const success = await TauriService.updateBranch(request);
      if (success) {
        NotificationService.success('Branch updated successfully');
        window.dispatchEvent(new CustomEvent('branches-updated'));
      }
      return success;
    } catch (err) {
      const message = extractErrorMessage(err);
      NotificationService.error(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteBranch = useCallback(async (id: number) => {
    try {
      setLoading(true);
      const success = await TauriService.deleteBranch(id);
      if (success) {
        NotificationService.success('Branch deleted successfully');
        window.dispatchEvent(new CustomEvent('branches-updated'));
      }
      return success;
    } catch (err) {
      const message = extractErrorMessage(err);
      NotificationService.error(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    games,
    loading,
    error,
    fetchGames,
    addGame,
    updateGame,
    deleteGame,
    fetchBranches,
    addBranch,
    updateBranch,
    deleteBranch,
  };
}
