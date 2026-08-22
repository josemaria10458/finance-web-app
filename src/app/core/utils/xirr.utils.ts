import { parseIsoDate } from './date.utils';

export interface CashFlow {
  amount: number;
  date: Date;
}

/**
 * XIRR (TIR con fechas) por Newton-Raphson.
 * Devuelve la tasa anualizada (p. ej. 0.12 = 12%) o null si no converge.
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
  const yearMs = 365.25 * 24 * 60 * 60 * 1000;

  const npv = (rate: number): number =>
    sorted.reduce((sum, cf) => {
      const years = (cf.date.getTime() - t0) / yearMs;
      return sum + cf.amount / Math.pow(1 + rate, years);
    }, 0);

  const dNpv = (rate: number): number =>
    sorted.reduce((sum, cf) => {
      const years = (cf.date.getTime() - t0) / yearMs;
      if (years === 0) return sum;
      return sum - (years * cf.amount) / Math.pow(1 + rate, years + 1);
    }, 0);

  let rate = guess;
  for (let i = 0; i < 64; i++) {
    const f = npv(rate);
    const df = dNpv(rate);
    if (Math.abs(df) < 1e-12) {
      break;
    }
    const next = rate - f / df;
    if (!Number.isFinite(next) || next <= -0.999999) {
      break;
    }
    if (Math.abs(next - rate) < 1e-7) {
      return next;
    }
    rate = next;
  }

  return Number.isFinite(rate) ? rate : null;
}

export function xirrFromIso(
  flows: { amount: number; dateIso: string }[],
  guess = 0.1
): number | null {
  return xirr(
    flows.map((f) => ({ amount: f.amount, date: parseIsoDate(f.dateIso) })),
    guess
  );
}
