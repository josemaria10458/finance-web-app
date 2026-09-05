import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  CategoriaGasto,
  Gasto,
} from '../../core/models';
import { CategoriasConfigService } from '../../core/services/categorias-config.service';
import { FiltroAnioService } from '../../core/services/filtro-anio.service';
import { GastosService } from '../../core/services/gastos.service';
import {
  formatMesLabel,
  buildMonthOptions,
  yearMonthKey,
} from '../../core/utils/date.utils';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { RecurringDialogComponent } from '../../shared/components/recurring-dialog/recurring-dialog.component';
import {
  GastoFormDialogComponent,
  GastoFormDialogData,
} from './gasto-form-dialog.component';

const CATEGORY_META: Record<string, { tone: string; icon: string }> = {
  Ocio: { tone: '#2f9b8f', icon: 'sports_tennis' },
  Viajes: { tone: '#3b6ea5', icon: 'flight' },
  Comida: { tone: '#c47a3a', icon: 'restaurant' },
  Bebida: { tone: '#9a6b4f', icon: 'local_cafe' },
  Transporte: { tone: '#4d6b57', icon: 'directions_car' },
  'Gastos propios': { tone: '#b54a3a', icon: 'person' },
};

const CATEGORY_PALETTE = [
  '#2f9b8f',
  '#3b6ea5',
  '#c47a3a',
  '#9a6b4f',
  '#4d6b57',
  '#b54a3a',
  '#1f6f66',
  '#2563eb',
];

