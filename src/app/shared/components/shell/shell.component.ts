import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { AsyncPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map, shareReplay } from 'rxjs/operators';
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

  readonly railOpen = signal(false);

  readonly navItems: NavItem[] = [
    { path: '/gastos', label: 'Gastos', icon: 'shopping_bag' },
    { path: '/ingresos', label: 'Ingresos', icon: 'south_west' },
    { path: '/inversiones', label: 'Inversiones', icon: 'show_chart' },
    { path: '/resumen', label: 'Resumen', icon: 'donut_large' },
  ];

  readonly isHandset$ = this.breakpoint.observe(Breakpoints.Handset).pipe(
    map((r) => r.matches),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  closeRailOnMobile(): void {
    this.railOpen.set(false);
  }

  abrirQuickAdd(): void {
    this.railOpen.set(false);
    this.dialog.open(QuickAddDialogComponent, {
      width: '400px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
    });
  }
}
