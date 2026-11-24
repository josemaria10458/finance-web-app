import { OperacionBolsa, claveImportOperacion } from '../models';

const EPS = 1e-8;

function claveActivo(op: OperacionBolsa): string {
  const isin = op.isin?.trim();
  if (isin) return isin.toUpperCase();
  return op.empresa
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function esCompraAbierta(op: OperacionBolsa): boolean {
  return !op.esVenta && op.precioVentaAccion == null && !op.consolidadaEnId;
}

/** Venta importada (fila propia) que aún no se ha enlazado con sus compras. */
function esVentaSinEnlazar(op: OperacionBolsa): boolean {
  return op.esVenta === true && !op.origenIds?.length;
}

/**
 * Enlaza las ventas importadas con las compras que cierran, por orden FIFO
 * (las más antiguas primero, y nunca posteriores a la fecha de venta).
 *
 * Las compras consumidas por completo quedan marcadas con `consolidadaEnId`;
 * si una venta cierra solo parte de una compra, esa compra se divide en la
 * parte vendida y la parte que sigue abierta. Es idempotente: las ventas ya
 * enlazadas (con `origenIds`) no se vuelven a procesar.
 */
export function conciliarVentas(ops: OperacionBolsa[]): {
  operaciones: OperacionBolsa[];
  cambios: boolean;
} {
  const ventas = ops
    .filter(esVentaSinEnlazar)
    .sort((a, b) =>
      (a.fechaVenta ?? a.fechaOperacion).localeCompare(
        b.fechaVenta ?? b.fechaOperacion
      )
    );
  if (!ventas.length) return { operaciones: ops, cambios: false };

  const lotesPorActivo = new Map<string, OperacionBolsa[]>();
  for (const op of ops) {
    if (!esCompraAbierta(op)) continue;
    const key = claveActivo(op);
    const list = lotesPorActivo.get(key) ?? [];
    list.push({ ...op });
    lotesPorActivo.set(key, list);
  }
  for (const list of lotesPorActivo.values()) {
    list.sort((a, b) => a.fechaOperacion.localeCompare(b.fechaOperacion));
  }

  const actualizadas = new Map<string, OperacionBolsa>();
  const nuevas: OperacionBolsa[] = [];
  let cambios = false;

  for (const venta of ventas) {
    const fechaVenta = venta.fechaVenta ?? venta.fechaOperacion;
    const lotes = lotesPorActivo.get(claveActivo(venta)) ?? [];
    let pendiente = Math.abs(venta.numeroAcciones);
    const origenIds: string[] = [];

    for (const lote of lotes) {
      if (pendiente <= EPS) break;
      if (lote.consolidadaEnId || lote.numeroAcciones <= EPS) continue;
      if (lote.fechaOperacion > fechaVenta) break;

      if (lote.numeroAcciones <= pendiente + EPS) {
        pendiente -= lote.numeroAcciones;
        lote.consolidadaEnId = venta.id;
        actualizadas.set(lote.id, lote);
        origenIds.push(lote.id);
        continue;
      }

      const fraccion = pendiente / lote.numeroAcciones;
      lote.claveImport = claveImportOperacion(lote);
      const vendida: OperacionBolsa = {
        ...lote,
        id: crypto.randomUUID(),
        numeroAcciones: pendiente,
        inversion: lote.inversion * fraccion,
        comision: lote.comision * fraccion,
        consolidadaEnId: venta.id,
      };
      lote.numeroAcciones -= pendiente;
      lote.inversion -= vendida.inversion;
      lote.comision -= vendida.comision;
      actualizadas.set(lote.id, lote);
      nuevas.push(vendida);
      origenIds.push(vendida.id);
      pendiente = 0;
    }

    if (origenIds.length) {
      actualizadas.set(venta.id, { ...venta, origenIds });
      cambios = true;
    }
  }

  if (!cambios) return { operaciones: ops, cambios: false };

  return {
    operaciones: [
      ...ops.map((o) => actualizadas.get(o.id) ?? o),
      ...nuevas,
    ],
    cambios: true,
  };
}
