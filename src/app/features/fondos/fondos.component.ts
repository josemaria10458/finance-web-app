import { DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChartConfiguration } from 'chart.js';
import { ChartPanelComponent } from '../../shared/charts/chart-panel.component';
import {
  FichaInstrumento,
  HistoricoComparado,
  HistoricoPrecios,
  LoteCartera,
  OrigenCartera,
  PosicionValorada,
  RANGOS_HISTORICO,
  RangoHistorico,
  ResultadoBusqueda,
  TotalesCartera,
  TrCartera,
} from '../../core/models';
import { InversionesService } from '../../core/services/inversiones.service';
import { MercadoService } from '../../core/services/mercado.service';
import {
  agruparPosiciones,
  conversorDesdeSerie,
  totalesCartera,
  valorarPosiciones,
} from '../../core/utils/cartera.utils';

type Pestana = 'cartera' | 'bolsa';
type FaseTradeRepublic = 'desconectado' | 'esperando-app' | 'codigo' | 'conectado';

/** Cada cuánto se pregunta al servidor si ya se aprobó el acceso en el móvil. */
const MS_SONDEO_TR = 2000;

/** Un color por serie del gráfico comparativo. */
const COLORES_SERIE: Record<string, string> = {
  cartera: '#1f6f66',
  '^GSPC': '#c9793b',
  URTH: '#5b7fb5',
};
const COLOR_SERIE_EXTRA = '#8a8f8d';

/** Divisa en la que están las operaciones importadas de Trade Republic. */
const DIVISA_OPERACIONES = 'EUR';

