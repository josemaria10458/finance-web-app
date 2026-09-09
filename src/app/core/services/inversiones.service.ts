import { Injectable, computed, inject, signal } from '@angular/core';
import {
  InversionMesResumen,
  MovimientoInversionMes,
  OperacionBolsa,
  OperacionBolsaInput,
  costeOperacion,
  normalizeRentabilidadPct,
} from '../models';
import { todayIso } from '../utils/date.utils';
import {
  buildResumenMensual,
  mesPorDefecto,
  mesesConActividad,
  movimientosEnMes,
  resumenDeMes,
} from '../utils/inversion-mensual.utils';
import { xirrFromIso } from '../utils/xirr.utils';
import { UserFirestoreService } from './user-firestore.service';

/**
 * Flujos de caja para XIRR según el libro del Excel:
 * - Compra (Inversión > 0): salida de dinero en fecha de operación
 * - Venta (Inversión < 0): entrada de dinero en fecha de venta
 * - Posiciones abiertas: valor residual = coste (hoy), para no tratarlas como pérdida
 */
export function buildXirrCashFlows(
  ops: OperacionBolsa[],
  asOfIso = todayIso()
): { amount: number; dateIso: string }[] {
  const flows: { amount: number; dateIso: string }[] = [];
  let capitalAbierto = 0;

  for (const o of ops) {
    if (o.consolidadaEnId) {
      const coste = costeOperacion(o);
      if (coste !== 0) {
        flows.push({ amount: -coste, dateIso: o.fechaOperacion });
      }
      continue;
    }

    if (o.esVenta) {
      const ingreso = ingresoVenta(o);
      if (ingreso !== 0) {
        flows.push({
          amount: ingreso,
          dateIso: o.fechaVenta ?? o.fechaOperacion,
        });
      }
      continue;
    }

    const coste = costeOperacion(o);
    if (coste !== 0) {
      flows.push({ amount: -coste, dateIso: o.fechaOperacion });
    }

    if (o.precioVentaAccion != null) {
      // Compra cerrada en la misma fila (poco habitual en el Excel).
      const ingreso = ingresoVenta(o);
      if (ingreso !== 0) {
        flows.push({
          amount: ingreso,
          dateIso: o.fechaVenta ?? o.fechaOperacion,
        });
      }
    } else {
      capitalAbierto += coste;
    }
  }

  // Sin valor residual, el XIRR interpreta el capital aún invertido como pérdida total.
  if (capitalAbierto > 0) {
    flows.push({ amount: capitalAbierto, dateIso: asOfIso });
  }

  return flows;
}

/** Dinero recuperado en una venta: coste + resultado neto (del Excel o calculado). */
function ingresoVenta(o: OperacionBolsa): number {
  const coste = costeOperacion(o);

  if (o.resultadoNeto !== 0) {
    return coste + o.resultadoNeto;
  }

  if (o.precioVentaAccion != null) {
    return (
      o.precioVentaAccion * o.numeroAcciones - (o.provisionImpuestos ?? 0)
    );
  }

  return coste + o.resultadoNeto;
}

@Injectable({ providedIn: 'root' })
export class InversionesService {
  private readonly firestore = inject(UserFirestoreService);
  private uid: string | null = null;
  private readonly _operaciones = signal<OperacionBolsa[]>([]);

  readonly operaciones = this._operaciones.asReadonly();

  readonly abiertas = computed(() =>
    this._operaciones().filter(
      (o) => !o.esVenta && o.precioVentaAccion == null && !o.consolidadaEnId
    )
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
    this._operaciones()
      .filter((o) => !o.consolidadaEnId && (o.esVenta === true || o.precioVentaAccion != null))
      .reduce((sum, o) => sum + o.resultadoNeto, 0)
  );

  /**
   * Rentabilidad anual (XIRR) de la cartera.
   * Usa compras como salidas, ventas como entradas y el coste
   * de posiciones abiertas como valor residual a hoy.
   */
  readonly rentabilidadAnual = computed(() => {
    const ops = this._operaciones();
    if (!ops.length) {
      return null;
    }
    return xirrFromIso(buildXirrCashFlows(ops));
  });

