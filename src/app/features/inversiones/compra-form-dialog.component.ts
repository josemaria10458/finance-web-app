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
import { OperacionBolsa } from '../../core/models';
import { InversionesService } from '../../core/services/inversiones.service';
import { todayIso } from '../../core/utils/date.utils';

export interface CompraFormDialogData {
  operacion?: OperacionBolsa;
}

@Component({
  selector: 'app-compra-form-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>
      {{ data.operacion ? 'Editar compra' : 'Nueva compra' }}
    </h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form" (ngSubmit)="guardar()">
        <label class="field">
          <span>Empresa / ETF</span>
          <input type="text" formControlName="empresa" maxlength="80" />
        </label>

        <label class="field">
          <span>Fecha operación</span>
          <input type="date" formControlName="fechaOperacion" />
        </label>

        <div class="grid-2">
          <label class="field">
            <span>Inversión (€)</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              inputmode="decimal"
              formControlName="inversion"
            />
          </label>
          <label class="field">
            <span>Comisión (€)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              inputmode="decimal"
              formControlName="comision"
            />
          </label>
        </div>

        <div class="grid-2">
          <label class="field">
            <span>Precio / acción (€)</span>
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              inputmode="decimal"
              formControlName="precioCompraAccion"
            />
          </label>
          <label class="field">
            <span>Nº acciones</span>
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              inputmode="decimal"
              formControlName="numeroAcciones"
            />
          </label>
        </div>
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
      min-width: min(100%, 380px);
      padding: 0.35rem 0 0.5rem;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
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
    .field input {
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
    .field input:focus {
      outline: 2px solid rgba(31, 111, 102, 0.3);
      border-color: var(--accent);
    }
    @media (max-width: 480px) {
      .grid-2 {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class CompraFormDialogComponent {
  readonly data = inject<CompraFormDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CompraFormDialogComponent>);
  private readonly fb = inject(FormBuilder);
  private readonly inversionesService = inject(InversionesService);

  readonly form = this.fb.nonNullable.group({
    empresa: [
      this.data.operacion?.empresa ?? '',
      [Validators.required, Validators.maxLength(80)],
    ],
    fechaOperacion: [
      this.data.operacion?.fechaOperacion ?? todayIso(),
      Validators.required,
    ],
    inversion: [
      this.data.operacion?.inversion ?? (null as number | null),
      [Validators.required, Validators.min(0.01)],
    ],
    comision: [
      this.data.operacion?.comision ?? 0,
      [Validators.required, Validators.min(0)],
    ],
    precioCompraAccion: [
      this.data.operacion?.precioCompraAccion ?? (null as number | null),
      [Validators.required, Validators.min(0.0001)],
    ],
    numeroAcciones: [
      this.data.operacion?.numeroAcciones ?? (null as number | null),
      [Validators.required, Validators.min(0.0001)],
    ],
  });

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const input = {
      empresa: raw.empresa.trim(),
      fechaOperacion: raw.fechaOperacion,
      inversion: Number(raw.inversion),
      comision: Number(raw.comision),
      precioCompraAccion: Number(raw.precioCompraAccion),
      numeroAcciones: Number(raw.numeroAcciones),
    };

    if (this.data.operacion) {
      this.inversionesService.updateCompra(this.data.operacion.id, input);
    } else {
      this.inversionesService.addCompra(input);
    }
    this.dialogRef.close(true);
  }
}
