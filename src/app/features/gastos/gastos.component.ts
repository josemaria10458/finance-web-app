import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  CATEGORIAS_GASTO,
  CategoriaGasto,
  Gasto,
} from '../../core/models';
import { GastosService } from '../../core/services/gastos.service';
import {
  formatMesLabel,
  buildMonthOptions,
} from '../../core/utils/date.utils';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  GastoFormDialogComponent,
  GastoFormDialogData,
} from './gasto-form-dialog.component';

const CATEGORY_META: Record<
  CategoriaGasto,
  { tone: string; icon: string }
> = {
  Ocio: { tone: '#2f9b8f', icon: 'sports_tennis' },
  Viajes: { tone: '#3b6ea5', icon: 'flight' },
  Comida: { tone: '#c47a3a', icon: 'restaurant' },
  Bebida: { tone: '#9a6b4f', icon: 'local_cafe' },
  Transporte: { tone: '#4d6b57', icon: 'directions_car' },
  'Gastos propios': { tone: '#b54a3a', icon: 'person' },
};

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
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly categorias = CATEGORIAS_GASTO;

  readonly mesFiltro = signal<string | null>(null);
  readonly categoriaFiltro = signal<CategoriaGasto | 'todas'>('todas');

  readonly mesesDisponibles = computed(() =>
    buildMonthOptions(this.gastosService.availableYearMonths())
  );

  readonly gastosFiltrados = computed(() => {
    this.gastosService.gastos();
    let list = this.gastosService.byYearMonth(this.mesFiltro());
    const cat = this.categoriaFiltro();
    if (cat !== 'todas') {
      list = list.filter((g) => g.categoria === cat);
    }
    return [...list].sort((a, b) => b.fecha.localeCompare(a.fecha));
  });

  readonly totalMes = computed(() => {
    this.gastosService.gastos();
    return this.gastosService
      .byYearMonth(this.mesFiltro())
      .reduce((s, g) => s + g.importe, 0);
  });

  readonly totalFiltrado = computed(() =>
    this.gastosFiltrados().reduce((s, g) => s + g.importe, 0)
  );

  /** Cartas de gasto del mes por categoría (todas las categorías). */
  readonly cartasCategoria = computed(() => {
    this.gastosService.gastos();
    const map = this.gastosService.totalsByCategoria(this.mesFiltro());
    const totalMes = this.totalMes();
    return CATEGORIAS_GASTO.map((categoria) => {
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
    return CATEGORY_META[categoria as CategoriaGasto]?.tone ?? '#1f6f66';
  }

  icon(categoria: string): string {
    return CATEGORY_META[categoria as CategoriaGasto]?.icon ?? 'payments';
  }

  labelMes(ym: string): string {
    return formatMesLabel(ym);
  }

  seleccionarCategoria(cat: CategoriaGasto): void {
    this.categoriaFiltro.update((actual) =>
      actual === cat ? 'todas' : cat
    );
  }

  abrirNuevo(): void {
    this.openForm();
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
    const data: GastoFormDialogData = { gasto };
    const ref = this.dialog.open(GastoFormDialogComponent, {
      width: '440px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
      data,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.snackBar.open(
          gasto ? 'Gasto actualizado' : 'Gasto añadido',
          'Cerrar',
          { duration: 2500 }
        );
      }
    });
  }
}
