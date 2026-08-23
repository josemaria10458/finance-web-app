import { Injectable, inject } from '@angular/core';
import { effect } from '@angular/core';
import { AuthService } from './auth.service';
import { GastosService } from './gastos.service';
import { IngresosService } from './ingresos.service';
import { InversionesService } from './inversiones.service';

/** Vincula datos de localStorage al uid cuando cambia la sesión. */
@Injectable({ providedIn: 'root' })
export class UserSessionService {
  private readonly auth = inject(AuthService);
  private readonly gastos = inject(GastosService);
  private readonly ingresos = inject(IngresosService);
  private readonly inversiones = inject(InversionesService);

  private lastUid: string | null | undefined;

  constructor() {
    effect(() => {
      if (!this.auth.ready()) return;

      const uid = this.auth.user()?.uid ?? null;
      if (uid === this.lastUid) return;
      this.lastUid = uid;

      this.gastos.bindUser(uid);
      this.ingresos.bindUser(uid);
      this.inversiones.bindUser(uid);
    });
  }
}