  /** Alias legado. */
  readonly xirrCartera = this.rentabilidadAnual;

  readonly resumenMensual = computed((): InversionMesResumen[] =>
    buildResumenMensual(this._operaciones())
  );

  readonly mesesConDatos = computed(() =>
    mesesConActividad(this._operaciones())
  );

  resumenMes(ym: string): InversionMesResumen {
    return resumenDeMes(this._operaciones(), ym);
  }

  movimientosMes(ym: string): MovimientoInversionMes[] {
    return movimientosEnMes(this._operaciones(), ym);
  }

  mesInicial(): string {
    return mesPorDefecto(this._operaciones());
  }

  list(): OperacionBolsa[] {
    return this._operaciones();
  }

  setUid(uid: string | null): void {
    this.uid = uid;
  }

  clearUser(): void {
    this.uid = null;
    this._operaciones.set([]);
  }

  hydrate(operaciones: OperacionBolsa[]): void {
    this._operaciones.set(operaciones);
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
    if (prev.precioVentaAccion != null || prev.consolidadaEnId) {
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

  /** Venta sin una compra abierta previa (compra + cierre en el mismo registro). */
  addVentaCerrada(input: {
    empresa: string;
    fechaOperacion: string;
    fechaVenta: string;
    inversion: number;
    comision: number;
    precioCompraAccion: number;
    numeroAcciones: number;
    precioVentaAccion: number;
    provisionImpuestos?: number;
  }): OperacionBolsa {
    const comision = Math.abs(input.comision) || 0;
    const shares = Math.abs(input.numeroAcciones);
    const inversion = Math.abs(input.inversion);
    const provision = Math.abs(input.provisionImpuestos ?? 0);
    const coste = costeOperacion({ inversion, comision });
    const resultadoNeto =
      input.precioVentaAccion * shares - coste - provision;
    const rentabilidadPct = coste > 0 ? (resultadoNeto / coste) * 100 : 0;
    const op: OperacionBolsa = {
      id: crypto.randomUUID(),
      empresa: input.empresa,
      fechaOperacion: input.fechaOperacion,
      inversion,
      comision,
      precioCompraAccion: input.precioCompraAccion,
      numeroAcciones: shares,
      precioVentaAccion: input.precioVentaAccion,
      fechaVenta: input.fechaVenta,
      provisionImpuestos: provision || undefined,
      resultadoNeto,
      rentabilidadPct,
      esVenta: false,
    };
    this.persist([op, ...this._operaciones()]);
    return op;
  }

  registrarVenta(
    id: string,
    precioVentaAccion: number,
    provisionImpuestos = 0,
    fechaVenta = todayIso()
  ): OperacionBolsa | null {
    const n = this.registrarVentas(
      [id],
      precioVentaAccion,
      provisionImpuestos,
      fechaVenta
    );
    if (!n) return null;
    return this._operaciones().find((o) => o.id === id) ?? null;
  }

  /** Cierra varias posiciones abiertas con el mismo precio y fecha. */
  registrarVentas(
    ids: string[],
    precioVentaAccion: number,
    provisionImpuestos = 0,
    fechaVenta = todayIso()
  ): number {
    const wanted = new Set(ids.filter(Boolean));
    if (!wanted.size) return 0;

    const current = this._operaciones();
    const targets = current.filter(
      (o) => wanted.has(o.id) && !o.esVenta && o.precioVentaAccion == null && !o.consolidadaEnId
    );
    if (!targets.length) return 0;

    if (targets.length > 1) {
      return this.consolidarEnUnaVenta(
        current,
        targets,
        precioVentaAccion,
        provisionImpuestos,
        fechaVenta
      );
    }

    const op = targets[0];
    const coste = costeOperacion(op);
    const resultadoNeto =
      precioVentaAccion * op.numeroAcciones - coste - provisionImpuestos;
    const rentabilidadPct = coste > 0 ? (resultadoNeto / coste) * 100 : 0;
    const next = current.map((o) =>
      o.id === op.id
        ? {
            ...o,
            precioVentaAccion,
            fechaVenta,
            ...(provisionImpuestos ? { provisionImpuestos } : {}),
            resultadoNeto,
            rentabilidadPct,
          }
        : o
    );
    this.persist(next);
    return 1;
  }

  private consolidarEnUnaVenta(
    current: OperacionBolsa[],
    targets: OperacionBolsa[],
    precioVentaAccion: number,
    provisionImpuestos: number,
    fechaVenta: string
  ): number {
    const shares = targets.reduce((s, o) => s + o.numeroAcciones, 0);
    const inversion = targets.reduce((s, o) => s + o.inversion, 0);
    const comision = targets.reduce((s, o) => s + o.comision, 0);
    const coste = targets.reduce((s, o) => s + costeOperacion(o), 0);
    const precioCompraAccion =
      shares > 0
        ? targets.reduce((s, o) => s + o.precioCompraAccion * o.numeroAcciones, 0) /
          shares
        : 0;
    const empresas = [
      ...new Set(targets.map((o) => o.empresa.trim()).filter(Boolean)),
    ];
    const resultadoNeto =
      precioVentaAccion * shares - coste - provisionImpuestos;
    const rentabilidadPct = coste > 0 ? (resultadoNeto / coste) * 100 : 0;
    const ventaId = crypto.randomUUID();
    const origenIds = targets.map((o) => o.id);
    const venta: OperacionBolsa = {
      id: ventaId,
      empresa: (empresas.join(', ') || 'Varias').slice(0, 80),
      fechaOperacion: fechaVenta,
      inversion,
      comision,
      precioCompraAccion,
      numeroAcciones: shares,
      precioVentaAccion,
      fechaVenta,
      ...(provisionImpuestos ? { provisionImpuestos } : {}),
      resultadoNeto,
      rentabilidadPct,
      esVenta: true,
      origenIds,
    };
    const origen = new Set(origenIds);
    const next = current.map((o) =>
      origen.has(o.id) ? { ...o, consolidadaEnId: ventaId } : o
    );
    this.persist([venta, ...next]);
    return 1;
  }

  remove(id: string): void {
    const next = this._operaciones()
      .filter((o) => o.id !== id)
      .map((o) => {
        if (o.consolidadaEnId !== id) return o;
        const { consolidadaEnId: _omit, ...rest } = o;
        return rest;
      });
    this.persist(next);
  }

  clearAll(): void {
    this.persist([]);
  }

  importMany(items: OperacionBolsaInput[], replace = false): number {
    const nuevos: OperacionBolsa[] = items.map((input) => {
      const shares = Math.abs(input.numeroAcciones);
      const comision = Math.abs(input.comision);
      const inversionBase =
        input.inversion > 0
          ? input.inversion
          : input.precioCompraAccion * shares;
      const costeTotal = costeOperacion({
        inversion: inversionBase,
        comision,
      });

      const hasExcelResultado = input.resultadoNeto != null;
      const hasExcelRentabilidad = input.rentabilidadPct != null;
      const cerrada =
        input.esVenta === true ||
        input.precioVentaAccion != null ||
        hasExcelResultado;

      let resultadoNeto = input.resultadoNeto ?? 0;
      let rentabilidadPct = input.rentabilidadPct ?? 0;

      if (!hasExcelResultado && cerrada && input.precioVentaAccion != null) {
        const bruto = input.precioVentaAccion * shares;
        resultadoNeto =
          bruto - costeTotal - (input.provisionImpuestos ?? 0);
      }

      if (hasExcelRentabilidad) {
        rentabilidadPct = normalizeRentabilidadPct(rentabilidadPct);
      } else if (cerrada && costeTotal > 0) {
        rentabilidadPct = (resultadoNeto / costeTotal) * 100;
      }

      return {
        ...input,
        inversion: inversionBase,
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
      void this.firestore.patch(this.uid, { operaciones });
    }
  }
}
