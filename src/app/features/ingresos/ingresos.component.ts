import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  CategoriaIngreso,
  Ingreso,
} from '../../core/models';
import { CategoriasConfigService } from '../../core/services/categorias-config.service';
import { FiltroAnioService } from '../../core/services/filtro-anio.service';
import { IngresosService } from '../../core/services/ingresos.service';
import {
  formatMesLabel,
  buildMonthOptions,
  yearMonthKey,
} from '../../core/utils/date.utils';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { RecurringDialogComponent } from '../../shared/components/recurring-dialog/recurring-dialog.component';
import {
  IngresoFormDialogComponent,
  IngresoFormDialogData,
} from './ingreso-form-dialog.component';

const CATEGORY_META: Record<string, { tone: string; icon: string }> = {
  Nómina: { tone: '#1f6f66', icon: 'account_balance' },
  'Retribución flexible': { tone: '#3b6ea5', icon: 'card_giftcard' },
  Otros: { tone: '#c47a3a', icon: 'payments' },
  'Venta Inversiones': { tone: '#2f9b8f', icon: 'trending_up' },
};

const CATEGORY_PALETTE = [
  '#1f6f66',
  '#3b6ea5',
  '#c47a3a',
  '#2f9b8f',
  '#2563eb',
  '#b54a3a',
];

@Component({
  selector: 'app-ingresos',
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
  templateUrl: './ingresos.component.html',
  styleUrl: './ingresos.component.css',
})
export class IngresosComponent {
  private readonly ingresosService = inject(IngresosService);
  private readonly categoriasConfig = inject(CategoriasConfigService);
  private readonly filtroAnio = inject(FiltroAnioService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly categorias = this.categoriasConfig.categoriasIngreso;

  readonly mesFiltro = signal<string | null>(null);
  readonly categoriaFiltro = signal<CategoriaIngreso | 'todas'>('todas');

  readonly mesesDisponibles = computed(() => {
    const months = buildMonthOptions(
      this.ingresosService.availableYearMonths()
    );
    const year = this.filtroAnio.year();
    if (year == null) return months;
    return months.filter((m) => m.startsWith(`${year}-`));
  });

  readonly ingresosFiltrados = computed(() => {
    this.ingresosService.ingresos();
    this.filtroAnio.year();
    let list = this.ingresosService.byYearMonth(this.mesFiltro());
    list = list.filter((i) => this.filtroAnio.matchesDate(i.fecha));
    const cat = this.categoriaFiltro();
    if (cat !== 'todas') {
      list = list.filter((i) => i.categoria === cat);
    }
    return [...list].sort((a, b) => b.fecha.localeCompare(a.fecha));
  });

  readonly totalMes = computed(() => {
    this.ingresosService.ingresos();
    this.filtroAnio.year();
    return this.ingresosService
      .byYearMonth(this.mesFiltro())
      .filter((i) => this.filtroAnio.matchesDate(i.fecha))
      .reduce((s, i) => s + i.importe, 0);
  });

  readonly totalFiltrado = computed(() =>
    this.ingresosFiltrados().reduce((s, i) => s + i.importe, 0)
  );

  readonly cartasCategoria = computed(() => {
    this.ingresosService.ingresos();
    this.filtroAnio.year();
    this.categoriasConfig.config();
    const map: Record<string, number> = {};
    for (const i of this.ingresosService
      .byYearMonth(this.mesFiltro())
      .filter((x) => this.filtroAnio.matchesDate(x.fecha))) {
      map[i.categoria] = (map[i.categoria] ?? 0) + i.importe;
    }
    const totalMes = this.totalMes();
    return this.categoriasConfig.categoriasIngreso().map((categoria, index) => {
      const total = map[categoria] ?? 0;
      const meta = CATEGORY_META[categoria] ?? {
        tone: CATEGORY_PALETTE[index % CATEGORY_PALETTE.length],
        icon: 'payments',
      };
      return {
        categoria,
        total,
        pct: totalMes > 0 ? (total / totalMes) * 100 : 0,
        tone: meta.tone,
        icon: meta.icon,
      };
    }).sort((a, b) => b.total - a.total);
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

  seleccionarCategoria(cat: CategoriaIngreso): void {
    this.categoriaFiltro.update((actual) =>
      actual === cat ? 'todas' : cat
    );
  }

  abrirNuevo(): void {
    this.openForm();
  }

  abrirProgramar(): void {
    const ref = this.dialog.open(RecurringDialogComponent, {
      width: '480px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
      data: { tipo: 'ingreso' },
    });
    ref.afterClosed().subscribe((rule) => {
      if (!rule?.id) return;
      const visible = this.ingresosService
        .ingresos()
        .find((i) => i.recurrenteId === rule.id);
      if (visible) this.revelarIngreso(visible);
      this.snackBar.open(
        visible
          ? 'Ingreso programado y añadido este mes'
          : `Ingreso programado: se añadirá el día ${rule.diaDelMes} de cada mes`,
        'Cerrar',
        { duration: 2800 }
      );
    });
  }

  abrirEditar(ingreso: Ingreso): void {
    this.openForm(ingreso);
  }

  confirmarBorrar(ingreso: Ingreso): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '380px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
      data: {
        titulo: 'Eliminar ingreso',
        mensaje: `¿Eliminar «${ingreso.descripcion}» (${ingreso.importe.toFixed(2)} €)?`,
      },
    });
    ref.afterClosed().subscribe((ok) => {
      if (!ok) return;
      this.ingresosService.remove(ingreso.id);
      this.snackBar.open('Ingreso eliminado', 'Cerrar', { duration: 2500 });
    });
  }

  private openForm(ingreso?: Ingreso): void {
    const data: IngresoFormDialogData = { ingreso };
    const ref = this.dialog.open(IngresoFormDialogComponent, {
      width: '440px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
      data,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        const id = ingreso?.id ?? this.ingresosService.ingresos()[0]?.id;
        const visible = this.ingresosService.ingresos().find((i) => i.id === id);
        if (visible) this.revelarIngreso(visible);
        this.snackBar.open(
          ingreso ? 'Ingreso actualizado' : 'Ingreso añadido',
          'Cerrar',
          { duration: 2500 }
        );
      }
    });
  }

  private revelarIngreso(ingreso: Ingreso): void {
    if (!this.filtroAnio.matchesDate(ingreso.fecha)) {
      const year = Number(ingreso.fecha.slice(0, 4));
      if (Number.isFinite(year)) this.filtroAnio.setYear(year);
    }
    const mes = this.mesFiltro();
    if (mes && yearMonthKey(ingreso.fecha) !== mes) {
      this.mesFiltro.set(yearMonthKey(ingreso.fecha));
    }
  }
}
