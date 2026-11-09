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

/** Escenarios de múltiplo de la hoja «Futuro Valoración», más los de la propia empresa. */
export type EscenarioMultiplo =
  | 'propio'
  | 'historico'
  | 'bajo'
  | 'medio'
  | 'alto'
  | 'mediaBolsas';

export const ESCENARIOS_MULTIPLO: { clave: EscenarioMultiplo; etiqueta: string }[] = [
  { clave: 'propio', etiqueta: 'Tu múltiplo' },
  { clave: 'historico', etiqueta: 'Histórico de la empresa' },
  { clave: 'bajo', etiqueta: 'Bajo' },
  { clave: 'medio', etiqueta: 'Medio' },
  { clave: 'alto', etiqueta: 'Alto' },
  { clave: 'mediaBolsas', etiqueta: 'Media de bolsas' },
];

export const ANIOS_PROYECCION = 5;

export interface AnioProyectado {
  anio: number;
  /** El último ejercicio cerrado; el resto son estimaciones. */
  real: boolean;
  ventas: number;
  crecimiento: number | null;
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
  /** Capitalización y EV si la acción siguiera al precio de hoy. */
  capitalizacion: number;
  ev: number;
  /** Múltiplos a los que se compran hoy los resultados de ese año. */
  implicitos: Record<MetodoValoracion, number | null>;
  /** Precio objetivo con los múltiplos de los supuestos. */
  objetivos: Record<MetodoValoracion, number | null>;
}

export interface ResultadoValoracion {
  actual: AnioProyectado;
  anios: AnioProyectado[];
  /** Rentabilidad anual implícita desde el precio actual hasta el objetivo. */
  cagr3: Record<MetodoValoracion, number | null>;
  cagr5: Record<MetodoValoracion, number | null>;
  /** Media de los métodos que se pueden calcular para esta empresa. */
  objetivoMedio5: number | null;
  cagrMedio5: number | null;
}

export interface ValoracionEscenario {
  /** Precio objetivo del ejercicio actual y de cada año proyectado. */
  objetivos: (number | null)[];
  potencial5: number | null;
  cagr3: number | null;
  cagr5: number | null;
}

export function cagr(objetivo: number | null, precio: number, anios: number): number | null {
  if (objetivo == null || objetivo <= 0 || precio <= 0) return null;
  return Math.pow(objetivo / precio, 1 / anios) - 1;
}

function dividir(a: number, b: number): number | null {
  return b ? a / b : null;
}

/**
 * Precio por acción que resulta de aplicar `multiplo` a los resultados de un año.
 *
 * Por PER y P/FCF solo se suma la caja neta; si la empresa tiene deuda neta no
 * se resta, porque esos múltiplos ya se aplican al beneficio después de
 * intereses. Por EV/EBITDA y EV/EBIT se pasa de valor de empresa a valor del
 * accionista restando la deuda neta (o sumando la caja).
 */
export function precioObjetivo(
  anio: AnioProyectado,
  metodo: MetodoValoracion,
  multiplo: number,
  sinEbit: boolean,
): number | null {
  if (!anio.acciones) return null;
  const cajaNeta = anio.deudaNeta < 0 ? -anio.deudaNeta : 0;
  switch (metodo) {
    case 'per':
      return (anio.beneficioNeto * multiplo + cajaNeta) / anio.acciones;
    case 'pfcf':
      return (anio.fcl * multiplo + cajaNeta) / anio.acciones;
    case 'evEbitda':
      return sinEbit ? null : (anio.ebitda * multiplo - anio.deudaNeta) / anio.acciones;
    case 'evEbit':
      return sinEbit ? null : (anio.ebit * multiplo - anio.deudaNeta) / anio.acciones;
  }
}

function completar(
  parcial: Omit<AnioProyectado, 'capitalizacion' | 'ev' | 'implicitos' | 'objetivos'>,
  precio: number,
  supuestos: SupuestosValoracion,
  sinEbit: boolean,
): AnioProyectado {
  const capitalizacion = precio * parcial.acciones;
  const ev = capitalizacion + parcial.deudaNeta;
  const anio: AnioProyectado = {
    ...parcial,
    capitalizacion,
    ev,
    implicitos: {
      per: dividir(capitalizacion, parcial.beneficioNeto),
      pfcf: dividir(capitalizacion, parcial.fcl),
      evEbitda: sinEbit ? null : dividir(ev, parcial.ebitda),
      evEbit: sinEbit ? null : dividir(ev, parcial.ebit),
    },
    objetivos: { per: null, pfcf: null, evEbitda: null, evEbit: null },
  };
  for (const { clave } of METODOS_VALORACION) {
    anio.objetivos[clave] = precioObjetivo(anio, clave, supuestos[clave], sinEbit);
  }
  return anio;
}

