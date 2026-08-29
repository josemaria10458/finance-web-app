import { CategoriasConfig } from '../models/categorias-config.model';

export interface GastoClasificacion {
  categoria: string;
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

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function allSubs(config: CategoriasConfig): string[] {
  return config.gastos.flatMap((g) => g.subcategorias);
}

function allMainCats(config: CategoriasConfig): string[] {
  return config.gastos.map((g) => g.nombre);
}

function canonSub(raw: string, config: CategoriasConfig): string | null {
  const n = norm(raw);
  if (!n) return null;
  if (SUB_ALIASES[n]) return SUB_ALIASES[n];
  for (const sub of allSubs(config)) {
    if (norm(sub) === n) return sub;
  }
  return null;
}

function mainFromRaw(raw: string, config: CategoriasConfig): string | null {
  const n = norm(raw);
  if (!n) return null;
  for (const cat of allMainCats(config)) {
    if (norm(cat) === n) return cat;
  }
  return null;
}

function parentOfSub(sub: string, config: CategoriasConfig): string | null {
  for (const g of config.gastos) {
    if (g.subcategorias.includes(sub)) return g.nombre;
  }
  return null;
}

function fallbackGasto(config: CategoriasConfig): string {
  const cats = allMainCats(config);
  return (
    cats.find((c) => norm(c).includes('propio')) ??
    cats[cats.length - 1] ??
    'Otros'
  );
}

export function clasificarGastoExcel(
  categoriaRaw: string,
  subcategoriaRaw = '',
  config: CategoriasConfig
): GastoClasificacion {
  const subFromCol = canonSub(subcategoriaRaw, config);
  const catFromCol = mainFromRaw(categoriaRaw, config);
  const catAsSub = canonSub(categoriaRaw, config);
  const fallback = fallbackGasto(config);

  if (subFromCol) {
    const parent = parentOfSub(subFromCol, config) ?? catFromCol ?? fallback;
    return { categoria: parent, subcategoria: subFromCol };
  }

  if (catAsSub) {
    const parent = parentOfSub(catAsSub, config) ?? fallback;
    return { categoria: parent, subcategoria: catAsSub };
  }

  if (catFromCol) {
    return { categoria: catFromCol };
  }

  const n = norm(categoriaRaw);
  if (n.includes('ocio') || n.includes('padel') || n.includes('gimnasio')) {
    const cat = allMainCats(config).find((c) => norm(c).includes('ocio'));
    if (cat) return { categoria: cat };
  }
  if (n.includes('viaje')) {
    const cat = allMainCats(config).find((c) => norm(c).includes('viaje'));
    if (cat) return { categoria: cat };
  }
  if (n.includes('comida') || n.includes('pluxee') || n.includes('restaur')) {
    const cat = allMainCats(config).find((c) => norm(c).includes('comida'));
    if (cat) return { categoria: cat };
  }
  if (n.includes('bebida') || n.includes('cerveza') || n.includes('alcohol')) {
    const cat = allMainCats(config).find((c) => norm(c).includes('bebida'));
    if (cat) return { categoria: cat };
  }
  if (
    n.includes('transport') ||
    n.includes('uber') ||
    n.includes('uner') ||
    n.includes('gasolina') ||
    n.includes('wible') ||
    n.includes('abono')
  ) {
    const cat = allMainCats(config).find((c) => norm(c).includes('transport'));
    if (cat) return { categoria: cat };
  }

  return { categoria: fallback };
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

export function esColumnaGastoExcel(
  header: string,
  config: CategoriasConfig
): boolean {
  const trimmed = String(header ?? '').trim();
  if (!trimmed || isMetaHeader(trimmed)) return false;
  if (canonSub(trimmed, config)) return true;
  if (mainFromRaw(trimmed, config)) return true;
  return false;
}

export function contarColumnasGastoExcel(
  headers: string[],
  config: CategoriasConfig
): number {
  return headers.filter((h) => esColumnaGastoExcel(h, config)).length;
}
