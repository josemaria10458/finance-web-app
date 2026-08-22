import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  CATEGORIAS_INGRESO,
  CategoriaIngreso,
  Ingreso,
} from '../../core/models';
import { IngresosService } from '../../core/services/ingresos.service';
import {
  formatMesLabel,
  buildMonthOptions,
} from '../../core/utils/date.utils';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  IngresoFormDialogComponent,
  IngresoFormDialogData,
} from './ingreso-form-dialog.component';

const CATEGORY_META: Record<
  CategoriaIngreso,
  { tone: string; icon: string }
> = {
  Nómina: { tone: '#1f6f66', icon: 'account_balance' },
  'Retribución flexible': { tone: '#3b6ea5', icon: 'card_giftcard' },
  Otros: { tone: '#c47a3a', icon: 'payments' },
  'Venta Inversiones': { tone: '#2f9b8f', icon: 'trending_up' },
};

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
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly categorias = CATEGORIAS_INGRESO;

  readonly mesFiltro = signal<string | null>(null);
  readonly categoriaFiltro = signal<CategoriaIngreso | 'todas'>('todas');

  readonly mesesDisponibles = computed(() =>
    buildMonthOptions(this.ingresosService.availableYearMonths())
  );

  readonly ingresosFiltrados = computed(() => {
    this.ingresosService.ingresos();
    let list = this.ingresosService.byYearMonth(this.mesFiltro());
    const cat = this.categoriaFiltro();
    if (cat !== 'todas') {
      list = list.filter((i) => i.categoria === cat);
    }
    return [...list].sort((a, b) => b.fecha.localeCompare(a.fecha));
  });

  readonly totalMes = computed(() => {
    this.ingresosService.ingresos();
    return this.ingresosService
      .byYearMonth(this.mesFiltro())
      .reduce((s, i) => s + i.importe, 0);
  });

  readonly totalFiltrado = computed(() =>
    this.ingresosFiltrados().reduce((s, i) => s + i.importe, 0)
  );

  readonly cartasCategoria = computed(() => {
    this.ingresosService.ingresos();
    const map = this.ingresosService.totalsByCategoria(this.mesFiltro());
    const totalMes = this.totalMes();
    return CATEGORIAS_INGRESO.map((categoria) => {
      const total = map[categoria] ?? 0;
      const meta = CATEGORY_META[categoria];
      return {
        categoria,
        total,
        pct: totalMes > 0 ? (total / totalMes) * 100 : 0,
        tone: meta.tone,
        icon: meta.icon,
      };
    }).sort((a, b) => b.total - a.total);
  });

  tone(categoria: string): string {
    return CATEGORY_META[categoria as CategoriaIngreso]?.tone ?? '#1f6f66';
  }

  icon(categoria: string): string {
    return CATEGORY_META[categoria as CategoriaIngreso]?.icon ?? 'payments';
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
        this.snackBar.open(
          ingreso ? 'Ingreso actualizado' : 'Ingreso añadido',
          'Cerrar',
          { duration: 2500 }
        );
      }
    });
  }
}
