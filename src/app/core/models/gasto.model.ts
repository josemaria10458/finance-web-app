export type CategoriaGasto =
  | 'Ocio'
  | 'Viajes'
  | 'Comida'
  | 'Bebida'
  | 'Transporte'
  | 'Gastos propios';

export const CATEGORIAS_GASTO: CategoriaGasto[] = [
  'Ocio',
  'Viajes',
  'Comida',
  'Bebida',
  'Transporte',
  'Gastos propios',
];

export const SUBCATEGORIAS_POR_CATEGORIA: Record<
  CategoriaGasto,
  readonly string[]
> = {
  Ocio: [
    'Padel/Tenis',
    'Gimnasio',
    'Golf',
    'Salir de fiesta',
    'Otros Ocio',
  ],
  Viajes: [],
  Comida: ['Pluxee', 'Otros Comida', 'Comer fuera'],
  Bebida: ['Cerveza', 'Alcohol', 'Otros Bebida'],
  Transporte: ['Uber', 'Gasolina', 'Wible', 'Abono'],
  'Gastos propios': ['Gastos Propios', 'Resto Gastos'],
};

/** @deprecated Usar SUBCATEGORIAS_POR_CATEGORIA */
export const SUBCATEGORIAS_OCIO = SUBCATEGORIAS_POR_CATEGORIA.Ocio;

export interface Gasto {
  id: string;
  fecha: string; // ISO date YYYY-MM-DD
  importe: number;
  descripcion: string;
  categoria: CategoriaGasto;
  subcategoria?: string;
}

export type GastoInput = Omit<Gasto, 'id'>;

export function subcategoriasDe(categoria: CategoriaGasto): readonly string[] {
  return SUBCATEGORIAS_POR_CATEGORIA[categoria];
}

export function categoriaTieneSubcategorias(categoria: CategoriaGasto): boolean {
  return SUBCATEGORIAS_POR_CATEGORIA[categoria].length > 0;
}
