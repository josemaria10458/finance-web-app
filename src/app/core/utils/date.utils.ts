const MESES_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

/** Formato ISO local YYYY-MM-DD sin UTC shift. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function yearMonthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

export function formatMesLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const shortYear = String(y).slice(-2);
  return `${MESES_ES[m - 1]} '${shortYear}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

/** Fecha YYYY-MM-DD para un día del mes, limitada al último día real. */
export function dateForDayInMonth(yearMonth: string, day: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const d = Math.min(Math.max(1, Math.round(day)), last);
  return toIsoDate(new Date(y, m - 1, d));
}

/**
 * Fecha por defecto al crear un movimiento para que coincida con el filtro
 * de año/mes activo y no “desaparezca” al guardar.
 */
export function defaultFechaParaVista(
  year: number | null = null,
  yearMonth: string | null = null,
  today = todayIso()
): string {
  if (yearMonth) {
    return today.startsWith(yearMonth) ? today : `${yearMonth}-01`;
  }
  if (year != null) {
    if (today.startsWith(`${year}-`)) return today;
    return `${year}-${today.slice(5, 7)}-01`;
  }
  return today;
}

export function currentYearMonth(): string {
  return yearMonthKey(todayIso());
}

/** Todos los meses YYYY-MM entre from y to (inclusive), del más reciente al más antiguo. */
export function monthsBetween(fromYm: string, toYm: string): string[] {
  const [fy, fm] = fromYm.split('-').map(Number);
  const [ty, tm] = toYm.split('-').map(Number);
  let y = fy;
  let m = fm;
  const out: string[] = [];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out.reverse();
}

/**
 * Rango continuo de meses para filtros: del dato más antiguo al actual,
 * con al menos `minMonthsBack` meses hacia atrás desde hoy.
 */
export function buildMonthOptions(
  dataMonths: string[],
  minMonthsBack = 36
): string[] {
  const current = currentYearMonth();
  const earliestFromBack = shiftYearMonth(current, -minMonthsBack);

  if (!dataMonths.length) {
    return monthsBetween(earliestFromBack, current);
  }

  const sorted = [...dataMonths].sort();
  const from =
    sorted[0] < earliestFromBack ? sorted[0] : earliestFromBack;
  const to =
    sorted[sorted.length - 1] > current ? sorted[sorted.length - 1] : current;
  return monthsBetween(from, to);
}

/** Desplaza YYYY-MM n meses (negativo = hacia atrás). */
export function shiftYearMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Convierte fechas de Excel/CSV a YYYY-MM-DD sin desfase por zona horaria.
 * Prioriza formato europeo DD/MM/YYYY.
 */
export function parseFlexibleDate(value: unknown): string | null {
  if (value == null || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // SheetJS suele devolver medianoche UTC → usar componentes UTC
    return toIsoDate(
      new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
    );
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Serial Excel (1900 date system)
    const utc = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(utc);
    if (!Number.isNaN(d.getTime())) {
      return toIsoDate(
        new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      );
    }
  }

  const s = String(value).trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }

  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (con o sin hora)
  const euro = s.match(
    /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s|T|$)/
  );
  if (euro) {
    const day = Number(euro[1]);
    const month = Number(euro[2]);
    let year = Number(euro[3]);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return toIsoDate(new Date(year, month - 1, day));
    }
  }

  const monthIndex = (raw: string): number | null => {
    const months: Record<string, number> = {
      ene: 0,
      jan: 0,
      feb: 1,
      mar: 2,
      abr: 3,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      ago: 7,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dic: 11,
      dec: 11,
    };
    const key = raw
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f.]/g, '')
      .slice(0, 3);
    return months[key] ?? null;
  };

  // Excel resumen mensual: "ene.-26", "ene-26", "ene.26", "ene 2026"
  const monthYear = s.match(
    /^([A-Za-záéíóúü.]{3,})\s*[.\-\/\s]+\s*(\d{2,4})$/i
  );
  if (monthYear) {
    const month = monthIndex(monthYear[1]);
    if (month != null) {
      let year = Number(monthYear[2]);
      if (year < 100) year += 2000;
      return toIsoDate(new Date(year, month, 1));
    }
  }

  // "15-mar-2024" / "15-mar.-24"
  const named = s.match(
    /^(\d{1,2})[\/\-\s]([A-Za-záéíóú.]{3,})[\/\-\s](\d{2,4})$/i
  );
  if (named) {
    const month = monthIndex(named[2]);
    if (month != null) {
      let year = Number(named[3]);
      if (year < 100) year += 2000;
      return toIsoDate(new Date(year, month, Number(named[1])));
    }
  }

  return null;
}


