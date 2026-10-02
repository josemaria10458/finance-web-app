export interface ImportMergeResult {
  /** Registros del archivo que se han guardado. */
  importados: number;
  /** Registros del archivo que ya estaban guardados y se han ignorado. */
  omitidos: number;
}

/**
 * Importar nunca debe borrar lo que ya hay: devuelve solo los registros del
 * archivo que no estaban todavía guardados. Se comparan como multiconjunto, así
 * reimportar el mismo archivo no añade nada y un archivo con dos filas idénticas
 * sigue aportando las dos si solo había una guardada.
 */
export function registrosNuevos<T>(
  existentes: T[],
  importados: T[],
  claveDe: (item: T) => string
): T[] {
  const disponibles = new Map<string, number>();
  for (const item of existentes) {
    const clave = claveDe(item);
    disponibles.set(clave, (disponibles.get(clave) ?? 0) + 1);
  }

  const nuevos: T[] = [];
  for (const item of importados) {
    const clave = claveDe(item);
    const repetidos = disponibles.get(clave) ?? 0;
    if (repetidos > 0) {
      disponibles.set(clave, repetidos - 1);
      continue;
    }
    nuevos.push(item);
  }
  return nuevos;
}
