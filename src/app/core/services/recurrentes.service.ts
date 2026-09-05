import { Injectable, computed, inject, signal } from '@angular/core';
import {
  MovimientoRecurrente,
  MovimientoRecurrenteInput,
  RecurrenteTipo,
} from '../models';
import {
  currentYearMonth,
  dateForDayInMonth,
  monthsBetween,
  todayIso,
  yearMonthKey,
} from '../utils/date.utils';
import { GastosService } from './gastos.service';
import { IngresosService } from './ingresos.service';
import { UserFirestoreService } from './user-firestore.service';

@Injectable({ providedIn: 'root' })
export class RecurrentesService {
  private readonly firestore = inject(UserFirestoreService);
  private readonly gastos = inject(GastosService);
  private readonly ingresos = inject(IngresosService);
  private uid: string | null = null;

  private readonly _items = signal<MovimientoRecurrente[]>([]);
  readonly items = this._items.asReadonly();

  readonly deGastos = computed(() =>
    this._items().filter((r) => r.tipo === 'gasto')
  );
  readonly deIngresos = computed(() =>
    this._items().filter((r) => r.tipo === 'ingreso')
  );

  setUid(uid: string | null): void {
    this.uid = uid;
  }

  clearUser(): void {
    this.uid = null;
    this._items.set([]);
  }

  hydrate(items: MovimientoRecurrente[]): void {
    this._items.set(items.map((r) => this.normalize(r)));
  }

  byTipo(tipo: RecurrenteTipo): MovimientoRecurrente[] {
    return this._items().filter((r) => r.tipo === tipo);
  }

  add(input: MovimientoRecurrenteInput): MovimientoRecurrente {
    const item = this.normalize({ ...input, id: crypto.randomUUID() });
    this.persist([item, ...this._items()]);
    this.generatePending();
    return item;
  }

  update(id: string, input: MovimientoRecurrenteInput): MovimientoRecurrente | null {
    const current = this._items();
    const idx = current.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    const updated = this.normalize({ ...input, id });
    const next = [...current];
    next[idx] = updated;
    this.persist(next);
    this.generatePending();
    return updated;
  }

  remove(id: string): void {
    this.persist(this._items().filter((r) => r.id !== id));
  }

  toggle(id: string): void {
    const current = this._items();
    const idx = current.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const next = [...current];
    next[idx] = { ...next[idx], activo: !next[idx].activo };
    this.persist(next);
    if (next[idx].activo) this.generatePending();
  }

  /** Crea los movimientos pendientes hasta el mes actual (sin duplicar). */
  generatePending(): number {
    const today = todayIso();
    const currentYm = currentYearMonth();
    const todayDay = Number(today.slice(8, 10));
    let created = 0;
    const nextRules = this._items().map((rule) => {
      if (!rule.activo) return rule;
      let last = rule.lastGeneradoYm ?? null;
      const months = monthsBetween(rule.desde, currentYm);
      for (const ym of [...months].reverse()) {
        if (last && ym <= last) continue;
        if (ym === currentYm && todayDay < rule.diaDelMes) continue;
        if (this.alreadyGenerated(rule, ym)) {
          last = ym;
          continue;
        }
        const fecha = dateForDayInMonth(ym, rule.diaDelMes);
        if (rule.tipo === 'gasto') {
          this.gastos.add({
            fecha,
            importe: rule.importe,
            descripcion: rule.descripcion,
            categoria: rule.categoria,
            ...(rule.subcategoria ? { subcategoria: rule.subcategoria } : {}),
            recurrenteId: rule.id,
          });
        } else {
          this.ingresos.add({
            fecha,
            importe: rule.importe,
            descripcion: rule.descripcion,
            categoria: rule.categoria,
            recurrenteId: rule.id,
          });
        }
        created += 1;
        last = ym;
      }
      return last === rule.lastGeneradoYm ? rule : { ...rule, lastGeneradoYm: last ?? undefined };
    });

    if (created > 0 || nextRules.some((r, i) => r !== this._items()[i])) {
      this.persist(nextRules);
    }
    return created;
  }

  private alreadyGenerated(rule: MovimientoRecurrente, ym: string): boolean {
    if (rule.tipo === 'gasto') {
      return this.gastos.list().some(
        (g) => g.recurrenteId === rule.id && yearMonthKey(g.fecha) === ym
      );
    }
    return this.ingresos.list().some(
      (i) => i.recurrenteId === rule.id && yearMonthKey(i.fecha) === ym
    );
  }

  private persist(items: MovimientoRecurrente[]): void {
    const clean = items.map((r) => this.normalize(r));
    this._items.set(clean);
    if (this.uid) {
      void this.firestore.patch(this.uid, { recurrentes: clean }).catch((err) => {
        console.error('Error guardando programaciones en Firestore', err);
      });
    }
  }

  private normalize(item: MovimientoRecurrente): MovimientoRecurrente {
    const sub = item.subcategoria?.trim();
    const dia = Math.min(31, Math.max(1, Math.round(Number(item.diaDelMes) || 1)));
    const last = item.lastGeneradoYm?.trim();
    return {
      id: item.id,
      tipo: item.tipo === 'ingreso' ? 'ingreso' : 'gasto',
      diaDelMes: dia,
      importe: Number(item.importe) || 0,
      descripcion: String(item.descripcion ?? '').trim(),
      categoria: String(item.categoria ?? '').trim(),
      activo: item.activo !== false,
      desde: (item.desde || currentYearMonth()).slice(0, 7),
      ...(sub ? { subcategoria: sub } : {}),
      ...(last ? { lastGeneradoYm: last } : {}),
    };
  }
}
