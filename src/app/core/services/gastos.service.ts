import { Injectable, computed, inject, signal } from '@angular/core';
import { Gasto, GastoInput } from '../models';
import { yearMonthKey } from '../utils/date.utils';
import { CategoriasConfigService } from './categorias-config.service';
import { UserFirestoreService } from './user-firestore.service';

export interface SubcategoriaTotal {
  subcategoria: string;
  total: number;
}

@Injectable({ providedIn: 'root' })
export class GastosService {
  private readonly firestore = inject(UserFirestoreService);
  private readonly categorias = inject(CategoriasConfigService);
  private uid: string | null = null;
  private readonly _gastos = signal<Gasto[]>([]);

  readonly gastos = this._gastos.asReadonly();

  readonly total = computed(() =>
    this._gastos().reduce((sum, g) => sum + g.importe, 0)
  );

  setUid(uid: string | null): void {
    this.uid = uid;
  }

  clearUser(): void {
    this.uid = null;
    this._gastos.set([]);
  }

  hydrate(gastos: Gasto[]): void {
    this._gastos.set(gastos.map((g) => this.normalize(g)));
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
    const gasto = this.normalize({ ...input, id: crypto.randomUUID() });
    this.persist([gasto, ...this._gastos()]);
    return gasto;
  }

  update(id: string, input: GastoInput): Gasto | null {
    const current = this._gastos();
    const idx = current.findIndex((g) => g.id === id);
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
    this.persist(this._gastos().filter((g) => g.id !== id));
  }

  importMany(items: GastoInput[], replace = false): number {
    const nuevos = items.map((input) =>
      this.normalize({
        ...input,
        id: crypto.randomUUID(),
      })
    );
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
    categoria: string
  ): SubcategoriaTotal[] {
    const canon = this.categorias.subcategoriasDe(categoria);
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

  categoriaTieneSubcategoriasDefinidas(categoria: string): boolean {
    return this.categorias.categoriaTieneSubcategorias(categoria);
  }

  availableYearMonths(): string[] {
    const keys = new Set(this._gastos().map((g) => yearMonthKey(g.fecha)));
    return [...keys].sort().reverse();
  }

  private persist(gastos: Gasto[]): void {
    const clean = gastos.map((g) => this.normalize(g));
    this._gastos.set(clean);
    if (this.uid) {
      void this.firestore.patch(this.uid, { gastos: clean }).catch((err) => {
        console.error('Error guardando gastos en Firestore', err);
      });
    }
  }

  private normalize(gasto: Gasto): Gasto {
    const sub = gasto.subcategoria?.trim();
    const recurrenteId = gasto.recurrenteId?.trim();
    return {
      id: gasto.id,
      fecha: gasto.fecha,
      importe: gasto.importe,
      descripcion: gasto.descripcion,
      categoria: gasto.categoria,
      ...(sub ? { subcategoria: sub } : {}),
      ...(recurrenteId ? { recurrenteId } : {}),
    };
  }
}
