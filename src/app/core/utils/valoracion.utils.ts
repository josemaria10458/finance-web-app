import {
  AnalisisValoracion,
  MetodoValoracion,
  SupuestosValoracion,
} from '../models';

export const METODOS_VALORACION: { clave: MetodoValoracion; etiqueta: string }[] = [
  { clave: 'per', etiqueta: 'PER' },
  { clave: 'pfcf', etiqueta: 'P / FCF' },
  { clave: 'evEbitda', etiqueta: 'EV / EBITDA' },
  { clave: 'evEbit', etiqueta: 'EV / EBIT' },
];

export const ANIOS_PROYECCION = 5;

export interface AnioProyectado {
  anio: number;
  ventas: number;
  crecimiento: number;
  amortizaciones: number;
  ebit: number;
  margenEbit: number;
  ebitda: number;
  margenEbitda: number;
  intereses: number;
  bai: number;
  impuestos: number;
  beneficioNeto: number;
  margenNeto: number;
  acciones: number;
  bpa: number;
  capex: number;
  fcl: number;
  fclPorAccion: number;
  deudaNeta: number;
  deudaNetaEbitda: number | null;
  objetivos: Record<MetodoValoracion, number | null>;
}

export interface ResultadoValoracion {
  anios: AnioProyectado[];
  /** Rentabilidad anual implícita desde el precio actual hasta el objetivo. */
  cagr3: Record<MetodoValoracion, number | null>;
  cagr5: Record<MetodoValoracion, number | null>;
  /** Media de los métodos que se pueden calcular para esta empresa. */
  objetivoMedio5: number | null;
  cagrMedio5: number | null;
}

function cagr(objetivo: number | null, precio: number, anios: number): number | null {
  if (objetivo == null || objetivo <= 0 || precio <= 0) return null;
  return Math.pow(objetivo / precio, 1 / anios) - 1;
}

/**
 * Proyección a cinco años y precio objetivo por múltiplos.
 *
 * Sigue la plantilla de valoración: las ventas y las amortizaciones crecen al
 * mismo ritmo, el EBIT sale del margen supuesto, los intereses se mantienen y
 * la mitad del flujo de caja libre de cada año reduce la deuda neta (la otra
 * mitad se supone repartida al accionista). El precio objetivo por PER y P/FCF
 * solo suma la caja neta; si la empresa tiene deuda neta no se resta, porque
 * esos múltiplos ya se aplican al beneficio después de intereses.
 */
export function proyectarValoracion(
  analisis: AnalisisValoracion,
  supuestos: SupuestosValoracion,
): ResultadoValoracion | null {
  const base = analisis.base;
  const precio = analisis.precioActual;
  if (base.ventas == null || base.acciones == null || precio == null) return null;

  const g = supuestos.crecimiento;
  let ventas = base.ventas;
  let amortizaciones = base.amortizaciones;
  let acciones = base.acciones;
  let capex = base.capex ?? 0;
  let deudaNeta = base.deudaNeta ?? 0;
  const intereses = base.intereses;
  const ultimoEjercicio = analisis.ejercicios[analisis.ejercicios.length - 1];

  const anios: AnioProyectado[] = [];
  for (let i = 1; i <= ANIOS_PROYECCION; i++) {
    ventas *= 1 + g;
    amortizaciones *= 1 + g;
    capex *= 1 + g;
    acciones *= 1 + supuestos.variacionAcciones;

    const ebit = ventas * supuestos.margenEbit;
    const ebitda = ebit + amortizaciones;
    const bai = ebit - intereses;
    const impuestos = bai * supuestos.tipoImpositivo;
    const beneficioNeto = bai - impuestos;
    const fcl = ebitda - capex - intereses - impuestos;
    deudaNeta -= fcl / 2;

    const cajaNeta = deudaNeta < 0 ? -deudaNeta : 0;
    const objetivos: Record<MetodoValoracion, number | null> = {
      per: (beneficioNeto * supuestos.per + cajaNeta) / acciones,
      pfcf: (fcl * supuestos.pfcf + cajaNeta) / acciones,
      evEbitda: analisis.sinEbit ? null : (ebitda * supuestos.evEbitda - deudaNeta) / acciones,
      evEbit: analisis.sinEbit ? null : (ebit * supuestos.evEbit - deudaNeta) / acciones,
    };

    anios.push({
      anio: ultimoEjercicio + i,
      ventas,
      crecimiento: g,
      amortizaciones,
      ebit,
      margenEbit: supuestos.margenEbit,
      ebitda,
      margenEbitda: ventas ? ebitda / ventas : 0,
      intereses,
      bai,
      impuestos,
      beneficioNeto,
      margenNeto: ventas ? beneficioNeto / ventas : 0,
      acciones,
      bpa: beneficioNeto / acciones,
      capex,
      fcl,
      fclPorAccion: fcl / acciones,
      deudaNeta,
      deudaNetaEbitda: ebitda ? deudaNeta / ebitda : null,
      objetivos,
    });
  }

  const tercero = anios[2];
  const quinto = anios[ANIOS_PROYECCION - 1];
  const cagr3 = {} as Record<MetodoValoracion, number | null>;
  const cagr5 = {} as Record<MetodoValoracion, number | null>;
  for (const { clave } of METODOS_VALORACION) {
    cagr3[clave] = cagr(tercero.objetivos[clave], precio, 3);
    cagr5[clave] = cagr(quinto.objetivos[clave], precio, ANIOS_PROYECCION);
  }

  const validos = METODOS_VALORACION.map((m) => quinto.objetivos[m.clave]).filter(
    (v): v is number => v != null && v > 0,
  );
  const objetivoMedio5 = validos.length
    ? validos.reduce((a, b) => a + b, 0) / validos.length
    : null;

  return {
    anios,
    cagr3,
    cagr5,
    objetivoMedio5,
    cagrMedio5: cagr(objetivoMedio5, precio, ANIOS_PROYECCION),
  };
}
