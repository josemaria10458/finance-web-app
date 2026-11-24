/** Tipo de activo tal y como lo etiqueta Trade Republic en su export. */
export type ClaseActivo = 'FUND' | 'STOCK' | 'CRYPTO' | 'BOND' | 'OTHER';

export interface OperacionBolsa {
  id: string;
  empresa: string;
  /** ISIN del activo (o ticker en cripto); permite buscar su precio de mercado. */
  isin?: string;
  claseActivo?: ClaseActivo;
  fechaOperacion: string; // ISO date YYYY-MM-DD
  inversion: number;
  precioCompraAccion: number;
  comision: number;
  numeroAcciones: number;
  precioVentaAccion?: number;
  fechaVenta?: string; // ISO date; se rellena al cerrar
  resultadoNeto: number;
  rentabilidadPct: number;
  provisionImpuestos?: number;
  /** true si en el Excel la columna Inversión era negativa (venta). */
  esVenta?: boolean;
  /** Lotes de compra absorbidos por una venta unificada. */
  origenIds?: string[];
  /** Esta compra se vendió dentro de la venta con este id. */
  consolidadaEnId?: string;
  /**
   * Huella de la fila original del archivo importado. Se conserva cuando la
   * operación se divide o se edita para que reimportar no la duplique.
   */
  claveImport?: string;
}

/** Dos operaciones con la misma clave son la misma fila del archivo importado. */
export function claveImportOperacion(o: OperacionBolsa): string {
  if (o.claveImport) return o.claveImport;
  return [
    o.empresa,
    o.isin ?? '',
    o.fechaOperacion,
    o.inversion,
    o.precioCompraAccion,
    o.numeroAcciones,
    o.comision,
    o.precioVentaAccion ?? '',
    o.fechaVenta ?? '',
    o.esVenta === true,
  ].join('|');
}

export type OperacionBolsaInput = Omit<
  OperacionBolsa,
  'id' | 'resultadoNeto' | 'rentabilidadPct'
> & {
  resultadoNeto?: number;
  rentabilidadPct?: number;
};

export function costeOperacion(
  op: Pick<OperacionBolsa, 'inversion' | 'comision'>
): number {
  return op.inversion + op.comision;
}

/** Excel suele guardar 19,5 % como 0,195; la UI muestra puntos porcentuales (19,5). */
export function normalizeRentabilidadPct(value: number): number {
  if (value !== 0 && Math.abs(value) <= 1) {
    return value * 100;
  }
  return value;
}