/**
 * Proyección a cinco años y precio objetivo por múltiplos.
 *
 * Sigue la plantilla de valoración: las ventas, las amortizaciones y el capex
 * crecen al mismo ritmo, el EBIT sale del margen supuesto, los intereses se
 * mantienen y la mitad del flujo de caja libre de cada año reduce la deuda
 * neta (la otra mitad se supone repartida al accionista). El flujo de caja
 * libre es EBITDA − capex − intereses − impuestos, también en el ejercicio
 * real, para que la primera columna sea comparable con las proyectadas.
 */
export function proyectarValoracion(
  analisis: AnalisisValoracion,
  supuestos: SupuestosValoracion,
): ResultadoValoracion | null {
  const base = analisis.base;
  const precio = analisis.precioActual;
  if (base.ventas == null || base.acciones == null || base.ebit == null || precio == null) {
    return null;
  }
  const sinEbit = analisis.sinEbit;
  const ultimoEjercicio = analisis.ejercicios[analisis.ejercicios.length - 1];
  const intereses = base.intereses;

  const ebitdaReal = base.ebit + base.amortizaciones;
  const baiReal = base.ebit - intereses;
  const impuestosReal = base.impuestos ?? baiReal * supuestos.tipoImpositivo;
  const beneficioReal = base.beneficioNeto ?? baiReal - impuestosReal;
  const capexReal = base.capex ?? 0;
  const fclReal = ebitdaReal - capexReal - intereses - impuestosReal;

  const actual = completar(
    {
      anio: ultimoEjercicio,
      real: true,
      ventas: base.ventas,
      crecimiento: null,
      amortizaciones: base.amortizaciones,
      ebit: base.ebit,
      margenEbit: base.ebit / base.ventas,
      ebitda: ebitdaReal,
      margenEbitda: ebitdaReal / base.ventas,
      intereses,
      bai: baiReal,
      impuestos: impuestosReal,
      beneficioNeto: beneficioReal,
      margenNeto: beneficioReal / base.ventas,
      acciones: base.acciones,
      bpa: beneficioReal / base.acciones,
      capex: capexReal,
      fcl: fclReal,
      fclPorAccion: fclReal / base.acciones,
      deudaNeta: base.deudaNeta ?? 0,
      deudaNetaEbitda: dividir(base.deudaNeta ?? 0, ebitdaReal),
    },
    precio,
    supuestos,
    sinEbit,
  );

  const g = supuestos.crecimiento;
  let ventas = base.ventas;
  let amortizaciones = base.amortizaciones;
  let acciones = base.acciones;
  let capex = capexReal;
  let deudaNeta = actual.deudaNeta;

  const anios: AnioProyectado[] = [];
  for (let i = 1; i <= ANIOS_PROYECCION; i++) {
    ventas *= 1 + g;
    amortizaciones *= 1 + g;
    capex *= 1 + g;
    // El ajuste se aplica una vez y, como el capex crece sobre el año anterior,
    // arrastra a todos los siguientes.
    if (i === 1) capex += supuestos.ajusteCapex ?? 0;
    acciones *= 1 + supuestos.variacionAcciones;

    const ebit = ventas * supuestos.margenEbit;
    const ebitda = ebit + amortizaciones;
    const bai = ebit - intereses;
    const impuestos = bai * supuestos.tipoImpositivo;
    const beneficioNeto = bai - impuestos;
    const fcl = ebitda - capex - intereses - impuestos;
    deudaNeta -= fcl / 2;

    anios.push(
      completar(
        {
          anio: ultimoEjercicio + i,
          real: false,
          ventas,
          crecimiento: g,
          amortizaciones,
          ebit,
          margenEbit: supuestos.margenEbit,
          ebitda,
          margenEbitda: ebitda / ventas,
          intereses,
          bai,
          impuestos,
          beneficioNeto,
          margenNeto: beneficioNeto / ventas,
          acciones,
          bpa: beneficioNeto / acciones,
          capex,
          fcl,
          fclPorAccion: fcl / acciones,
          deudaNeta,
          deudaNetaEbitda: dividir(deudaNeta, ebitda),
        },
        precio,
        supuestos,
        sinEbit,
      ),
    );
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
    actual,
    anios,
    cagr3,
    cagr5,
    objetivoMedio5,
    cagrMedio5: cagr(objetivoMedio5, precio, ANIOS_PROYECCION),
  };
}

/** Precio objetivo de un método con un múltiplo dado, del ejercicio actual al quinto año. */
export function valorarEscenario(
  resultado: ResultadoValoracion,
  metodo: MetodoValoracion,
  multiplo: number,
  precio: number,
  sinEbit: boolean,
): ValoracionEscenario {
  const objetivos = [resultado.actual, ...resultado.anios].map((anio) =>
    precioObjetivo(anio, metodo, multiplo, sinEbit),
  );
  const tercero = objetivos[3];
  const quinto = objetivos[ANIOS_PROYECCION];
  return {
    objetivos,
    potencial5: quinto != null && precio > 0 ? quinto / precio - 1 : null,
    cagr3: cagr(tercero, precio, 3),
    cagr5: cagr(quinto, precio, ANIOS_PROYECCION),
  };
}
