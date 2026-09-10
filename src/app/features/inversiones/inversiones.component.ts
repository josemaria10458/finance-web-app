import { CurrencyPipe, DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { OperacionBolsa, costeOperacion } from '../../core/models';
import { CategoriasConfigService } from '../../core/services/categorias-config.service';
import { FiltroAnioService } from '../../core/services/filtro-anio.service';
import { InversionesService } from '../../core/services/inversiones.service';
import { buildMonthOptions, formatMesLabel } from '../../core/utils/date.utils';
import { impuestosAPagarDelAnio } from '../../core/utils/irpf-ahorro.utils';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { CompraFormDialogComponent } from './compra-form-dialog.component';
import { VentaFormDialogComponent } from './venta-form-dialog.component';

type Vista = 'historico' | 'ventas' | 'meses';
type OrdenCampo = 'fecha' | 'importe';
type OrdenDir = 'asc' | 'desc';

@Component({
  selector: 'app-inversiones',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    PercentPipe,
    FormsModule,
    MatDialogModule,
    MatIconModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './inversiones.component.html',
  styleUrl: './inversiones.component.css',
})
export class InversionesComponent {
  private readonly inversionesService = inject(InversionesService);
  private readonly categoriasConfig = inject(CategoriasConfigService);
  private readonly filtroAnio = inject(FiltroAnioService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly divisa = this.categoriasConfig.divisa;

  readonly vista = signal<Vista>('meses');
  readonly ordenCampo = signal<OrdenCampo>('fecha');
  readonly ordenDir = signal<OrdenDir>('desc');
  readonly mesFiltro = signal<string>(this.inversionesService.mesInicial());

  readonly capitalAbierto = this.inversionesService.capitalInvertidoAbierto;
  readonly resultadoVentas = this.inversionesService.resultadoNetoVentas;
  readonly rentabilidadAnual = this.inversionesService.rentabilidadAnual;
  readonly impuestosAnio = computed(() => this.filtroAnio.referenceYear());
  readonly impuestosAPagar = computed(() =>
    impuestosAPagarDelAnio(
      this.inversionesService.operaciones(),
      this.impuestosAnio()
    )
  );

  readonly totalOps = computed(() => {
    this.filtroAnio.year();
    return this.opsDelAnio().length;
  });

  readonly resumenMensual = computed(() => {
    this.filtroAnio.year();
    return this.inversionesService
      .resumenMensual()
      .filter((r) => this.filtroAnio.matchesYearMonth(r.mesKey));
  });

  readonly mesesDisponibles = computed(() => {
    this.inversionesService.operaciones();
    const months = buildMonthOptions(this.inversionesService.mesesConDatos());
    const year = this.filtroAnio.year();
    if (year == null) return months;
    return months.filter((m) => m.startsWith(`${year}-`));
  });

  readonly resumenMesActual = computed(() => {
    this.inversionesService.operaciones();
    return this.inversionesService.resumenMes(this.mesFiltro());
  });

  readonly movimientosMes = computed(() => {
    this.inversionesService.operaciones();
    return this.inversionesService.movimientosMes(this.mesFiltro());
  });

  readonly historico = computed(() =>
    this.sortOps(this.opsDelAnio().filter((o) => !o.consolidadaEnId))
  );

  readonly ventas = computed(() =>
    this.sortOps(
      this.opsDelAnio().filter(
        (o) =>
          !o.consolidadaEnId &&
          (o.esVenta === true || o.precioVentaAccion != null)
      )
    )
  );

  constructor() {
    effect(() => {
      const year = this.filtroAnio.year();
      const mes = this.mesFiltro();
      const disponibles = this.mesesDisponibles();
      if (year != null && mes && !mes.startsWith(`${year}-`)) {
        this.mesFiltro.set(disponibles[0] ?? `${year}-01`);
      }
    });
  }

  private opsDelAnio(): OperacionBolsa[] {
    return this.inversionesService
      .operaciones()
      .filter((o) =>
        this.filtroAnio.matchesDate(o.fechaVenta ?? o.fechaOperacion)
      );
  }

  coste(op: OperacionBolsa): number {
    return costeOperacion(op);
  }

  fechaRef(op: OperacionBolsa): string {
    return op.fechaVenta ?? op.fechaOperacion;
  }

  labelMes(ym: string): string {
    return formatMesLabel(ym);
  }

  seleccionarMes(ym: string): void {
    this.mesFiltro.set(ym);
    this.vista.set('meses');
  }

  setVista(v: Vista): void {
    this.vista.set(v);
  }

  ordenarPor(campo: OrdenCampo): void {
    if (this.ordenCampo() === campo) {
      this.ordenDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.ordenCampo.set(campo);
      this.ordenDir.set('desc');
    }
  }

  private sortOps(list: OperacionBolsa[]): OperacionBolsa[] {
    const campo = this.ordenCampo();
    const dir = this.ordenDir() === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      if (campo === 'fecha') {
        return this.fechaRef(a).localeCompare(this.fechaRef(b)) * dir;
      }
      const ia = a.esVenta ? a.resultadoNeto : this.coste(a);
      const ib = b.esVenta ? b.resultadoNeto : this.coste(b);
      return (ia - ib) * dir;
    });
  }

  abrirCompra(op?: OperacionBolsa): void {
    const ref = this.dialog.open(CompraFormDialogComponent, {
      width: '480px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
      data: { operacion: op },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.snackBar.open(
          op ? 'Compra actualizada' : 'Compra registrada',
          'Cerrar',
          { duration: 2500 }
        );
      }
    });
  }

  abrirVenta(op?: OperacionBolsa): void {
    if (op && (op.esVenta || op.precioVentaAccion != null || op.consolidadaEnId)) {
      this.snackBar.open('Esta posición ya está cerrada', 'Cerrar', {
        duration: 2500,
      });
      return;
    }
    const ref = this.dialog.open(VentaFormDialogComponent, {
      width: '520px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
      data: op ? { operacion: op } : {},
    });
    ref.afterClosed().subscribe((saved) => {
      if (!saved) return;
      this.vista.set('ventas');
      this.snackBar.open('Venta registrada', 'Cerrar', { duration: 2500 });
    });
  }

  puedeVender(op: OperacionBolsa): boolean {
    return !op.esVenta && op.precioVentaAccion == null && !op.consolidadaEnId;
  }

  confirmarBorrar(op: OperacionBolsa): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '380px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
      data: {
        titulo: 'Eliminar operación',
        mensaje: `¿Eliminar la operación de «${op.empresa}»?`,
      },
    });
    ref.afterClosed().subscribe((ok) => {
      if (!ok) return;
      this.inversionesService.remove(op.id);
      this.snackBar.open('Operación eliminada', 'Cerrar', { duration: 2500 });
    });
  }

  confirmarBorrarTodas(): void {
    const n = this.totalOps();
    if (!n) {
      this.snackBar.open('No hay operaciones que borrar', 'Cerrar', {
        duration: 2500,
      });
      return;
    }
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
      data: {
        titulo: 'Borrar todas las inversiones',
        mensaje: `Se eliminarán ${n} operaciones. Luego podrás volver a importar el Excel.`,
        confirmarLabel: 'Borrar todas',
      },
    });
    ref.afterClosed().subscribe((ok) => {
      if (!ok) return;
      this.inversionesService.clearAll();
      this.snackBar.open('Inversiones eliminadas', 'Cerrar', { duration: 2500 });
    });
  }
}
