import { Injectable, inject } from '@angular/core';
import {
  CategoriasConfig,
  DEFAULT_CATEGORIAS_CONFIG,
} from '../models/categorias-config.model';
import { Gasto } from '../models/gasto.model';
import { Ingreso } from '../models/ingreso.model';
import { OperacionBolsa } from '../models/operacion-bolsa.model';
import { MovimientoRecurrente } from '../models/recurrente.model';
import {
  doc,
  getDoc,
  getFirebaseFirestore,
  serverTimestamp,
  setDoc,
} from '../firebase/firestore.app';
import { StorageService } from './storage.service';

const USERS_COLLECTION = 'users';

const LEGACY_KEYS = {
  gastos: 'finanzas.gastos',
  ingresos: 'finanzas.ingresos',
  operaciones: 'finanzas.operaciones-bolsa',
  categoriasConfig: 'finanzas.categorias-config',
  filtroAnio: 'finanzas.filtro-anio',
} as const;

export interface UserDataSnapshot {
  gastos: Gasto[];
  ingresos: Ingreso[];
  operaciones: OperacionBolsa[];
  recurrentes: MovimientoRecurrente[];
  categoriasConfig: CategoriasConfig;
  filtroAnio: number | null;
  initialSetupCompleted: boolean;
}

@Injectable({ providedIn: 'root' })
export class UserFirestoreService {
  private readonly storage = inject(StorageService);
  private readonly db = getFirebaseFirestore();

