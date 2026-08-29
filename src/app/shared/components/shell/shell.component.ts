import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { AsyncPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map, shareReplay } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
import { FiltroAnioService } from '../../../core/services/filtro-anio.service';
import { QuickAddDialogComponent } from '../quick-add-dialog/quick-add-dialog.component';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    AsyncPipe,
    FormsModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatDialogModule,
    MatIconModule,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.css',
})
export class ShellComponent {
  private readonly breakpoint = inject(BreakpointObserver);
  private readonly dialog = inject(MatDialog);
  readonly auth = inject(AuthService);
  readonly filtroAnio = inject(FiltroAnioService);

  readonly railOpen = signal(false);

  readonly navItems: NavItem[] = [
    { path: '/gastos', label: 'Gastos', icon: 'shopping_bag' },
    { path: '/ingresos', label: 'Ingresos', icon: 'south_west' },
    { path: '/inversiones', label: 'Inversiones', icon: 'show_chart' },
    { path: '/fondos', label: 'Fondos & ETFs', icon: 'insights' },
    { path: '/resumen', label: 'Resumen', icon: 'donut_large' },
  ];

  readonly isHandset$ = this.breakpoint.observe(Breakpoints.Handset).pipe(
    map((r) => r.matches),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  closeRailOnMobile(): void {
    this.railOpen.set(false);
  }

  onYearChange(value: string): void {
    this.filtroAnio.setYear(value ? Number(value) : null);
  }

  abrirQuickAdd(): void {
    this.railOpen.set(false);
    this.dialog.open(QuickAddDialogComponent, {
      width: '400px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
    });
  }

  cerrarSesion(): void {
    void this.auth.signOut();
  }
}
