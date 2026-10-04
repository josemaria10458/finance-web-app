/** Modelos de la API de mercado (`api/` en este repo). */

export interface ResultadoBusqueda {
  simbolo: string;
  nombre: string;
  tipo: string | null;
  tipoTexto: string | null;
  mercado: string | null;
  moneda: string | null;
}

export interface Cotizacion {
  /** Identificador con el que se pidió (ISIN o símbolo). */
  id: string;
  isin: string | null;
  simbolo: string | null;
  nombre?: string | null;
  /** Precio en la divisa en la que cotiza el activo. */
  precio: number | null;
  /** Precio convertido a `divisaBase`. */
  precioBase: number | null;
  moneda: string | null;
  divisaBase: string;
  cierreAnterior?: number | null;
  variacionDiaPct: number | null;
  mercado?: string | null;
  tipo?: string | null;
  /** Epoch en segundos. */
  actualizado?: number | null;
  error?: string;
}

export interface PesoNombrado {
  nombre: string;
  pesoPct: number;
}

export interface PosicionFondo {
  simbolo: string;
  nombre: string;
  pesoPct: number;
}

export interface DatosYahoo {
  nombre: string | null;
  tipo: string | null;
  moneda: string | null;
  mercado: string | null;
  gestora: string | null;
  categoria: string | null;
  terPct: number | null;
  patrimonio: number | null;
  rentabilidadYtdPct: number | null;
  rentabilidad3aPct: number | null;
  rentabilidad5aPct: number | null;
  dividendoPct: number | null;
  beta: number | null;
  per: number | null;
  nav: number | null;
  sectores: PesoNombrado[] | null;
  principalesPosiciones: PosicionFondo[] | null;
  tiposActivo: PesoNombrado[] | null;
}

export interface DatosMorningstar {
  nombre?: string;
  isin?: string;
  codigoMorningstar?: string;
  ticker?: string;
  mercado?: string;
  moneda?: string;
  tipoInversion?: string;
  terPct?: number;
  categoria?: string;
  indiceReferencia?: string;
}

export interface FichaInstrumento {
  simbolo: string;
  isin: string | null;
  cotizacion: Cotizacion;
  yahoo: DatosYahoo;
  morningstar: DatosMorningstar;
}

export interface PuntoHistorico {
  /** Epoch en segundos. */
  t: number;
  c: number;
}

export interface HistoricoPrecios {
  simbolo: string;
  moneda: string | null;
  rango: string;
  puntos: PuntoHistorico[];
}

export const RANGOS_HISTORICO = [
  { valor: '1mo', etiqueta: '1M' },
  { valor: '3mo', etiqueta: '3M' },
  { valor: '6mo', etiqueta: '6M' },
  { valor: '1y', etiqueta: '1A' },
  { valor: '5y', etiqueta: '5A' },
  { valor: 'max', etiqueta: 'Máx' },
] as const;

export type RangoHistorico = (typeof RANGOS_HISTORICO)[number]['valor'];

// --------------------------------------------------------------------------- //
// Trade Republic
// --------------------------------------------------------------------------- //

/**
 * Cómo pide Trade Republic el segundo factor: `app` se aprueba desde el móvil
 * y no tiene código; `autenticador` espera un TOTP.
 */
export type TrMetodo = 'app' | 'autenticador';

export type TrEstado = 'esperando' | 'codigo' | 'confirmada' | 'error';

export interface TrLoginResultado {
  sessionId: string;
  metodo: TrMetodo;
  segundosParaConfirmar: number;
  mensaje: string;
}

export interface TrEstadoSesion {
  estado: TrEstado;
  metodo: TrMetodo;
  mensaje: string | null;
}

export interface TrPosicion {
  isin: string | null;
  nombre: string;
  acciones: number | null;
  precioMedio: number | null;
  costeTotal: number | null;
  precioActual: number | null;
  simbolo: string | null;
  variacionDiaPct: number | null;
  valorMercado: number | null;
  plusvalia: number | null;
}

export interface TrEfectivo {
  moneda: string;
  importe: number | null;
}

export interface TrCartera {
  posiciones: TrPosicion[];
  efectivo: TrEfectivo[];
  divisaBase: string;
}