@Component({
  selector: 'app-fondos',
  standalone: true,
  imports: [
    ChartPanelComponent,
    DatePipe,
    DecimalPipe,
    FormsModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './fondos.component.html',
  styleUrl: './fondos.component.css',
})
export class FondosComponent implements OnInit, OnDestroy {
  private readonly mercado = inject(MercadoService);
  private readonly inversiones = inject(InversionesService);

  readonly pestana = signal<Pestana>('cartera');
  readonly rangos = RANGOS_HISTORICO;

  // ----------------------------------------------------------------------- //
  // Mi cartera
  // ----------------------------------------------------------------------- //

  readonly origen = signal<OrigenCartera>('importado');
  readonly cargandoCartera = signal(false);
  readonly errorCartera = signal<string | null>(null);
  readonly divisa = signal('USD');
  readonly actualizado = signal<Date | null>(null);

  readonly abiertas = this.inversiones.abiertas;
  readonly posiciones = signal<PosicionValorada[]>([]);
  readonly totales = computed(() => totalesCartera(this.posiciones()));

  readonly hayOperaciones = computed(() => this.abiertas().length > 0);

  // Evolución comparada con los índices
  readonly rangoCartera = signal<RangoHistorico>('1y');
  readonly comparativa = signal<HistoricoComparado | null>(null);
  readonly cargandoComparativa = signal(false);
  readonly errorComparativa = signal<string | null>(null);

  /** Lo mínimo que necesita la API para reconstruir la evolución. */
  private readonly lotes = computed<LoteCartera[]>(() =>
    this.abiertas()
      .map((o) => ({
        id: o.isin?.trim() || o.empresa.trim(),
        fecha: o.fechaOperacion,
        acciones: o.numeroAcciones,
      }))
      .filter((l) => l.id && l.fecha && l.acciones > 0)
  );

  readonly serieCartera = computed(
    () => this.comparativa()?.series.find((s) => s.clave === 'cartera') ?? null
  );

  readonly seriesIndices = computed(
    () => this.comparativa()?.series.filter((s) => s.clave !== 'cartera') ?? []
  );

  readonly datosComparativa = computed<ChartConfiguration['data'] | null>(() => {
    const datos = this.comparativa();
    if (!datos) return null;

    return {
      labels: datos.fechas,
      datasets: datos.series.map((serie) => {
        const color = COLORES_SERIE[serie.clave] ?? COLOR_SERIE_EXTRA;
        return {
          label: serie.nombre,
          data: serie.valores,
          borderColor: color,
          backgroundColor: color,
          borderWidth: serie.clave === 'cartera' ? 2.4 : 1.6,
          pointRadius: 0,
          pointHitRadius: 8,
          tension: 0.15,
          spanGaps: true,
        };
      }),
    };
  });

  readonly opcionesComparativa: ChartConfiguration['options'] = {
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
      tooltip: {
        callbacks: {
          // Las series van en base 100, así que lo útil es la variación.
          label: (item) => {
            const valor = item.parsed.y;
            if (valor == null) return `${item.dataset.label}: —`;
            return `${item.dataset.label}: ${(valor - 100).toFixed(2)} %`;
          },
        },
      },
    },
    scales: {
      x: { ticks: { maxTicksLimit: 8, autoSkip: true } },
      y: {
        ticks: {
          callback: (valor) => `${(Number(valor) - 100).toFixed(0)} %`,
        },
      },
    },
  };

  // Conexión real con Trade Republic
  readonly trFase = signal<FaseTradeRepublic>('desconectado');
  readonly trTelefono = signal('');
  readonly trPin = signal('');
  readonly trCodigo = signal('');
  readonly trMensaje = signal<string | null>(null);
  readonly trError = signal<string | null>(null);
  readonly trOcupado = signal(false);
  readonly trCartera = signal<TrCartera | null>(null);
  private trSessionId: string | null = null;
  private trSondeo: ReturnType<typeof setInterval> | null = null;

  /** Mismos totales que en el origen importado, con los datos que da TR. */
  readonly totalesTr = computed<TotalesCartera | null>(() => {
    const cartera = this.trCartera();
    if (!cartera) return null;

    let coste = 0;
    let valorMercado = 0;
    let sinPrecio = 0;
    for (const p of cartera.posiciones) {
      coste += p.costeTotal ?? 0;
      if (p.valorMercado != null) {
        valorMercado += p.valorMercado;
      } else {
        valorMercado += p.costeTotal ?? 0;
        sinPrecio += 1;
      }
    }

    const plusvalia = valorMercado - coste;
    return {
      coste,
      valorMercado,
      plusvalia,
      plusvaliaPct: coste > 0 ? (plusvalia / coste) * 100 : null,
      sinPrecio,
    };
  });

  // ----------------------------------------------------------------------- //
  // Bolsa
  // ----------------------------------------------------------------------- //

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

  // ----------------------------------------------------------------------- //

  ngOnInit(): void {
    if (this.hayOperaciones()) {
      void this.cargarCartera();
      void this.cargarComparativa();
    }
  }

  ngOnDestroy(): void {
    this.pararSondeoTr();
  }

  cambiarPestana(pestana: Pestana): void {
    this.pestana.set(pestana);
    if (pestana === 'cartera' && !this.posiciones().length && this.hayOperaciones()) {
      void this.cargarCartera();
      void this.cargarComparativa();
    }
  }

  cambiarOrigen(origen: OrigenCartera): void {
    this.origen.set(origen);
    this.errorCartera.set(null);
    if (origen === 'importado') {
      void this.cargarCartera();
    } else if (this.trFase() === 'conectado') {
      void this.cargarCarteraTradeRepublic();
    }
  }

  /** Valora las posiciones abiertas que vienen de los CSV/Excel importados. */
  async cargarCartera(): Promise<void> {
    const abiertas = this.abiertas();
    if (!abiertas.length) {
      this.posiciones.set([]);
      return;
    }

    this.cargandoCartera.set(true);
    this.errorCartera.set(null);
    try {
      const isins = [
        ...new Set(
          abiertas
            .map((o) => o.isin?.trim() || o.empresa.trim())
            .filter(Boolean)
        ),
      ];

      // El cambio se pide en paralelo asumiendo la divisa actual; si las
      // cotizaciones llegan en otra, la serie no sirve y se descarta.
      const divisaPrevista = this.divisa();
      const [cotizaciones, serieCambio] = await Promise.all([
        this.mercado.cotizaciones(isins),
        this.serieCambioSegura(divisaPrevista),
      ]);

      const divisa = [...cotizaciones.values()][0]?.divisaBase ?? divisaPrevista;
      this.divisa.set(divisa);

      const conversor =
        divisa === DIVISA_OPERACIONES || divisa !== divisaPrevista
          ? null
          : conversorDesdeSerie(serieCambio?.puntos ?? []);

      const posiciones = agruparPosiciones(abiertas, conversor);

      const precios = new Map(
        posiciones.map((p) => {
          const cotizacion =
            cotizaciones.get(p.clave.toUpperCase()) ??
            cotizaciones.get((p.isin ?? '').toUpperCase());
          return [
            p.clave,
            {
              precio: cotizacion?.precioBase ?? null,
              moneda: cotizacion?.divisaBase ?? null,
              variacionDiaPct: cotizacion?.variacionDiaPct ?? null,
              simbolo: cotizacion?.simbolo ?? null,
            },
          ];
        })
      );

      this.posiciones.set(valorarPosiciones(posiciones, precios));
      this.actualizado.set(new Date());

      if (!conversor && divisa !== DIVISA_OPERACIONES) {
        this.errorCartera.set(
          `No se pudo obtener el cambio ${DIVISA_OPERACIONES}/${divisa}, así que el coste se muestra en ${DIVISA_OPERACIONES} y la plusvalía no es comparable.`
        );
      }
    } catch (e) {
      this.posiciones.set([]);
      this.errorCartera.set(
        e instanceof Error ? e.message : 'No se pudo valorar la cartera.'
      );
    } finally {
      this.cargandoCartera.set(false);
    }
  }

  /**
   * Evolución de la cartera frente al S&P 500 y al MSCI World.
   *
   * Se calcula en el servidor encadenando las variaciones diarias y
   * descontando las aportaciones de cada día: sin eso, meter dinero nuevo
   * parecería una subida y la comparación con los índices no valdría.
   */
  async cargarComparativa(): Promise<void> {
    const lotes = this.lotes();
    if (!lotes.length) {
      this.comparativa.set(null);
      return;
    }

    this.cargandoComparativa.set(true);
    this.errorComparativa.set(null);
    try {
      this.comparativa.set(
        await this.mercado.historicoCartera(lotes, this.rangoCartera())
      );
    } catch (e) {
      this.comparativa.set(null);
      this.errorComparativa.set(
        e instanceof Error ? e.message : 'No se pudo calcular la evolución.'
      );
    } finally {
      this.cargandoComparativa.set(false);
    }
  }

  async cambiarRangoCartera(rango: RangoHistorico): Promise<void> {
    this.rangoCartera.set(rango);
    await this.cargarComparativa();
  }

  /** El cambio histórico es un extra: si falla, la cartera se muestra igual. */
  private async serieCambioSegura(divisa: string): Promise<HistoricoPrecios | null> {
    if (divisa === DIVISA_OPERACIONES) return null;
    try {
      return await this.mercado.serieCambio(DIVISA_OPERACIONES, divisa);
    } catch {
      return null;
    }
  }

  // ----------------------------------------------------------------------- //
  // Trade Republic
  // ----------------------------------------------------------------------- //

  async trEntrar(): Promise<void> {
    const telefono = this.trTelefono().trim();
    const pin = this.trPin().trim();
    if (!telefono || !pin) {
      this.trError.set('Indica el teléfono (con prefijo) y el PIN.');
      return;
    }

    this.trOcupado.set(true);
    this.trError.set(null);
    try {
      const res = await this.mercado.trLogin(telefono, pin);
      this.trSessionId = res.sessionId;
      this.trMensaje.set(res.mensaje);
      // El PIN ya no hace falta en el cliente.
      this.trPin.set('');

      if (res.metodo === 'app') {
        // No hay código que teclear: el aviso ya está en el móvil y el servidor
        // sondea hasta que se aprueba, así que aquí solo se vigila el estado.
        this.trFase.set('esperando-app');
        this.arrancarSondeoTr();
      } else {
        this.trFase.set('codigo');
      }
    } catch (e) {
      this.trError.set(
        e instanceof Error ? e.message : 'No se pudo iniciar sesión.'
      );
    } finally {
      this.trOcupado.set(false);
    }
  }

  async trConfirmar(): Promise<void> {
    if (!this.trSessionId) return;
    const codigo = this.trCodigo().trim();
    if (!codigo) {
      this.trError.set('Introduce el código de tu app de autenticación.');
      return;
    }

    this.trOcupado.set(true);
    this.trError.set(null);
    try {
      await this.mercado.trConfirmar(this.trSessionId, codigo);
      this.trCodigo.set('');
      this.trMensaje.set(null);
      this.trFase.set('conectado');
      await this.cargarCarteraTradeRepublic();
    } catch (e) {
      this.trError.set(
        e instanceof Error ? e.message : 'No se pudo validar el código.'
      );
    } finally {
      this.trOcupado.set(false);
    }
  }

  private arrancarSondeoTr(): void {
    this.pararSondeoTr();
    this.trSondeo = setInterval(() => void this.comprobarEstadoTr(), MS_SONDEO_TR);
  }

  private pararSondeoTr(): void {
    if (this.trSondeo !== null) {
      clearInterval(this.trSondeo);
      this.trSondeo = null;
    }
  }

  private async comprobarEstadoTr(): Promise<void> {
    const sessionId = this.trSessionId;
    if (!sessionId) {
      this.pararSondeoTr();
      return;
    }

    try {
      const { estado, mensaje } = await this.mercado.trEstado(sessionId);
      if (estado === 'confirmada') {
        this.pararSondeoTr();
        this.trMensaje.set(null);
        this.trFase.set('conectado');
        await this.cargarCarteraTradeRepublic();
      } else if (estado === 'error') {
        this.pararSondeoTr();
        this.trFase.set('desconectado');
        this.trMensaje.set(null);
        this.trSessionId = null;
        this.trError.set(
          mensaje ?? 'Trade Republic no confirmó el acceso. Vuelve a intentarlo.'
        );
      }
    } catch (e) {
      this.pararSondeoTr();
      this.trFase.set('desconectado');
      this.trSessionId = null;
      this.trError.set(
        e instanceof Error ? e.message : 'Se perdió la conexión con el servidor.'
      );
    }
  }

  async cargarCarteraTradeRepublic(): Promise<void> {
    if (!this.trSessionId) return;
    this.cargandoCartera.set(true);
    this.errorCartera.set(null);
    try {
      const cartera = await this.mercado.trCartera(this.trSessionId);
      this.trCartera.set(cartera);
      this.divisa.set(cartera.divisaBase);
      this.actualizado.set(new Date());
    } catch (e) {
      this.trCartera.set(null);
      this.errorCartera.set(
        e instanceof Error ? e.message : 'No se pudo leer la cartera.'
      );
    } finally {
      this.cargandoCartera.set(false);
    }
  }

  async trSalir(): Promise<void> {
    this.pararSondeoTr();
    if (this.trSessionId) {
      await this.mercado.trCerrarSesion(this.trSessionId);
    }
    this.trSessionId = null;
    this.trFase.set('desconectado');
    this.trCartera.set(null);
    this.trMensaje.set(null);
    this.trError.set(null);
    this.trTelefono.set('');
    this.trPin.set('');
    this.trCodigo.set('');
  }

  // ----------------------------------------------------------------------- //
  // Bolsa
  // ----------------------------------------------------------------------- //

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
      this.ficha.set(await this.mercado.ficha(identificador));
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
      this.historico.set(
        await this.mercado.historico(f.simbolo, this.rango())
      );
    } catch {
      // El gráfico es secundario; si falla no se bloquea la ficha.
      this.historico.set(null);
    } finally {
      this.cargandoHistorico.set(false);
    }
  }

  /** Abre directamente la ficha de una posición de la cartera. */
  async verEnBolsa(posicion: PosicionValorada): Promise<void> {
    const identificador = posicion.isin ?? posicion.simbolo;
    if (!identificador) return;
    this.pestana.set('bolsa');
    this.consulta.set(identificador);
    await this.abrirFicha(identificador);
  }

  // ----------------------------------------------------------------------- //

  colorSerie(clave: string): string {
    return COLORES_SERIE[clave] ?? COLOR_SERIE_EXTRA;
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
