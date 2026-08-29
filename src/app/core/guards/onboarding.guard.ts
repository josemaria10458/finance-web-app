import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserSessionService } from '../services/user-session.service';

/** Redirige a configuración inicial si el usuario no tiene datos guardados. */
export const onboardingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const session = inject(UserSessionService);
  const router = inject(Router);

  await auth.waitUntilReady();
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  await session.waitUntilDataReady();

  if (session.needsInitialSetup()) {
    return router.createUrlTree(['/configuracion-inicial']);
  }

  return true;
};

/** Solo accesible mientras falta completar el onboarding. */
export const setupOnlyGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const session = inject(UserSessionService);
  const router = inject(Router);

  await auth.waitUntilReady();
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  await session.waitUntilDataReady();

  if (!session.needsInitialSetup()) {
    return router.createUrlTree(['/gastos']);
  }

  return true;
};
