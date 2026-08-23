import { CurrencyPipe, DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { OperacionBolsa, costeOperacion } from '../../core/models';
import { InversionesService } from '../../core/services/inversiones.service';
import { buildMonthOptions, formatMesLabel } from '../../core/utils/date.utils';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { CompraFormDialogComponent } from './compra-form-dialog.component';

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
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly vista = signal<Vista>('meses');
  readonly ordenCampo = signal<OrdenCampo>('fecha');
  readonly ordenDir = signal<OrdenDir>('desc');
  readonly mesFiltro = signal<string>(
    this.inversionesService.mesInicial()
  );

  readonly capitalAbierto = this.inversionesService.capitalInvertidoAbierto;
  readonly resultadoVentas = this.inversionesService.resultadoNetoVentas;
  readonly rentabilidadAnual = this.inversionesService.rentabilidadAnual;
  readonly totalOps = computed(() => this.inversionesService.operaciones().length);

  readonly resumenMensual = this.inversionesService.resumenMensual;

  readonly mesesDisponibles = computed(() => {
    this.inversionesService.operaciones();
    return buildMonthOptions(this.inversionesService.mesesConDatos());
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
    this.sortOps([...this.inversionesService.operaciones()])
  );

  readonly ventas = computed(() =>
    this.sortOps([...this.inversionesService.ventas()])
  );

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
