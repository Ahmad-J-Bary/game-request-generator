// src/services/storage.service.ts

class StorageService {
  private prefix = 'game_request_';

  set<T>(key: string, value: T): void {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(this.prefix + key, serialized);
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }

  get<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(this.prefix + key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return null;
    }
  }

  remove(key: string): void {
    localStorage.removeItem(this.prefix + key);
  }

  clear(): void {
    Object.keys(localStorage)
      .filter(key => key.startsWith(this.prefix))
      .forEach(key => localStorage.removeItem(key));
  }
}

// ==== Asynchronous DB Storage Wrapper ====
import { TauriService } from './tauri.service';

class AsyncStorageService {
  private prefix = 'grq_';

  async set<T>(key: string, value: T): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      await TauriService.setStoreValue(this.prefix + key, serialized);
    } catch (error) {
      console.error('Error saving to AsyncStorage:', error);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const item = await TauriService.getStoreValue(this.prefix + key);
      if (item) {
          return JSON.parse(item);
      }
      
      // Automatic transparent migration from LocalStorage if not found in DB
      const legacyItem = localStorage.getItem('game_request_' + key) || localStorage.getItem(key);
      if (legacyItem) {
          console.log(`Migrating ${key} from LocalStorage to Database...`);
          const parsed = JSON.parse(legacyItem);
          await this.set(key, parsed);
          return parsed;
      }
      
      return null;
    } catch (error) {
      console.error('Error reading from AsyncStorage:', error);
      return null;
    }
  }

  async remove(key: string): Promise<void> {
      try {
          await TauriService.deleteStoreValue(this.prefix + key);
      } catch (error) {
          console.error('Error removing from AsyncStorage:', error);
      }
  }
}

export const storageService = new StorageService();
export const asyncStorageService = new AsyncStorageService();