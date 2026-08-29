import { parseIsoDate } from './date.utils';

export interface CashFlow {
  amount: number;
  date: Date;
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const MIN_RATE = -0.99;
const MAX_RATE = 10; // 1000 % anual como techo razonable
const NPV_TOLERANCE = 1e-4;

/** Suma flujos del mismo día (evita cancelaciones que explotan el XIRR). */
export function mergeFlowsByDate(
  flows: { amount: number; dateIso: string }[]
): { amount: number; dateIso: string }[] {
  const map = new Map<string, number>();
  for (const f of flows) {
    if (!Number.isFinite(f.amount) || f.amount === 0) continue;
    map.set(f.dateIso, (map.get(f.dateIso) ?? 0) + f.amount);
  }
  return [...map.entries()]
    .filter(([, amount]) => Math.abs(amount) > 1e-9)
    .map(([dateIso, amount]) => ({ dateIso, amount }))
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

function npvAt(
  rate: number,
  sorted: CashFlow[],
  t0: number
): number {
  return sorted.reduce((sum, cf) => {
    const years = (cf.date.getTime() - t0) / YEAR_MS;
    return sum + cf.amount / Math.pow(1 + rate, years);
  }, 0);
}

function dNpvAt(
  rate: number,
  sorted: CashFlow[],
  t0: number
): number {
  return sorted.reduce((sum, cf) => {
    const years = (cf.date.getTime() - t0) / YEAR_MS;
    if (years === 0) return sum;
    return sum - (years * cf.amount) / Math.pow(1 + rate, years + 1);
  }, 0);
}

function isValidRate(rate: number, sorted: CashFlow[], t0: number): boolean {
  if (!Number.isFinite(rate) || rate <= MIN_RATE || rate >= MAX_RATE) {
    return false;
  }
  return Math.abs(npvAt(rate, sorted, t0)) <= NPV_TOLERANCE;
}

function xirrBisection(sorted: CashFlow[], t0: number): number | null {
  let lo = MIN_RATE;
  let hi = MAX_RATE;
  let fLo = npvAt(lo, sorted, t0);
  let fHi = npvAt(hi, sorted, t0);

  if (fLo * fHi > 0) {
    return null;
  }

  for (let i = 0; i < 128; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npvAt(mid, sorted, t0);
    if (Math.abs(fMid) < NPV_TOLERANCE || hi - lo < 1e-7) {
      return isValidRate(mid, sorted, t0) ? mid : null;
    }
    if (fLo * fMid <= 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }

  const mid = (lo + hi) / 2;
  return isValidRate(mid, sorted, t0) ? mid : null;
}

/**
 * XIRR (TIR con fechas) por Newton-Raphson + bisección.
 * Devuelve la tasa anualizada (p. ej. 0.12 = 12 %) o null si no converge.
 */
export function xirr(cashflows: CashFlow[], guess = 0.1): number | null {
  if (cashflows.length < 2) {
    return null;
  }

  const sorted = [...cashflows].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  const hasPositive = sorted.some((c) => c.amount > 0);
  const hasNegative = sorted.some((c) => c.amount < 0);
  if (!hasPositive || !hasNegative) {
    return null;
  }

  const t0 = sorted[0].date.getTime();

  let rate = guess;
  for (let i = 0; i < 64; i++) {
    const f = npvAt(rate, sorted, t0);
    const df = dNpvAt(rate, sorted, t0);
    if (Math.abs(df) < 1e-12) {
      break;
    }
    const next = rate - f / df;
    if (!Number.isFinite(next) || next <= MIN_RATE || next >= MAX_RATE) {
      break;
    }
    if (Math.abs(next - rate) < 1e-7) {
      return isValidRate(next, sorted, t0) ? next : xirrBisection(sorted, t0);
    }
    rate = next;
  }

  if (isValidRate(rate, sorted, t0)) {
    return rate;
  }

  return xirrBisection(sorted, t0);
}

export function xirrFromIso(
  flows: { amount: number; dateIso: string }[],
  guess = 0.1
): number | null {
  const merged = mergeFlowsByDate(flows);
  if (merged.length < 2) {
    return null;
  }

  return xirr(
    merged.map((f) => ({ amount: f.amount, date: parseIsoDate(f.dateIso) })),
    guess
  );
}
