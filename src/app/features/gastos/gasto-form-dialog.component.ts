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
import {
  CategoriaGasto,
  Gasto,
  GastoInput,
} from '../../core/models';
import { CategoriasConfigService } from '../../core/services/categorias-config.service';
import { FiltroAnioService } from '../../core/services/filtro-anio.service';
import { GastosService } from '../../core/services/gastos.service';
import { defaultFechaParaVista } from '../../core/utils/date.utils';

export interface GastoFormDialogData {
  gasto?: Gasto;
  /** Borrador de importación (sin id); no persiste al guardar. */
  draft?: GastoInput;
  previewMode?: boolean;
  /** YYYY-MM del filtro de la pantalla de gastos, si hay uno activo. */
  yearMonth?: string | null;
}

@Component({
  selector: 'app-gasto-form-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>
      {{
        data.previewMode || data.gasto
          ? 'Editar gasto'
          : 'Nuevo gasto'
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

        @if (tieneSubcategorias()) {
          <label class="field">
            <span>Subcategoría</span>
            <select formControlName="subcategoria">
              <option value="">Selecciona</option>
              @for (s of subcategoriasActuales(); track s) {
                <option [value]="s">{{ s }}</option>
              }
            </select>
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
export class GastoFormDialogComponent {
  readonly data: GastoFormDialogData =
    inject<GastoFormDialogData>(MAT_DIALOG_DATA, { optional: true }) ?? {};
  private readonly dialogRef = inject(MatDialogRef<GastoFormDialogComponent>);
  private readonly fb = inject(FormBuilder);
  private readonly gastosService = inject(GastosService);
  private readonly categoriasConfig = inject(CategoriasConfigService);
  private readonly filtroAnio = inject(FiltroAnioService);

  readonly categorias = this.categoriasConfig.categoriasGasto;

  private readonly initial = this.data.gasto ?? this.data.draft;
  private readonly defaultCategoria =
    this.initial?.categoria ?? this.categoriasConfig.categoriasGasto()[0] ?? '';

  readonly form = this.fb.nonNullable.group({
    fecha: [
      this.initial?.fecha ??
        defaultFechaParaVista(this.filtroAnio.year(), this.data.yearMonth),
      Validators.required,
    ],
    importe: [
      this.initial?.importe ?? (null as number | null),
      [Validators.required, Validators.min(0.01)],
    ],
    descripcion: [
      this.initial?.descripcion ?? '',
      [Validators.required, Validators.maxLength(120)],
    ],
    categoria: [this.defaultCategoria, Validators.required],
    subcategoria: [this.initial?.subcategoria ?? ''],
  });

  private readonly _categoria = signal(this.defaultCategoria);

  readonly subcategoriasActuales = computed(() =>
    this.categoriasConfig.subcategoriasDe(this._categoria())
  );

  constructor() {
    this.form.controls.categoria.valueChanges.subscribe((cat) => {
      this._categoria.set(cat);
      const subs = this.categoriasConfig.subcategoriasDe(cat);
      if (!subs.includes(this.form.controls.subcategoria.value)) {
        this.form.controls.subcategoria.setValue('');
      }
    });
  }

  tieneSubcategorias(): boolean {
    return this.categoriasConfig.categoriaTieneSubcategorias(this._categoria());
  }

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const importe = Number(raw.importe);
    if (!Number.isFinite(importe) || importe < 0.01) {
      this.form.controls.importe.setErrors({ min: true });
      this.form.markAllAsTouched();
      return;
    }
    const subs = this.categoriasConfig.subcategoriasDe(raw.categoria);
    const sub = raw.subcategoria?.trim();
    const input: GastoInput = {
      fecha: raw.fecha,
      importe,
      descripcion: raw.descripcion.trim(),
      categoria: raw.categoria,
    };
    if (subs.length && sub) {
      input.subcategoria = sub;
    }

    if (this.data.previewMode) {
      this.dialogRef.close(input);
      return;
    }

    if (this.data.gasto) {
      this.gastosService.update(this.data.gasto.id, input);
    } else {
      this.gastosService.add(input);
    }
    this.dialogRef.close(true);
  }
}
