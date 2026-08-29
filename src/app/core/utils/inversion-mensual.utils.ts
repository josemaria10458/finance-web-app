import {
  InversionMesResumen,
  MovimientoInversionMes,
  OperacionBolsa,
  costeOperacion,
} from '../models';
import {
  buildMonthOptions,
  currentYearMonth,
  formatMesLabel,
  yearMonthKey,
} from '../utils/date.utils';

export function esCompraEnMes(op: OperacionBolsa, ym: string): boolean {
  return !op.esVenta && yearMonthKey(op.fechaOperacion) === ym;
}

export function esVentaEnMes(op: OperacionBolsa, ym: string): boolean {
  if (op.esVenta) {
    return yearMonthKey(op.fechaVenta ?? op.fechaOperacion) === ym;
  }
  if (op.precioVentaAccion != null) {
    return yearMonthKey(op.fechaVenta ?? op.fechaOperacion) === ym;
  }
  return false;
}

export function mesesConActividad(ops: OperacionBolsa[]): string[] {
  const keys = new Set<string>();
  for (const o of ops) {
    if (!o.esVenta) {
      keys.add(yearMonthKey(o.fechaOperacion));
    }
    if (o.esVenta || o.precioVentaAccion != null) {
      keys.add(yearMonthKey(o.fechaVenta ?? o.fechaOperacion));
    }
  }
  return [...keys].sort().reverse();
}

export function buildResumenMensual(ops: OperacionBolsa[]): InversionMesResumen[] {
  const meses = buildMonthOptions(mesesConActividad(ops));
  return meses.map((ym) => resumenDeMes(ops, ym));
}

export function resumenDeMes(
  ops: OperacionBolsa[],
  ym: string
): InversionMesResumen {
  let invertido = 0;
  let resultado = 0;
  let numCompras = 0;
  let numVentas = 0;
  let costeVentas = 0;

  for (const o of ops) {
    if (esCompraEnMes(o, ym)) {
      invertido += costeOperacion(o);
      numCompras += 1;
    }
    if (esVentaEnMes(o, ym)) {
      resultado += o.resultadoNeto;
      costeVentas += costeOperacion(o);
      numVentas += 1;
    }
  }

  let rentabilidadPct: number | null = null;
  if (invertido > 0) {
    rentabilidadPct = (resultado / invertido) * 100;
  } else if (costeVentas > 0 && numVentas > 0) {
    rentabilidadPct = (resultado / costeVentas) * 100;
  }

  return {
    mesKey: ym,
    mesLabel: formatMesLabel(ym),
    invertido,
    resultado,
    rentabilidadPct,
    numCompras,
    numVentas,
  };
}

export function movimientosEnMes(
  ops: OperacionBolsa[],
  ym: string
): MovimientoInversionMes[] {
  const out: MovimientoInversionMes[] = [];

  for (const o of ops) {
    if (esCompraEnMes(o, ym)) {
      out.push({
        operacion: o,
        tipo: 'compra',
        fecha: o.fechaOperacion,
        importe: costeOperacion(o),
      });
    }
    if (esVentaEnMes(o, ym)) {
      out.push({
        operacion: o,
        tipo: 'venta',
        fecha: o.fechaVenta ?? o.fechaOperacion,
        importe: o.resultadoNeto,
      });
    }
  }

  return out.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function mesPorDefecto(ops: OperacionBolsa[]): string {
  const activos = mesesConActividad(ops);
  if (activos.length) return activos[0];
  return currentYearMonth();
}
