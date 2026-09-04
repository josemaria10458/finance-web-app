import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
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
import { OperacionBolsa, costeOperacion } from '../../core/models';
import { InversionesService } from '../../core/services/inversiones.service';
import { todayIso } from '../../core/utils/date.utils';

export interface VentaFormDialogData {
  operacion: OperacionBolsa;
}

@Component({
  selector: 'app-venta-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    CurrencyPipe,
    DecimalPipe,
  ],
  template: `
    <h2 mat-dialog-title>Registrar venta</h2>
    <mat-dialog-content>
      <p class="context">
        <strong>{{ data.operacion.empresa }}</strong>
        · {{ data.operacion.numeroAcciones }} acciones · coste
        {{ coste | currency: 'EUR' : 'symbol' : '1.2-2' : 'es' }}
      </p>

      <form [formGroup]="form" class="form" (ngSubmit)="guardar()">
        <label class="field">
          <span>Fecha venta</span>
          <input type="date" formControlName="fechaVenta" />
        </label>

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

        <label class="field">
          <span>Provisión impuestos (€)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            inputmode="decimal"
            formControlName="provisionImpuestos"
          />
        </label>

        @if (preview(); as p) {
          <div
            class="preview"
            [class.gain]="p.resultadoNeto >= 0"
            [class.loss]="p.resultadoNeto < 0"
          >
            <div>
              <span>Resultado neto</span>
              <strong>{{ p.resultadoNeto | currency: 'EUR' : 'symbol' : '1.2-2' : 'es' }}</strong>
            </div>
            <div>
              <span>Rentabilidad</span>
              <strong>{{ p.rentabilidadPct | number: '1.2-2' }} %</strong>
            </div>
          </div>
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
        Confirmar venta
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .context {
      margin: 0 0 0.75rem;
      color: var(--muted);
      font-size: 0.9rem;
    }
    .context strong {
      color: var(--ink);
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      min-width: 0;
      width: 100%;
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
    .preview {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
      padding: 0.9rem 1rem;
      border-radius: 12px;
      background: rgba(31, 111, 102, 0.08);
      border: 1px solid var(--line);
    }
    .preview.loss {
      background: rgba(181, 74, 58, 0.08);
    }
    .preview span {
      display: block;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
      margin-bottom: 0.2rem;
    }
    .preview strong {
      font-variant-numeric: tabular-nums;
      font-size: 1.05rem;
      color: var(--ink);
    }
    .preview.gain strong {
      color: var(--accent);
    }
    .preview.loss strong {
      color: var(--danger);
    }
  `,
})
export class VentaFormDialogComponent {
  readonly data = inject<VentaFormDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<VentaFormDialogComponent>);
  private readonly fb = inject(FormBuilder);
  private readonly inversionesService = inject(InversionesService);

  readonly coste = costeOperacion(this.data.operacion);

  readonly form = this.fb.nonNullable.group({
    fechaVenta: [todayIso(), Validators.required],
    precioVentaAccion: [
      null as number | null,
      [Validators.required, Validators.min(0.0001)],
    ],
    provisionImpuestos: [0, [Validators.required, Validators.min(0)]],
  });

  private readonly formTick = signal(0);

  readonly preview = computed(() => {
    this.formTick();
    const precio = Number(this.form.controls.precioVentaAccion.value);
    const provision = Number(this.form.controls.provisionImpuestos.value) || 0;
    if (!precio || precio <= 0) {
      return null;
    }
    const bruto = precio * this.data.operacion.numeroAcciones;
    const resultadoNeto = bruto - this.coste - provision;
    const rentabilidadPct =
      this.coste > 0 ? (resultadoNeto / this.coste) * 100 : 0;
    return { resultadoNeto, rentabilidadPct };
  });

  constructor() {
    this.form.valueChanges.subscribe(() =>
      this.formTick.update((n) => n + 1)
    );
  }

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.inversionesService.registrarVenta(
      this.data.operacion.id,
      Number(raw.precioVentaAccion),
      Number(raw.provisionImpuestos) || 0,
      raw.fechaVenta
    );
    this.dialogRef.close(true);
  }
}
