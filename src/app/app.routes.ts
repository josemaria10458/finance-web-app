import { Routes } from '@angular/router';
import { ShellComponent } from './shared/components/shell/shell.component';

export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
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
    ],
  },
  { path: '**', redirectTo: 'gastos' },
];
