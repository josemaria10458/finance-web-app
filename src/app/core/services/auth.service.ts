import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  GoogleAuthProvider,
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { getFirebaseAuth } from '../firebase/firebase.app';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly auth = getFirebaseAuth();

  private readonly _user = signal<AppUser | null>(null);
  private readonly _ready = signal(false);
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;

  readonly user = this._user.asReadonly();
  readonly ready = this._ready.asReadonly();

  constructor() {
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });

    onAuthStateChanged(this.auth, (firebaseUser) => {
      this._user.set(firebaseUser ? this.toAppUser(firebaseUser) : null);
      if (!this._ready()) {
        this._ready.set(true);
        this.resolveReady();
      }
    });
  }

  waitUntilReady(): Promise<void> {
    return this.readyPromise;
  }

  isAuthenticated(): boolean {
    return this._user() != null;
  }

  async signInWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(this.auth, provider);
  }

  async signOut(): Promise<void> {
    await firebaseSignOut(this.auth);
    await this.router.navigate(['/login']);
  }

  private toAppUser(user: User): AppUser {
    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    };
  }
}
