import { Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  ImportResult,
  ImportService,
} from '../../core/services/import.service';

@Component({
  selector: 'app-importar',
  standalone: true,
  imports: [MatIconModule, MatSnackBarModule],
  templateUrl: './importar.component.html',
  styleUrl: './importar.component.css',
})
export class ImportarComponent {
  private readonly importService = inject(ImportService);
  private readonly snackBar = inject(MatSnackBar);

  readonly busy = signal(false);
  readonly dragOver = signal(false);
  readonly result = signal<ImportResult | null>(null);
  readonly error = signal<string | null>(null);
  readonly fileName = signal<string | null>(null);

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      void this.process(file);
    }
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void this.process(file);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  onDragLeave(): void {
    this.dragOver.set(false);
  }

  private async process(file: File): Promise<void> {
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
    this.fileName.set(file.name);

    try {
      const res = await this.importService.importFile(file);
      this.result.set(res);
      const total = res.gastos + res.ingresos + res.operaciones;
      this.snackBar.open(
        total
          ? `Datos sobrescritos: ${total} registros`
          : 'No se importó ningún registro válido',
        'Cerrar',
        { duration: 3500 }
      );
    } catch (e) {
      console.error(e);
      this.error.set('No se pudo leer el archivo. Revisa el formato.');
    } finally {
      this.busy.set(false);
    }
  }
}
