import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  GastoInput,
  IngresoInput,
  OperacionBolsaInput,
} from '../../core/models';
import {
  ImportPreview,
  ImportResult,
  ImportService,
} from '../../core/services/import.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  GastoFormDialogComponent,
  GastoFormDialogData,
} from '../gastos/gasto-form-dialog.component';
import {
  IngresoFormDialogComponent,
  IngresoFormDialogData,
} from '../ingresos/ingreso-form-dialog.component';
import { OperacionPreviewDialogComponent } from './operacion-preview-dialog.component';

@Component({
  selector: 'app-importar',
  standalone: true,
  imports: [
    MatIconModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
    CurrencyPipe,
    DatePipe,
  ],
  templateUrl: './importar.component.html',
  styleUrl: './importar.component.css',
})
export class ImportarComponent {
  private readonly importService = inject(ImportService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly busy = signal(false);
  readonly dragOver = signal(false);
  readonly preview = signal<ImportPreview | null>(null);
  readonly result = signal<ImportResult | null>(null);
  readonly error = signal<string | null>(null);
  readonly fileName = signal<string | null>(null);

  readonly previewTotal = computed(() => {
    const p = this.preview();
    if (!p) return 0;
    return p.gastos.length + p.ingresos.length + p.operaciones.length;
  });

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      void this.analyze(file);
    }
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void this.analyze(file);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  onDragLeave(): void {
    this.dragOver.set(false);
  }

  cancelPreview(): void {
    this.preview.set(null);
    this.fileName.set(null);
    this.result.set(null);
    this.error.set(null);
  }

  async confirmImport(): Promise<void> {
    const p = this.preview();
    if (!p) return;

    this.busy.set(true);
    try {
      const res = this.importService.commitPreview(p);
      this.result.set(res);
      this.preview.set(null);
      const total = res.gastos + res.ingresos + res.operaciones;
      this.snackBar.open(
        total
          ? `Importados ${total} registros`
          : 'No se importó ningún registro válido',
        'Cerrar',
        { duration: 3500 }
      );
    } catch (e) {
      console.error(e);
      this.error.set('No se pudo guardar la importación.');
    } finally {
      this.busy.set(false);
    }
  }

  editarGasto(index: number): void {
    const p = this.preview();
    if (!p) return;
    const draft = p.gastos[index];
    const data: GastoFormDialogData = { draft, previewMode: true };
    const ref = this.dialog.open(GastoFormDialogComponent, {
      width: '440px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
      data,
    });
    ref.afterClosed().subscribe((updated: GastoInput | undefined) => {
      if (!updated) return;
      this.preview.update((prev) => {
        if (!prev) return prev;
        const gastos = [...prev.gastos];
        gastos[index] = updated;
        return { ...prev, gastos };
      });
    });
  }

  eliminarGasto(index: number): void {
    const p = this.preview();
    if (!p) return;
    const g = p.gastos[index];
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '380px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
      data: {
        titulo: 'Quitar gasto',
        mensaje: `¿Quitar «${g.descripcion}» de la importación?`,
      },
    });
    ref.afterClosed().subscribe((ok) => {
      if (!ok) return;
      this.preview.update((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          gastos: prev.gastos.filter((_, i) => i !== index),
        };
      });
    });
  }

  editarIngreso(index: number): void {
    const p = this.preview();
    if (!p) return;
    const draft = p.ingresos[index];
    const data: IngresoFormDialogData = { draft, previewMode: true };
    const ref = this.dialog.open(IngresoFormDialogComponent, {
      width: '440px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
      data,
    });
    ref.afterClosed().subscribe((updated: IngresoInput | undefined) => {
      if (!updated) return;
      this.preview.update((prev) => {
        if (!prev) return prev;
        const ingresos = [...prev.ingresos];
        ingresos[index] = updated;
        return { ...prev, ingresos };
      });
    });
  }

  eliminarIngreso(index: number): void {
    const p = this.preview();
    if (!p) return;
    const i = p.ingresos[index];
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '380px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
      data: {
        titulo: 'Quitar ingreso',
        mensaje: `¿Quitar «${i.descripcion}» de la importación?`,
      },
    });
    ref.afterClosed().subscribe((ok) => {
      if (!ok) return;
      this.preview.update((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ingresos: prev.ingresos.filter((_, idx) => idx !== index),
        };
      });
    });
  }

  editarOperacion(index: number): void {
    const p = this.preview();
    if (!p) return;
    const draft = p.operaciones[index];
    const ref = this.dialog.open(OperacionPreviewDialogComponent, {
      width: '460px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
      data: { draft },
    });
    ref.afterClosed().subscribe((updated: OperacionBolsaInput | undefined) => {
      if (!updated) return;
      this.preview.update((prev) => {
        if (!prev) return prev;
        const operaciones = [...prev.operaciones];
        operaciones[index] = updated;
        return { ...prev, operaciones };
      });
    });
  }

  eliminarOperacion(index: number): void {
    const p = this.preview();
    if (!p) return;
    const o = p.operaciones[index];
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '380px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
      data: {
        titulo: 'Quitar operación',
        mensaje: `¿Quitar «${o.empresa}» de la importación?`,
      },
    });
    ref.afterClosed().subscribe((ok) => {
      if (!ok) return;
      this.preview.update((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          operaciones: prev.operaciones.filter((_, i) => i !== index),
        };
      });
    });
  }

  private async analyze(file: File): Promise<void> {
    const ok =
      /\.(xlsx|xls|csv)$/i.test(file.name) ||
      file.type.includes('sheet') ||
      file.type.includes('csv');
    if (!ok) {
      this.error.set('Usa un archivo .xlsx, .xls o .csv');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    this.result.set(null);
    this.preview.set(null);
    this.fileName.set(file.name);

    try {
      const res = await this.importService.previewFile(file);
      this.preview.set(res);
      if (
        !res.gastos.length &&
        !res.ingresos.length &&
        !res.operaciones.length
      ) {
        this.error.set('No se encontraron transacciones válidas en el archivo.');
      }
    } catch (e) {
      console.error(e);
      this.error.set('No se pudo leer el archivo. Revisa el formato.');
    } finally {
      this.busy.set(false);
    }
  }
}