  async load(uid: string): Promise<UserDataSnapshot> {
    const ref = doc(this.db, USERS_COLLECTION, uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      return this.normalizeSnapshot(snap.data());
    }

    const migrated = this.migrateFromLocalStorage(uid);
    if (this.hasAnyData(migrated)) {
      await setDoc(
        ref,
        {
          ...migrated,
          initialSetupCompleted: migrated.initialSetupCompleted,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      this.clearLocalStorage(uid);
      return migrated;
    }

    const empty = this.emptySnapshot();
    await setDoc(
      ref,
      {
        gastos: [],
        ingresos: [],
        operaciones: [],
        recurrentes: [],
        categoriasConfig: empty.categoriasConfig,
        filtroAnio: null,
        initialSetupCompleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return empty;
  }

  async patch(
    uid: string,
    partial: Partial<UserDataSnapshot>
  ): Promise<void> {
    const ref = doc(this.db, USERS_COLLECTION, uid);
    const payload = stripUndefinedDeep({
      ...partial,
      updatedAt: serverTimestamp(),
    }) as Record<string, unknown>;
    await setDoc(ref, payload, { merge: true });
  }

  private emptySnapshot(): UserDataSnapshot {
    return {
      gastos: [],
      ingresos: [],
      operaciones: [],
      recurrentes: [],
      categoriasConfig: structuredClone(DEFAULT_CATEGORIAS_CONFIG),
      filtroAnio: null,
      initialSetupCompleted: false,
    };
  }

  private hasAnyData(data: UserDataSnapshot): boolean {
    return (
      data.gastos.length > 0 ||
      data.ingresos.length > 0 ||
      data.operaciones.length > 0 ||
      data.initialSetupCompleted ||
      data.categoriasConfig.onboardingCompleted ||
      data.filtroAnio != null
    );
  }

  private migrateFromLocalStorage(uid: string): UserDataSnapshot {
    const gastos =
      this.readLegacy<Gasto[]>(LEGACY_KEYS.gastos, uid) ?? [];
    const ingresos =
      this.readLegacy<Ingreso[]>(LEGACY_KEYS.ingresos, uid) ?? [];
    const operaciones =
      this.readLegacy<OperacionBolsa[]>(LEGACY_KEYS.operaciones, uid) ?? [];

    const storedConfig = this.readLegacy<CategoriasConfig>(
      LEGACY_KEYS.categoriasConfig,
      uid
    );

    let categoriasConfig: CategoriasConfig;
    let initialSetupCompleted = false;
    if (storedConfig) {
      categoriasConfig = storedConfig;
      initialSetupCompleted = storedConfig.onboardingCompleted === true;
    } else if (
      gastos.length > 0 ||
      ingresos.length > 0 ||
      operaciones.length > 0
    ) {
      categoriasConfig = structuredClone(DEFAULT_CATEGORIAS_CONFIG);
      categoriasConfig.onboardingCompleted = true;
      initialSetupCompleted = true;
    } else {
      categoriasConfig = structuredClone(DEFAULT_CATEGORIAS_CONFIG);
    }

    const filtroRaw = this.storage.read<number | null>(
      LEGACY_KEYS.filtroAnio,
      null
    );
    const filtroAnio =
      typeof filtroRaw === 'number' && Number.isFinite(filtroRaw)
        ? filtroRaw
        : null;

    return {
      gastos,
      ingresos,
      operaciones,
      recurrentes: [],
      categoriasConfig,
      filtroAnio,
      initialSetupCompleted,
    };
  }

  private readLegacy<T>(base: string, uid: string): T | null {
    const userKey = this.storage.keyFor(base, uid);
    const migrated = this.storage.migrateLegacy<T>(base, userKey);
    if (migrated != null) return migrated;
    const data = this.storage.read<T | null>(userKey, null);
    return data;
  }

  private clearLocalStorage(uid: string): void {
    for (const base of Object.values(LEGACY_KEYS)) {
      if (base === LEGACY_KEYS.filtroAnio) {
        this.storage.remove(base);
        continue;
      }
      this.storage.remove(this.storage.keyFor(base, uid));
      this.storage.remove(base);
    }
  }

  private normalizeSnapshot(raw: Record<string, unknown>): UserDataSnapshot {
    const defaults = this.emptySnapshot();
    const configRaw = raw['categoriasConfig'] as CategoriasConfig | undefined;

    const gastos = Array.isArray(raw['gastos'])
      ? (raw['gastos'] as Gasto[])
      : defaults.gastos;
    const ingresos = Array.isArray(raw['ingresos'])
      ? (raw['ingresos'] as Ingreso[])
      : defaults.ingresos;
    const operaciones = Array.isArray(raw['operaciones'])
      ? (raw['operaciones'] as OperacionBolsa[])
      : defaults.operaciones;
    const recurrentes = Array.isArray(raw['recurrentes'])
      ? (raw['recurrentes'] as MovimientoRecurrente[])
      : defaults.recurrentes;

    const hasLegacyActivity =
      gastos.length > 0 || ingresos.length > 0 || operaciones.length > 0;
    const initialSetupCompleted =
      raw['initialSetupCompleted'] === true ||
      configRaw?.onboardingCompleted === true ||
      hasLegacyActivity;

    const categoriasConfig: CategoriasConfig = configRaw
      ? {
          gastos: Array.isArray(configRaw.gastos)
            ? configRaw.gastos
            : defaults.categoriasConfig.gastos,
          ingresos: Array.isArray(configRaw.ingresos)
            ? configRaw.ingresos
            : defaults.categoriasConfig.ingresos,
          onboardingCompleted: initialSetupCompleted,
        }
      : {
          ...defaults.categoriasConfig,
          onboardingCompleted: initialSetupCompleted,
        };

    return {
      gastos,
      ingresos,
      operaciones,
      recurrentes,
      categoriasConfig,
      filtroAnio:
        typeof raw['filtroAnio'] === 'number' &&
        Number.isFinite(raw['filtroAnio'])
          ? (raw['filtroAnio'] as number)
          : null,
      initialSetupCompleted,
    };
  }
}

/** Firestore rechaza `undefined` (y NaN) en documentos; se omiten antes de escribir. */
function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return undefined;
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeep(item))
      .filter((item) => item !== undefined);
  }
  if (typeof value === 'object' && value.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (nested === undefined) continue;
      const cleaned = stripUndefinedDeep(nested);
      if (cleaned === undefined) continue;
      out[key] = cleaned;
    }
    return out;
  }
  return value;
}
