import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  AnalisisValoracion,
  FormatoFila,
  MetodoValoracion,
  SupuestosValoracion,
} from '../../../core/models';
import { MercadoService } from '../../../core/services/mercado.service';
import {
  METODOS_VALORACION,
  proyectarValoracion,
} from '../../../core/utils/valoracion.utils';

type Vista = 'valoracion' | 'proyeccion' | 'historico';

/** Supuestos que se introducen en porcentaje y se guardan como fracción. */
type SupuestoPct = 'crecimiento' | 'margenEbit' | 'tipoImpositivo' | 'variacionAcciones';

@Component({
  selector: 'app-valoracion',
  standalone: true,
  imports: [DecimalPipe, FormsModule, MatIconModule, MatTooltipModule],
  templateUrl: './valoracion.component.html',
  styleUrl: './valoracion.component.css',
})
export class ValoracionComponent {
  private readonly mercado = inject(MercadoService);

  /** Símbolo de Yahoo de la acción a valorar. */
  readonly simbolo = input.required<string>();

  readonly metodos = METODOS_VALORACION;
  readonly vista = signal<Vista>('valoracion');

  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly analisis = signal<AnalisisValoracion | null>(null);
  readonly supuestos = signal<SupuestosValoracion | null>(null);

  readonly resultado = computed(() => {
    const a = this.analisis();
    const s = this.supuestos();
    return a && s ? proyectarValoracion(a, s) : null;
  });

  /** Métodos aplicables: sin EBIT (bancos) no hay múltiplos sobre EV. */
  readonly metodosAplicables = computed(() =>
    this.analisis()?.sinEbit
      ? this.metodos.filter((m) => m.clave === 'per' || m.clave === 'pfcf')
      : this.metodos
  );

  readonly potencial = computed(() => {
    const precio = this.analisis()?.precioActual;
    const objetivo = this.resultado()?.objetivoMedio5;
    if (precio == null || objetivo == null || precio <= 0) return null;
    return objetivo / precio - 1;
  });

  /** Mediana histórica de cada múltiplo, para orientar al elegir uno. */
  readonly historicoMultiplos = computed(() => {
    const salida: Partial<Record<MetodoValoracion, number | null>> = {};
    const filas = this.analisis()?.grupos.flatMap((g) => g.filas) ?? [];
    for (const { clave } of this.metodos) {
      const valores = (filas.find((f) => f.clave === clave)?.valores ?? [])
        .filter((v): v is number => v != null && v > 0)
        .sort((a, b) => a - b);
      salida[clave] = valores.length ? valores[Math.floor(valores.length / 2)] : null;
    }
    return salida;
  });

  private peticion = 0;

  constructor() {
    effect(() => {
      void this.cargar(this.simbolo());
    });
  }

  private async cargar(simbolo: string): Promise<void> {
    const id = ++this.peticion;
    this.cargando.set(true);
    this.error.set(null);
    this.analisis.set(null);
    this.supuestos.set(null);
    try {
      const analisis = await this.mercado.valoracion(simbolo);
      if (id !== this.peticion) return;
      this.analisis.set(analisis);
      this.supuestos.set({ ...analisis.supuestos });
    } catch (e) {
      if (id !== this.peticion) return;
      this.error.set(
        e instanceof Error ? e.message : 'No se pudo cargar el análisis de la empresa.'
      );
    } finally {
      if (id === this.peticion) this.cargando.set(false);
    }
  }

  setVista(vista: Vista): void {
    this.vista.set(vista);
  }

  pct(clave: SupuestoPct): number {
    const valor = this.supuestos()?.[clave] ?? 0;
    return Math.round(valor * 10000) / 100;
  }

  setPct(clave: SupuestoPct, valor: number | null): void {
    if (valor == null || Number.isNaN(valor)) return;
    this.supuestos.update((s) => (s ? { ...s, [clave]: valor / 100 } : s));
  }

  multiplo(clave: MetodoValoracion): number {
    return this.supuestos()?.[clave] ?? 0;
  }

  setMultiplo(clave: MetodoValoracion, valor: number | null): void {
    if (valor == null || Number.isNaN(valor) || valor < 0) return;
    this.supuestos.update((s) => (s ? { ...s, [clave]: valor } : s));
  }

  restablecer(): void {
    const a = this.analisis();
    if (a) this.supuestos.set({ ...a.supuestos });
  }

  formato(valor: number | null | undefined, formato: FormatoFila): string {
    if (valor == null || !Number.isFinite(valor)) return '—';
    switch (formato) {
      case 'pct':
        return `${(valor * 100).toLocaleString('es-ES', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })} %`;
      case 'veces':
        return `${valor.toLocaleString('es-ES', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}x`;
      case 'precio':
        return valor.toLocaleString('es-ES', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      default:
        return valor.toLocaleString('es-ES', { maximumFractionDigits: 0 });
    }
  }

  formatPct(valor: number | null | undefined): string {
    if (valor == null || !Number.isFinite(valor)) return '—';
    const texto = (valor * 100).toLocaleString('es-ES', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    return `${valor > 0 ? '+' : ''}${texto} %`;
  }
}
