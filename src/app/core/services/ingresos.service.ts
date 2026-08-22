import { Injectable, computed, inject, signal } from '@angular/core';
import { Ingreso, IngresoInput } from '../models';
import { yearMonthKey } from '../utils/date.utils';
import { StorageService } from './storage.service';

const STORAGE_KEY = 'finanzas.ingresos';

@Injectable({ providedIn: 'root' })
export class IngresosService {
  private readonly storage = inject(StorageService);
  private readonly _ingresos = signal<Ingreso[]>(this.load());

  readonly ingresos = this._ingresos.asReadonly();

  readonly total = computed(() =>
    this._ingresos().reduce((sum, i) => sum + i.importe, 0)
  );

  list(): Ingreso[] {
    return this._ingresos();
  }

  byYearMonth(yearMonth: string | null): Ingreso[] {
    const all = this._ingresos();
    if (!yearMonth) {
      return all;
    }
    return all.filter((i) => yearMonthKey(i.fecha) === yearMonth);
  }

  totalsByCategoria(yearMonth: string | null): Record<string, number> {
    const map: Record<string, number> = {};
    for (const i of this.byYearMonth(yearMonth)) {
      map[i.categoria] = (map[i.categoria] ?? 0) + i.importe;
    }
    return map;
  }

  add(input: IngresoInput): Ingreso {
    const ingreso: Ingreso = { ...input, id: crypto.randomUUID() };
    this.persist([ingreso, ...this._ingresos()]);
    return ingreso;
  }

  update(id: string, input: IngresoInput): Ingreso | null {
    const current = this._ingresos();
    const idx = current.findIndex((i) => i.id === id);
    if (idx < 0) {
      return null;
    }
    const updated: Ingreso = { ...input, id };
    const next = [...current];
    next[idx] = updated;
    this.persist(next);
    return updated;
  }

  remove(id: string): void {
    this.persist(this._ingresos().filter((i) => i.id !== id));
  }

  importMany(items: IngresoInput[], replace = false): number {
    const nuevos = items.map((input) => ({
      ...input,
      id: crypto.randomUUID(),
    }));
    this.persist(replace ? nuevos : [...nuevos, ...this._ingresos()]);
    return nuevos.length;
  }

  availableYearMonths(): string[] {
    const keys = new Set(this._ingresos().map((i) => yearMonthKey(i.fecha)));
    return [...keys].sort().reverse();
  }

  private load(): Ingreso[] {
    return this.storage.read<Ingreso[]>(STORAGE_KEY, []);
  }

  private persist(ingresos: Ingreso[]): void {
    this._ingresos.set(ingresos);
    this.storage.write(STORAGE_KEY, ingresos);
  }
}
