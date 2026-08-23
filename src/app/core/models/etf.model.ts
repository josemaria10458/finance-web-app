export type EtfCategory =
  | 'mundo'
  | 'eeuu'
  | 'internacional'
  | 'emergentes'
  | 'bonos'
  | 'dividendos'
  | 'sector';

export interface CuratedEtf {
  ticker: string;
  name: string;
  category: EtfCategory;
  why: string;
  /** Ticker europeo/UCITS equivalente orientativo (si existe). */
  europeHint?: string;
}

export interface EtfXrayMetrics {
  expenseRatio: number | null;
  aum: number | null;
  numHoldings: number | null;
  yieldTtm: number | null;
  style: string | null;
  size: string | null;
  sharpe1y: number | null;
  sharpe3y: number | null;
  maxDrawdown3y: number | null;
  maxDrawdown5y: number | null;
  volatility: number | null;
  top10Concentration: number | null;
  diversification: string | null;
  weightedPe: number | null;
}

export interface EtfProfile {
  ticker: string;
  name: string;
  category: EtfCategory;
  why: string;
  europeHint?: string;
  metrics: EtfXrayMetrics | null;
  score: number;
  error?: string;
}

export interface EtfOverlapResult {
  etf1: string;
  etf2: string;
  overlapPct: number | null;
  verdict: string | null;
}

export const ETF_CATEGORY_LABELS: Record<EtfCategory, string> = {
  mundo: 'Mundo',
  eeuu: 'EE. UU.',
  internacional: 'Internacional',
  emergentes: 'Emergentes',
  bonos: 'Bonos',
  dividendos: 'Dividendos',
  sector: 'Sector',
};

/**
 * Lista curada de ETFs líquidos y baratos (tickers US que SecuritiesDB cubre vía SEC).
 * Para inversores en Europa, `europeHint` sugiere el UCITS más cercano.
 */
export const CURATED_ETFS: CuratedEtf[] = [
  {
    ticker: 'VT',
    name: 'Vanguard Total World Stock',
    category: 'mundo',
    why: 'Acciones globales en un solo ETF.',
    europeHint: 'VWCE / VWRL',
  },
  {
    ticker: 'VTI',
    name: 'Vanguard Total Stock Market',
    category: 'eeuu',
    why: 'Todo el mercado estadounidense a muy bajo coste.',
    europeHint: 'CSPX / VUAA (solo large-cap)',
  },
  {
    ticker: 'VOO',
    name: 'Vanguard S&P 500',
    category: 'eeuu',
    why: 'Las 500 mayores empresas de EE. UU.',
    europeHint: 'CSPX / SXR8 / VUAA',
  },
  {
    ticker: 'IVV',
    name: 'iShares Core S&P 500',
    category: 'eeuu',
    why: 'Alternativa líquida al S&P 500.',
    europeHint: 'CSPX / SXR8',
  },
  {
    ticker: 'QQQ',
    name: 'Invesco QQQ (Nasdaq-100)',
    category: 'sector',
    why: 'Concentrado en tecnología y crecimiento.',
    europeHint: 'EQQQ / SXRV',
  },
  {
    ticker: 'VXUS',
    name: 'Vanguard Total International Stock',
    category: 'internacional',
    why: 'Resto del mundo excluyendo EE. UU.',
    europeHint: 'VXUS ≈ VWCE − CSPX',
  },
  {
    ticker: 'VEA',
    name: 'Vanguard FTSE Developed Markets',
    category: 'internacional',
    why: 'Mercados desarrollados fuera de EE. UU.',
    europeHint: 'VEUR / IWDA − US',
  },
  {
    ticker: 'IEFA',
    name: 'iShares Core MSCI EAFE',
    category: 'internacional',
    why: 'Europa, Japón y Asia desarrollada.',
    europeHint: 'IEMA / SXRT',
  },
  {
    ticker: 'VWO',
    name: 'Vanguard FTSE Emerging Markets',
    category: 'emergentes',
    why: 'China, India, Brasil y otros emergentes.',
    europeHint: 'VFEM / EIMI',
  },
  {
    ticker: 'IEMG',
    name: 'iShares Core MSCI Emerging Markets',
    category: 'emergentes',
    why: 'Emergentes con buena liquidez.',
    europeHint: 'EIMI / EMIM',
  },
  {
    ticker: 'BND',
    name: 'Vanguard Total Bond Market',
    category: 'bonos',
    why: 'Renta fija estadounidense diversificada.',
    europeHint: 'AGGG / VAGF',
  },
  {
    ticker: 'AGG',
    name: 'iShares Core U.S. Aggregate Bond',
    category: 'bonos',
    why: 'Bonos investment grade de EE. UU.',
    europeHint: 'AGGG',
  },
  {
    ticker: 'TLT',
    name: 'iShares 20+ Year Treasury Bond',
    category: 'bonos',
    why: 'Bonos largos del Tesoro (más volátiles).',
  },
  {
    ticker: 'SCHD',
    name: 'Schwab U.S. Dividend Equity',
    category: 'dividendos',
    why: 'Dividendos de calidad en EE. UU.',
    europeHint: 'VHYL / TDIV',
  },
  {
    ticker: 'VNQ',
    name: 'Vanguard Real Estate',
    category: 'sector',
    why: 'Exposición a REITs estadounidenses.',
  },
  {
    ticker: 'GLD',
    name: 'SPDR Gold Shares',
    category: 'sector',
    why: 'Oro físico cotizado.',
    europeHint: 'SGLD / PHAU',
  },
  {
    ticker: 'IWM',
    name: 'iShares Russell 2000',
    category: 'eeuu',
    why: 'Small caps de EE. UU.',
  },
  {
    ticker: 'XLK',
    name: 'Technology Select Sector SPDR',
    category: 'sector',
    why: 'Sector tecnología del S&P 500.',
  },
];

export const ETF_CATEGORY_FILTERS: { value: EtfCategory | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'mundo', label: 'Mundo' },
  { value: 'eeuu', label: 'EE. UU.' },
  { value: 'internacional', label: 'Internacional' },
  { value: 'emergentes', label: 'Emergentes' },
  { value: 'bonos', label: 'Bonos' },
  { value: 'dividendos', label: 'Dividendos' },
  { value: 'sector', label: 'Sector' },
];
