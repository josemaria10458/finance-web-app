import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
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
  operacion?: OperacionBolsa;
}

const POSICION_NUEVA = '__nueva__';

function normalizaTexto(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

@Component({
  selector: 'app-venta-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
  ],
  template: `
    <h2 mat-dialog-title>Registrar venta</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form" (ngSubmit)="guardar()">
        @if (!fija) {
          <label class="field">
            <span>Buscar</span>
            <input
              type="search"
              [value]="filtroNombre()"
              (input)="onFiltro($event)"
              placeholder="Filtrar por nombre"
              autocomplete="off"
            />
          </label>
          <div class="field">
            <span>Posiciones</span>
            <div class="pos-toolbar">
              <p class="pos-hint">
                Puedes marcar varias: se registran como una sola venta con el
                total.
              </p>
              @if (abiertasFiltradas().length > 1) {
                <button type="button" class="link-btn" (click)="marcarTodas()">
                  Todas
                </button>
              }
            </div>
            <div class="pos-list" role="group" aria-label="Posiciones a vender">
              @for (op of abiertasFiltradas(); track op.id) {
                <label class="pos-item" [class.on]="estaSeleccionada(op.id)">
                  <input
                    type="checkbox"
                    [checked]="estaSeleccionada(op.id)"
                    (change)="togglePosicion(op.id)"
                  />
                  <span class="pos-copy">
                    <strong>{{ op.empresa }}</strong>
                    <small>
                      {{ op.numeroAcciones | number: '1.0-4' }} acc. ·
                      {{ op.fechaOperacion | date: 'dd/MM/yyyy' }} ·
                      {{ costeDe(op) | currency: 'EUR' : 'symbol' : '1.2-2' : 'es' }}
                    </small>
                  </span>
                </label>
              }
              @if (!abiertasFiltradas().length && abiertas().length) {
                <p class="pos-empty">Ninguna posición coincide con la búsqueda.</p>
              }
              <label class="pos-item" [class.on]="esIndependiente()">
                <input
                  type="checkbox"
                  [checked]="esIndependiente()"
                  (change)="togglePosicion(posicionNueva)"
                />
                <span class="pos-copy">
                  <strong>Sin compra registrada</strong>
                  <small>Introduce los datos de la venta a mano</small>
                </span>
              </label>
            </div>
          </div>
        }

        @if (seleccionadas().length === 1 && !esIndependiente()) {
          <p class="context">
            <strong>{{ seleccionadas()[0].empresa }}</strong>
            · {{ seleccionadas()[0].numeroAcciones | number: '1.0-4' }} acciones ·
            coste
            {{
              costeDe(seleccionadas()[0])
                | currency: 'EUR' : 'symbol' : '1.2-2' : 'es'
            }}
          </p>
        }

        @if (seleccionadas().length > 1) {
          <p class="context">
            <strong>1 venta unificada</strong>
            · {{ seleccionadas().length }} posiciones ·
            {{ totalAcciones() | number: '1.0-4' }} acciones · total
            {{ totalVenta() | currency: 'EUR' : 'symbol' : '1.2-2' : 'es' }}
          </p>
          @if (empresasDistintas()) {
            <p class="warn">
              Hay empresas distintas: el mismo precio por acción se aplicará a
              todas.
            </p>
          }
        }

        @if (esIndependiente()) {
          <label class="field">
            <span>Empresa / ETF</span>
            <input type="text" formControlName="empresa" maxlength="80" />
          </label>

          <div class="grid-2">
            <label class="field">
              <span>Fecha compra</span>
              <input type="date" formControlName="fechaOperacion" />
            </label>
            <label class="field">
              <span>Fecha venta</span>
              <input type="date" formControlName="fechaVenta" />
            </label>
          </div>

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
              <span>Precio compra / acción (€)</span>
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
        } @else {
          <label class="field">
            <span>Fecha venta</span>
            <input type="date" formControlName="fechaVenta" />
          </label>
        }

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
            @if (seleccionadas().length > 1) {
              <div class="preview-total">
                <span>Total venta</span>
                <strong>{{ totalVenta() | currency: 'EUR' : 'symbol' : '1.2-2' : 'es' }}</strong>
              </div>
            }
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
        [disabled]="form.invalid || !haySeleccion()"
        (click)="guardar()"
      >
        {{
          seleccionadas().length > 1 ? 'Confirmar venta unificada' : 'Confirmar venta'
        }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .context {
      margin: 0;
      color: var(--muted);
      font-size: 0.9rem;
    }
    .context strong {
      color: var(--ink);
    }
    .warn {
      margin: 0;
      color: #8a5a12;
      font-size: 0.82rem;
      line-height: 1.4;
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      min-width: 0;
      width: 100%;
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
    .pos-toolbar {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .pos-hint {
      margin: 0;
      font-size: 0.78rem;
      font-weight: 500;
      letter-spacing: 0;
      text-transform: none;
      color: var(--muted);
      line-height: 1.35;
    }
    .link-btn {
      border: 0;
      background: transparent;
      color: var(--accent);
      font-size: 0.78rem;
      font-weight: 700;
      cursor: pointer;
      font-family: var(--font-body);
      padding: 0;
      white-space: nowrap;
    }
    .pos-list {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      max-height: 220px;
      overflow: auto;
      padding: 0.35rem;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #fff;
    }
    .pos-item {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 0.65rem;
      align-items: center;
      padding: 0.55rem 0.6rem;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 500;
      text-transform: none;
      letter-spacing: 0;
      color: var(--ink);
    }
    .pos-item:hover,
    .pos-item.on {
      background: rgba(31, 111, 102, 0.08);
    }
    .pos-item input {
      width: 18px;
      height: 18px;
      margin: 0;
      accent-color: var(--accent);
      flex-shrink: 0;
    }
    .pos-copy {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.12rem;
    }
    .pos-copy strong {
      font-size: 0.92rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pos-copy small {
      color: var(--muted);
      font-size: 0.78rem;
      font-weight: 500;
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
    .pos-empty {
      margin: 0;
      padding: 0.65rem 0.6rem;
      font-size: 0.82rem;
      font-weight: 500;
      letter-spacing: 0;
      text-transform: none;
      color: var(--muted);
    }
    .preview-total {
      grid-column: 1 / -1;
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
    @media (max-width: 480px) {
      .grid-2 {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class VentaFormDialogComponent {
  readonly data: VentaFormDialogData =
    inject<VentaFormDialogData>(MAT_DIALOG_DATA, { optional: true }) ?? {};
  private readonly dialogRef = inject(MatDialogRef<VentaFormDialogComponent>);
  private readonly fb = inject(FormBuilder);
  private readonly inversionesService = inject(InversionesService);

  readonly posicionNueva = POSICION_NUEVA;
  readonly fija = Boolean(this.data.operacion);
  readonly abiertas = this.inversionesService.abiertas;

  readonly abiertasOrdenadas = computed(() =>
    [...this.abiertas()].sort(
      (a, b) =>
        a.empresa.localeCompare(b.empresa, 'es') ||
        a.fechaOperacion.localeCompare(b.fechaOperacion)
    )
  );

  readonly filtroNombre = signal('');

  readonly abiertasFiltradas = computed(() => {
    const q = normalizaTexto(this.filtroNombre());
    const list = this.abiertasOrdenadas();
    if (!q) return list;
    return list.filter((o) => normalizaTexto(o.empresa).includes(q));
  });

  private readonly inicialIds: string[] = this.data.operacion?.id
    ? [this.data.operacion.id]
    : this.inversionesService.abiertas()[0]
      ? [this.inversionesService.abiertas()[0].id]
      : [POSICION_NUEVA];

  readonly form = this.fb.nonNullable.group({
    posicionIds: [this.inicialIds],
    empresa: ['', [Validators.maxLength(80)]],
    fechaOperacion: [todayIso(), Validators.required],
    fechaVenta: [todayIso(), Validators.required],
    inversion: [null as number | null],
    comision: [0],
    precioCompraAccion: [null as number | null],
    numeroAcciones: [null as number | null],
    precioVentaAccion: [
      null as number | null,
      [Validators.required, Validators.min(0.0001)],
    ],
    provisionImpuestos: [0, [Validators.required, Validators.min(0)]],
  });

  private readonly formTick = signal(0);

  readonly idsSeleccionados = computed(() => {
    this.formTick();
    return this.form.controls.posicionIds.value;
  });

  readonly esIndependiente = computed(() => {
    const ids = this.idsSeleccionados();
    return ids.length === 1 && ids[0] === POSICION_NUEVA;
  });

  readonly seleccionadas = computed((): OperacionBolsa[] => {
    const ids = new Set(
      this.idsSeleccionados().filter((id) => id !== POSICION_NUEVA)
    );
    if (this.fija && this.data.operacion) {
      return [this.data.operacion];
    }
    return this.abiertas().filter((o) => ids.has(o.id));
  });

  readonly totalAcciones = computed(() =>
    this.seleccionadas().reduce((s, o) => s + o.numeroAcciones, 0)
  );

  readonly totalCoste = computed(() =>
    this.seleccionadas().reduce((s, o) => s + costeOperacion(o), 0)
  );

  readonly totalVenta = computed(() => {
    this.formTick();
    const precio = Number(this.form.controls.precioVentaAccion.value) || 0;
    return precio * this.totalAcciones();
  });

  readonly empresasDistintas = computed(() => {
    const names = new Set(this.seleccionadas().map((o) => o.empresa));
    return names.size > 1;
  });

  readonly preview = computed(() => {
    this.formTick();
    const precio = Number(this.form.controls.precioVentaAccion.value);
    const provision = Number(this.form.controls.provisionImpuestos.value) || 0;
    if (!precio || precio <= 0) return null;

    const ops = this.seleccionadas();
    let coste: number;
    let shares: number;
    if (ops.length) {
      coste = this.totalCoste();
      shares = this.totalAcciones();
    } else if (this.esIndependiente()) {
      const inversion = Number(this.form.controls.inversion.value);
      const comision = Number(this.form.controls.comision.value) || 0;
      shares = Number(this.form.controls.numeroAcciones.value);
      if (!inversion || inversion <= 0 || !shares || shares <= 0) return null;
      coste = costeOperacion({ inversion, comision });
    } else {
      return null;
    }

    const resultadoNeto = precio * shares - coste - provision;
    const rentabilidadPct = coste > 0 ? (resultadoNeto / coste) * 100 : 0;
    return { resultadoNeto, rentabilidadPct };
  });

  constructor() {
    this.syncIndependentValidators(this.esIndependiente());
    this.form.valueChanges.subscribe(() => {
      this.formTick.update((n) => n + 1);
    });
    this.form.controls.posicionIds.valueChanges.subscribe((ids) => {
      this.syncIndependentValidators(
        ids.length === 1 && ids[0] === POSICION_NUEVA
      );
    });
  }

  costeDe(op: OperacionBolsa): number {
    return costeOperacion(op);
  }

  estaSeleccionada(id: string): boolean {
    return this.idsSeleccionados().includes(id);
  }

  haySeleccion(): boolean {
    return this.esIndependiente() || this.seleccionadas().length > 0;
  }

  togglePosicion(id: string): void {
    const current = this.form.controls.posicionIds.value;
    if (id === POSICION_NUEVA) {
      this.form.controls.posicionIds.setValue(
        current.includes(POSICION_NUEVA) ? [] : [POSICION_NUEVA]
      );
      return;
    }
    const sinNueva = current.filter((x) => x !== POSICION_NUEVA);
    const next = sinNueva.includes(id)
      ? sinNueva.filter((x) => x !== id)
      : [...sinNueva, id];
    this.form.controls.posicionIds.setValue(next);
  }

  onFiltro(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.filtroNombre.set(value);
  }

  marcarTodas(): void {
    this.form.controls.posicionIds.setValue(
      this.abiertasFiltradas().map((o) => o.id)
    );
  }

  guardar(): void {
    this.syncIndependentValidators(this.esIndependiente());
    if (this.form.invalid || !this.haySeleccion()) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const precio = Number(raw.precioVentaAccion);
    const provision = Number(raw.provisionImpuestos) || 0;
    if (!Number.isFinite(precio) || precio <= 0) return;

    if (this.esIndependiente()) {
      const inversion = Number(raw.inversion);
      const shares = Number(raw.numeroAcciones);
      const precioCompra = Number(raw.precioCompraAccion);
      if (
        !raw.empresa.trim() ||
        !Number.isFinite(inversion) ||
        !Number.isFinite(shares) ||
        !Number.isFinite(precioCompra)
      ) {
        this.form.markAllAsTouched();
        return;
      }
      this.inversionesService.addVentaCerrada({
        empresa: raw.empresa.trim(),
        fechaOperacion: raw.fechaOperacion,
        fechaVenta: raw.fechaVenta,
        inversion,
        comision: Number(raw.comision) || 0,
        precioCompraAccion: precioCompra,
        numeroAcciones: shares,
        precioVentaAccion: precio,
        provisionImpuestos: provision,
      });
      this.dialogRef.close(1);
      return;
    }

    const n = this.inversionesService.registrarVentas(
      this.seleccionadas().map((o) => o.id),
      precio,
      provision,
      raw.fechaVenta
    );
    this.dialogRef.close(n);
  }

  private syncIndependentValidators(independiente: boolean): void {
    const req = independiente
      ? [Validators.required, Validators.min(0.01)]
      : [];
    const reqShare = independiente
      ? [Validators.required, Validators.min(0.0001)]
      : [];
    this.form.controls.empresa.setValidators(
      independiente
        ? [Validators.required, Validators.maxLength(80)]
        : [Validators.maxLength(80)]
    );
    this.form.controls.inversion.setValidators(req);
    this.form.controls.comision.setValidators(
      independiente ? [Validators.required, Validators.min(0)] : []
    );
    this.form.controls.precioCompraAccion.setValidators(reqShare);
    this.form.controls.numeroAcciones.setValidators(reqShare);
    this.form.controls.empresa.updateValueAndValidity({ emitEvent: false });
    this.form.controls.inversion.updateValueAndValidity({ emitEvent: false });
    this.form.controls.comision.updateValueAndValidity({ emitEvent: false });
    this.form.controls.precioCompraAccion.updateValueAndValidity({
      emitEvent: false,
    });
    this.form.controls.numeroAcciones.updateValueAndValidity({
      emitEvent: false,
    });
  }
}
