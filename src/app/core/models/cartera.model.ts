import { ClaseActivo } from './operacion-bolsa.model';

/** Posición abierta agregada a partir de las compras sin vender. */
export interface PosicionCartera {
  /** ISIN si lo hay; si no, el nombre normalizado del activo. */
  clave: string;
  isin?: string;
  empresa: string;
  claseActivo?: ClaseActivo;
  acciones: number;
  /** Inversión + comisiones de los lotes que siguen abiertos. */
  costeTotal: number;
  precioMedio: number;
  /** Nº de compras abiertas que componen la posición. */
  lotes: number;
  primeraCompra: string;
  ultimaCompra: string;
}

/** Posición enriquecida con el precio de mercado actual. */
export interface PosicionValorada extends PosicionCartera {
  precioActual: number | null;
  moneda: string | null;
  valorMercado: number | null;
  plusvalia: number | null;
  plusvaliaPct: number | null;
  /** Peso sobre el valor total de la cartera. */
  pesoPct: number | null;
  variacionDiaPct: number | null;
  /** Ticker de Yahoo Finance con el que se resolvió el precio. */
  simbolo: string | null;
}

export interface TotalesCartera {
  coste: number;
  valorMercado: number;
  plusvalia: number;
  plusvaliaPct: number | null;
  /** Posiciones sin precio de mercado, excluidas del valor total. */
  sinPrecio: number;
}

/** Origen de los datos que se muestran en «Mi cartera». */
export type OrigenCartera = 'importado' | 'trade-republic';
