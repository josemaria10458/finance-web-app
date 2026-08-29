import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  CURATED_ETFS,
  CuratedEtf,
  EtfCategory,
  EtfOverlapResult,
  EtfProfile,
  EtfXrayMetrics,
} from '../models/etf.model';

const API_BASE = 'https://securitiesdb.com/api/v1';

interface ApiEnvelope<T> {
  status?: string;
  data?: T;
  meta?: unknown;
}

interface XrayData {
  ticker?: string;
  overview?: {
    expense_ratio?: number | null;
    aum?: number | null;
    num_holdings?: number | null;
    ttm_yield?: number | null;
    style?: string | null;
    size?: string | null;
  };
  valuation?: {
    weighted_pe?: number | null;
  };
  concentration?: {
    hhi_interpretation?: string | null;
    top10_concentration_pct?: number | null;
  };
  risk?: {
    sharpe_1y?: number | null;
    sharpe_3y?: number | null;
    max_drawdown_3y?: number | null;
    max_drawdown_5y?: number | null;
    volatility_annual?: number | null;
  };
}

interface OverlapData {
  overlap_pct?: number | null;
  verdict?: string | null;
}

@Injectable({ providedIn: 'root' })
export class EtfService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, EtfProfile>();

  listCurated(category: EtfCategory | 'todos' = 'todos'): CuratedEtf[] {
    if (category === 'todos') return CURATED_ETFS;
    return CURATED_ETFS.filter((e) => e.category === category);
  }

  async loadProfiles(
    category: EtfCategory | 'todos' = 'todos'
  ): Promise<EtfProfile[]> {
    const curated = this.listCurated(category);
    const profiles = await Promise.all(
      curated.map((etf) => this.loadOne(etf))
    );
    return this.rank(profiles);
  }

  async compareOverlap(etf1: string, etf2: string): Promise<EtfOverlapResult> {
    const url = `${API_BASE}/etfs/overlap?etf1=${encodeURIComponent(etf1)}&etf2=${encodeURIComponent(etf2)}`;
    try {
      const res = await firstValueFrom(
        this.http.get<ApiEnvelope<OverlapData>>(url)
      );
      const data = res?.data ?? {};
      return {
        etf1: etf1.toUpperCase(),
        etf2: etf2.toUpperCase(),
        overlapPct: this.num(data.overlap_pct),
        verdict: typeof data.verdict === 'string' ? data.verdict : null,
      };
    } catch (err) {
      throw this.toFriendlyError(err);
    }
  }

  private async loadOne(etf: CuratedEtf): Promise<EtfProfile> {
    const cached = this.cache.get(etf.ticker);
    if (cached) return cached;

    try {
      const res = await firstValueFrom(
        this.http.get<ApiEnvelope<XrayData>>(
          `${API_BASE}/etfs/${encodeURIComponent(etf.ticker)}/xray`
        )
      );
      const metrics = this.mapMetrics(res?.data);
      const profile: EtfProfile = {
        ...etf,
        metrics,
        score: this.computeScore(metrics),
      };
      this.cache.set(etf.ticker, profile);
      return profile;
    } catch (err) {
      const profile: EtfProfile = {
        ...etf,
        metrics: null,
        score: 0,
        error: err instanceof Error ? err.message : 'Sin datos',
      };
      return profile;
    }
  }

  private mapMetrics(data: XrayData | undefined): EtfXrayMetrics | null {
    if (!data) return null;
    const o = data.overview ?? {};
    const r = data.risk ?? {};
    const c = data.concentration ?? {};
    const v = data.valuation ?? {};
    return {
      expenseRatio: this.num(o.expense_ratio),
      aum: this.num(o.aum),
      numHoldings: this.num(o.num_holdings),
      yieldTtm: this.num(o.ttm_yield),
      style: o.style ?? null,
      size: o.size ?? null,
      sharpe1y: this.num(r.sharpe_1y),
      sharpe3y: this.num(r.sharpe_3y),
      maxDrawdown3y: this.num(r.max_drawdown_3y),
      maxDrawdown5y: this.num(r.max_drawdown_5y),
      volatility: this.num(r.volatility_annual),
      top10Concentration: this.num(c.top10_concentration_pct),
      diversification: c.hhi_interpretation ?? null,
      weightedPe: this.num(v.weighted_pe),
    };
  }

  /** Score orientativo: premia TER bajo, Sharpe alto y diversificación. */
  private computeScore(m: EtfXrayMetrics | null): number {
    if (!m) return 0;
    let score = 50;

    if (m.expenseRatio != null) {
      // 0.03% → +25; 0.5% → ~0
      score += Math.max(0, 25 - m.expenseRatio * 5000);
    }
    if (m.sharpe3y != null) {
      score += m.sharpe3y * 12;
    } else if (m.sharpe1y != null) {
      score += m.sharpe1y * 8;
    }
    if (m.top10Concentration != null) {
      // Menos concentración → mejor
      score += Math.max(0, (50 - m.top10Concentration) * 0.25);
    }
    if (m.maxDrawdown3y != null) {
      // Drawdown menos severo → mejor (p.ej. -0.15 mejor que -0.40)
      score += Math.max(0, (0.4 + m.maxDrawdown3y) * 20);
    }
    if (m.numHoldings != null && m.numHoldings > 100) {
      score += 5;
    }

    return Math.round(score * 10) / 10;
  }

  private rank(profiles: EtfProfile[]): EtfProfile[] {
    return [...profiles].sort((a, b) => b.score - a.score);
  }

  private num(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const n = Number.parseFloat(value);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  private toFriendlyError(err: unknown): Error {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) {
        return new Error('No se pudo conectar con SecuritiesDB.');
      }
      if (err.status === 404) {
        return new Error('ETF no encontrado en SecuritiesDB.');
      }
      return new Error(`Error de SecuritiesDB (${err.status}).`);
    }
    if (err instanceof Error) return err;
    return new Error('Error al consultar ETFs.');
  }
}
