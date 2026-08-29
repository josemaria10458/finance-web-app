export type CategoriaIngreso = string;

export interface Ingreso {
  id: string;
  fecha: string; // ISO date YYYY-MM-DD
  importe: number;
  descripcion: string;
  categoria: CategoriaIngreso;
}

export type IngresoInput = Omit<Ingreso, 'id'>;
