export interface OperacionBolsa {
  id: string;
  empresa: string;
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
