export type CategoriaGasto = string;

export interface Gasto {
  id: string;
  fecha: string; // ISO date YYYY-MM-DD
  importe: number;
  descripcion: string;
  categoria: CategoriaGasto;
  subcategoria?: string;
}

export type GastoInput = Omit<Gasto, 'id'>;
