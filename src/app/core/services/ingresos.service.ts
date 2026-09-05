import { Injectable, computed, inject, signal } from '@angular/core';
import { Ingreso, IngresoInput } from '../models';
import { yearMonthKey } from '../utils/date.utils';
import { UserFirestoreService } from './user-firestore.service';

@Injectable({ providedIn: 'root' })
export class IngresosService {
  private readonly firestore = inject(UserFirestoreService);
  private uid: string | null = null;
  private readonly _ingresos = signal<Ingreso[]>([]);

  readonly ingresos = this._ingresos.asReadonly();

  readonly total = computed(() =>
    this._ingresos().reduce((sum, i) => sum + i.importe, 0)
  );

  setUid(uid: string | null): void {
    this.uid = uid;
  }

  clearUser(): void {
    this.uid = null;
    this._ingresos.set([]);
  }

  hydrate(ingresos: Ingreso[]): void {
    this._ingresos.set(ingresos.map((i) => this.normalize(i)));
  }

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
    const ingreso = this.normalize({ ...input, id: crypto.randomUUID() });
    this.persist([ingreso, ...this._ingresos()]);
    return ingreso;
  }

  update(id: string, input: IngresoInput): Ingreso | null {
    const current = this._ingresos();
    const idx = current.findIndex((i) => i.id === id);
    if (idx < 0) {
      return null;
    }
    const updated = this.normalize({ ...input, id });
    const next = [...current];
    next[idx] = updated;
    this.persist(next);
    return updated;
  }

  remove(id: string): void {
    this.persist(this._ingresos().filter((i) => i.id !== id));
  }

  importMany(items: IngresoInput[], replace = false): number {
    const nuevos = items.map((input) =>
      this.normalize({
        ...input,
        id: crypto.randomUUID(),
      })
    );
    this.persist(replace ? nuevos : [...nuevos, ...this._ingresos()]);
    return nuevos.length;
  }

  availableYearMonths(): string[] {
    const keys = new Set(this._ingresos().map((i) => yearMonthKey(i.fecha)));
    return [...keys].sort().reverse();
  }

  private persist(ingresos: Ingreso[]): void {
    const clean = ingresos.map((i) => this.normalize(i));
    this._ingresos.set(clean);
    if (this.uid) {
      void this.firestore.patch(this.uid, { ingresos: clean });
    }
  }

  private normalize(ingreso: Ingreso): Ingreso {
    const recurrenteId = ingreso.recurrenteId?.trim();
    return {
      id: ingreso.id,
      fecha: ingreso.fecha,
      importe: ingreso.importe,
      descripcion: ingreso.descripcion,
      categoria: ingreso.categoria,
      ...(recurrenteId ? { recurrenteId } : {}),
    };
  }
}
