/** Rango de fechas cubierto por un archivo importado (ISO YYYY-MM-DD). */
export interface RangoImportacion {
  desde: string;
  hasta: string;
}

export interface UltimaImportacion extends RangoImportacion {
  /** Momento en que se confirmó la importación (ISO completo). */
  importadoEl: string;
  fileName: string;
}
