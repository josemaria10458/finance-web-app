import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  input,
} from '@angular/core';
import {
  Chart,
  ChartConfiguration,
  ChartType,
  registerables,
} from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-chart-panel',
  standalone: true,
  template: `
    <div class="chart-panel">
      <h3>{{ title() }}</h3>
      <div class="canvas-wrap">
        <canvas #canvas></canvas>
      </div>
    </div>
  `,
  styles: `
    .chart-panel {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 1rem 1.1rem 1.1rem;
      border-radius: var(--radius);
      background: var(--surface);
      border: 1px solid var(--line);
      backdrop-filter: blur(8px);
      min-height: 280px;
    }
    h3 {
      margin: 0;
      font-family: var(--font-display);
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--ink);
    }
    .canvas-wrap {
      position: relative;
      flex: 1;
      min-height: 220px;
    }
    canvas {
      width: 100% !important;
      height: 100% !important;
    }
  `,
})
export class ChartPanelComponent implements AfterViewInit, OnDestroy {
  readonly title = input.required<string>();
  readonly type = input.required<ChartType>();
  readonly config = input.required<ChartConfiguration['data']>();
  readonly options = input<ChartConfiguration['options']>({});

  @ViewChild('canvas', { static: true })
  canvas!: ElementRef<HTMLCanvasElement>;

  private chart?: Chart;
  private ready = false;

  constructor() {
    effect(() => {
      // Track inputs
      this.type();
      this.config();
      this.options();
      if (this.ready) {
        this.render();
      }
    });
  }

  ngAfterViewInit(): void {
    this.ready = true;
    this.render();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private render(): void {
    const data = this.config();
    if (!data) return;

    const baseOptions: ChartConfiguration['options'] = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            font: { family: 'DM Sans', size: 12 },
            color: '#5c6b68',
          },
        },
        tooltip: {
          titleFont: { family: 'DM Sans' },
          bodyFont: { family: 'DM Sans' },
        },
      },
      scales:
        this.type() === 'doughnut' || this.type() === 'pie'
          ? undefined
          : {
              x: {
                ticks: { font: { family: 'DM Sans', size: 11 }, color: '#5c6b68' },
                grid: { color: 'rgba(12,46,43,0.06)' },
              },
              y: {
                ticks: { font: { family: 'DM Sans', size: 11 }, color: '#5c6b68' },
                grid: { color: 'rgba(12,46,43,0.06)' },
              },
            },
      ...this.options(),
    };

    if (this.chart) {
      this.chart.destroy();
      this.chart = undefined;
    }

    this.chart = new Chart(this.canvas.nativeElement, {
      type: this.type(),
      data,
      options: baseOptions,
    });
  }
}