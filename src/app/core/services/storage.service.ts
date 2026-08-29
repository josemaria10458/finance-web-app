import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class StorageService {
  read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return fallback;
      }
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  write<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  remove(key: string): void {
    localStorage.removeItem(key);
  }

  /** Migra datos legacy (sin uid) al espacio del usuario, una sola vez. */
  migrateLegacy<T>(legacyKey: string, userKey: string): T | null {
    const legacyRaw = localStorage.getItem(legacyKey);
    if (!legacyRaw) return null;

    const existing = localStorage.getItem(userKey);
    if (existing) {
      localStorage.removeItem(legacyKey);
      return null;
    }

    try {
      const data = JSON.parse(legacyRaw) as T;
      localStorage.setItem(userKey, legacyRaw);
      localStorage.removeItem(legacyKey);
      return data;
    } catch {
      return null;
    }
  }

  keyFor(base: string, uid: string | null): string {
    return uid ? `${base}.${uid}` : base;
  }
}
