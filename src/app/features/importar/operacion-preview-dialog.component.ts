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
import { OperacionBolsaInput } from '../../core/models';
import { todayIso } from '../../core/utils/date.utils';

export interface OperacionPreviewDialogData {
  draft: OperacionBolsaInput;
}

@Component({
  selector: 'app-operacion-preview-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Editar operación</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form" (ngSubmit)="guardar()">
        <label class="field">
          <span>Empresa / ETF</span>
          <input type="text" formControlName="empresa" maxlength="80" />
        </label>

        <label class="field">
          <span>Tipo</span>
          <select formControlName="tipo">
            <option value="compra">Compra</option>
            <option value="venta">Venta</option>
          </select>
        </label>

        <label class="field">
          <span>Fecha</span>
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

        @if (form.controls.tipo.value === 'venta') {
          <label class="field">
            <span>Precio venta / acción (€)</span>
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              inputmode="decimal"
              formControlName="precioVentaAccion"
            />
          </label>
        }
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
      min-width: 0;
      width: 100%;
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
      font-weight: 650;
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
export class OperacionPreviewDialogComponent {
  readonly data = inject<OperacionPreviewDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject(MatDialogRef<OperacionPreviewDialogComponent>);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    empresa: [this.data.draft.empresa, Validators.required],
    tipo: [this.data.draft.esVenta ? 'venta' : 'compra', Validators.required],
    fechaOperacion: [
      this.data.draft.fechaOperacion ?? todayIso(),
      Validators.required,
    ],
    inversion: [
      this.data.draft.inversion,
      [Validators.required, Validators.min(0.01)],
    ],
    comision: [this.data.draft.comision ?? 0, [Validators.min(0)]],
    precioCompraAccion: [
      this.data.draft.precioCompraAccion,
      [Validators.required, Validators.min(0.0001)],
    ],
    numeroAcciones: [
      this.data.draft.numeroAcciones,
      [Validators.required, Validators.min(0.0001)],
    ],
    precioVentaAccion: [
      this.data.draft.precioVentaAccion ??
        (null as number | null),
    ],
  });

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const esVenta = raw.tipo === 'venta';
    const result: OperacionBolsaInput = {
      ...this.data.draft,
      empresa: raw.empresa.trim(),
      fechaOperacion: raw.fechaOperacion,
      inversion: Number(raw.inversion),
      comision: Number(raw.comision) || 0,
      precioCompraAccion: Number(raw.precioCompraAccion),
      numeroAcciones: Number(raw.numeroAcciones),
      esVenta,
      fechaVenta: esVenta ? raw.fechaOperacion : undefined,
      precioVentaAccion:
        esVenta && raw.precioVentaAccion != null
          ? Number(raw.precioVentaAccion)
          : esVenta
            ? Number(raw.precioCompraAccion)
            : undefined,
    };
    this.dialogRef.close(result);
  }
}
