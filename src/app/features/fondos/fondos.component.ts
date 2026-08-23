import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import {
  ETF_CATEGORY_FILTERS,
  ETF_CATEGORY_LABELS,
  EtfCategory,
  EtfOverlapResult,
  EtfProfile,
} from '../../core/models/etf.model';
import { EtfService } from '../../core/services/etf.service';

@Component({
  selector: 'app-fondos',
  standalone: true,
  imports: [DecimalPipe, FormsModule, MatIconModule],
  templateUrl: './fondos.component.html',
  styleUrl: './fondos.component.css',
})
export class FondosComponent implements OnInit {
  private readonly etfService = inject(EtfService);

  readonly categoryFilters = ETF_CATEGORY_FILTERS;
  readonly categoryLabels = ETF_CATEGORY_LABELS;

  readonly category = signal<EtfCategory | 'todos'>('todos');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly profiles = signal<EtfProfile[]>([]);
  readonly loaded = signal(false);

  readonly overlapA = signal('VTI');
  readonly overlapB = signal('VOO');
  readonly overlapLoading = signal(false);
  readonly overlapError = signal<string | null>(null);
  readonly overlap = signal<EtfOverlapResult | null>(null);

  readonly topProfiles = computed(() => this.profiles().slice(0, 8));
  readonly tickers = computed(() =>
    this.profiles()
      .filter((p) => p.metrics)
      .map((p) => p.ticker)
  );

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const results = await this.etfService.loadProfiles(this.category());
      this.profiles.set(results);
      this.loaded.set(true);
      if (results.every((r) => !r.metrics)) {
        this.error.set(
          'No se pudieron cargar métricas. Comprueba tu conexión o inténtalo más tarde.'
        );
      }
    } catch (e) {
      this.profiles.set([]);
      this.error.set(
        e instanceof Error ? e.message : 'Error al consultar SecuritiesDB.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  setCategory(cat: EtfCategory | 'todos'): void {
    this.category.set(cat);
    void this.cargar();
  }

  async comparar(): Promise<void> {
    const a = this.overlapA().trim().toUpperCase();
    const b = this.overlapB().trim().toUpperCase();
    if (!a || !b || a === b) {
      this.overlapError.set('Elige dos tickers distintos.');
      return;
    }
    this.overlapLoading.set(true);
    this.overlapError.set(null);
    try {
      this.overlap.set(await this.etfService.compareOverlap(a, b));
    } catch (e) {
      this.overlap.set(null);
      this.overlapError.set(
        e instanceof Error ? e.message : 'Error al comparar solapamiento.'
      );
    } finally {
      this.overlapLoading.set(false);
    }
  }

  formatPct(value: number | null, digits = 2): string {
    if (value == null) return '—';
    return `${(value * (Math.abs(value) <= 1 ? 100 : 1)).toFixed(digits)} %`;
  }

  /** TER ya viene como fracción (0.0003 = 0.03%). */
  formatTer(value: number | null): string {
    if (value == null) return '—';
    return `${(value * 100).toFixed(2)} %`;
  }

  formatAum(value: number | null): string {
    if (value == null) return '—';
    if (value >= 1e12) return `${(value / 1e12).toFixed(1)} T$`;
    if (value >= 1e9) return `${(value / 1e9).toFixed(1)} B$`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(0)} M$`;
    return value.toLocaleString('es-ES');
  }

  formatNum(value: number | null, digits = 2): string {
    if (value == null) return '—';
    return value.toFixed(digits);
  }
}
