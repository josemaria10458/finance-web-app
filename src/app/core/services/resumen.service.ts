import { Injectable, computed, inject } from '@angular/core';
import { RangoResumen, ResumenMensual } from '../models';
import { costeOperacion } from '../models/operacion-bolsa.model';
import {
  currentYearMonth,
  formatMesLabel,
  yearMonthKey,
} from '../utils/date.utils';
import { GastosService } from './gastos.service';
import { IngresosService } from './ingresos.service';
import { InversionesService } from './inversiones.service';

export type { RangoResumen };

@Injectable({ providedIn: 'root' })
export class ResumenService {
  private readonly gastosService = inject(GastosService);
  private readonly ingresosService = inject(IngresosService);
  private readonly inversionesService = inject(InversionesService);

  readonly mensuales = computed(() => this.calcular());

  filtrarPorRango(
    rango: RangoResumen,
    all = this.mensuales()
  ): ResumenMensual[] {
    if (rango === 'todo' || !all.length) {
      return all;
    }
    const now = currentYearMonth();
    const [y, m] = now.split('-').map(Number);

    if (rango === 'mes') {
      return all.filter((r) => r.mesKey === now);
    }

    if (rango === 'trimestre') {
      const startMonth = Math.floor((m - 1) / 3) * 3 + 1;
      const keys = [0, 1, 2].map((i) => {
        const mm = String(startMonth + i).padStart(2, '0');
        return `${y}-${mm}`;
      });
      return all.filter((r) => keys.includes(r.mesKey));
    }

    // año
    return all.filter((r) => r.mesKey.startsWith(`${y}-`));
  }

  gastosPorCategoria(rango: RangoResumen): { label: string; value: number }[] {
    const filtered = this.filtrarPorRango(rango);
    const monthSet =
      rango === 'todo'
        ? null
        : new Set(filtered.map((r) => r.mesKey));

    const map: Record<string, number> = {};
    for (const g of this.gastosService.gastos()) {
      const ym = yearMonthKey(g.fecha);
      if (monthSet && !monthSet.has(ym)) {
        continue;
      }
      map[g.categoria] = (map[g.categoria] ?? 0) + g.importe;
    }
    return Object.entries(map)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }

  kpis(rango: RangoResumen) {
    const filtered = this.filtrarPorRango(rango);
    const all = this.mensuales();
    const ultimoAll = all.length ? all[all.length - 1] : null;
    const ultimoFiltrado = filtered.length
      ? filtered[filtered.length - 1]
      : null;

    const ingresos = filtered.reduce((s, r) => s + r.ingresos, 0);
    const gastos = filtered.reduce((s, r) => s + r.gastos, 0);
    const ahorroNeto = ingresos - gastos;
    const porcentajeAhorro = ingresos > 0 ? ahorroNeto / ingresos : 0;

    const year = currentYearMonth().slice(0, 4);
    const ytdOps = this.inversionesService
      .cerradas()
      .filter((o) => (o.fechaVenta ?? o.fechaOperacion).startsWith(year));
    const ytdResultado = ytdOps.reduce((s, o) => s + o.resultadoNeto, 0);
    const ytdCoste = ytdOps.reduce((s, o) => s + costeOperacion(o), 0);
    const rentabilidadYtd = ytdCoste > 0 ? ytdResultado / ytdCoste : null;

    return {
      ahorroNeto,
      porcentajeAhorro,
      patrimonio: ultimoAll?.balancePatrimonio ?? 0,
      rentabilidadYtd,
      mesLabel: ultimoFiltrado?.mes ?? '—',
      ingresos,
      gastos,
    };
  }

  private calcular(): ResumenMensual[] {
    const gastos = this.gastosService.gastos();
    const ingresos = this.ingresosService.ingresos();
    const ops = this.inversionesService.operaciones();

    const months = new Set<string>();
    for (const g of gastos) months.add(yearMonthKey(g.fecha));
    for (const i of ingresos) months.add(yearMonthKey(i.fecha));
    for (const o of ops) {
      months.add(yearMonthKey(o.fechaOperacion));
      if (o.fechaVenta) months.add(yearMonthKey(o.fechaVenta));
    }

    const sorted = [...months].sort();
    let ahorroAcumulado = 0;
    let balanceInversion = 0;
    const result: ResumenMensual[] = [];

    for (const ym of sorted) {
      const ingresosMes = ingresos
        .filter((i) => yearMonthKey(i.fecha) === ym)
        .reduce((s, i) => s + i.importe, 0);
      const gastosMes = gastos
        .filter((g) => yearMonthKey(g.fecha) === ym)
        .reduce((s, g) => s + g.importe, 0);

      const comprasMes = ops.filter(
        (o) => yearMonthKey(o.fechaOperacion) === ym
      );
      const ventasMes = ops.filter((o) => {
        if (o.precioVentaAccion == null) return false;
        const ventaKey = yearMonthKey(o.fechaVenta ?? o.fechaOperacion);
        return ventaKey === ym;
      });

      const dineroInvertidoMes = comprasMes.reduce(
        (s, o) => s + costeOperacion(o),
        0
      );
      const resultadoNetoInversionesMes = ventasMes.reduce(
        (s, o) => s + o.resultadoNeto,
        0
      );
      const impuestosProvisionados = ventasMes.reduce(
        (s, o) => s + (o.provisionImpuestos ?? 0),
        0
      );

      for (const o of comprasMes) {
        balanceInversion += costeOperacion(o);
      }
      for (const o of ventasMes) {
        balanceInversion -= costeOperacion(o);
        balanceInversion += o.resultadoNeto;
      }

      const ahorroNeto = ingresosMes - gastosMes;
      ahorroAcumulado += ahorroNeto;
      const porcentajeAhorro = ingresosMes > 0 ? ahorroNeto / ingresosMes : 0;
      const rentabilidadMensualInversiones =
        dineroInvertidoMes > 0
          ? resultadoNetoInversionesMes / dineroInvertidoMes
          : 0;
      const balancePatrimonio = ahorroAcumulado + balanceInversion;

      result.push({
        mesKey: ym,
        mes: formatMesLabel(ym),
        ingresos: ingresosMes,
        gastos: gastosMes,
        ahorroNeto,
        porcentajeAhorro,
        dineroInvertidoMes,
        resultadoNetoInversionesMes,
        rentabilidadMensualInversiones,
        impuestosProvisionados,
        balanceInversion,
        balancePatrimonio,
        dineroTotalFinMes: balancePatrimonio,
      });
    }

    return result;
  }
}
