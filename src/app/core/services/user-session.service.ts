import { Injectable, inject, signal } from '@angular/core';
import { effect } from '@angular/core';
import { CategoriasConfig } from '../models/categorias-config.model';
import { AuthService } from './auth.service';
import { CategoriasConfigService } from './categorias-config.service';
import { FiltroAnioService } from './filtro-anio.service';
import { GastosService } from './gastos.service';
import { IngresosService } from './ingresos.service';
import { InversionesService } from './inversiones.service';
import {
  UserDataSnapshot,
  UserFirestoreService,
} from './user-firestore.service';

/** Vincula datos del usuario desde Firestore cuando cambia la sesión. */
@Injectable({ providedIn: 'root' })
export class UserSessionService {
  private readonly auth = inject(AuthService);
  private readonly firestore = inject(UserFirestoreService);
  private readonly categorias = inject(CategoriasConfigService);
  private readonly filtroAnio = inject(FiltroAnioService);
  private readonly gastos = inject(GastosService);
  private readonly ingresos = inject(IngresosService);
  private readonly inversiones = inject(InversionesService);

  private lastUid: string | null = null;
  private loadPromise: Promise<void> | null = null;

  readonly dataReady = signal(false);

  constructor() {
    effect(() => {
      if (!this.auth.ready()) return;

      const uid = this.auth.user()?.uid ?? null;
      if (uid === this.lastUid && this.dataReady()) return;

      if (!uid) {
        this.resetSession();
        return;
      }

      this.ensureUserLoaded(uid);
    });
  }

  async waitUntilDataReady(): Promise<void> {
    await this.auth.waitUntilReady();
    const uid = this.auth.user()?.uid ?? null;
    if (!uid) return;

    this.ensureUserLoaded(uid);
    if (this.loadPromise) {
      await this.loadPromise;
    }
  }

  /** Hay gastos, ingresos u operaciones guardados. */
  hasUserData(): boolean {
    return (
      this.gastos.gastos().length > 0 ||
      this.ingresos.ingresos().length > 0 ||
      this.inversiones.operaciones().length > 0
    );
  }

  /** Solo usuarios nuevos sin datos deben ver la configuración inicial. */
  needsInitialSetup(): boolean {
    if (this.hasUserData()) return false;
    return !this.categorias.onboardingCompleted();
  }

  private resetSession(): void {
    this.lastUid = null;
    this.loadPromise = null;
    this.clearAll();
    this.dataReady.set(true);
  }

  private ensureUserLoaded(uid: string): void {
    if (this.loadPromise && this.lastUid === uid) return;
    this.lastUid = uid;
    this.loadUser(uid);
  }

  private clearAll(): void {
    this.gastos.clearUser();
    this.ingresos.clearUser();
    this.inversiones.clearUser();
    this.categorias.clearUser();
    this.filtroAnio.clearUser();
  }

  private loadUser(uid: string): void {
    this.dataReady.set(false);
    this.gastos.setUid(uid);
    this.ingresos.setUid(uid);
    this.inversiones.setUid(uid);
    this.categorias.setUid(uid);
    this.filtroAnio.setUid(uid);

    this.loadPromise = this.firestore
      .load(uid)
      .then(async (data) => {
        if (this.lastUid !== uid) return;

        const dataWithSetup = this.applySetupFromData(data);
        this.gastos.hydrate(dataWithSetup.gastos);
        this.ingresos.hydrate(dataWithSetup.ingresos);
        this.inversiones.hydrate(dataWithSetup.operaciones);
        this.categorias.hydrate(dataWithSetup.categoriasConfig);
        this.filtroAnio.hydrate(dataWithSetup.filtroAnio);

        if (
          this.snapshotHasUserData(dataWithSetup) &&
          !dataWithSetup.initialSetupCompleted
        ) {
          await this.firestore.patch(uid, {
            initialSetupCompleted: true,
            categoriasConfig: {
              ...dataWithSetup.categoriasConfig,
              onboardingCompleted: true,
            },
          });
        }
      })
      .catch((err) => {
        console.error('Error cargando datos de Firestore', err);
        if (this.lastUid !== uid) return;
        this.clearAll();
        this.gastos.setUid(uid);
        this.ingresos.setUid(uid);
        this.inversiones.setUid(uid);
        this.categorias.setUid(uid);
        this.filtroAnio.setUid(uid);
      })
      .finally(() => {
        if (this.lastUid === uid) {
          this.dataReady.set(true);
        }
      });
  }

  private snapshotHasUserData(data: UserDataSnapshot): boolean {
    return (
      data.gastos.length > 0 ||
      data.ingresos.length > 0 ||
      data.operaciones.length > 0
    );
  }

  private applySetupFromData(data: UserDataSnapshot): UserDataSnapshot {
    const hasData = this.snapshotHasUserData(data);
    if (!hasData && !data.initialSetupCompleted) {
      return data;
    }

    const categoriasConfig: CategoriasConfig = {
      ...data.categoriasConfig,
      onboardingCompleted: true,
    };

    return {
      ...data,
      categoriasConfig,
      initialSetupCompleted: true,
    };
  }
}
