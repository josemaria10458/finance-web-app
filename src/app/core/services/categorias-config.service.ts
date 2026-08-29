import { Injectable, computed, inject, signal } from '@angular/core';
import {
  CategoriasConfig,
  DEFAULT_CATEGORIAS_CONFIG,
  GastoCategoriaConfig,
} from '../models/categorias-config.model';
import { UserFirestoreService } from './user-firestore.service';

@Injectable({ providedIn: 'root' })
export class CategoriasConfigService {
  private readonly firestore = inject(UserFirestoreService);
  private uid: string | null = null;

  private readonly _config = signal<CategoriasConfig>(
    structuredClone(DEFAULT_CATEGORIAS_CONFIG)
  );

  readonly config = this._config.asReadonly();

  readonly onboardingCompleted = computed(
    () => this._config().onboardingCompleted
  );

  readonly categoriasGasto = computed(() =>
    this._config().gastos.map((g) => g.nombre)
  );

  readonly categoriasIngreso = computed(() => [...this._config().ingresos]);

  setUid(uid: string | null): void {
    this.uid = uid;
  }

  clearUser(): void {
    this.uid = null;
    this._config.set(structuredClone(DEFAULT_CATEGORIAS_CONFIG));
  }

  hydrate(config: CategoriasConfig): void {
    this._config.set(this.normalize(config));
  }

  subcategoriasDe(categoria: string): readonly string[] {
    const hit = this._config().gastos.find((g) => g.nombre === categoria);
    return hit?.subcategorias ?? [];
  }

  categoriaTieneSubcategorias(categoria: string): boolean {
    return this.subcategoriasDe(categoria).length > 0;
  }

  categoriaGastoFallback(): string {
    const cats = this.categoriasGasto();
    return (
      cats.find((c) => c.toLowerCase().includes('propio')) ??
      cats[cats.length - 1] ??
      'Otros'
    );
  }

  categoriaIngresoFallback(): string {
    const cats = this.categoriasIngreso();
    return cats.find((c) => c.toLowerCase().includes('otro')) ?? cats[0] ?? 'Otros';
  }

  saveConfig(config: CategoriasConfig): void {
    const normalized = this.normalize(config);
    this._config.set(normalized);
    void this.persist(normalized);
  }

  async completeOnboarding(config: CategoriasConfig): Promise<void> {
    const normalized = { ...this.normalize(config), onboardingCompleted: true };
    this._config.set(normalized);
    if (!this.uid) return;
    await this.firestore.patch(this.uid, {
      categoriasConfig: normalized,
      initialSetupCompleted: true,
    });
  }

  private normalize(config: CategoriasConfig): CategoriasConfig {
    const gastos: GastoCategoriaConfig[] = [];
    const seenGastos = new Set<string>();

    for (const raw of config.gastos ?? []) {
      const nombre = String(raw.nombre ?? '').trim();
      if (!nombre || seenGastos.has(nombre)) continue;
      seenGastos.add(nombre);

      const subs: string[] = [];
      const seenSubs = new Set<string>();
      for (const sub of raw.subcategorias ?? []) {
        const s = String(sub).trim();
        if (!s || seenSubs.has(s)) continue;
        seenSubs.add(s);
        subs.push(s);
      }
      gastos.push({ nombre, subcategorias: subs });
    }

    const ingresos: string[] = [];
    const seenIngresos = new Set<string>();
    for (const raw of config.ingresos ?? []) {
      const nombre = String(raw).trim();
      if (!nombre || seenIngresos.has(nombre)) continue;
      seenIngresos.add(nombre);
      ingresos.push(nombre);
    }

    return {
      gastos: gastos.length ? gastos : structuredClone(DEFAULT_CATEGORIAS_CONFIG.gastos),
      ingresos: ingresos.length
        ? ingresos
        : structuredClone(DEFAULT_CATEGORIAS_CONFIG.ingresos),
      onboardingCompleted: config.onboardingCompleted === true,
    };
  }

  private persist(config: CategoriasConfig): void {
    if (!this.uid) return;
    void this.firestore.patch(this.uid, { categoriasConfig: config });
  }
}
