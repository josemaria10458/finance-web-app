import {
  OperacionBolsa,
  PosicionCartera,
  PosicionValorada,
  PuntoHistorico,
  TotalesCartera,
  costeOperacion,
} from '../models';

function claveDe(op: OperacionBolsa): string {
  const isin = op.isin?.trim();
  if (isin) return isin.toUpperCase();
  return op.empresa.trim().toLowerCase();
}

/** Convierte un importe aplicando el cambio vigente en una fecha concreta. */
export type ConversorHistorico = (importe: number, fechaIso: string) => number;

/**
 * Construye el conversor a partir de la serie diaria de un par de divisas.
 *
 * Las compras se hicieron en euros en fechas distintas, así que aplicarles el
 * cambio de hoy falsearía la plusvalía: se usa el cambio que había cada día.
 */
export function conversorDesdeSerie(
  puntos: PuntoHistorico[]
): ConversorHistorico | null {
  if (!puntos.length) return null;

  const ordenados = [...puntos].sort((a, b) => a.t - b.t);
  const fechas = ordenados.map((p) =>
    new Date(p.t * 1000).toISOString().slice(0, 10)
  );
  const tasas = ordenados.map((p) => p.c);

  return (importe, fechaIso) => {
    // Último cambio publicado en o antes de la fecha de la operación.
    let inferior = 0;
    let superior = fechas.length - 1;
    let encontrado = -1;
    while (inferior <= superior) {
      const medio = (inferior + superior) >> 1;
      if (fechas[medio] <= fechaIso) {
        encontrado = medio;
        inferior = medio + 1;
      } else {
        superior = medio - 1;
      }
    }
    // Si la compra es anterior a toda la serie se usa el cambio más antiguo.
    return importe * tasas[encontrado >= 0 ? encontrado : 0];
  };
}

/**
 * Agrupa las compras abiertas en posiciones. Las operaciones ya vienen
 * filtradas (sin ventas ni lotes consolidados), así que basta con sumar.
 *
 * `convertirCoste` traslada el coste a la divisa en la que se va a valorar la
 * cartera; sin él se mantiene la divisa original de las operaciones.
 */
export function agruparPosiciones(
  abiertas: OperacionBolsa[],
  convertirCoste?: ConversorHistorico | null
): PosicionCartera[] {
  const porClave = new Map<string, PosicionCartera>();

  for (const op of abiertas) {
    const clave = claveDe(op);
    const costeOriginal = costeOperacion(op);
    const coste = convertirCoste
      ? convertirCoste(costeOriginal, op.fechaOperacion)
      : costeOriginal;
    const actual = porClave.get(clave);

    if (!actual) {
      porClave.set(clave, {
        clave,
        isin: op.isin?.trim().toUpperCase(),
        empresa: op.empresa,
        claseActivo: op.claseActivo,
        acciones: op.numeroAcciones,
        costeTotal: coste,
        precioMedio: op.numeroAcciones > 0 ? coste / op.numeroAcciones : 0,
        lotes: 1,
        primeraCompra: op.fechaOperacion,
        ultimaCompra: op.fechaOperacion,
      });
      continue;
    }

    actual.acciones += op.numeroAcciones;
    actual.costeTotal += coste;
    actual.lotes += 1;
    actual.precioMedio =
      actual.acciones > 0 ? actual.costeTotal / actual.acciones : 0;
    actual.isin ??= op.isin?.trim().toUpperCase();
    actual.claseActivo ??= op.claseActivo;
    if (op.fechaOperacion < actual.primeraCompra) {
      actual.primeraCompra = op.fechaOperacion;
    }
    if (op.fechaOperacion > actual.ultimaCompra) {
      actual.ultimaCompra = op.fechaOperacion;
    }
  }

  return [...porClave.values()].sort((a, b) => b.costeTotal - a.costeTotal);
}

interface PrecioMercado {
  precio: number | null;
  moneda: string | null;
  variacionDiaPct: number | null;
  simbolo: string | null;
}

/**
 * Cruza cada posición con su precio de mercado. Las posiciones sin precio
 * conservan sus datos de coste y quedan marcadas con `precioActual = null`.
 */
export function valorarPosiciones(
  posiciones: PosicionCartera[],
  precios: Map<string, PrecioMercado>
): PosicionValorada[] {
  const valoradas: PosicionValorada[] = posiciones.map((p) => {
    const cotizacion = precios.get(p.clave);
    const precioActual = cotizacion?.precio ?? null;
    const valorMercado =
      precioActual != null ? precioActual * p.acciones : null;
    const plusvalia =
      valorMercado != null ? valorMercado - p.costeTotal : null;

    return {
      ...p,
      precioActual,
      moneda: cotizacion?.moneda ?? null,
      valorMercado,
      plusvalia,
      plusvaliaPct:
        plusvalia != null && p.costeTotal > 0
          ? (plusvalia / p.costeTotal) * 100
          : null,
      pesoPct: null,
      variacionDiaPct: cotizacion?.variacionDiaPct ?? null,
      simbolo: cotizacion?.simbolo ?? null,
    };
  });

  // El peso se calcula sobre el valor conocido; si falta el precio se usa el coste
  // para no inflar artificialmente el resto de posiciones.
  const base = valoradas.reduce(
    (sum, p) => sum + (p.valorMercado ?? p.costeTotal),
    0
  );
  if (base > 0) {
    for (const p of valoradas) {
      p.pesoPct = ((p.valorMercado ?? p.costeTotal) / base) * 100;
    }
  }

  return valoradas.sort(
    (a, b) =>
      (b.valorMercado ?? b.costeTotal) - (a.valorMercado ?? a.costeTotal)
  );
}

export function totalesCartera(posiciones: PosicionValorada[]): TotalesCartera {
  let coste = 0;
  let valorMercado = 0;
  let sinPrecio = 0;

  for (const p of posiciones) {
    coste += p.costeTotal;
    if (p.valorMercado != null) {
      valorMercado += p.valorMercado;
    } else {
      // Sin cotización se asume el coste para que el total siga siendo legible.
      valorMercado += p.costeTotal;
      sinPrecio += 1;
    }
  }

  const plusvalia = valorMercado - coste;
  return {
    coste,
    valorMercado,
    plusvalia,
    plusvaliaPct: coste > 0 ? (plusvalia / coste) * 100 : null,
    sinPrecio,
  };
}
