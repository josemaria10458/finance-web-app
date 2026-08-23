import { Injectable, computed, inject, signal } from '@angular/core';
import {
  OperacionBolsa,
  OperacionBolsaInput,
  costeOperacion,
} from '../models';
import { todayIso } from '../utils/date.utils';
import { xirrFromIso } from '../utils/xirr.utils';
import { StorageService } from './storage.service';

const STORAGE_BASE = 'finanzas.operaciones-bolsa';

@Injectable({ providedIn: 'root' })
export class InversionesService {
  private readonly storage = inject(StorageService);
  private uid: string | null = null;
  private readonly _operaciones = signal<OperacionBolsa[]>([]);

  readonly operaciones = this._operaciones.asReadonly();

  readonly abiertas = computed(() =>
    this._operaciones().filter((o) => o.precioVentaAccion == null)
  );

  readonly cerradas = computed(() =>
    this._operaciones().filter((o) => o.precioVentaAccion != null)
  );

  /** Ventas del Excel (Inversión negativa). */
  readonly ventas = computed(() =>
    this._operaciones().filter((o) => o.esVenta === true)
  );

  readonly capitalInvertidoAbierto = computed(() =>
    this.abiertas().reduce((sum, o) => sum + costeOperacion(o), 0)
  );

  readonly resultadoNetoCerrado = computed(() =>
    this.cerradas().reduce((sum, o) => sum + o.resultadoNeto, 0)
  );

  readonly resultadoNetoVentas = computed(() =>
    this.ventas().reduce((sum, o) => sum + o.resultadoNeto, 0)
  );

  /** XIRR anualizado de la cartera (flujos de compra/venta). */
  readonly xirrCartera = computed(() => {
    const ops = this._operaciones();
    if (!ops.length) {
      return null;
    }
    const flows: { amount: number; dateIso: string }[] = [];
    for (const o of ops) {
      flows.push({
        amount: -costeOperacion(o),
        dateIso: o.fechaOperacion,
      });
      if (o.precioVentaAccion != null) {
        const ingreso =
          o.precioVentaAccion * o.numeroAcciones - (o.provisionImpuestos ?? 0);
        flows.push({
          amount: ingreso,
          dateIso: o.fechaVenta ?? o.fechaOperacion,
        });
      }
    }
    return xirrFromIso(flows);
  });

  list(): OperacionBolsa[] {
    return this._operaciones();
  }

  bindUser(uid: string | null): void {
    this.uid = uid;
    if (!uid) {
      this._operaciones.set([]);
      return;
    }
    const userKey = this.storage.keyFor(STORAGE_BASE, uid);
    const migrated = this.storage.migrateLegacy<OperacionBolsa[]>(
      STORAGE_BASE,
      userKey
    );
    this._operaciones.set(migrated ?? this.storage.read(userKey, []));
  }

  addCompra(
    input: Omit<
      OperacionBolsaInput,
      'precioVentaAccion' | 'fechaVenta' | 'provisionImpuestos'
    >
  ): OperacionBolsa {
    const op: OperacionBolsa = {
      ...input,
      id: crypto.randomUUID(),
      precioVentaAccion: undefined,
      fechaVenta: undefined,
      provisionImpuestos: undefined,
      resultadoNeto: 0,
      rentabilidadPct: 0,
      esVenta: false,
    };
    this.persist([op, ...this._operaciones()]);
    return op;
  }

  updateCompra(
    id: string,
    input: Omit<
      OperacionBolsaInput,
      'precioVentaAccion' | 'fechaVenta' | 'provisionImpuestos'
    >
  ): OperacionBolsa | null {
    const current = this._operaciones();
    const idx = current.findIndex((o) => o.id === id);
    if (idx < 0) {
      return null;
    }
    const prev = current[idx];
    if (prev.precioVentaAccion != null) {
      return null;
    }
    const updated: OperacionBolsa = {
      ...prev,
      ...input,
      resultadoNeto: 0,
      rentabilidadPct: 0,
    };
    const next = [...current];
    next[idx] = updated;
    this.persist(next);
    return updated;
  }

  registrarVenta(
    id: string,
    precioVentaAccion: number,
    provisionImpuestos = 0,
    fechaVenta = todayIso()
  ): OperacionBolsa | null {
    const current = this._operaciones();
    const idx = current.findIndex((o) => o.id === id);
    if (idx < 0) {
      return null;
    }
    const op = current[idx];
    const coste = costeOperacion(op);
    const ingresoBruto = precioVentaAccion * op.numeroAcciones;
    const resultadoNeto = ingresoBruto - coste - provisionImpuestos;
    const rentabilidadPct = coste > 0 ? (resultadoNeto / coste) * 100 : 0;
    const updated: OperacionBolsa = {
      ...op,
      precioVentaAccion,
      fechaVenta,
      provisionImpuestos,
      resultadoNeto,
      rentabilidadPct,
    };
    const next = [...current];
    next[idx] = updated;
    this.persist(next);
    return updated;
  }

  remove(id: string): void {
    this.persist(this._operaciones().filter((o) => o.id !== id));
  }

  clearAll(): void {
    this.persist([]);
  }

  importMany(
    items: Omit<
      OperacionBolsaInput,
      'resultadoNeto' | 'rentabilidadPct'
    >[],
    replace = false
  ): number {
    const nuevos: OperacionBolsa[] = items.map((input) => {
      const shares = Math.abs(input.numeroAcciones);
      const pCompra = input.precioCompraAccion;
      const coste =
        input.inversion > 0 ? input.inversion : pCompra * shares;
      const comision = Math.abs(input.comision);
      let resultadoNeto = 0;
      let rentabilidadPct = 0;
      if (input.precioVentaAccion != null) {
        const bruto = input.precioVentaAccion * shares;
        resultadoNeto =
          bruto - coste - comision - (input.provisionImpuestos ?? 0);
        rentabilidadPct = coste > 0 ? (resultadoNeto / coste) * 100 : 0;
      }
      return {
        ...input,
        inversion: coste,
        comision,
        numeroAcciones: shares,
        esVenta: input.esVenta === true,
        id: crypto.randomUUID(),
        resultadoNeto,
        rentabilidadPct,
      };
    });
    this.persist(replace ? nuevos : [...nuevos, ...this._operaciones()]);
    return nuevos.length;
  }

  private persist(operaciones: OperacionBolsa[]): void {
    this._operaciones.set(operaciones);
    if (this.uid) {
      this.storage.write(
        this.storage.keyFor(STORAGE_BASE, this.uid),
        operaciones
      );
    }
  }
}
