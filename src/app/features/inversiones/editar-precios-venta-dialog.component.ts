import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { CategoriasConfigService } from '../../core/services/categorias-config.service';

export interface EditarPreciosVentaDialogData {
  operacion: OperacionBolsa;
}

export interface EditarPreciosVentaResult {
  precioCompraAccion: number;
  precioVentaAccion: number;
}

@Component({
  selector: 'app-editar-precios-venta-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    CurrencyPipe,
    DecimalPipe,
  ],
  template: `
    <h2 mat-dialog-title>Editar precios de venta</h2>
    <mat-dialog-content>
      <p class="lead">
        {{ data.operacion.empresa }} ·
        {{ data.operacion.numeroAcciones | number: '1.0-4' }} acc.
      </p>
      <form [formGroup]="form" class="form" (ngSubmit)="guardar()">
        <div class="grid-2">
          <label class="field">
            <span>Precio compra / acción ({{ divisaSymbol() }})</span>
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              inputmode="decimal"
              formControlName="precioCompraAccion"
            />
          </label>
          <label class="field">
            <span>Precio venta / acción ({{ divisaSymbol() }})</span>
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              inputmode="decimal"
              formControlName="precioVentaAccion"
            />
          </label>
        </div>
      </form>

      @if (preview(); as p) {
        <div class="preview">
          <div>
            <span>Resultado neto</span>
            <strong [class.gain]="p.resultadoNeto >= 0" [class.loss]="p.resultadoNeto < 0">
              {{ p.resultadoNeto | currency: divisa() : 'symbol' : '1.2-2' : 'es' }}
            </strong>
          </div>
          <div>
            <span>Rentabilidad</span>
            <strong [class.gain]="p.rentabilidadPct >= 0" [class.loss]="p.rentabilidadPct < 0">
              {{ p.rentabilidadPct | number: '1.2-2' }} %
            </strong>
          </div>
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="form.invalid || !cambiado()"
        (click)="guardar()"
      >
        Guardar
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .lead {
      margin: 0 0 0.75rem;
      color: var(--muted);
      font-size: 0.9rem;
    }
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
      margin-top: 0.5rem;
      padding: 0.75rem 0.85rem;
      border-radius: 12px;
      background: rgba(12, 46, 43, 0.04);
    }
    .preview div {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .preview span {
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .gain {
      color: var(--accent);
    }
    .loss {
      color: var(--danger);
    }
    @media (max-width: 480px) {
      .grid-2 {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class EditarPreciosVentaDialogComponent {
  readonly data = inject<EditarPreciosVentaDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<EditarPreciosVentaDialogComponent, EditarPreciosVentaResult>
  );
  private readonly fb = inject(FormBuilder);
  private readonly categoriasConfig = inject(CategoriasConfigService);

  readonly divisa = this.categoriasConfig.divisa;
  readonly divisaSymbol = this.categoriasConfig.divisaSymbol;

  readonly form = this.fb.nonNullable.group({
    precioCompraAccion: [
      this.data.operacion.precioCompraAccion as number | null,
      [Validators.required, Validators.min(0.0001)],
    ],
    precioVentaAccion: [
      (this.data.operacion.precioVentaAccion ?? null) as number | null,
      [Validators.required, Validators.min(0.0001)],
    ],
  });

  private readonly values = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  readonly cambiado = computed(() => {
    const v = this.values();
    const op = this.data.operacion;
    return (
      Number(v.precioCompraAccion) !== op.precioCompraAccion ||
      Number(v.precioVentaAccion) !== op.precioVentaAccion
    );
  });

  readonly preview = computed(() => {
    const v = this.values();
    const pc = Number(v.precioCompraAccion);
    const pv = Number(v.precioVentaAccion);
    if (!(pc > 0) || !(pv > 0)) return null;
    const op = this.data.operacion;
    const inversion =
      op.precioCompraAccion > 0
        ? op.inversion * (pc / op.precioCompraAccion)
        : pc * op.numeroAcciones;
    const coste = costeOperacion({ inversion, comision: op.comision });
    const resultadoNeto =
      pv * op.numeroAcciones - coste - (op.provisionImpuestos ?? 0);
    const rentabilidadPct = coste > 0 ? (resultadoNeto / coste) * 100 : 0;
    return { resultadoNeto, rentabilidadPct };
  });

  guardar(): void {
    if (this.form.invalid || !this.cambiado()) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.dialogRef.close({
      precioCompraAccion: Number(raw.precioCompraAccion),
      precioVentaAccion: Number(raw.precioVentaAccion),
    });
  }
}
