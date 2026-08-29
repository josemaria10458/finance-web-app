import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import {
  CategoriasConfig,
  GastoCategoriaConfig,
} from '../../core/models/categorias-config.model';
import { AuthService } from '../../core/services/auth.service';
import { CategoriasConfigService } from '../../core/services/categorias-config.service';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [FormsModule, MatIconModule],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.css',
})
export class OnboardingComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly categorias = inject(CategoriasConfigService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly isEdit = signal(false);
  readonly signingOut = signal(false);

  readonly draft = signal<CategoriasConfig>(
    structuredClone(this.categorias.config())
  );

  readonly nuevaCategoriaGasto = signal('');
  readonly nuevaSubcategoria = signal<Record<string, string>>({});
  readonly nuevoIngreso = signal('');

  ngOnInit(): void {
    this.isEdit.set(
      this.route.snapshot.routeConfig?.path === 'configuracion'
    );
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
  }

  removeCategoriaGasto(index: number): void {
    this.draft.update((d) => ({
      ...d,
      gastos: d.gastos.filter((_, i) => i !== index),
    }));
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
  }

  addIngreso(): void {
    const nombre = this.nuevoIngreso().trim();
    if (!nombre) return;
    this.draft.update((d) => {
      if (d.ingresos.includes(nombre)) return d;
      return { ...d, ingresos: [...d.ingresos, nombre] };
    });
    this.nuevoIngreso.set('');
  }

  removeIngreso(index: number): void {
    this.draft.update((d) => ({
      ...d,
      ingresos: d.ingresos.filter((_, i) => i !== index),
    }));
  }

  subInput(categoria: string): string {
    return this.nuevaSubcategoria()[categoria] ?? '';
  }

  setSubInput(categoria: string, value: string): void {
    this.nuevaSubcategoria.update((m) => ({ ...m, [categoria]: value }));
  }

  async volverAlLogin(): Promise<void> {
    this.signingOut.set(true);
    try {
      await this.auth.signOut();
    } finally {
      this.signingOut.set(false);
    }
  }

  async guardar(): Promise<void> {
    const draft = this.draft();
    if (!draft.gastos.length || !draft.ingresos.length) return;

    if (this.isEdit()) {
      this.categorias.saveConfig({
        ...draft,
        onboardingCompleted: true,
      });
    } else {
      await this.categorias.completeOnboarding(draft);
    }
    await this.router.navigate(['/gastos']);
  }

  trackGasto(_: number, g: GastoCategoriaConfig): string {
    return g.nombre;
  }
}
