import { CurrencyPipe, PercentPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ChartConfiguration } from 'chart.js';
import { RangoResumen } from '../../core/models';
import { ResumenService } from '../../core/services/resumen.service';
import { ChartPanelComponent } from '../../shared/charts/chart-panel.component';

const INK = '#0c2e2b';
const ACCENT = '#1f6f66';
const AMBER = '#e8a54b';
const MUTED = '#8aa09b';
const DANGER = '#b54a3a';

const CAT_COLORS = [
  '#1f6f66',
  '#3b6ea5',
  '#c47a3a',
  '#9a6b4f',
  '#4d6b57',
  '#b54a3a',
  '#2f9b8f',
];

@Component({
  selector: 'app-resumen',
  standalone: true,
  imports: [CurrencyPipe, PercentPipe, ChartPanelComponent],
  templateUrl: './resumen.component.html',
  styleUrl: './resumen.component.css',
})
export class ResumenComponent {
  private readonly resumenService = inject(ResumenService);

  readonly rango = signal<RangoResumen>('anio');
  readonly rangos: { id: RangoResumen; label: string }[] = [
    { id: 'mes', label: 'Mes' },
    { id: 'trimestre', label: 'Trimestre' },
    { id: 'anio', label: 'Año' },
    { id: 'todo', label: 'Todo' },
  ];

  readonly series = computed(() =>
    this.resumenService.filtrarPorRango(this.rango())
  );

  readonly kpis = computed(() => this.resumenService.kpis(this.rango()));

  readonly hasData = computed(() => this.resumenService.mensuales().length > 0);

  readonly ingresosGastosData = computed<ChartConfiguration['data']>(() => {
    const rows = this.series();
    return {
      labels: rows.map((r) => r.mes),
      datasets: [
        {
          label: 'Ingresos',
          data: rows.map((r) => r.ingresos),
          backgroundColor: ACCENT,
          borderRadius: 6,
        },
        {
          label: 'Gastos',
          data: rows.map((r) => r.gastos),
          backgroundColor: AMBER,
          borderRadius: 6,
        },
      ],
    };
  });

  readonly ahorroData = computed<ChartConfiguration['data']>(() => {
    const rows = this.series();
    let acum = 0;
    const acumulado = rows.map((r) => {
      acum += r.ahorroNeto;
      return acum;
    });
    return {
      labels: rows.map((r) => r.mes),
      datasets: [
        {
          type: 'line',
          label: 'Ahorro acumulado',
          data: acumulado,
          borderColor: INK,
          backgroundColor: 'rgba(12,46,43,0.08)',
          fill: true,
          tension: 0.35,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: '% ahorro',
          data: rows.map((r) => +(r.porcentajeAhorro * 100).toFixed(2)),
          borderColor: ACCENT,
          borderDash: [5, 4],
          tension: 0.35,
          yAxisID: 'y1',
        },
      ],
    };
  });

  readonly ahorroOptions: ChartConfiguration['options'] = {
    scales: {
      y: {
        position: 'left',
        ticks: { font: { family: 'DM Sans', size: 11 }, color: MUTED },
        grid: { color: 'rgba(12,46,43,0.06)' },
      },
      y1: {
        position: 'right',
        grid: { drawOnChartArea: false },
        ticks: {
          font: { family: 'DM Sans', size: 11 },
          color: MUTED,
          callback: (v) => `${v}%`,
        },
      },
      x: {
        ticks: { font: { family: 'DM Sans', size: 11 }, color: MUTED },
        grid: { color: 'rgba(12,46,43,0.06)' },
      },
    },
  };

  readonly donutData = computed<ChartConfiguration['data']>(() => {
    const cats = this.resumenService.gastosPorCategoria(this.rango());
    return {
      labels: cats.map((c) => c.label),
      datasets: [
        {
          data: cats.map((c) => c.value),
          backgroundColor: cats.map((_, i) => CAT_COLORS[i % CAT_COLORS.length]),
          borderWidth: 0,
        },
      ],
    };
  });

  readonly patrimonioData = computed<ChartConfiguration['data']>(() => {
    const rows = this.series();
    return {
      labels: rows.map((r) => r.mes),
      datasets: [
        {
          label: 'Balance inversión',
          data: rows.map((r) => r.balanceInversion),
          borderColor: ACCENT,
          tension: 0.35,
          fill: false,
        },
        {
          label: 'Patrimonio',
          data: rows.map((r) => r.balancePatrimonio),
          borderColor: INK,
          backgroundColor: 'rgba(12,46,43,0.08)',
          tension: 0.35,
          fill: true,
        },
      ],
    };
  });

  readonly rentabData = computed<ChartConfiguration['data']>(() => {
    const rows = this.series();
    return {
      labels: rows.map((r) => r.mes),
      datasets: [
        {
          label: 'Resultado neto inversiones',
          data: rows.map((r) => r.resultadoNetoInversionesMes),
          backgroundColor: rows.map((r) =>
            r.resultadoNetoInversionesMes >= 0 ? ACCENT : DANGER
          ),
          borderRadius: 6,
        },
      ],
    };
  });

  setRango(r: RangoResumen): void {
    this.rango.set(r);
  }
}
