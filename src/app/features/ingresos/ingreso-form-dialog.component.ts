import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import {
  CategoriaIngreso,
  Ingreso,
  IngresoInput,
} from '../../core/models';
import { CategoriasConfigService } from '../../core/services/categorias-config.service';
import { IngresosService } from '../../core/services/ingresos.service';
import { todayIso } from '../../core/utils/date.utils';

export interface IngresoFormDialogData {
  ingreso?: Ingreso;
  draft?: IngresoInput;
  previewMode?: boolean;
}

@Component({
  selector: 'app-ingreso-form-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>
      {{
        data.previewMode || data.ingreso
          ? 'Editar ingreso'
          : 'Nuevo ingreso'
      }}
    </h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form" (ngSubmit)="guardar()">
        <label class="field">
          <span>Fecha</span>
          <input type="date" formControlName="fecha" />
        </label>

        <label class="field">
          <span>Importe (€)</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            inputmode="decimal"
            formControlName="importe"
            placeholder="0,00"
          />
        </label>

        <label class="field">
          <span>Descripción</span>
          <input type="text" formControlName="descripcion" maxlength="120" />
        </label>

        <label class="field">
          <span>Categoría</span>
          <select formControlName="categoria">
            @for (c of categorias(); track c) {
              <option [value]="c">{{ c }}</option>
            }
          </select>
        </label>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="form.invalid"
        (click)="guardar()"
      >
        Guardar
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      min-width: min(100%, 340px);
      padding: 0.35rem 0 0.5rem;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .field input,
    .field select {
      appearance: none;
      width: 100%;
      padding: 0.8rem 0.9rem;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--text);
      font-size: 0.98rem;
      font-weight: 500;
      text-transform: none;
      letter-spacing: 0;
      font-family: var(--font-body);
    }
    .field input:focus,
    .field select:focus {
      outline: 2px solid rgba(31, 111, 102, 0.3);
      border-color: var(--accent);
    }
  `,
})
export class IngresoFormDialogComponent {
  readonly data = inject<IngresoFormDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<IngresoFormDialogComponent>);
  private readonly fb = inject(FormBuilder);
  private readonly ingresosService = inject(IngresosService);
  private readonly categoriasConfig = inject(CategoriasConfigService);

  readonly categorias = this.categoriasConfig.categoriasIngreso;

  private readonly initial = this.data.ingreso ?? this.data.draft;

  readonly form = this.fb.nonNullable.group({
    fecha: [this.initial?.fecha ?? todayIso(), Validators.required],
    importe: [
      this.initial?.importe ?? (null as number | null),
      [Validators.required, Validators.min(0.01)],
    ],
    descripcion: [
      this.initial?.descripcion ?? '',
      [Validators.required, Validators.maxLength(120)],
    ],
    categoria: [
      this.initial?.categoria ??
        this.categoriasConfig.categoriasIngreso()[0] ??
        '',
      Validators.required,
    ],
  });

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const input = {
      fecha: raw.fecha,
      importe: Number(raw.importe),
      descripcion: raw.descripcion.trim(),
      categoria: raw.categoria,
    };

    if (this.data.previewMode) {
      this.dialogRef.close(input);
      return;
    }

    if (this.data.ingreso) {
      this.ingresosService.update(this.data.ingreso.id, input);
    } else {
      this.ingresosService.add(input);
    }
    this.dialogRef.close(true);
  }
}
