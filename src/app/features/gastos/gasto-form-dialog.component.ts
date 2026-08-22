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
  CATEGORIAS_GASTO,
  CategoriaGasto,
  Gasto,
  categoriaTieneSubcategorias,
  subcategoriasDe,
} from '../../core/models';
import { GastosService } from '../../core/services/gastos.service';
import { todayIso } from '../../core/utils/date.utils';

export interface GastoFormDialogData {
  gasto?: Gasto;
}

@Component({
  selector: 'app-gasto-form-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>{{ data.gasto ? 'Editar gasto' : 'Nuevo gasto' }}</h2>
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
            @for (c of categorias; track c) {
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
      min-width: min(100%, 340px);
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
  readonly data = inject<GastoFormDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<GastoFormDialogComponent>);
  private readonly fb = inject(FormBuilder);
  private readonly gastosService = inject(GastosService);

  readonly categorias = CATEGORIAS_GASTO;

  readonly form = this.fb.nonNullable.group({
    fecha: [this.data.gasto?.fecha ?? todayIso(), Validators.required],
    importe: [
      this.data.gasto?.importe ?? (null as number | null),
      [Validators.required, Validators.min(0.01)],
    ],
    descripcion: [
      this.data.gasto?.descripcion ?? '',
      [Validators.required, Validators.maxLength(120)],
    ],
    categoria: [
      this.data.gasto?.categoria ?? ('Comida' as CategoriaGasto),
      Validators.required,
    ],
    subcategoria: [this.data.gasto?.subcategoria ?? ''],
  });

  private readonly _categoria = signal(
    this.data.gasto?.categoria ?? ('Comida' as CategoriaGasto)
  );

  readonly subcategoriasActuales = computed(() =>
    subcategoriasDe(this._categoria())
  );

  constructor() {
    this.form.controls.categoria.valueChanges.subscribe((cat) => {
      this._categoria.set(cat);
      const subs = subcategoriasDe(cat);
      if (!subs.includes(this.form.controls.subcategoria.value)) {
        this.form.controls.subcategoria.setValue('');
      }
    });
  }

  tieneSubcategorias(): boolean {
    return categoriaTieneSubcategorias(this._categoria());
  }

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const subs = subcategoriasDe(raw.categoria);
    const input = {
      fecha: raw.fecha,
      importe: Number(raw.importe),
      descripcion: raw.descripcion.trim(),
      categoria: raw.categoria,
      subcategoria:
        subs.length && raw.subcategoria ? raw.subcategoria : undefined,
    };

    if (this.data.gasto) {
      this.gastosService.update(this.data.gasto.id, input);
    } else {
      this.gastosService.add(input);
    }
    this.dialogRef.close(true);
  }
}