@Component({
  selector: 'app-gastos',
  standalone: true,
  imports: [
    FormsModule,
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    MatDialogModule,
    MatIconModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './gastos.component.html',
  styleUrl: './gastos.component.css',
})
export class GastosComponent {
  private readonly gastosService = inject(GastosService);
  private readonly categoriasConfig = inject(CategoriasConfigService);
  private readonly filtroAnio = inject(FiltroAnioService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly categorias = this.categoriasConfig.categoriasGasto;

  readonly mesFiltro = signal<string | null>(null);
  readonly categoriaFiltro = signal<CategoriaGasto | 'todas'>('todas');
  readonly subcategoriaFiltro = signal<string | null>(null);

  readonly mesesDisponibles = computed(() => {
    const months = buildMonthOptions(this.gastosService.availableYearMonths());
    const year = this.filtroAnio.year();
    if (year == null) return months;
    return months.filter((m) => m.startsWith(`${year}-`));
  });

  readonly gastosFiltrados = computed(() => {
    this.gastosService.gastos();
    this.filtroAnio.year();
    let list = this.gastosService.byYearMonth(this.mesFiltro());
    list = list.filter((g) => this.filtroAnio.matchesDate(g.fecha));
    const cat = this.categoriaFiltro();
    if (cat !== 'todas') {
      list = list.filter((g) => g.categoria === cat);
    }
    const sub = this.subcategoriaFiltro();
    if (sub) {
      list = list.filter((g) =>
        sub === 'Sin subcategoría'
          ? !g.subcategoria?.trim()
          : g.subcategoria === sub
      );
    }
    return [...list].sort((a, b) => b.fecha.localeCompare(a.fecha));
  });

  readonly totalMes = computed(() => {
    this.gastosService.gastos();
    this.filtroAnio.year();
    return this.gastosService
      .byYearMonth(this.mesFiltro())
      .filter((g) => this.filtroAnio.matchesDate(g.fecha))
      .reduce((s, g) => s + g.importe, 0);
  });

  readonly totalFiltrado = computed(() =>
    this.gastosFiltrados().reduce((s, g) => s + g.importe, 0)
  );

  readonly cartasCategoria = computed(() => {
    this.gastosService.gastos();
    this.filtroAnio.year();
    this.categoriasConfig.config();
    const gastosMes = this.gastosService
      .byYearMonth(this.mesFiltro())
      .filter((g) => this.filtroAnio.matchesDate(g.fecha));
    const map: Record<string, number> = {};
    for (const g of gastosMes) {
      map[g.categoria] = (map[g.categoria] ?? 0) + g.importe;
    }
    const totalMes = this.totalMes();
    return this.categoriasConfig.categoriasGasto().map((categoria, index) => {
      const total = map[categoria] ?? 0;
      const meta = CATEGORY_META[categoria] ?? {
        tone: CATEGORY_PALETTE[index % CATEGORY_PALETTE.length],
        icon: 'payments',
      };
      const subMap = new Map<string, number>();
      for (const g of gastosMes) {
        if (g.categoria !== categoria) continue;
        const key = g.subcategoria?.trim() || 'Sin subcategoría';
        subMap.set(key, (subMap.get(key) ?? 0) + g.importe);
      }
      const subs = [...subMap.entries()]
        .map(([nombre, t]) => ({
          nombre,
          total: t,
          pct: total > 0 ? (t / total) * 100 : 0,
        }))
        .sort((a, b) => b.total - a.total);
      return {
        categoria,
        total,
        pct: totalMes > 0 ? (total / totalMes) * 100 : 0,
        tone: meta.tone,
        icon: meta.icon,
        subcategorias: subs,
      };
    }).sort((a, b) => b.total - a.total);
  });

  readonly subcategoriasVisibles = computed(() => {
    const cat = this.categoriaFiltro();
    if (cat === 'todas') return [];
    return (
      this.cartasCategoria().find((c) => c.categoria === cat)?.subcategorias ??
      []
    );
  });

  constructor() {
    effect(() => {
      const year = this.filtroAnio.year();
      const mes = this.mesFiltro();
      if (year != null && mes && !mes.startsWith(`${year}-`)) {
        this.mesFiltro.set(null);
      }
    });
  }

  tone(categoria: string, index = 0): string {
    return (
      CATEGORY_META[categoria]?.tone ??
      CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]
    );
  }

  icon(categoria: string): string {
    return CATEGORY_META[categoria]?.icon ?? 'payments';
  }

  labelMes(ym: string): string {
    return formatMesLabel(ym);
  }

  seleccionarCategoria(cat: CategoriaGasto): void {
    this.categoriaFiltro.update((actual) => {
      if (actual === cat) {
        this.subcategoriaFiltro.set(null);
        return 'todas';
      }
      this.subcategoriaFiltro.set(null);
      return cat;
    });
  }

  seleccionarSubcategoria(sub: string): void {
    this.subcategoriaFiltro.update((actual) => (actual === sub ? null : sub));
  }

  subcategoriaActiva(sub: string): boolean {
    return this.subcategoriaFiltro() === sub;
  }

  abrirNuevo(): void {
    this.openForm();
  }

  abrirProgramar(): void {
    const ref = this.dialog.open(RecurringDialogComponent, {
      width: '480px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
      data: { tipo: 'gasto' },
    });
    ref.afterClosed().subscribe((rule) => {
      if (!rule?.id) return;
      const visible = this.gastosService
        .gastos()
        .find((g) => g.recurrenteId === rule.id);
      if (visible) this.revelarGasto(visible);
      this.snackBar.open(
        visible
          ? 'Gasto programado y añadido este mes'
          : `Gasto programado: se añadirá el día ${rule.diaDelMes} de cada mes`,
        'Cerrar',
        { duration: 2800 }
      );
    });
  }

  abrirEditar(gasto: Gasto): void {
    this.openForm(gasto);
  }

  confirmarBorrar(gasto: Gasto): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '380px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
      data: {
        titulo: 'Eliminar gasto',
        mensaje: `¿Eliminar «${gasto.descripcion}» (${gasto.importe.toFixed(2)} €)?`,
      },
    });
    ref.afterClosed().subscribe((ok) => {
      if (!ok) return;
      this.gastosService.remove(gasto.id);
      this.snackBar.open('Gasto eliminado', 'Cerrar', { duration: 2500 });
    });
  }

  private openForm(gasto?: Gasto): void {
    const data: GastoFormDialogData = {
      gasto,
      yearMonth: gasto ? undefined : this.mesFiltro(),
    };
    const ref = this.dialog.open(GastoFormDialogComponent, {
      width: '440px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
      data,
    });
    ref.afterClosed().subscribe((saved) => {
      if (!saved) return;
      const id = gasto?.id ?? this.gastosService.gastos()[0]?.id;
      const visible = this.gastosService.gastos().find((g) => g.id === id);
      if (visible) this.revelarGasto(visible);
      this.snackBar.open(
        gasto ? 'Gasto actualizado' : 'Gasto añadido',
        'Cerrar',
        { duration: 2500 }
      );
    });
  }

  /** Ajusta año/mes para que el gasto recién guardado no quede oculto por el filtro. */
  private revelarGasto(gasto: Gasto): void {
    if (!this.filtroAnio.matchesDate(gasto.fecha)) {
      const year = Number(gasto.fecha.slice(0, 4));
      if (Number.isFinite(year)) this.filtroAnio.setYear(year);
    }
    const mes = this.mesFiltro();
    if (mes && yearMonthKey(gasto.fecha) !== mes) {
      this.mesFiltro.set(yearMonthKey(gasto.fecha));
    }
  }
}
