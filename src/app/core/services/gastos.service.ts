import { Injectable, computed, inject, signal } from '@angular/core';
import { Gasto, GastoInput } from '../models';
import { yearMonthKey } from '../utils/date.utils';
import { StorageService } from './storage.service';

const STORAGE_KEY = 'finanzas.gastos';

@Injectable({ providedIn: 'root' })
export class GastosService {
  private readonly storage = inject(StorageService);
  private readonly _gastos = signal<Gasto[]>(this.load());

  readonly gastos = this._gastos.asReadonly();

  readonly total = computed(() =>
    this._gastos().reduce((sum, g) => sum + g.importe, 0)
  );

  list(): Gasto[] {
    return this._gastos();
  }

  byYearMonth(yearMonth: string | null): Gasto[] {
    const all = this._gastos();
    if (!yearMonth) {
      return all;
    }
    return all.filter((g) => yearMonthKey(g.fecha) === yearMonth);
  }

  add(input: GastoInput): Gasto {
    const gasto: Gasto = { ...input, id: crypto.randomUUID() };
    this.persist([gasto, ...this._gastos()]);
    return gasto;
  }

  update(id: string, input: GastoInput): Gasto | null {
    const current = this._gastos();
    const idx = current.findIndex((g) => g.id === id);
    if (idx < 0) {
      return null;
    }
    const updated: Gasto = { ...input, id };
    const next = [...current];
    next[idx] = updated;
    this.persist(next);
    return updated;
  }

  remove(id: string): void {
    this.persist(this._gastos().filter((g) => g.id !== id));
  }

  importMany(items: GastoInput[], replace = false): number {
    const nuevos = items.map((input) => ({
      ...input,
      id: crypto.randomUUID(),
    }));
    this.persist(replace ? nuevos : [...nuevos, ...this._gastos()]);
    return nuevos.length;
  }

  totalsByCategoria(yearMonth: string | null): Record<string, number> {
    const map: Record<string, number> = {};
    for (const g of this.byYearMonth(yearMonth)) {
      map[g.categoria] = (map[g.categoria] ?? 0) + g.importe;
    }
    return map;
  }

  availableYearMonths(): string[] {
    const keys = new Set(this._gastos().map((g) => yearMonthKey(g.fecha)));
    return [...keys].sort().reverse();
  }

  private load(): Gasto[] {
    return this.storage.read<Gasto[]>(STORAGE_KEY, []);
  }

  private persist(gastos: Gasto[]): void {
    this._gastos.set(gastos);
    this.storage.write(STORAGE_KEY, gastos);
  }
}
