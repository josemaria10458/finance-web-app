import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { onboardingGuard, setupOnlyGuard } from './core/guards/onboarding.guard';
import { ShellComponent } from './shared/components/shell/shell.component';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'configuracion-inicial',
    canActivate: [authGuard, setupOnlyGuard],
    loadComponent: () =>
      import('./features/onboarding/onboarding.component').then(
        (m) => m.OnboardingComponent
      ),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard, onboardingGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'gastos' },
      {
        path: 'gastos',
        loadComponent: () =>
          import('./features/gastos/gastos.component').then(
            (m) => m.GastosComponent
          ),
      },
      {
        path: 'ingresos',
        loadComponent: () =>
          import('./features/ingresos/ingresos.component').then(
            (m) => m.IngresosComponent
          ),
      },
      {
        path: 'inversiones',
        loadComponent: () =>
          import('./features/inversiones/inversiones.component').then(
            (m) => m.InversionesComponent
          ),
      },
      {
        path: 'fondos',
        loadComponent: () =>
          import('./features/fondos/fondos.component').then(
            (m) => m.FondosComponent
          ),
      },
      {
        path: 'resumen',
        loadComponent: () =>
          import('./features/resumen/resumen.component').then(
            (m) => m.ResumenComponent
          ),
      },
      {
        path: 'importar',
        loadComponent: () =>
          import('./features/importar/importar.component').then(
            (m) => m.ImportarComponent
          ),
      },
      {
        path: 'configuracion',
        loadComponent: () =>
          import('./features/onboarding/onboarding.component').then(
            (m) => m.OnboardingComponent
          ),
      },
    ],
  },
  { path: '**', redirectTo: 'gastos' },
];
