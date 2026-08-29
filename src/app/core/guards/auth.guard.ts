import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserSessionService } from '../services/user-session.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const session = inject(UserSessionService);
  const router = inject(Router);

  await auth.waitUntilReady();

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  await session.waitUntilDataReady();
  return true;
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const session = inject(UserSessionService);
  const router = inject(Router);

  await auth.waitUntilReady();

  if (auth.isAuthenticated()) {
    await session.waitUntilDataReady();
    if (session.needsInitialSetup()) {
      return router.createUrlTree(['/configuracion-inicial']);
    }
    return router.createUrlTree(['/gastos']);
  }

  return true;
};
