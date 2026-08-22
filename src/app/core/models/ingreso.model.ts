export type CategoriaIngreso =
  | 'Nómina'
  | 'Retribución flexible'
  | 'Otros'
  | 'Venta Inversiones';

export const CATEGORIAS_INGRESO: CategoriaIngreso[] = [
  'Nómina',
  'Retribución flexible',
  'Otros',
  'Venta Inversiones',
];

export interface Ingreso {
  id: string;
  fecha: string; // ISO date YYYY-MM-DD
  importe: number;
  descripcion: string;
  categoria: CategoriaIngreso;
}

export type IngresoInput = Omit<Ingreso, 'id'>;
