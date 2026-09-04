import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { GastoFormDialogComponent } from '../../../features/gastos/gasto-form-dialog.component';
import { IngresoFormDialogComponent } from '../../../features/ingresos/ingreso-form-dialog.component';
import { CompraFormDialogComponent } from '../../../features/inversiones/compra-form-dialog.component';

@Component({
  selector: 'app-quick-add-dialog',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Añadir transacción</h2>
    <mat-dialog-content>
      <div class="choices">
        <button type="button" class="choice" (click)="abrirGasto()">
          <mat-icon>shopping_bag</mat-icon>
          <span class="choice-copy">
            <strong>Gasto</strong>
            <small>Pago o compra rápida</small>
          </span>
        </button>
        <button type="button" class="choice" (click)="abrirIngreso()">
          <mat-icon>south_west</mat-icon>
          <span class="choice-copy">
            <strong>Ingreso</strong>
            <small>Nómina u otro cobro</small>
          </span>
        </button>
        <button type="button" class="choice" (click)="abrirInversion()">
          <mat-icon>show_chart</mat-icon>
          <span class="choice-copy">
            <strong>Inversión</strong>
            <small>Compra de acciones / ETF</small>
          </span>
        </button>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: `
    .choices {
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
      padding: 0.35rem 0 0.5rem;
      min-width: 0;
      width: 100%;
    }
    .choice {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      width: 100%;
      padding: 0.9rem 1rem;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: #fff;
      text-align: left;
      cursor: pointer;
      color: var(--text);
      transition: border-color 0.2s, transform 0.2s var(--ease-out);
    }
    .choice:hover {
      border-color: rgba(31, 111, 102, 0.35);
      transform: translateY(-1px);
    }
    .choice mat-icon {
      color: var(--accent);
    }
    .choice-copy {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .choice-copy strong {
      font-family: var(--font-display);
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .choice-copy small {
      color: var(--muted);
      font-size: 0.82rem;
    }
  `,
})
export class QuickAddDialogComponent {
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(MatDialogRef<QuickAddDialogComponent>);

  abrirGasto(): void {
    this.dialogRef.close();
    this.dialog.open(GastoFormDialogComponent, {
      width: '440px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
      data: {},
    });
  }

  abrirIngreso(): void {
    this.dialogRef.close();
    this.dialog.open(IngresoFormDialogComponent, {
      width: '440px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
      data: {},
    });
  }

  abrirInversion(): void {
    this.dialogRef.close();
    this.dialog.open(CompraFormDialogComponent, {
      width: '480px',
      maxWidth: '94vw',
      panelClass: 'app-dialog',
      data: {},
    });
  }
}
