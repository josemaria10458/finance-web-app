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
}
