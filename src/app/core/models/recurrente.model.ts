export type RecurrenteTipo = 'gasto' | 'ingreso';

export interface MovimientoRecurrente {
  id: string;
  tipo: RecurrenteTipo;
  diaDelMes: number;
  importe: number;
  descripcion: string;
  categoria: string;
  subcategoria?: string;
  activo: boolean;
  /** YYYY-MM a partir del cual se generan movimientos. */
  desde: string;
  /** Último YYYY-MM generado. */
  lastGeneradoYm?: string;
}

export type MovimientoRecurrenteInput = Omit<MovimientoRecurrente, 'id'>;
