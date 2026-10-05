import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import {
  FichaInstrumento,
  HistoricoPrecios,
  RANGOS_HISTORICO,
  RangoHistorico,
  ResultadoBusqueda,
} from '../../core/models';
import { MercadoService } from '../../core/services/mercado.service';

@Component({
  selector: 'app-fondos',
  standalone: true,
  imports: [DecimalPipe, FormsModule, MatIconModule, MatTooltipModule],
  templateUrl: './fondos.component.html',
  styleUrl: './fondos.component.css',
})
export class FondosComponent implements OnInit {
  private readonly mercado = inject(MercadoService);
  private readonly ruta = inject(ActivatedRoute);

  readonly rangos = RANGOS_HISTORICO;
  readonly divisa = signal('USD');

  readonly consulta = signal('');
  readonly buscando = signal(false);
  readonly errorBusqueda = signal<string | null>(null);
  readonly resultados = signal<ResultadoBusqueda[]>([]);
  readonly busquedaHecha = signal(false);

  readonly ficha = signal<FichaInstrumento | null>(null);
  readonly cargandoFicha = signal(false);
  readonly errorFicha = signal<string | null>(null);

  readonly rango = signal<RangoHistorico>('1y');
  readonly historico = signal<HistoricoPrecios | null>(null);
  readonly cargandoHistorico = signal(false);

  /** TER preferido: el del KIID de Morningstar y, si no hay, el de Yahoo. */
  readonly terFicha = computed(() => {
    const f = this.ficha();
    if (!f) return null;
    return f.morningstar.terPct ?? f.yahoo.terPct ?? null;
  });

  readonly categoriaFicha = computed(() => {
    const f = this.ficha();
    if (!f) return null;
    return f.morningstar.categoria ?? f.yahoo.categoria ?? null;
  });

  /** Polilínea SVG del histórico, normalizada a una caja de 100 × 32. */
  readonly lineaHistorico = computed(() => {
    const puntos = this.historico()?.puntos ?? [];
    if (puntos.length < 2) return null;
    const valores = puntos.map((p) => p.c);
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const recorrido = max - min || 1;
    return puntos
      .map((p, i) => {
        const x = (i / (puntos.length - 1)) * 100;
        const y = 32 - ((p.c - min) / recorrido) * 32;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  });

  readonly variacionHistorico = computed(() => {
    const puntos = this.historico()?.puntos ?? [];
    if (puntos.length < 2) return null;
    const primero = puntos[0].c;
    const ultimo = puntos[puntos.length - 1].c;
    if (!primero) return null;
    return (ultimo / primero - 1) * 100;
  });

  ngOnInit(): void {
    // «Ver en bolsa» desde la cartera llega con el activo en la url.
    const q = this.ruta.snapshot.queryParamMap.get('q');
    if (q) {
      this.consulta.set(q);
      void this.abrirFicha(q);
    }
  }

  async buscar(): Promise<void> {
    const termino = this.consulta().trim();
    if (termino.length < 2) {
      this.errorBusqueda.set('Escribe al menos 2 caracteres.');
      return;
    }

    this.buscando.set(true);
    this.errorBusqueda.set(null);
    try {
      this.resultados.set(await this.mercado.buscar(termino));
      this.busquedaHecha.set(true);
    } catch (e) {
      this.resultados.set([]);
      this.errorBusqueda.set(
        e instanceof Error ? e.message : 'No se pudo buscar.'
      );
    } finally {
      this.buscando.set(false);
    }
  }

  async abrirFicha(identificador: string): Promise<void> {
    this.cargandoFicha.set(true);
    this.errorFicha.set(null);
    this.historico.set(null);
    try {
      const ficha = await this.mercado.ficha(identificador);
      this.ficha.set(ficha);
      this.divisa.set(ficha.cotizacion.divisaBase);
      await this.cargarHistorico();
    } catch (e) {
      this.ficha.set(null);
      this.errorFicha.set(
        e instanceof Error ? e.message : 'No se pudo cargar la ficha.'
      );
    } finally {
      this.cargandoFicha.set(false);
    }
  }

  cerrarFicha(): void {
    this.ficha.set(null);
    this.historico.set(null);
    this.errorFicha.set(null);
  }

  async cambiarRango(rango: RangoHistorico): Promise<void> {
    this.rango.set(rango);
    await this.cargarHistorico();
  }

  private async cargarHistorico(): Promise<void> {
    const f = this.ficha();
    if (!f) return;
    this.cargandoHistorico.set(true);
    try {
      this.historico.set(await this.mercado.historico(f.simbolo, this.rango()));
    } catch {
      // El gráfico es secundario; si falla no se bloquea la ficha.
      this.historico.set(null);
    } finally {
      this.cargandoHistorico.set(false);
    }
  }

  formatPct(value: number | null | undefined, digits = 2): string {
    if (value == null) return '—';
    return `${value >= 0 ? '+' : ''}${value.toFixed(digits)} %`;
  }

  formatPatrimonio(value: number | null | undefined): string {
    if (value == null) return '—';
    if (value >= 1e12) return `${(value / 1e12).toFixed(1)} T`;
    if (value >= 1e9) return `${(value / 1e9).toFixed(1)} B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(0)} M`;
    return value.toLocaleString('es-ES');
  }

  /** Nombres de sector que devuelve Yahoo, en castellano. */
  nombreSector(clave: string): string {
    const nombres: Record<string, string> = {
      technology: 'Tecnología',
      financial_services: 'Servicios financieros',
      healthcare: 'Salud',
      consumer_cyclical: 'Consumo cíclico',
      consumer_defensive: 'Consumo defensivo',
      industrials: 'Industria',
      communication_services: 'Comunicaciones',
      energy: 'Energía',
      basic_materials: 'Materiales',
      utilities: 'Servicios públicos',
      realestate: 'Inmobiliario',
      cashPosition: 'Efectivo',
      stockPosition: 'Acciones',
      bondPosition: 'Bonos',
      preferredPosition: 'Preferentes',
      convertiblePosition: 'Convertibles',
      otherPosition: 'Otros',
    };
    return nombres[clave] ?? clave;
  }
}
