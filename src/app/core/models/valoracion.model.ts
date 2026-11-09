/** Cómo se pinta cada fila del análisis. */
export type FormatoFila = 'importe' | 'numero' | 'precio' | 'pct' | 'veces';

export interface FilaAnalisis {
  clave: string;
  etiqueta: string;
  formato: FormatoFila;
  /** Un valor por ejercicio, en el mismo orden que `ejercicios`. */
  valores: (number | null)[];
  /** Variación del último ejercicio frente al anterior. */
  varAnual: number | null;
  /** Crecimiento anual compuesto entre el primer y el último ejercicio. */
  cagr: number | null;
}

export interface GrupoAnalisis {
  titulo: string;
  filas: FilaAnalisis[];
}

/** Punto de partida de la proyección: el último ejercicio cerrado. */
export interface BaseProyeccion {
  ventas: number | null;
  amortizaciones: number;
  /** EBIT, o el beneficio antes de impuestos si la empresa no lo presenta. */
  ebit: number | null;
  /** Gasto financiero neto (EBIT − BAI); negativo si la empresa cobra intereses. */
  intereses: number;
  capex: number | null;
  beneficioNeto: number | null;
  /** BAI sin extraordinarios − beneficio neto del último ejercicio. */
  impuestos: number | null;
  acciones: number | null;
  deudaNeta: number | null;
  patrimonio: number | null;
}

export interface SupuestosValoracion {
  crecimiento: number;
  margenEbit: number;
  tipoImpositivo: number;
  variacionAcciones: number;
  /** Millones que se suman al capex del primer año proyectado (negativo para reducirlo). */
  ajusteCapex: number;
  per: number;
  pfcf: number;
  evEbitda: number;
  evEbit: number;
}

export type MetodoValoracion = 'per' | 'pfcf' | 'evEbitda' | 'evEbit';

export interface ReferenciaMultiplo {
  bajo: number;
  medio: number;
  alto: number;
  mediaBolsas: number;
}

/** Respuesta de `/valuation/{id}`; importes en millones de `divisa`. */
export interface AnalisisValoracion {
  simbolo: string;
  nombre: string | null;
  sector: string | null;
  industria: string | null;
  descripcion: string | null;
  mercado: string | null;
  empleados: number | null;
  divisa: string;
  divisaEstados: string;
  cambioHoy: number | null;
  precioActual: number | null;
  accionesActuales: number | null;
  ejercicios: number[];
  fechasCierre: string[];
  grupos: GrupoAnalisis[];
  sinEbit: boolean;
  base: BaseProyeccion;
  supuestos: SupuestosValoracion;
  referencias: Record<MetodoValoracion, ReferenciaMultiplo>;
  tipoRoic: number;
  avisos: string[];
}
