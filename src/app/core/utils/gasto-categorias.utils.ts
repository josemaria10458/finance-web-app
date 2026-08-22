import { CategoriaGasto, SUBCATEGORIAS_POR_CATEGORIA } from '../models/gasto.model';

export interface GastoClasificacion {
  categoria: CategoriaGasto;
  subcategoria?: string;
}

/** Alias Excel → subcategoría canónica */
const SUB_ALIASES: Record<string, string> = {
  padel: 'Padel/Tenis',
  tenis: 'Padel/Tenis',
  'padel tenis': 'Padel/Tenis',
  'padel/tenis': 'Padel/Tenis',
  gimnasio: 'Gimnasio',
  golf: 'Golf',
  fiesta: 'Salir de fiesta',
  'salir fiesta': 'Salir de fiesta',
  'salir de fiesta': 'Salir de fiesta',
  'salis fiesta': 'Salir de fiesta',
  'otros ocio': 'Otros Ocio',
  pluxee: 'Pluxee',
  'ticket restaurant': 'Pluxee',
  'otros comida': 'Otros Comida',
  'comer fuera': 'Comer fuera',
  restaurante: 'Comer fuera',
  cerveza: 'Cerveza',
  alcohol: 'Alcohol',
  'otros bebida': 'Otros Bebida',
  uber: 'Uber',
  uner: 'Uber',
  gasolina: 'Gasolina',
  wible: 'Wible',
  abono: 'Abono',
  'transporte publico': 'Abono',
  'gastos propios': 'Gastos Propios',
  'resto gastos': 'Resto Gastos',
  resto: 'Resto Gastos',
};

const MAIN_ALIASES: Record<string, CategoriaGasto> = {
  ocio: 'Ocio',
  viajes: 'Viajes',
  viaje: 'Viajes',
  comida: 'Comida',
  alimentacion: 'Comida',
  bebida: 'Bebida',
  bebidas: 'Bebida',
  transporte: 'Transporte',
  movilidad: 'Transporte',
  'gastos propios': 'Gastos propios',
  propios: 'Gastos propios',
  personal: 'Gastos propios',
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function canonSub(raw: string): string | null {
  const n = norm(raw);
  if (!n) return null;
  if (SUB_ALIASES[n]) return SUB_ALIASES[n];
  for (const subs of Object.values(SUBCATEGORIAS_POR_CATEGORIA)) {
    const hit = subs.find((s) => norm(s) === n);
    if (hit) return hit;
  }
  return null;
}

function mainFromRaw(raw: string): CategoriaGasto | null {
  const n = norm(raw);
  if (!n) return null;
  if (MAIN_ALIASES[n]) return MAIN_ALIASES[n];
  for (const cat of Object.keys(SUBCATEGORIAS_POR_CATEGORIA) as CategoriaGasto[]) {
    if (norm(cat) === n) return cat;
  }
  return null;
}

function parentOfSub(sub: string): CategoriaGasto | null {
  for (const [cat, subs] of Object.entries(SUBCATEGORIAS_POR_CATEGORIA) as [
    CategoriaGasto,
    readonly string[],
  ][]) {
    if (subs.includes(sub)) return cat;
  }
  return null;
}

/**
 * Resuelve categoría + subcategoría desde Excel.
 * Acepta subcategoría en columna propia o en la columna de categoría.
 */
export function clasificarGastoExcel(
  categoriaRaw: string,
  subcategoriaRaw = ''
): GastoClasificacion {
  const subFromCol = canonSub(subcategoriaRaw);
  const catFromCol = mainFromRaw(categoriaRaw);
  const catAsSub = canonSub(categoriaRaw);

  if (subFromCol) {
    const parent = parentOfSub(subFromCol) ?? catFromCol ?? 'Gastos propios';
    return { categoria: parent, subcategoria: subFromCol };
  }

  if (catAsSub) {
    const parent = parentOfSub(catAsSub) ?? 'Gastos propios';
    return { categoria: parent, subcategoria: catAsSub };
  }

  if (catFromCol) {
    return { categoria: catFromCol };
  }

  // Heurísticas por palabras clave
  const n = norm(categoriaRaw);
  if (n.includes('ocio') || n.includes('padel') || n.includes('gimnasio'))
    return { categoria: 'Ocio' };
  if (n.includes('viaje')) return { categoria: 'Viajes' };
  if (n.includes('comida') || n.includes('pluxee') || n.includes('restaur'))
    return { categoria: 'Comida' };
  if (n.includes('bebida') || n.includes('cerveza') || n.includes('alcohol'))
    return { categoria: 'Bebida' };
  if (
    n.includes('transport') ||
    n.includes('uber') ||
    n.includes('uner') ||
    n.includes('gasolina') ||
    n.includes('wible') ||
    n.includes('abono')
  )
    return { categoria: 'Transporte' };

  return { categoria: 'Gastos propios' };
}

const META_HEADERS = new Set([
  'fecha',
  'date',
  'dia',
  'mes',
  'month',
  'descripcion',
  'concepto',
  'detalle',
  'nota',
  'notas',
  'total',
  'suma',
  'importe',
  'cantidad',
  'amount',
  'gasto',
  'gastos',
  'ingresos',
  'euros',
  'valor',
]);

function isMetaHeader(raw: string): boolean {
  const n = norm(raw);
  if (!n) return true;
  if (n.startsWith('col ')) return true;
  if (/^col \d+$/.test(n) || /^col_\d+$/.test(n)) return true;
  return (
    META_HEADERS.has(n) ||
    n.includes('fecha') ||
    n.includes('descripcion') ||
    n.startsWith('total ')
  );
}

/** Cabecera de columna de gasto (subcategoría o categoría principal). */
export function esColumnaGastoExcel(header: string): boolean {
  const trimmed = String(header ?? '').trim();
  if (!trimmed || isMetaHeader(trimmed)) return false;
  if (canonSub(trimmed)) return true;
  if (mainFromRaw(trimmed)) return true;
  return false;
}

export function contarColumnasGastoExcel(headers: string[]): number {
  return headers.filter((h) => esColumnaGastoExcel(h)).length;
}
