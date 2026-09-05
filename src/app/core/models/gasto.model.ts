export type CategoriaGasto = string;

export interface Gasto {
  id: string;
  fecha: string; // ISO date YYYY-MM-DD
  importe: number;
  descripcion: string;
  categoria: CategoriaGasto;
  subcategoria?: string;
  /** Si viene de una programación mensual. */
  recurrenteId?: string;
}

export type GastoInput = Omit<Gasto, 'id'>;
