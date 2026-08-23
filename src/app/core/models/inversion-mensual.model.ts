import { OperacionBolsa } from './operacion-bolsa.model';

export interface InversionMesResumen {
  mesKey: string;
  mesLabel: string;
  invertido: number;
  resultado: number;
  /** Puntos porcentuales; null si no aplica. */
  rentabilidadPct: number | null;
  numCompras: number;
  numVentas: number;
}

export type TipoMovimientoInversion = 'compra' | 'venta';

export interface MovimientoInversionMes {
  operacion: OperacionBolsa;
  tipo: TipoMovimientoInversion;
  fecha: string;
  importe: number;
}
