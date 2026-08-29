import { Injectable, inject } from '@angular/core';
import * as XLSX from 'xlsx';
import {
  GastoInput,
  IngresoInput,
  OperacionBolsaInput,
} from '../models';
import { parseFlexibleDate } from '../utils/date.utils';
import { clasificarGastoExcel, contarColumnasGastoExcel, esColumnaGastoExcel } from '../utils/gasto-categorias.utils';
import {
  isTradeRepublicExport,
  parseTradeRepublicRows,
} from '../utils/trade-republic.utils';
import { CategoriasConfigService } from './categorias-config.service';
import { GastosService } from './gastos.service';
import { IngresosService } from './ingresos.service';
import { InversionesService } from './inversiones.service';

export interface ImportIssue {
  sheet: string;
  row: number;
  message: string;
}

export interface ImportResult {
  gastos: number;
  ingresos: number;
  operaciones: number;
  issues: ImportIssue[];
}

export interface ImportPreview {
  gastos: GastoInput[];
  ingresos: IngresoInput[];
  operaciones: OperacionBolsaInput[];
  issues: ImportIssue[];
  source: 'trade-republic' | 'excel';
  fileName: string;
}

type Row = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class ImportService {
  private readonly gastosService = inject(GastosService);
  private readonly ingresosService = inject(IngresosService);
  private readonly inversionesService = inject(InversionesService);
  private readonly categoriasConfig = inject(CategoriasConfigService);

  private get catConfig() {
    return this.categoriasConfig.config();
  }

  async previewFile(file: File): Promise<ImportPreview> {
    const parsed = await this.parseWorkbook(file);
    return { ...parsed, fileName: file.name };
  }

  commitPreview(preview: ImportPreview): ImportResult {
    return {
      gastos: this.gastosService.importMany(preview.gastos, true),
      ingresos: this.ingresosService.importMany(preview.ingresos, true),
      operaciones: this.inversionesService.importMany(preview.operaciones, true),
      issues: preview.issues,
    };
  }

  async importFile(file: File): Promise<ImportResult> {
    const preview = await this.previewFile(file);
    return this.commitPreview(preview);
  }

  private async parseWorkbook(file: File): Promise<Omit<ImportPreview, 'fileName'>> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, {
      type: 'array',
      cellDates: true,
      cellNF: false,
      cellText: false,
    });

    const issues: ImportIssue[] = [];
    let gastos: GastoInput[] = [];
    let ingresos: IngresoInput[] = [];
    let operaciones: OperacionBolsaInput[] = [];
    let transaccionesParsed = false;
    let source: ImportPreview['source'] = 'excel';

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = this.rowsFromSheet(sheet);
      if (!rows.length) continue;

      if (isTradeRepublicExport(rows[0])) {
        source = 'trade-republic';
        const tr = parseTradeRepublicRows(rows, this.catConfig);
        gastos = gastos.concat(tr.gastos);
        ingresos = ingresos.concat(tr.ingresos);
        operaciones = operaciones.concat(tr.operaciones);
        issues.push({
          sheet: sheetName,
          row: 0,
          message: `Exportación Trade Republic: ${tr.gastos.length} gastos, ${tr.ingresos.length} ingresos, ${tr.operaciones.length} operaciones.`,
        });
        continue;
      }

      const kind = this.detectSheetKind(sheetName, rows[0]);
      issues.push({
        sheet: sheetName,
        row: 0,
        message: `Detectada como «${kind}». Columnas: ${Object.keys(rows[0])
          .filter((k) => !/^col_\d+$/i.test(k))
          .slice(0, 12)
          .join(', ')}`,
      });

      if (kind === 'transacciones') {
        const mixed = this.parseTransacciones(rows, sheetName, issues);
        if (mixed.gastos.length) {
          gastos = mixed.gastos;
          transaccionesParsed = true;
        } else {
          issues.push({
            sheet: sheetName,
            row: 0,
            message:
              'Transacciones sin gastos válidos; se usará la hoja Gastos si existe.',
          });
        }
        if (mixed.ingresos.length) {
          ingresos = ingresos.concat(mixed.ingresos);
        }
        continue;
      }

      if (
        transaccionesParsed &&
        gastos.length > 0 &&
        (kind === 'gastos' || kind === 'mixto' || this.isWideGastosSheet(rows[0]))
      ) {
        issues.push({
          sheet: sheetName,
          row: 0,
          message: 'Ignorada (gastos tomados de la hoja Transacciones).',
        });
        continue;
      }

      if (kind === 'gastos') {
        const parsed = this.parseGastosSheet(rows, sheetName, issues);
        if (parsed.length) {
          gastos = gastos.concat(parsed);
        }
      } else if (kind === 'ingresos') {
        // La hoja Ingresos es la fuente de verdad (Nómina, Venta Inversiones, …).
        const parsed = this.parseIngresosSheet(rows, sheetName, issues);
        if (parsed.length) {
          ingresos = parsed;
        }
      } else if (kind === 'mixto') {
        const mixed = this.parseMixto(rows, sheetName, issues);
        if (mixed.gastos.length) {
          gastos = gastos.concat(mixed.gastos);
        }
        if (mixed.ingresos.length) {
          ingresos = ingresos.concat(mixed.ingresos);
        }
      } else if (kind === 'bolsa') {
        const parsed = this.parseBolsa(rows, sheetName, issues);
        if (parsed.length) {
          operaciones = operaciones.concat(parsed);
        }
      } else if (kind === 'skip') {
        continue;
      } else if (this.looksLikeMoneySheet(rows[0])) {
        const mixed = this.parseMixto(rows, sheetName, issues);
        if (mixed.gastos.length) {
          gastos = gastos.concat(mixed.gastos);
        }
        if (mixed.ingresos.length) {
          ingresos = ingresos.concat(mixed.ingresos);
        }
        if (!mixed.gastos.length && !mixed.ingresos.length) {
          const asGastos = this.parseGastosSheet(rows, sheetName, issues);
          if (asGastos.length) {
            gastos = gastos.concat(asGastos);
          }
        }
      } else if (this.isWideGastosSheet(rows[0])) {
        const parsed = this.parseGastosWide(rows, sheetName, issues);
        if (parsed.length) {
          gastos = gastos.concat(parsed);
        }
      } else {
        issues.push({
          sheet: sheetName,
          row: 0,
          message:
            'No se pudo detectar el tipo de hoja (gastos/ingresos/bolsa).',
        });
      }
    }

    return { gastos, ingresos, operaciones, issues, source };
  }

  /** Localiza la fila de cabeceras aunque haya títulos encima. */
  private rowsFromSheet(sheet: XLSX.WorkSheet): Row[] {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: '',
      blankrows: false,
    });
    if (!aoa.length) return [];

    let headerIdx = -1;
    const scanLimit = Math.min(aoa.length, 40);
    for (let i = 0; i < scanLimit; i++) {
      const rawCells = (aoa[i] ?? []).map((c) => String(c ?? '').trim());
      const cells = rawCells.map((c) => this.norm(c));
      const hasFecha = cells.some(
        (c) => c === 'fecha' || c.startsWith('fecha ') || c.includes('fecha')
      );
      const hasImporte = cells.some(
        (c) =>
          c === 'importe' ||
          c.includes('importe') ||
          c === 'cantidad' ||
          c.includes('euro') ||
          c === 'valor' ||
          c === 'total'
      );
      const hasEmpresa = cells.some(
        (c) => c.includes('empresa') || c === 'ticker' || c.includes('activo')
      );
      const hasInversion = cells.some(
        (c) => c === 'inversion' || c.startsWith('inversion ')
      );
      const gastoColsHere = contarColumnasGastoExcel(rawCells, this.catConfig);
      const nextRaw = (aoa[i + 1] ?? []).map((c) => String(c ?? '').trim());
      const gastoColsNext = contarColumnasGastoExcel(nextRaw, this.catConfig);
      const ingresoColsHere = rawCells.filter((c) =>
        this.matchCategoriaIngreso(c)
      ).length;
      const ingresoColsNext = nextRaw.filter((c) =>
        this.matchCategoriaIngreso(c)
      ).length;

      if ((hasFecha && hasImporte) || (hasEmpresa && hasInversion)) {
        headerIdx = i;
        break;
      }
      // Hoja Ingresos en columnas: Fecha | Nómina | … | Venta Inversiones
      if (hasFecha && ingresoColsHere >= 1) {
        headerIdx = i;
        break;
      }
      if (ingresoColsHere >= 2 || ingresoColsNext >= 2) {
        headerIdx = ingresoColsNext > ingresoColsHere ? i + 1 : i;
        break;
      }
      if (gastoColsHere >= 2 || gastoColsNext >= 2) {
        headerIdx = gastoColsNext > gastoColsHere ? i + 1 : i;
        break;
      }
    }

    if (headerIdx < 0) {
      headerIdx = aoa.findIndex((r) =>
        (r ?? []).some((c) => String(c ?? '').trim() !== '')
      );
    }
    if (headerIdx < 0) return [];

    const rawHeaders = (aoa[headerIdx] ?? []).map((h) =>
      String(h ?? '').trim().replace(/;+\s*$/, '')
    );

    // Solo columnas con cabecera real; si hay tablas lado a lado, se queda la 1ª aparición
    const headerIndexes: number[] = [];
    const headers: string[] = [];
    const seen = new Set<string>();
    rawHeaders.forEach((s, i) => {
      if (!s) return;
      let name = s;
      if (
        i === 0 &&
        (this.looksLikeDateHeader(s) ||
          this.norm(s) === 'ingresos' ||
          this.norm(s) === 'gastos' ||
          this.norm(s) === 'ocio' ||
          this.norm(s) === 'viajes' ||
          this.norm(s) === 'comida')
      ) {
        // Primera columna de cada bloque resumen = mes
        if (headerIndexes.length === 0) {
          name = 'fecha';
        } else {
          // Columnas de mes repetidas en tablas laterales
          return;
        }
      }
      const key = this.norm(name);
      if (seen.has(key)) return;
      seen.add(key);
      headerIndexes.push(i);
      headers.push(name);
    });

    if (!headers.includes('fecha') && headerIndexes[0] !== 0) {
      const col0HasDates = aoa
        .slice(headerIdx + 1, headerIdx + 6)
        .some((line) => parseFlexibleDate((line ?? [])[0]) != null);
      if (col0HasDates) {
        headerIndexes.unshift(0);
        headers.unshift('fecha');
      }
    }

    const rows: Row[] = [];
    for (let i = headerIdx + 1; i < aoa.length; i++) {
      const line = aoa[i] ?? [];
      if (!line.some((c) => c !== '' && c != null)) continue;
      const first = String(line[headerIndexes[0] ?? 0] ?? '').trim();
      const firstN = this.norm(first);
      if (firstN === 'total' || firstN === 'promedio' || firstN === 'media') {
        continue;
      }
      const row: Row = {};
      headers.forEach((h, idx) => {
        row[h] = line[headerIndexes[idx]] ?? '';
      });
      rows.push(row);
    }
    return rows;
  }

  private looksLikeDateHeader(raw: string): boolean {
    const n = this.norm(raw);
    return (
      !n ||
      n === 'fecha' ||
      n.startsWith('fecha ') ||
      n === 'date' ||
      n === 'mes' ||
      n === 'month'
    );
  }

  private looksLikeMoneySheet(sample: Row): boolean {
    return (
      this.hasKeys(sample, ['fecha']) &&
      (this.hasKeys(sample, ['importe']) ||
        this.hasKeys(sample, ['cantidad']) ||
        this.hasKeys(sample, ['valor']) ||
        this.hasKeys(sample, ['euros']))
    );
  }

  private detectSheetKind(
    name: string,
    sample: Row
  ):
    | 'gastos'
    | 'ingresos'
    | 'bolsa'
    | 'mixto'
    | 'transacciones'
    | 'skip'
    | 'unknown' {
    const n = this.norm(name);
    if (n.includes('resumen') || n.includes('dashboard')) {
      return 'skip';
    }
    if (n.includes('transaccion') || n.includes('movimiento')) {
      return 'transacciones';
    }
    if (n.includes('gasto')) return 'gastos';
    if (n.includes('ingreso')) return 'ingresos';
    if (this.isWideIngresosSheet(sample)) return 'ingresos';
    if (this.isWideGastosSheet(sample)) return 'gastos';
    if (
      n.includes('compra') ||
      n.includes('venta') ||
      n.includes('bolsa') ||
      n.includes('accion') ||
      n.includes('invers')
    ) {
      return 'bolsa';
    }

    if (this.hasKeys(sample, ['empresa', 'inversion'])) return 'bolsa';
    if (this.hasKeys(sample, ['empresa', 'precio'])) return 'bolsa';
    if (this.looksLikeMoneySheet(sample)) return 'mixto';
    return 'unknown';
  }

  private parseGastosSheet(
    rows: Row[],
    sheet: string,
    issues: ImportIssue[]
  ): GastoInput[] {
    if (!rows.length) return [];
    if (this.isWideGastosSheet(rows[0])) {
      return this.parseGastosWide(rows, sheet, issues);
    }
    return this.parseGastos(rows, sheet, issues);
  }

  /** Excel con columnas por subcategoría (fecha en filas, importes en columnas). */
  private isWideGastosSheet(sample: Row): boolean {
    if (this.hasKeys(sample, ['categoria', 'category', 'tipo', 'rubro'])) {
      return false;
    }
    const importeCol = this.pick(sample, [
      'importe',
      'cantidad',
      'amount',
      'gasto',
    ]);
    if (importeCol != null && importeCol !== '') {
      return false;
    }

    let catCols = 0;
    for (const key of Object.keys(sample)) {
      if (this.isGastoMetaColumn(key)) continue;
      if (esColumnaGastoExcel(key, this.catConfig)) {
        catCols++;
      }
    }
    return catCols >= 2;
  }

  private pickFechaFromRow(row: Row): string | null {
    const direct = parseFlexibleDate(
      this.pick(row, ['fecha', 'date', 'día', 'dia', 'mes', 'month'])
    );
    if (direct) return direct;

    for (const [key, val] of Object.entries(row)) {
      if (this.isGastoMetaColumn(key) && this.norm(key) !== 'fecha') continue;
      const parsed = parseFlexibleDate(val);
      if (parsed) return parsed;
    }
    return null;
  }

  private isGastoMetaColumn(key: string): boolean {
    const n = this.norm(key);
    if (!n) return true;
    if (/^col_\d+$/.test(n) || (n.startsWith('col ') && n !== 'col 0')) {
      return true;
    }
    return (
      n === 'fecha' ||
      n.includes('fecha') ||
      n === 'date' ||
      n === 'mes' ||
      n === 'month' ||
      n.includes('descripcion') ||
      n.includes('concepto') ||
      n.includes('detalle') ||
      n.includes('nota') ||
      n === 'total' ||
      n.startsWith('total ') ||
      n === 'suma' ||
      n === 'gastos'
    );
  }

  private parseGastosWide(
    rows: Row[],
    sheet: string,
    issues: ImportIssue[]
  ): GastoInput[] {
    const out: GastoInput[] = [];
    const sampleKeys = rows[0] ? Object.keys(rows[0]) : [];
    const parentsWithSubs = new Set<string>();
    for (const key of sampleKeys) {
      if (this.isGastoMetaColumn(key)) continue;
      const { categoria, subcategoria } = clasificarGastoExcel(key, '', this.catConfig);
      if (subcategoria) parentsWithSubs.add(categoria);
    }

    rows.forEach((row, idx) => {
      const fecha = this.pickFechaFromRow(row);
      if (!fecha) {
        const rawFecha = this.pick(row, ['fecha', 'mes', 'gastos']);
        if (rawFecha != null && String(rawFecha).trim() !== '') {
          issues.push({
            sheet,
            row: idx + 2,
            message: `Mes no reconocido: «${rawFecha}».`,
          });
        }
        return;
      }

      let added = 0;
      for (const [col, rawVal] of Object.entries(row)) {
        if (this.isGastoMetaColumn(col)) continue;
        if (!esColumnaGastoExcel(col, this.catConfig)) continue;

        const { categoria, subcategoria } = clasificarGastoExcel(col, '', this.catConfig);
        // Si hay desglose por subcategoría, no importar el total de la categoría
        if (!subcategoria && parentsWithSubs.has(categoria)) continue;

        const importe = this.parseNumber(rawVal);
        if (importe == null || importe === 0) continue;

        out.push({
          fecha,
          importe: Math.abs(importe),
          descripcion: subcategoria ?? categoria,
          categoria,
          subcategoria,
        });
        added++;
      }

      if (!added && Object.keys(row).some((k) => !this.isGastoMetaColumn(k))) {
        // Fila de mes sin importes > 0: ok, no avisar
      }
    });
    return out;
  }

  private parseGastos(
    rows: Row[],
    sheet: string,
    issues: ImportIssue[]
  ): GastoInput[] {
    const out: GastoInput[] = [];
    rows.forEach((row, idx) => {
      const fecha = parseFlexibleDate(
        this.pick(row, ['fecha', 'date', 'día', 'dia'])
      );
      const importe = this.parseNumber(
        this.pick(row, [
          'importe',
          'cantidad',
          'amount',
          'gasto',
          'euros',
          'valor',
          'total',
        ])
      );
      const descripcion = String(
        this.pick(row, [
          'descripcion',
          'descripción',
          'concepto',
          'detalle',
          'nombre',
          'notas',
        ]) ?? ''
      ).trim();
      const catRaw = String(
        this.pick(row, [
          'categoria',
          'categoría',
          'category',
          'tipo',
          'rubro',
          'grupo',
        ]) ?? ''
      ).trim();
      const subRaw = String(
        this.pick(row, [
          'subcategoria',
          'subcategoría',
          'subcategory',
          'sub categoria',
          'subtipo',
          'detalle categoria',
          'detalle categoría',
        ]) ?? ''
      ).trim();
      const { categoria, subcategoria } = clasificarGastoExcel(catRaw, subRaw, this.catConfig);

      if (!fecha || importe == null) {
        if (fecha || importe != null || catRaw || subRaw) {
          issues.push({
            sheet,
            row: idx + 2,
            message: `Gasto inválido (fecha/importe).`,
          });
        }
        return;
      }
      out.push({
        fecha,
        importe: Math.abs(importe),
        descripcion: descripcion || subcategoria || categoria,
        categoria,
        subcategoria,
      });
    });
    return out;
  }

  private parseIngresos(
    rows: Row[],
    sheet: string,
    issues: ImportIssue[]
  ): IngresoInput[] {
    const out: IngresoInput[] = [];
    rows.forEach((row, idx) => {
      const fecha = this.pickFechaFromRow(row);
      const descripcion = String(
        this.pick(row, [
          'descripcion',
          'descripción',
          'concepto',
          'detalle',
          'nombre',
          'notas',
        ]) ?? ''
      ).trim();
      const catRaw = String(
        this.pick(row, [
          'categoria',
          'categoría',
          'category',
          'tipo',
        ]) ?? ''
      ).trim();

      if (!fecha) {
        return;
      }

      const fromColumns = this.extractIngresosFromNamedColumns(
        row,
        fecha,
        descripcion
      );
      if (fromColumns.length) {
        out.push(...fromColumns);
        return;
      }

      const importe = this.pickImporte(row);
      const categoria = this.resolveCategoriaIngreso(catRaw);

      if (importe == null) {
        if (catRaw) {
          issues.push({
            sheet,
            row: idx + 2,
            message: `Ingreso inválido (importe) para «${catRaw}».`,
          });
        }
        return;
      }
      out.push({
        fecha,
        importe: Math.abs(importe),
        descripcion: descripcion || categoria,
        categoria,
      });
    });
    return out;
  }

  /** Importe desde columna «importe» (no confundir con «Venta Inversiones»). */
  private pickImporte(row: Row): number | null {
    return this.parseNumber(
      this.pick(row, [
        'importe',
        'cantidad',
        'amount',
        'euros',
        'valor',
        'total',
      ])
    );
  }

  /** Filas/hojas con columnas «Nómina», «Venta Inversiones», etc. */
  private extractIngresosFromNamedColumns(
    row: Row,
    fecha: string,
    descripcion: string
  ): IngresoInput[] {
    const out: IngresoInput[] = [];
    for (const [col, rawVal] of Object.entries(row)) {
      if (this.isIngresoMetaColumn(col)) continue;
      const categoria = this.matchCategoriaIngreso(col);
      if (!categoria) continue;
      const importe = this.parseNumber(rawVal);
      if (importe == null || importe === 0) continue;
      out.push({
        fecha,
        importe: Math.abs(importe),
        descripcion: descripcion || categoria,
        categoria,
      });
    }
    return out;
  }

  private isIngresoMetaColumn(key: string): boolean {
    const n = this.norm(key);
    if (!n) return true;
    if (/^col_\d+$/.test(n) || n.startsWith('col ')) return true;
    return (
      n === 'fecha' ||
      n.includes('fecha') ||
      n === 'date' ||
      n === 'mes' ||
      n.includes('descripcion') ||
      n.includes('concepto') ||
      n.includes('detalle') ||
      n.includes('nota') ||
      n === 'importe' ||
      n === 'cantidad' ||
      n === 'amount' ||
      n === 'total' ||
      n.startsWith('total ') ||
      n === 'ingresos' ||
      n === 'categoria' ||
      n === 'category' ||
      n === 'tipo'
    );
  }

  /** Hoja Transacciones: fecha, importe, descripción, Categoría por fila. */
  private parseTransacciones(
    rows: Row[],
    sheet: string,
    issues: ImportIssue[]
  ): { gastos: GastoInput[]; ingresos: IngresoInput[] } {
    const gastos: GastoInput[] = [];
    const ingresos: IngresoInput[] = [];

    rows.forEach((row, idx) => {
      const fecha = this.pickFechaFromRow(row);
      const importe = this.parseNumber(
        this.pick(row, [
          'importe',
          'cantidad',
          'amount',
          'euros',
          'valor',
          'total',
        ])
      );
      const descripcion = String(
        this.pick(row, [
          'descripcion',
          'descripción',
          'concepto',
          'detalle',
          'nombre',
          'notas',
        ]) ?? ''
      ).trim();
      const catRaw = String(
        this.pick(row, [
          'categoria',
          'categoría',
          'category',
          'tipo',
          'rubro',
          'grupo',
        ]) ?? ''
      ).trim();

      if (!fecha || importe == null || importe === 0) {
        if (fecha || (importe != null && importe !== 0) || catRaw) {
          issues.push({
            sheet,
            row: idx + 2,
            message: 'Transacción inválida (fecha/importe).',
          });
        }
        return;
      }

      const catIngreso = this.matchCategoriaIngreso(catRaw);
      const esGasto = this.esCategoriaGasto(catRaw);

      if (catIngreso && !esGasto) {
        ingresos.push({
          fecha,
          importe: Math.abs(importe),
          descripcion: descripcion || catIngreso,
          categoria: catIngreso,
        });
        return;
      }

      const ingresosColumna = this.extractIngresosFromNamedColumns(
        row,
        fecha,
        descripcion
      );
      if (ingresosColumna.length) {
        ingresos.push(...ingresosColumna);
        return;
      }

      const { categoria, subcategoria } = clasificarGastoExcel(catRaw, '', this.catConfig);
      gastos.push({
        fecha,
        importe: Math.abs(importe),
        descripcion: descripcion || subcategoria || categoria,
        categoria,
        subcategoria,
      });
    });

    return { gastos, ingresos };
  }

  /** ¿La categoría pertenece a gastos (incluye subcategorías como «Otros Ocio»)? */
  private esCategoriaGasto(raw: string): boolean {
    if (!raw.trim()) return false;
    if (this.matchCategoriaGasto(raw)) return true;
    const { subcategoria } = clasificarGastoExcel(raw, '', this.catConfig);
    return subcategoria != null;
  }

  private parseIngresosSheet(
    rows: Row[],
    sheet: string,
    issues: ImportIssue[]
  ): IngresoInput[] {
    if (!rows.length) return [];
    if (this.isWideIngresosSheet(rows[0])) {
      return this.parseIngresosWide(rows, sheet, issues);
    }
    return this.parseIngresos(rows, sheet, issues);
  }

  /** Excel con columnas por tipo de ingreso (p. ej. «Venta Inversiones»). */
  private isWideIngresosSheet(sample: Row): boolean {
    if (this.hasImporteColumn(sample)) {
      return false;
    }
    let ingresoCols = 0;
    for (const key of Object.keys(sample)) {
      if (this.isIngresoMetaColumn(key)) continue;
      if (this.matchCategoriaIngreso(key)) {
        ingresoCols++;
      }
    }
    return ingresoCols >= 1;
  }

  private hasImporteColumn(row: Row): boolean {
    return Object.keys(row).some((k) => {
      const n = this.norm(k);
      return (
        n === 'importe' ||
        n === 'cantidad' ||
        n === 'amount' ||
        n === 'ingreso'
      );
    });
  }

  private parseIngresosWide(
    rows: Row[],
    sheet: string,
    issues: ImportIssue[]
  ): IngresoInput[] {
    const out: IngresoInput[] = [];
    rows.forEach((row, idx) => {
      const fecha = this.pickFechaFromRow(row);
      if (!fecha) return;

      const descripcion = String(
        this.pick(row, [
          'descripcion',
          'descripción',
          'concepto',
          'detalle',
          'nombre',
        ]) ?? ''
      ).trim();

      const extracted = this.extractIngresosFromNamedColumns(
        row,
        fecha,
        descripcion
      );
      if (extracted.length) {
        out.push(...extracted);
        return;
      }

      issues.push({
        sheet,
        row: idx + 2,
        message: 'Fila sin columnas de ingreso reconocidas.',
      });
    });
    return out;
  }

  /** Hoja mixta / Transacciones (legacy): clasifica cada fila por categoría. */
  private parseMixto(
    rows: Row[],
    sheet: string,
    issues: ImportIssue[]
  ): {
    gastos: GastoInput[];
    ingresos: IngresoInput[];
    looksLikeGastos: boolean;
    looksLikeIngresos: boolean;
  } {
    const gastos: GastoInput[] = [];
    const ingresos: IngresoInput[] = [];

    rows.forEach((row, idx) => {
      const fecha = parseFlexibleDate(
        this.pick(row, ['fecha', 'date', 'día', 'dia'])
      );
      const importe = this.parseNumber(
        this.pick(row, [
          'importe',
          'cantidad',
          'amount',
          'euros',
          'valor',
          'total',
          'gasto',
          'ingreso',
        ])
      );
      const descripcion = String(
        this.pick(row, [
          'descripcion',
          'descripción',
          'concepto',
          'detalle',
          'nombre',
        ]) ?? ''
      ).trim();
      const catRaw = String(
        this.pick(row, ['categoria', 'categoría', 'category', 'tipo', 'rubro']) ??
          ''
      ).trim();

      if (!fecha || importe == null) {
        return;
      }

      const esGasto = this.esCategoriaGasto(catRaw);
      const catIngreso = this.matchCategoriaIngreso(catRaw);
      if (catIngreso && !esGasto) {
        ingresos.push({
          fecha,
          importe: Math.abs(importe),
          descripcion: descripcion || catIngreso,
          categoria: catIngreso,
        });
        return;
      }

      const subRaw = String(
        this.pick(row, [
          'subcategoria',
          'subcategoría',
          'subcategory',
          'sub categoria',
          'subtipo',
        ]) ?? ''
      ).trim();
      const { categoria, subcategoria } = clasificarGastoExcel(catRaw, subRaw, this.catConfig);
      gastos.push({
        fecha,
        importe: Math.abs(importe),
        descripcion: descripcion || subcategoria || categoria,
        categoria,
        subcategoria,
      });

      if (
        catRaw &&
        !this.matchCategoriaGasto(catRaw) &&
        !subcategoria
      ) {
        issues.push({
          sheet,
          row: idx + 2,
          message: `Categoría «${catRaw}» → «${categoria}»${subcategoria ? ` / ${subcategoria}` : ''}.`,
        });
      }
    });

    return {
      gastos,
      ingresos,
      looksLikeGastos: gastos.length > 0,
      looksLikeIngresos: ingresos.length > 0,
    };
  }

  /**
   * Excel de bolsa: Inversión > 0 = compra; Inversión < 0 = venta
   * (la venta trae precio compra + precio venta → rentabilidad).
   */
  private parseBolsa(
    rows: Row[],
    sheet: string,
    issues: ImportIssue[]
  ): OperacionBolsaInput[] {
    const out: OperacionBolsaInput[] = [];

    rows.forEach((row, idx) => {
      if (this.isEmptyBolsaRow(row)) return;

      const empresa = String(
        this.pick(row, [
          'empresa',
          'ticker',
          'activo',
          'nombre',
          'etf',
          'acción',
          'accion',
        ]) ?? ''
      ).trim();

      const fecha = parseFlexibleDate(
        this.pick(row, [
          'fechaoperacion',
          'fecha operación',
          'fecha',
          'fecha compra',
          'fechacompra',
          'date',
        ])
      );

      const inversionRaw = this.parseNumber(
        this.pick(row, ['inversion', 'inversión', 'invertido', 'capital'])
      );

      const precioCompraAccion = this.parseNumber(
        this.pick(row, [
          'preciocompraaccion',
          'precio compra accion',
          'precio de compra',
          'precio compra',
          'preciocompra',
          'p compra',
        ])
      );

      const precioVentaAccion = this.parseNumber(
        this.pick(row, [
          'precioventaaccion',
          'precio venta accion',
          'precio de venta',
          'precio venta',
          'precioventa',
          'p venta',
        ])
      );

      const comision =
        this.parseNumber(
          this.pick(row, ['comision', 'comisión', 'fee', 'fees'])
        ) ?? 0;

      let numeroAcciones = this.parseNumber(
        this.pick(row, [
          'numeroacciones',
          'número acciones',
          'nº acciones',
          'n acciones',
          'acciones',
          'titulos',
          'títulos',
          'cantidad',
        ])
      );

      const provisionImpuestos = this.parseNumber(
        this.pick(row, [
          'provisionimpuestos',
          'provisión impuestos',
          'impuestos',
          'irpf',
        ])
      );

      const resultadoNetoExcel = this.parseNumber(
        this.pick(row, [
          'resultado neto',
          'resultado',
          'ganancia',
          'beneficio',
          'pl',
          'p l',
        ])
      );

      const rentabilidadExcel = this.parsePercent(
        this.pick(row, [
          'rentabilidad',
          'rentabilidad pct',
          'rentabilidad %',
          'rent',
          'roi',
        ])
      );

      if (!empresa || !fecha || inversionRaw == null) {
        issues.push({
          sheet,
          row: idx + 2,
          message: `Operación inválida (empresa/fecha/inversión).`,
        });
        return;
      }

      const esVenta = inversionRaw < 0;
      const importeAbs = Math.abs(inversionRaw);

      if (numeroAcciones == null || numeroAcciones === 0) {
        const precioRef = esVenta
          ? (precioVentaAccion ?? precioCompraAccion)
          : (precioCompraAccion ?? precioVentaAccion);
        if (precioRef && precioRef > 0) {
          numeroAcciones = importeAbs / precioRef;
        }
      }
      if (numeroAcciones != null) {
        numeroAcciones = Math.abs(numeroAcciones);
      }

      if (numeroAcciones == null || numeroAcciones <= 0) {
        issues.push({
          sheet,
          row: idx + 2,
          message: `Falta nº de acciones (o no se pudo calcular).`,
        });
        return;
      }

      if (esVenta) {
        const pVenta =
          precioVentaAccion ??
          (numeroAcciones > 0 ? importeAbs / numeroAcciones : null);
        const pCompra = precioCompraAccion ?? null;

        if (
          (pCompra == null || pVenta == null) &&
          resultadoNetoExcel == null
        ) {
          issues.push({
            sheet,
            row: idx + 2,
            message: `Venta sin precio de compra y/o venta.`,
          });
          return;
        }

        const pCompraFinal = pCompra ?? pVenta ?? 0;
        const pVentaFinal = pVenta ?? pCompra ?? 0;

        out.push({
          empresa,
          fechaOperacion: fecha,
          fechaVenta: fecha,
          inversion: pCompraFinal * numeroAcciones,
          precioCompraAccion: pCompraFinal,
          precioVentaAccion: pVentaFinal,
          comision: Math.abs(comision),
          numeroAcciones,
          provisionImpuestos: provisionImpuestos ?? undefined,
          esVenta: true,
          resultadoNeto: resultadoNetoExcel ?? undefined,
          rentabilidadPct: rentabilidadExcel ?? undefined,
        });
        return;
      }

      const pCompra =
        precioCompraAccion ??
        (numeroAcciones > 0 ? importeAbs / numeroAcciones : null);

      if (pCompra == null) {
        issues.push({
          sheet,
          row: idx + 2,
          message: `Compra sin precio de compra.`,
        });
        return;
      }

      const cerradaPorPrecio =
        precioVentaAccion != null && precioVentaAccion > 0;

      out.push({
        empresa,
        fechaOperacion: fecha,
        inversion: importeAbs,
        precioCompraAccion: pCompra,
        comision: Math.abs(comision),
        numeroAcciones,
        precioVentaAccion: cerradaPorPrecio ? precioVentaAccion : undefined,
        fechaVenta: cerradaPorPrecio ? fecha : undefined,
        provisionImpuestos: provisionImpuestos ?? undefined,
        esVenta: false,
        resultadoNeto: resultadoNetoExcel ?? undefined,
        rentabilidadPct: rentabilidadExcel ?? undefined,
      });
    });

    return out;
  }

  private isEmptyBolsaRow(row: Row): boolean {
    const empresa = this.pick(row, ['empresa', 'ticker', 'activo', 'nombre']);
    const inversion = this.pick(row, ['inversion', 'inversión']);
    const fecha = this.pick(row, ['fecha', 'fechaoperacion']);
    return (
      (empresa == null || String(empresa).trim() === '') &&
      (inversion == null || inversion === '') &&
      (fecha == null || fecha === '')
    );
  }

  private matchCategoriaGasto(raw: string): string | null {
    const n = this.norm(raw);
    if (!n) return null;
    const cats = this.categoriasConfig.categoriasGasto();
    const found = cats.find((c) => this.norm(c) === n);
    if (found) return found;

    const { categoria } = clasificarGastoExcel(raw, '', this.catConfig);
    if (cats.includes(categoria)) return categoria;
    return null;
  }

  private resolveCategoriaGasto(raw: string): string {
    return (
      this.matchCategoriaGasto(raw) ?? this.categoriasConfig.categoriaGastoFallback()
    );
  }

  private matchCategoriaIngreso(raw: string): string | null {
    const n = this.norm(raw);
    if (!n) return null;
    const cats = this.categoriasConfig.categoriasIngreso();
    const found = cats.find((c) => this.norm(c) === n);
    if (found) return found;

    if (n.includes('nomina') || n.includes('sueldo') || n.includes('salario')) {
      return cats.find((c) => this.norm(c).includes('nomina')) ?? null;
    }
    if (n.includes('flexib') || n.includes('retrib') || n.includes('ticket')) {
      return cats.find((c) => this.norm(c).includes('flex')) ?? null;
    }
    if (n === 'ret flexible' || n.startsWith('ret ')) {
      return cats.find((c) => this.norm(c).includes('flex')) ?? null;
    }
    if (
      n.includes('venta') &&
      (n.includes('invers') || n.includes('bolsa'))
    ) {
      return cats.find((c) => this.norm(c).includes('venta')) ?? null;
    }
    if (n === 'otros' || n === 'otro') {
      return cats.find((c) => this.norm(c).includes('otro')) ?? null;
    }
    return null;
  }

  private resolveCategoriaIngreso(raw: string): string {
    return (
      this.matchCategoriaIngreso(raw) ??
      this.categoriasConfig.categoriaIngresoFallback()
    );
  }

  private pick(row: Row, aliases: string[]): unknown {
    const entries = Object.entries(row);
    for (const alias of aliases) {
      const target = this.norm(alias);
      const hit = entries.find(([k]) => this.norm(k) === target);
      if (hit && hit[1] !== '' && hit[1] != null) return hit[1];
    }
    for (const alias of aliases) {
      const target = this.norm(alias);
      const hit = entries.find(([k]) => {
        const nk = this.norm(k);
        if (target === 'precio' && nk !== 'precio') return false;
        return this.columnMatchesAlias(nk, target);
      });
      if (hit && hit[1] !== '' && hit[1] != null) return hit[1];
    }
    return undefined;
  }

  /** Evita confundir «Venta Inversiones» con alias «ingreso». */
  private columnMatchesAlias(columnNorm: string, aliasNorm: string): boolean {
    if (columnNorm === aliasNorm) return true;
    return (
      columnNorm.startsWith(`${aliasNorm} `) ||
      columnNorm.endsWith(` ${aliasNorm}`) ||
      columnNorm.includes(` ${aliasNorm} `)
    );
  }

  private hasKeys(row: Row, keys: string[]): boolean {
    return keys.every((k) => this.pick(row, [k]) != null);
  }

  private parseNumber(value: unknown): number | null {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    let s = String(value).trim();
    if (!s) return null;
    s = s.replace(/[€\s%]/g, '');
    const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
    s = s.replace(/^\(|\)$/g, '').replace(/^-/, '');
    if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',') && !s.includes('.')) {
      s = s.replace(',', '.');
    }
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return neg ? -Math.abs(n) : n;
  }

  /** Rentabilidad % del Excel (0,195 → 19,5 puntos porcentuales). */
  private parsePercent(value: unknown): number | null {
    const n = this.parseNumber(value);
    if (n == null) return null;
    if (n !== 0 && Math.abs(n) <= 1) {
      return n * 100;
    }
    return n;
  }

  private norm(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
}
