import { Injectable, computed, inject, signal } from '@angular/core';
import { currentYearMonth } from '../utils/date.utils';
import { GastosService } from './gastos.service';
import { IngresosService } from './ingresos.service';
import { InversionesService } from './inversiones.service';
import { UserFirestoreService } from './user-firestore.service';

@Injectable({ providedIn: 'root' })
export class FiltroAnioService {
  private readonly firestore = inject(UserFirestoreService);
  private readonly gastosService = inject(GastosService);
  private readonly ingresosService = inject(IngresosService);
  private readonly inversionesService = inject(InversionesService);

  private uid: string | null = null;
  private readonly _year = signal<number | null>(null);

  readonly year = this._year.asReadonly();

  readonly availableYears = computed(() => {
    const years = new Set<number>();
    const current = Number(currentYearMonth().slice(0, 4));
    years.add(current);

    for (const g of this.gastosService.gastos()) {
      years.add(Number(g.fecha.slice(0, 4)));
    }
    for (const i of this.ingresosService.ingresos()) {
      years.add(Number(i.fecha.slice(0, 4)));
    }
    for (const o of this.inversionesService.operaciones()) {
      years.add(Number(o.fechaOperacion.slice(0, 4)));
      if (o.fechaVenta) {
        years.add(Number(o.fechaVenta.slice(0, 4)));
      }
    }

    return [...years]
      .filter((y) => Number.isFinite(y))
      .sort((a, b) => b - a);
  });

  setUid(uid: string | null): void {
    this.uid = uid;
  }

  clearUser(): void {
    this.uid = null;
    this._year.set(null);
  }

  hydrate(year: number | null): void {
    this._year.set(year);
  }

  setYear(year: number | null): void {
    this._year.set(year);
    if (this.uid) {
      void this.firestore.patch(this.uid, { filtroAnio: year });
    }
  }

  /** true si la fecha ISO pertenece al año seleccionado (o no hay filtro). */
  matchesDate(iso: string): boolean {
    const y = this._year();
    return y == null || iso.startsWith(`${y}-`);
  }

  /** true si YYYY-MM pertenece al año seleccionado. */
  matchesYearMonth(ym: string): boolean {
    const y = this._year();
    return y == null || ym.startsWith(`${y}-`);
  }

  /** Año de referencia para rangos (mes/trimestre/año). */
  referenceYear(): number {
    return this._year() ?? Number(currentYearMonth().slice(0, 4));
  }
}
