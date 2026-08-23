import { Injectable, computed, inject, signal } from '@angular/core';
import {
  CategoriaGasto,
  Gasto,
  GastoInput,
  SUBCATEGORIAS_POR_CATEGORIA,
  subcategoriasDe,
} from '../models';
import { yearMonthKey } from '../utils/date.utils';
import { StorageService } from './storage.service';

const STORAGE_BASE = 'finanzas.gastos';

export interface SubcategoriaTotal {
  subcategoria: string;
  total: number;
}

@Injectable({ providedIn: 'root' })
export class GastosService {
  private readonly storage = inject(StorageService);
  private uid: string | null = null;
  private readonly _gastos = signal<Gasto[]>([]);

  readonly gastos = this._gastos.asReadonly();

  readonly total = computed(() =>
    this._gastos().reduce((sum, g) => sum + g.importe, 0)
  );

  bindUser(uid: string | null): void {
    this.uid = uid;
    if (!uid) {
      this._gastos.set([]);
      return;
    }
    const userKey = this.storage.keyFor(STORAGE_BASE, uid);
    const migrated = this.storage.migrateLegacy<Gasto[]>(STORAGE_BASE, userKey);
    this._gastos.set(migrated ?? this.storage.read(userKey, []));
  }

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

  totalsBySubcategoria(
    yearMonth: string | null,
    categoria: CategoriaGasto
  ): SubcategoriaTotal[] {
    const canon = subcategoriasDe(categoria);
    if (!canon.length) return [];

    const map = new Map<string, number>();
    for (const g of this.byYearMonth(yearMonth)) {
      if (g.categoria !== categoria) continue;
      const key = g.subcategoria?.trim() || 'Sin subcategoría';
      map.set(key, (map.get(key) ?? 0) + g.importe);
    }

    const out: SubcategoriaTotal[] = [];
    for (const sub of canon) {
      const total = map.get(sub) ?? 0;
      if (total > 0) out.push({ subcategoria: sub, total });
      map.delete(sub);
    }
    for (const [subcategoria, total] of map.entries()) {
      if (total > 0) out.push({ subcategoria, total });
    }
    return out.sort((a, b) => b.total - a.total);
  }

  categoriaTieneSubcategoriasDefinidas(categoria: CategoriaGasto): boolean {
    return SUBCATEGORIAS_POR_CATEGORIA[categoria].length > 0;
  }

  availableYearMonths(): string[] {
    const keys = new Set(this._gastos().map((g) => yearMonthKey(g.fecha)));
    return [...keys].sort().reverse();
  }

  private persist(gastos: Gasto[]): void {
    this._gastos.set(gastos);
    if (this.uid) {
      this.storage.write(this.storage.keyFor(STORAGE_BASE, this.uid), gastos);
    }
  }
}
