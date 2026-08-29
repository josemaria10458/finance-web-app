import {
  GastoInput,
  IngresoInput,
  OperacionBolsaInput,
} from '../models';
import { CategoriasConfig } from '../models/categorias-config.model';
import { parseFlexibleDate } from './date.utils';
import { clasificarGastoExcel, GastoClasificacion } from './gasto-categorias.utils';

export interface TradeRepublicParseResult {
  gastos: GastoInput[];
  ingresos: IngresoInput[];
  operaciones: OperacionBolsaInput[];
}

type TrRow = Record<string, unknown>;

interface OpenLot {
  shares: number;
  pricePerShare: number;
  date: string;
}

const GASTO_TYPES = new Set([
  'CARD_TRANSACTION',
  'CARD_TRANSACTION_INTERNATIONAL',
  'TRANSFER_INSTANT_OUTBOUND',
  'DIRECT_DEBIT',
  'DIRECT_DEBIT_RETURN',
]);

const INGRESO_TYPES = new Set([
  'TRANSFER_INSTANT_INBOUND',
  'INTEREST_PAYMENT',
  'DIVIDEND',
]);

const SKIP_TYPES = new Set([
  'BENEFITS_SAVEBACK',
  'TOP_UP',
  'WITHDRAWAL',
  'SAVINGS_PLAN',
]);

