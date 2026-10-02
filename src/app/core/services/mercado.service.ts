import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Cotizacion,
  FichaInstrumento,
  HistoricoPrecios,
  RangoHistorico,
  ResultadoBusqueda,
  TrCartera,
  TrLoginResultado,
} from '../models';

/** Máximo de identificadores que acepta `/quotes` en una sola llamada. */
const LOTE_COTIZACIONES = 50;

@Injectable({ providedIn: 'root' })
export class MercadoService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.marketApiBase.replace(/\/+$/, '');

  async buscar(termino: string, limite = 15): Promise<ResultadoBusqueda[]> {
    const url = `${this.base}/search`;
    const res = await this.pedir<{ resultados: ResultadoBusqueda[] }>(() =>
      firstValueFrom(
        this.http.get<{ resultados: ResultadoBusqueda[] }>(url, {
          params: { q: termino, limite },
        })
      )
    );
    return res.resultados ?? [];
  }

  /** Cotizaciones de varios ISIN o símbolos, troceadas en lotes. */
  async cotizaciones(ids: string[]): Promise<Map<string, Cotizacion>> {
    const unicos = [...new Set(ids.map((i) => i.trim()).filter(Boolean))];
    if (!unicos.length) return new Map();

    const lotes: string[][] = [];
    for (let i = 0; i < unicos.length; i += LOTE_COTIZACIONES) {
      lotes.push(unicos.slice(i, i + LOTE_COTIZACIONES));
    }

    const respuestas = await Promise.all(
      lotes.map((lote) =>
        this.pedir<{ cotizaciones: Cotizacion[] }>(() =>
          firstValueFrom(
            this.http.get<{ cotizaciones: Cotizacion[] }>(
              `${this.base}/quotes`,
              { params: { ids: lote.join(',') } }
            )
          )
        )
      )
    );

    const mapa = new Map<string, Cotizacion>();
    for (const respuesta of respuestas) {
      for (const cotizacion of respuesta.cotizaciones ?? []) {
        mapa.set(cotizacion.id.toUpperCase(), cotizacion);
      }
    }
    return mapa;
  }

  async ficha(identificador: string): Promise<FichaInstrumento> {
    return this.pedir<FichaInstrumento>(() =>
      firstValueFrom(
        this.http.get<FichaInstrumento>(
          `${this.base}/instrument/${encodeURIComponent(identificador)}`
        )
      )
    );
  }

  /**
   * Serie diaria de un par de divisas, para convertir importes históricos con
   * el cambio que había en su fecha.
   */
  async serieCambio(desde: string, hasta: string): Promise<HistoricoPrecios> {
    return this.pedir<HistoricoPrecios>(() =>
      firstValueFrom(
        this.http.get<HistoricoPrecios>(`${this.base}/fx/series`, {
          params: { desde, hasta, rango: '10y' },
        })
      )
    );
  }

  async historico(
    identificador: string,
    rango: RangoHistorico
  ): Promise<HistoricoPrecios> {
    return this.pedir<HistoricoPrecios>(() =>
      firstValueFrom(
        this.http.get<HistoricoPrecios>(
          `${this.base}/history/${encodeURIComponent(identificador)}`,
          { params: { rango } }
        )
      )
    );
  }

  // ----------------------------------------------------------------------- //
  // Trade Republic
  // ----------------------------------------------------------------------- //

  async trLogin(telefono: string, pin: string): Promise<TrLoginResultado> {
    return this.pedir<TrLoginResultado>(() =>
      firstValueFrom(
        this.http.post<TrLoginResultado>(`${this.base}/tr/login`, {
          telefono,
          pin,
        })
      )
    );
  }

  async trConfirmar(sessionId: string, codigo: string | null): Promise<void> {
    await this.pedir(() =>
      firstValueFrom(
        this.http.post(`${this.base}/tr/confirm`, { sessionId, codigo })
      )
    );
  }

  async trReenviarCodigo(sessionId: string): Promise<void> {
    await this.pedir(() =>
      firstValueFrom(this.http.post(`${this.base}/tr/resend`, { sessionId }))
    );
  }

  async trCartera(sessionId: string): Promise<TrCartera> {
    return this.pedir<TrCartera>(() =>
      firstValueFrom(
        this.http.post<TrCartera>(`${this.base}/tr/portfolio`, { sessionId })
      )
    );
  }

  async trCerrarSesion(sessionId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(`${this.base}/tr/logout`, { sessionId })
      );
    } catch {
      // Cerrar sesión es best-effort: si falla, caduca sola en el servidor.
    }
  }

  private async pedir<T>(peticion: () => Promise<T>): Promise<T> {
    try {
      return await peticion();
    } catch (err) {
      throw this.traducirError(err);
    }
  }

  private traducirError(err: unknown): Error {
    if (err instanceof HttpErrorResponse) {
      // El backend manda el motivo en `detail`; es más útil que el código.
      const detalle =
        typeof err.error?.detail === 'string' ? err.error.detail : null;
      if (err.status === 0) {
        return new Error(
          'No se pudo contactar con la API de mercado. Si está en el plan gratuito de Render, puede estar despertando: inténtalo en unos segundos.'
        );
      }
      if (err.status === 503) {
        return new Error(
          detalle ?? 'La API de mercado no tiene ese servicio activado.'
        );
      }
      return new Error(detalle ?? `La API de mercado respondió ${err.status}.`);
    }
    if (err instanceof Error) return err;
    return new Error('Error consultando la API de mercado.');
  }
}
