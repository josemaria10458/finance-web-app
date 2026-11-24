import { Injectable, inject, signal } from '@angular/core';
import { UltimaImportacion } from '../models/ultima-importacion.model';
import { UserFirestoreService } from './user-firestore.service';

/** Hasta qué fecha llegan los datos del último archivo importado. */
@Injectable({ providedIn: 'root' })
export class UltimaImportacionService {
  private readonly firestore = inject(UserFirestoreService);
  private uid: string | null = null;

  private readonly _ultima = signal<UltimaImportacion | null>(null);
  readonly ultima = this._ultima.asReadonly();

  setUid(uid: string | null): void {
    this.uid = uid;
  }

  clearUser(): void {
    this.uid = null;
    this._ultima.set(null);
  }

  hydrate(ultima: UltimaImportacion | null | undefined): void {
    this._ultima.set(ultima ?? null);
  }

  save(ultima: UltimaImportacion): void {
    this._ultima.set(ultima);
    if (this.uid) {
      void this.firestore.patch(this.uid, { ultimaImportacion: ultima });
    }
  }
}
