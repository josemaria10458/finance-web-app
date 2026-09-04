import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { FiltroAnioService } from '../../../core/services/filtro-anio.service';
import { QuickAddDialogComponent } from '../quick-add-dialog/quick-add-dialog.component';

const COMPACT_QUERY = '(max-width: 959.98px)';

interface NavItem {
  path: string;
  label: string;
  dockLabel: string;
  icon: string;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
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
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly filtroAnio = inject(FiltroAnioService);

  readonly railOpen = signal(false);
  readonly isCompact = signal(
    typeof window !== 'undefined' && window.matchMedia(COMPACT_QUERY).matches
  );

  readonly navItems: NavItem[] = [
    { path: '/gastos', label: 'Gastos', dockLabel: 'Gastos', icon: 'shopping_bag' },
    { path: '/ingresos', label: 'Ingresos', dockLabel: 'Ingresos', icon: 'south_west' },
    { path: '/inversiones', label: 'Inversiones', dockLabel: 'Bolsa', icon: 'show_chart' },
    { path: '/fondos', label: 'Fondos & ETFs', dockLabel: 'Fondos', icon: 'insights' },
    { path: '/resumen', label: 'Resumen', dockLabel: 'Resumen', icon: 'donut_large' },
  ];

  constructor() {
    this.breakpoint
      .observe(COMPACT_QUERY)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        this.isCompact.set(state.matches);
        if (state.matches) {
          this.railOpen.set(false);
        }
      });
  }

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
