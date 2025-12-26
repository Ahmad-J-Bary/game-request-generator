import { useState, useEffect, useCallback } from 'react';
import { TauriService } from '../services/tauri.service';
import { Level, CreateLevelRequest, UpdateLevelRequest } from '../types';
import { NotificationService } from '../utils/notifications';

function extractErrorMessage(err: any): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err?.payload === 'string') return err.payload;
  if (typeof err?.message === 'string') return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}

export const useLevels = (gameId?: number) => {
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLevels = useCallback(async () => {
    if (!gameId) {
      setLevels([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await TauriService.getGameLevels(gameId);
      setLevels(data);
    } catch (err) {
      const errorMessage = extractErrorMessage(err);
      setError(errorMessage);
      NotificationService.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  // Listen to levels-updated events and refresh only when it concerns this gameId
  useEffect(() => {
    loadLevels();
    const handler = (e: any) => {
      // if detail not provided, refresh anyway; if provided and matches gameId, refresh
      const detailGameId = e?.detail?.gameId;
      if (detailGameId === undefined || detailGameId === gameId) {
        loadLevels();
      }
    };
    window.addEventListener('levels-updated', handler);
    return () => {
      window.removeEventListener('levels-updated', handler);
    };
  }, [gameId, loadLevels]);

  const addLevel = async (request: CreateLevelRequest) => {
    setLoading(true);
    setError(null);
    try {
      const id = await TauriService.addLevel(request);
      NotificationService.success('Level added successfully');
      // notify other listeners; include gameId in detail
      window.dispatchEvent(new CustomEvent('levels-updated', { detail: { gameId: request.game_id, id } }));
      await loadLevels();
      return true;
    } catch (err) {
      const errorMessage = extractErrorMessage(err);
      setError(errorMessage);
      NotificationService.error(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateLevel = async (request: UpdateLevelRequest) => {
    setLoading(true);
    setError(null);
    try {
      const success = await TauriService.updateLevel(request);
      if (success) {
        NotificationService.success('Level updated successfully');
        // if request contains game_id detail use it, otherwise refresh all relevant
        const detailGameId = (request as any).game_id ?? gameId;
        window.dispatchEvent(new CustomEvent('levels-updated', { detail: { gameId: detailGameId, id: request.id } }));
        await loadLevels();
      }
      return success;
    } catch (err) {
      const errorMessage = extractErrorMessage(err);
      setError(errorMessage);
      NotificationService.error(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteLevel = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const success = await TauriService.deleteLevel(id);
      if (success) {
        NotificationService.success('Level deleted successfully');
        // dispatch with current gameId so listeners refresh that game's list
        window.dispatchEvent(new CustomEvent('levels-updated', { detail: { gameId, id } }));
        await loadLevels();
      }
      return success;
    } catch (err) {
      const errorMessage = extractErrorMessage(err);
      setError(errorMessage);
      NotificationService.error(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    levels,
    loading,
    error,
    addLevel,
    updateLevel,
    deleteLevel,
    refreshLevels: loadLevels,
  };
};
