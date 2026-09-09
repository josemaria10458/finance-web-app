import { OperacionBolsa } from '../models';

/** Tramos IRPF base del ahorro (territorio común, 2025–2026). */
const TRAMOS_IRPF_AHORRO: { hasta: number; tipo: number }[] = [
  { hasta: 6_000, tipo: 0.19 },
  { hasta: 50_000, tipo: 0.21 },
  { hasta: 200_000, tipo: 0.23 },
  { hasta: 300_000, tipo: 0.27 },
  { hasta: Number.POSITIVE_INFINITY, tipo: 0.3 },
];

/** Cuota IRPF sobre la base liquidable del ahorro. */
export function cuotaIrpfAhorro(base: number): number {
  if (!Number.isFinite(base) || base <= 0) return 0;
  let remaining = base;
  let prev = 0;
  let cuota = 0;
  for (const tramo of TRAMOS_IRPF_AHORRO) {
    const ancho = tramo.hasta - prev;
    const parte = Math.min(remaining, ancho);
    if (parte > 0) {
      cuota += parte * tramo.tipo;
      remaining -= parte;
    }
    prev = tramo.hasta;
    if (remaining <= 0) break;
  }
  return Math.round(cuota * 100) / 100;
}

export function esVentaRealizada(op: OperacionBolsa): boolean {
  if (op.consolidadaEnId) return false;
  return op.esVenta === true || op.precioVentaAccion != null;
}

/** Plusvalía bruta (antes de la provisión de impuestos). */
export function gananciaPatrimonial(op: OperacionBolsa): number {
  if (!esVentaRealizada(op)) return 0;
  return op.resultadoNeto + (op.provisionImpuestos ?? 0);
}

export function impuestosAPagarDelAnio(
  ops: OperacionBolsa[],
  year: number
): number {
  const prefix = `${year}-`;
  let base = 0;
  for (const o of ops) {
    if (!esVentaRealizada(o)) continue;
    const fecha = o.fechaVenta ?? o.fechaOperacion;
    if (!fecha.startsWith(prefix)) continue;
    base += gananciaPatrimonial(o);
  }
  return cuotaIrpfAhorro(base);
}