/** MCC → categoría de gasto (Merchant Category Code). */
const MCC_GASTO: Record<string, GastoClasificacion> = {
  '5411': { categoria: 'Comida', subcategoria: 'Otros Comida' },
  '5812': { categoria: 'Comida', subcategoria: 'Comer fuera' },
  '5813': { categoria: 'Bebida', subcategoria: 'Otros Bebida' },
  '5814': { categoria: 'Comida', subcategoria: 'Comer fuera' },
  '4111': { categoria: 'Transporte', subcategoria: 'Abono' },
  '4112': { categoria: 'Transporte', subcategoria: 'Abono' },
  '4121': { categoria: 'Transporte', subcategoria: 'Uber' },
  '5541': { categoria: 'Transporte', subcategoria: 'Gasolina' },
  '5542': { categoria: 'Transporte', subcategoria: 'Gasolina' },
  '7011': { categoria: 'Viajes' },
  '4722': { categoria: 'Viajes' },
  '7311': { categoria: 'Gastos propios', subcategoria: 'Resto Gastos' },
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function str(row: TrRow, key: string): string {
  const v = row[key];
  return v == null ? '' : String(v).trim();
}

function num(row: TrRow, key: string): number | null {
  const raw = row[key];
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function isTradeRepublicExport(sample: TrRow): boolean {
  const keys = Object.keys(sample).map((k) => norm(k));
  const hasCategory = keys.includes('category');
  const hasType = keys.includes('type');
  const hasAmount = keys.includes('amount');
  const hasTrMarker =
    keys.includes('transaction_id') ||
    keys.includes('symbol') ||
    keys.includes('asset_class');
  return hasCategory && hasType && hasAmount && hasTrMarker;
}

function clasificarPorComercio(
  name: string,
  mcc: string,
  config: CategoriasConfig
): GastoClasificacion {
  if (mcc && MCC_GASTO[mcc]) {
    return MCC_GASTO[mcc];
  }

  const n = norm(name);
  if (
    n.includes('renfe') ||
    n.includes('metro') ||
    n.includes('cabify') ||
    n.includes('uber')
  ) {
    return clasificarGastoExcel(
      'Transporte',
      n.includes('uber') ? 'Uber' : 'Abono',
      config
    );
  }
  if (
    n.includes('booking') ||
    n.includes('hotel') ||
    n.includes('airbnb') ||
    n.includes('expedia')
  ) {
    const viajes = config.gastos.find((g) => norm(g.nombre).includes('viaje'));
    return { categoria: viajes?.nombre ?? config.gastos[0]?.nombre ?? 'Viajes' };
  }
  if (
    n.includes('restaur') ||
    n.includes('sidrer') ||
    n.includes('cafe') ||
    n.includes('comida') ||
    n.includes('super') ||
    n.includes('mercad')
  ) {
    return clasificarGastoExcel('Comida', 'Comer fuera', config);
  }
  if (n.includes('bar') || n.includes('cerveza')) {
    return clasificarGastoExcel('Bebida', 'Cerveza', config);
  }

  return clasificarGastoExcel('', name, config);
}

function clasificarIngreso(
  type: string,
  name: string,
  config: CategoriasConfig
): string {
  const n = norm(name);
  const cats = config.ingresos;
  if (n.includes('nomina') || n.includes('nómina') || n.includes('salario')) {
    return cats.find((c) => norm(c).includes('nomina')) ?? cats[0] ?? 'Otros';
  }
  if (n.includes('flex') || n.includes('retrib')) {
    return cats.find((c) => norm(c).includes('flex')) ?? cats[0] ?? 'Otros';
  }
  if (type === 'INTEREST_PAYMENT' || type === 'DIVIDEND') {
    return cats.find((c) => norm(c).includes('otro')) ?? cats[0] ?? 'Otros';
  }
  return cats.find((c) => norm(c).includes('otro')) ?? cats[0] ?? 'Otros';
}

function parseGasto(row: TrRow, config: CategoriasConfig): GastoInput | null {
  const fecha =
    parseFlexibleDate(row['date']) ?? parseFlexibleDate(row['datetime']);
  const amount = num(row, 'amount');
  if (!fecha || amount == null || amount >= 0) return null;

  const name = str(row, 'name') || str(row, 'description');
  const mcc = str(row, 'mcc_code');
  const { categoria, subcategoria } = clasificarPorComercio(name, mcc, config);

  return {
    fecha,
    importe: Math.abs(amount),
    descripcion: name || str(row, 'description') || 'Gasto Trade Republic',
    categoria,
    subcategoria,
  };
}

function parseIngreso(row: TrRow, config: CategoriasConfig): IngresoInput | null {
  const fecha =
    parseFlexibleDate(row['date']) ?? parseFlexibleDate(row['datetime']);
  const amount = num(row, 'amount');
  if (!fecha || amount == null || amount <= 0) return null;

  const type = str(row, 'type');
  const name =
    str(row, 'counterparty_name') || str(row, 'name') || str(row, 'description');
  const categoria = clasificarIngreso(type, name, config);

  return {
    fecha,
    importe: Math.abs(amount),
    descripcion: name || str(row, 'description') || type,
    categoria,
  };
}

function consumeLots(
  lots: OpenLot[],
  sharesToSell: number,
  fallbackPrice: number
): { cost: number; avgBuyPrice: number } {
  let remaining = sharesToSell;
  let cost = 0;
  let matchedShares = 0;

  while (remaining > 0 && lots.length) {
    const lot = lots[0];
    const take = Math.min(remaining, lot.shares);
    cost += take * lot.pricePerShare;
    matchedShares += take;
    remaining -= take;
    lot.shares -= take;
    if (lot.shares <= 1e-8) lots.shift();
  }

  if (remaining > 0) {
    cost += remaining * fallbackPrice;
    matchedShares += remaining;
  }

  const avgBuyPrice =
    matchedShares > 0 ? cost / matchedShares : fallbackPrice;
  return { cost, avgBuyPrice };
}

function parseTradingRows(rows: TrRow[]): OperacionBolsaInput[] {
  const trading = rows
    .filter((r) => norm(str(r, 'category')) === 'trading')
    .sort((a, b) => {
      const da = parseFlexibleDate(a['date']) ?? '';
      const db = parseFlexibleDate(b['date']) ?? '';
      return da.localeCompare(db);
    });

  const lotsBySymbol = new Map<string, OpenLot[]>();
  const operaciones: OperacionBolsaInput[] = [];

  for (const row of trading) {
    const type = str(row, 'type').toUpperCase();
    const symbol = str(row, 'symbol') || str(row, 'name');
    const empresa = str(row, 'name') || symbol;
    const fecha =
      parseFlexibleDate(row['date']) ?? parseFlexibleDate(row['datetime']);
    const shares = num(row, 'shares');
    const price = num(row, 'price');
    const amount = num(row, 'amount');
    const fee = Math.abs(num(row, 'fee') ?? 0);
    const tax = Math.abs(num(row, 'tax') ?? 0);

    if (!fecha || !symbol || shares == null || price == null || amount == null) {
      continue;
    }

    const qty = Math.abs(shares);

    if (type === 'BUY') {
      const lots = lotsBySymbol.get(symbol) ?? [];
      lots.push({ shares: qty, pricePerShare: price, date: fecha });
      lotsBySymbol.set(symbol, lots);

      operaciones.push({
        empresa,
        fechaOperacion: fecha,
        inversion: Math.abs(amount),
        precioCompraAccion: price,
        comision: fee,
        numeroAcciones: qty,
        provisionImpuestos: tax || undefined,
        esVenta: false,
      });
      continue;
    }

    if (type === 'SELL') {
      const lots = lotsBySymbol.get(symbol) ?? [];
      const { cost, avgBuyPrice } = consumeLots(lots, qty, price);
      lotsBySymbol.set(symbol, lots);

      const precioCompra = avgBuyPrice > 0 ? avgBuyPrice : price;
      const precioVenta = price;
      const inversion = cost > 0 ? cost : precioCompra * qty;

      operaciones.push({
        empresa,
        fechaOperacion: fecha,
        fechaVenta: fecha,
        inversion,
        precioCompraAccion: precioCompra,
        precioVentaAccion: precioVenta,
        comision: fee,
        numeroAcciones: qty,
        provisionImpuestos: tax || undefined,
        esVenta: true,
      });
    }
  }

  return operaciones;
}

export function parseTradeRepublicRows(
  rows: TrRow[],
  config: CategoriasConfig
): TradeRepublicParseResult {
  const gastos: GastoInput[] = [];
  const ingresos: IngresoInput[] = [];

  for (const row of rows) {
    const category = norm(str(row, 'category'));
    const type = str(row, 'type').toUpperCase();

    if (category === 'trading') continue;

    if (SKIP_TYPES.has(type)) continue;

    if (GASTO_TYPES.has(type)) {
      const g = parseGasto(row, config);
      if (g) gastos.push(g);
      continue;
    }

    if (INGRESO_TYPES.has(type)) {
      const i = parseIngreso(row, config);
      if (i) ingresos.push(i);
      continue;
    }

    const amount = num(row, 'amount');
    if (amount == null) continue;

    if (amount < 0) {
      const g = parseGasto(row, config);
      if (g) gastos.push(g);
    } else if (amount > 0) {
      const i = parseIngreso(row, config);
      if (i) ingresos.push(i);
    }
  }

  const operaciones = parseTradingRows(rows);

  return { gastos, ingresos, operaciones };
}
