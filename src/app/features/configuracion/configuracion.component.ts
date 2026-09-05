import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  CategoriasConfig,
  GastoCategoriaConfig,
} from '../../core/models/categorias-config.model';
import { CategoriasConfigService } from '../../core/services/categorias-config.service';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [FormsModule, MatIconModule, MatSnackBarModule],
  templateUrl: './configuracion.component.html',
  styleUrl: './configuracion.component.css',
})
export class ConfiguracionComponent {
  private readonly categorias = inject(CategoriasConfigService);
  private readonly snackBar = inject(MatSnackBar);

  readonly draft = signal<CategoriasConfig>(
    structuredClone(this.categorias.config())
  );

  readonly nuevaCategoriaGasto = signal('');
  readonly nuevaSubcategoria = signal<Record<string, string>>({});
  readonly nuevoIngreso = signal('');

  constructor() {
    effect(() => {
      this.draft.set(structuredClone(this.categorias.config()));
    });
  }

  addCategoriaGasto(): void {
    const nombre = this.nuevaCategoriaGasto().trim();
    if (!nombre) return;
    this.draft.update((d) => {
      if (d.gastos.some((g) => g.nombre === nombre)) return d;
      return {
        ...d,
        gastos: [...d.gastos, { nombre, subcategorias: [] }],
      };
    });
    this.nuevaCategoriaGasto.set('');
    this.persist();
  }

  removeCategoriaGasto(index: number): void {
    if (this.draft().gastos.length <= 1) {
      this.snackBar.open('Debe quedar al menos una categoría de gasto', 'Cerrar', {
        duration: 2500,
      });
      return;
    }
    this.draft.update((d) => ({
      ...d,
      gastos: d.gastos.filter((_, i) => i !== index),
    }));
    this.persist();
  }

  addSubcategoria(categoria: string): void {
    const sub = (this.nuevaSubcategoria()[categoria] ?? '').trim();
    if (!sub) return;
    this.draft.update((d) => ({
      ...d,
      gastos: d.gastos.map((g) => {
        if (g.nombre !== categoria) return g;
        if (g.subcategorias.includes(sub)) return g;
        return { ...g, subcategorias: [...g.subcategorias, sub] };
      }),
    }));
    this.nuevaSubcategoria.update((m) => ({ ...m, [categoria]: '' }));
    this.persist();
  }

  removeSubcategoria(categoria: string, sub: string): void {
    this.draft.update((d) => ({
      ...d,
      gastos: d.gastos.map((g) =>
        g.nombre === categoria
          ? {
              ...g,
              subcategorias: g.subcategorias.filter((s) => s !== sub),
            }
          : g
      ),
    }));
    this.persist();
  }

  addIngreso(): void {
    const nombre = this.nuevoIngreso().trim();
    if (!nombre) return;
    this.draft.update((d) => {
      if (d.ingresos.includes(nombre)) return d;
      return { ...d, ingresos: [...d.ingresos, nombre] };
    });
    this.nuevoIngreso.set('');
    this.persist();
  }

  removeIngreso(index: number): void {
    if (this.draft().ingresos.length <= 1) {
      this.snackBar.open('Debe quedar al menos un tipo de ingreso', 'Cerrar', {
        duration: 2500,
      });
      return;
    }
    this.draft.update((d) => ({
      ...d,
      ingresos: d.ingresos.filter((_, i) => i !== index),
    }));
    this.persist();
  }

  subInput(categoria: string): string {
    return this.nuevaSubcategoria()[categoria] ?? '';
  }

  setSubInput(categoria: string, value: string): void {
    this.nuevaSubcategoria.update((m) => ({ ...m, [categoria]: value }));
  }

  trackGasto(_: number, g: GastoCategoriaConfig): string {
    return g.nombre;
  }

  private persist(): void {
    this.categorias.saveConfig({
      ...this.draft(),
      onboardingCompleted: true,
    });
  }
}
