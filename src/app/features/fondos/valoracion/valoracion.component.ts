import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChartConfiguration } from 'chart.js';
import {
  AnalisisValoracion,
  FormatoFila,
  MetodoValoracion,
  SupuestosValoracion,
} from '../../../core/models';
import { MercadoService } from '../../../core/services/mercado.service';
import {
  ESCENARIOS_MULTIPLO,
  EscenarioMultiplo,
  METODOS_VALORACION,
  ValoracionEscenario,
  proyectarValoracion,
  valorarEscenario,
} from '../../../core/utils/valoracion.utils';
import { ChartPanelComponent } from '../../../shared/charts/chart-panel.component';

type Vista = 'valoracion' | 'futura' | 'proyeccion' | 'historico';

interface FilaEscenario {
  escenario: EscenarioMultiplo;
  etiqueta: string;
  multiplo: number;
  valoracion: ValoracionEscenario;
}

interface BloqueMetodo {
  metodo: MetodoValoracion;
  etiqueta: string;
  /** Múltiplo al que cotiza hoy respecto a los resultados del último ejercicio. */
  implicitoHoy: number | null;
  filas: FilaEscenario[];
}

const COLORES_METODO: Record<MetodoValoracion, string> = {
  per: '#1f6f66',
  pfcf: '#c9793b',
  evEbitda: '#5b7fb5',
  evEbit: '#9a5bb5',
};

/** Supuestos que se introducen en porcentaje y se guardan como fracción. */
type SupuestoPct = 'crecimiento' | 'margenEbit' | 'tipoImpositivo' | 'variacionAcciones';

@Component({
  selector: 'app-valoracion',
  standalone: true,
  imports: [ChartPanelComponent, DecimalPipe, FormsModule, MatIconModule, MatTooltipModule],
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

  readonly escenarios = ESCENARIOS_MULTIPLO;
  /** Escenario de múltiplos que se dibuja en el gráfico de valoración futura. */
  readonly escenarioGrafico = signal<EscenarioMultiplo>('propio');

  /** Ejercicio real seguido de los cinco proyectados. */
  readonly aniosFuturos = computed(() => {
    const r = this.resultado();
    return r ? [r.actual, ...r.anios] : [];
  });

  /**
   * Hoja «Futuro Valoración»: precio objetivo de cada año con cada múltiplo y
   * escenario, su potencial frente al precio de hoy y la rentabilidad anual.
   */
  readonly bloquesFuturos = computed<BloqueMetodo[]>(() => {
    const a = this.analisis();
    const r = this.resultado();
    if (!a || !r || a.precioActual == null) return [];
    const precio = a.precioActual;
    return this.metodosAplicables().map(({ clave, etiqueta }) => ({
      metodo: clave,
      etiqueta,
      implicitoHoy: r.actual.implicitos[clave],
      filas: this.escenarios.flatMap(({ clave: escenario, etiqueta: nombre }) => {
        const multiplo = this.multiploEscenario(clave, escenario);
        if (multiplo == null) return [];
        return [{
          escenario,
          etiqueta: nombre,
          multiplo,
          valoracion: valorarEscenario(r, clave, multiplo, precio, a.sinEbit),
        }];
      }),
    }));
  });

  readonly datosGrafico = computed<ChartConfiguration['data'] | null>(() => {
    const a = this.analisis();
    const anios = this.aniosFuturos();
    if (!a || !anios.length || a.precioActual == null) return null;
    const escenario = this.escenarioGrafico();
    const series = this.bloquesFuturos().flatMap((bloque) => {
      const fila = bloque.filas.find((f) => f.escenario === escenario);
      if (!fila) return [];
      const color = COLORES_METODO[bloque.metodo];
      return [{
        label: `${bloque.etiqueta} ${this.formato(fila.multiplo, 'veces')}`,
        data: fila.valoracion.objetivos,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointRadius: 3,
        tension: 0.2,
      }];
    });
    return {
      labels: anios.map((x) => (x.real ? `${x.anio}` : `${x.anio}e`)),
      datasets: [
        ...series,
        {
          label: 'Precio actual',
          data: anios.map(() => a.precioActual),
          borderColor: '#8a8f8d',
          backgroundColor: '#8a8f8d',
          borderDash: [6, 4],
          borderWidth: 1.5,
          pointRadius: 0,
        },
      ],
    };
  });

  readonly opcionesGrafico: ChartConfiguration['options'] = {
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
      tooltip: {
        callbacks: {
          label: (item) => {
            const valor = item.parsed.y;
            if (valor == null) return `${item.dataset.label}: —`;
            return `${item.dataset.label}: ${this.formato(valor, 'precio')}`;
          },
        },
      },
    },
  };

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

  multiploEscenario(metodo: MetodoValoracion, escenario: EscenarioMultiplo): number | null {
    switch (escenario) {
      case 'propio':
        return this.supuestos()?.[metodo] ?? null;
      case 'historico':
        return this.historicoMultiplos()[metodo] ?? null;
      default:
        return this.analisis()?.referencias[metodo]?.[escenario] ?? null;
    }
  }

  setAjusteCapex(valor: number | null): void {
    if (valor == null || Number.isNaN(valor)) return;
    this.supuestos.update((s) => (s ? { ...s, ajusteCapex: valor } : s));
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
