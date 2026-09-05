import { CurrencyPipe } from '@angular/common';
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
import { MatIconModule } from '@angular/material/icon';
import {
  MovimientoRecurrente,
  RecurrenteTipo,
} from '../../../core/models';
import { CategoriasConfigService } from '../../../core/services/categorias-config.service';
import { RecurrentesService } from '../../../core/services/recurrentes.service';
import { currentYearMonth } from '../../../core/utils/date.utils';

export interface RecurringDialogData {
  tipo: RecurrenteTipo;
}

@Component({
  selector: 'app-recurring-dialog',
  standalone: true,
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ data.tipo === 'gasto' ? 'Programar gasto' : 'Programar ingreso' }}
    </h2>
    <mat-dialog-content>
      <p class="lead">
        Se creará automáticamente el día elegido de cada mes (por ejemplo, la
        hipoteca el día 3).
      </p>

      @if (reglas().length) {
        <ul class="rules">
          @for (r of reglas(); track r.id) {
            <li class="rule" [class.off]="!r.activo">
              <div class="rule-copy">
                <strong>{{ r.descripcion }}</strong>
                <span>
                  Día {{ r.diaDelMes }} ·
                  {{ r.importe | currency: 'EUR' : 'symbol' : '1.2-2' : 'es' }}
                  · {{ r.categoria }}
                </span>
              </div>
              <button
                type="button"
                class="icon-btn"
                [attr.aria-label]="r.activo ? 'Pausar' : 'Reanudar'"
                (click)="toggle(r)"
              >
                <mat-icon>{{ r.activo ? 'pause' : 'play_arrow' }}</mat-icon>
              </button>
              <button
                type="button"
                class="icon-btn danger"
                aria-label="Eliminar programación"
                (click)="remove(r)"
              >
                <mat-icon>close</mat-icon>
              </button>
            </li>
          }
        </ul>
      }

      <form [formGroup]="form" class="form" (ngSubmit)="guardar()">
        <label class="field">
          <span>Día del mes</span>
          <select formControlName="diaDelMes">
            @for (d of dias; track d) {
              <option [value]="d">{{ d }}</option>
            }
          </select>
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
      <button mat-button type="button" mat-dialog-close>Cerrar</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="form.invalid"
        (click)="guardar()"
      >
        Programar
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .lead {
      margin: 0 0 1rem;
      color: var(--muted);
      font-size: 0.9rem;
      line-height: 1.45;
    }
    .rules {
      list-style: none;
      margin: 0 0 1.1rem;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }
    .rule {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 0.15rem;
      padding: 0.65rem 0.7rem;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: #fff;
    }
    .rule.off {
      opacity: 0.55;
    }
    .rule-copy {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .rule-copy strong {
      font-size: 0.92rem;
      color: var(--ink);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .rule-copy span {
      font-size: 0.78rem;
      color: var(--muted);
    }
    .icon-btn {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
    }
    .icon-btn:hover {
      background: rgba(12, 46, 43, 0.06);
      color: var(--ink);
    }
    .icon-btn.danger:hover {
      background: rgba(181, 74, 58, 0.1);
      color: var(--danger);
    }
    .icon-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
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
export class RecurringDialogComponent {
  readonly data = inject<RecurringDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<RecurringDialogComponent>);
  private readonly fb = inject(FormBuilder);
  private readonly recurrentes = inject(RecurrentesService);
  private readonly categoriasConfig = inject(CategoriasConfigService);

  readonly dias = Array.from({ length: 31 }, (_, i) => i + 1);
  readonly reglas = computed(() => this.recurrentes.byTipo(this.data.tipo));

  readonly categorias = computed(() =>
    this.data.tipo === 'gasto'
      ? this.categoriasConfig.categoriasGasto()
      : this.categoriasConfig.categoriasIngreso()
  );

  private readonly defaultCategoria = this.categorias()[0] ?? '';
  private readonly _categoria = signal(this.defaultCategoria);

  readonly form = this.fb.nonNullable.group({
    diaDelMes: ['3', Validators.required],
    importe: [null as number | null, [Validators.required, Validators.min(0.01)]],
    descripcion: ['', [Validators.required, Validators.maxLength(120)]],
    categoria: [this.defaultCategoria, Validators.required],
    subcategoria: [''],
  });

  readonly subcategoriasActuales = computed(() =>
    this.data.tipo === 'gasto'
      ? this.categoriasConfig.subcategoriasDe(this._categoria())
      : []
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
    return (
      this.data.tipo === 'gasto' &&
      this.categoriasConfig.categoriaTieneSubcategorias(this._categoria())
    );
  }

  toggle(rule: MovimientoRecurrente): void {
    this.recurrentes.toggle(rule.id);
  }

  remove(rule: MovimientoRecurrente): void {
    this.recurrentes.remove(rule.id);
  }

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const importe = Number(raw.importe);
    if (!Number.isFinite(importe) || importe < 0.01) return;
    const subs = this.categoriasConfig.subcategoriasDe(raw.categoria);
    const sub = raw.subcategoria?.trim();
    const created = this.recurrentes.add({
      tipo: this.data.tipo,
      diaDelMes: Number(raw.diaDelMes),
      importe,
      descripcion: raw.descripcion.trim(),
      categoria: raw.categoria,
      activo: true,
      desde: currentYearMonth(),
      ...(this.data.tipo === 'gasto' && subs.length && sub
        ? { subcategoria: sub }
        : {}),
    });
    this.dialogRef.close(created);
  }
}
