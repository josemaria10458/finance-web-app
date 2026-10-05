"""Acceso a Yahoo Finance.

Las cotizaciones se leen del endpoint `chart`, que no exige la cookie+crumb que
sí pide `v7/finance/quote`. Para la ficha detallada se usa `yfinance`, que ya
resuelve esa autenticación por su cuenta.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any

import httpx

from .cache import cache
from .config import TTL_DETAIL, TTL_FX, TTL_HISTORY, TTL_QUOTE, TTL_RESOLVE, TTL_SEARCH

CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
SEARCH_URL = "https://query2.finance.yahoo.com/v1/finance/search"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}

#: Sufijos de mercados que cotizan en euros. Trade Republic opera en EUR, así que
#: se prefieren para que el precio no haya que convertirlo.
EUR_SUFFIXES = (".DE", ".F", ".SG", ".MU", ".BE", ".HM", ".DU", ".MC", ".PA", ".AS", ".MI")

TIPOS_VALIDOS = {"ETF", "MUTUALFUND", "EQUITY", "CRYPTOCURRENCY", "INDEX"}

#: Intervalo adecuado para cada rango pedido al gráfico.
RANGOS = {
    "1d": "5m",
    "5d": "30m",
    "1mo": "1d",
    "3mo": "1d",
    "6mo": "1d",
    "ytd": "1d",
    "1y": "1d",
    "2y": "1wk",
    "5y": "1wk",
    "10y": "1mo",
    "max": "1mo",
}


class YahooError(RuntimeError):
    pass


_client: httpx.AsyncClient | None = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            headers=HEADERS,
            timeout=httpx.Timeout(15.0),
            follow_redirects=True,
        )
    return _client


async def close_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def _get_json(url: str, params: dict[str, Any]) -> dict[str, Any]:
    try:
        response = await get_client().get(url, params=params)
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as exc:
        raise YahooError(
            f"Yahoo Finance respondió {exc.response.status_code}"
        ) from exc
    except httpx.HTTPError as exc:
        raise YahooError("No se pudo contactar con Yahoo Finance") from exc


def _num(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value))
    except (TypeError, ValueError):
        return None


# --------------------------------------------------------------------------- #
# Búsqueda y resolución de ISIN
# --------------------------------------------------------------------------- #


def _mapear_resultado(quote: dict[str, Any]) -> dict[str, Any]:
    return {
        "simbolo": quote.get("symbol"),
        "nombre": quote.get("longname") or quote.get("shortname") or quote.get("symbol"),
        "tipo": quote.get("quoteType"),
        "tipoTexto": quote.get("typeDisp") or quote.get("quoteType"),
        "mercado": quote.get("exchDisp") or quote.get("exchange"),
        "moneda": quote.get("currency"),
    }


async def buscar(termino: str, limite: int = 15) -> list[dict[str, Any]]:
    clave = f"search:{termino.lower()}:{limite}"

    async def cargar() -> list[dict[str, Any]]:
        data = await _get_json(
            SEARCH_URL,
            {
                "q": termino,
                "quotesCount": limite,
                "newsCount": 0,
                "listsCount": 0,
                "enableFuzzyQuery": "false",
            },
        )
        salida: list[dict[str, Any]] = []
        for quote in data.get("quotes") or []:
            if quote.get("quoteType") not in TIPOS_VALIDOS:
                continue
            if not quote.get("symbol"):
                continue
            salida.append(_mapear_resultado(quote))
        return salida

    return await cache.get_or_set(clave, TTL_SEARCH, cargar)


def _puntuar_simbolo(simbolo: str, tipo: str | None) -> int:
    """Prioriza listados en euros y, dentro de ellos, Xetra."""
    puntos = 0
    if simbolo.endswith(".DE"):
        puntos += 10
    elif simbolo.endswith(EUR_SUFFIXES):
        puntos += 6
    elif "." not in simbolo:
        # Símbolo estadounidense o cripto: válido, pero cotiza en USD.
        puntos += 2
    if tipo in ("ETF", "MUTUALFUND"):
        puntos += 1
    return puntos


async def resolver_isin(isin: str) -> dict[str, Any] | None:
    """Traduce un ISIN (o ticker de cripto) al símbolo de Yahoo más adecuado."""
    clave = f"resolve:{isin.upper()}"

    async def cargar() -> dict[str, Any] | None:
        candidatos = await buscar(isin, limite=10)
        if not candidatos:
            return None
        mejor = max(
            candidatos,
            key=lambda c: _puntuar_simbolo(str(c["simbolo"]), c.get("tipo")),
        )
        return mejor

    return await cache.get_or_set(clave, TTL_RESOLVE, cargar)


# --------------------------------------------------------------------------- #
# Cotizaciones
# --------------------------------------------------------------------------- #


async def cotizacion(simbolo: str) -> dict[str, Any]:
    clave = f"quote:{simbolo.upper()}"

    async def cargar() -> dict[str, Any]:
        data = await _get_json(
            CHART_URL.format(symbol=simbolo),
            {"range": "5d", "interval": "1d", "includePrePost": "false"},
        )
        resultados = (data.get("chart") or {}).get("result") or []
        if not resultados:
            raise YahooError(f"Sin datos de mercado para {simbolo}")

        resultado = resultados[0]
        meta = resultado.get("meta") or {}
        precio = _num(meta.get("regularMarketPrice"))

        cierres = []
        indicadores = (resultado.get("indicators") or {}).get("quote") or [{}]
        for valor in indicadores[0].get("close") or []:
            numero = _num(valor)
            if numero is not None:
                cierres.append(numero)

        cierre_anterior = _num(meta.get("previousClose"))
        if cierre_anterior is None and len(cierres) >= 2:
            # El último cierre es el de hoy; el anterior es el de la sesión previa.
            cierre_anterior = cierres[-2]
        if cierre_anterior is None:
            cierre_anterior = _num(meta.get("chartPreviousClose"))
        if precio is None and cierres:
            precio = cierres[-1]

        variacion_pct = None
        if precio is not None and cierre_anterior:
            variacion_pct = (precio / cierre_anterior - 1) * 100

        return {
            "simbolo": meta.get("symbol") or simbolo.upper(),
            "nombre": meta.get("longName") or meta.get("shortName"),
            "precio": precio,
            "moneda": (meta.get("currency") or "").upper() or None,
            "cierreAnterior": cierre_anterior,
            "variacionDiaPct": variacion_pct,
            "mercado": meta.get("exchangeName"),
            "tipo": meta.get("instrumentType"),
            "actualizado": meta.get("regularMarketTime"),
        }

    return await cache.get_or_set(clave, TTL_QUOTE, cargar)


async def tipo_cambio(desde: str, hasta: str) -> float | None:
    """Tipo de cambio `desde`→`hasta` usando el par sintético de Yahoo."""
    desde = desde.upper()
    hasta = hasta.upper()
    if not desde or not hasta or desde == hasta:
        return 1.0

    clave = f"fx:{desde}{hasta}"

    async def cargar() -> float | None:
        try:
            quote = await cotizacion(f"{desde}{hasta}=X")
        except YahooError:
            return None
        return quote.get("precio")

    return await cache.get_or_set(clave, TTL_FX, cargar)


async def convertir(importe: float | None, desde: str | None, hasta: str) -> float | None:
    if importe is None or not desde:
        return None
    desde = desde.upper()
    if desde == hasta.upper():
        return importe
    # Algunas plazas cotizan en subunidades (peniques, céntimos).
    if desde in ("GBP0", "GBX", "GBP PENCE"):
        desde = "GBP"
        importe = importe / 100
    tasa = await tipo_cambio(desde, hasta)
    if tasa is None:
        return None
    return importe * tasa


# --------------------------------------------------------------------------- #
# Histórico y ficha detallada
# --------------------------------------------------------------------------- #


def _parsear_chart(data: dict[str, Any], simbolo: str, rango: str) -> dict[str, Any]:
    resultados = (data.get("chart") or {}).get("result") or []
    if not resultados:
        raise YahooError(f"Sin histórico para {simbolo}")

    resultado = resultados[0]
    meta = resultado.get("meta") or {}
    marcas = resultado.get("timestamp") or []
    indicadores = (resultado.get("indicators") or {}).get("quote") or [{}]
    cierres = indicadores[0].get("close") or []

    puntos = [
        {"t": int(marca), "c": _num(cierre)}
        for marca, cierre in zip(marcas, cierres)
        if _num(cierre) is not None
    ]
    return {
        "simbolo": meta.get("symbol") or simbolo.upper(),
        "moneda": (meta.get("currency") or "").upper() or None,
        "rango": rango,
        "puntos": puntos,
    }


async def historico(simbolo: str, rango: str = "1y") -> dict[str, Any]:
    rango = rango if rango in RANGOS else "1y"
    clave = f"history:{simbolo.upper()}:{rango}"

    async def cargar() -> dict[str, Any]:
        data = await _get_json(
            CHART_URL.format(symbol=simbolo),
            {"range": rango, "interval": RANGOS[rango]},
        )
        return _parsear_chart(data, simbolo, rango)

    return await cache.get_or_set(clave, TTL_HISTORY, cargar)


async def historico_desde(simbolo: str, desde: str) -> dict[str, Any]:
    """Cierres diarios desde una fecha concreta.

    `range` solo acepta ventanas predefinidas y las más largas vienen con
    granularidad semanal o mensual. La cartera necesita el detalle diario desde
    la primera compra, así que se piden las fechas exactas con `period1`.
    """
    clave = f"history-desde:{simbolo.upper()}:{desde}"

    async def cargar() -> dict[str, Any]:
        inicio = datetime.fromisoformat(desde).replace(tzinfo=timezone.utc)
        data = await _get_json(
            CHART_URL.format(symbol=simbolo),
            {
                "period1": int(inicio.timestamp()),
                "period2": int(datetime.now(tz=timezone.utc).timestamp()),
                "interval": "1d",
            },
        )
        return _parsear_chart(data, simbolo, f"desde {desde}")

    return await cache.get_or_set(clave, TTL_HISTORY, cargar)


def _a_porcentaje(value: Any) -> float | None:
    """Convierte una fracción (0,213) en puntos porcentuales (21,3)."""
    numero = _num(value)
    return None if numero is None else numero * 100


def _ficha_sincrona(simbolo: str) -> dict[str, Any]:
    """Parte de la ficha que depende de `yfinance` (bloqueante)."""
    import yfinance as yf

    ticker = yf.Ticker(simbolo)
    try:
        info = ticker.info or {}
    except Exception:  # noqa: BLE001 - yfinance lanza de todo
        info = {}

    salida: dict[str, Any] = {
        "nombre": info.get("longName") or info.get("shortName"),
        "tipo": info.get("quoteType"),
        "moneda": (info.get("currency") or "").upper() or None,
        "mercado": info.get("exchange"),
        "gestora": info.get("fundFamily"),
        "categoria": info.get("category"),
        # Yahoo da el TER de fondos europeos en puntos porcentuales (0.2 = 0,20 %).
        "terPct": _num(info.get("netExpenseRatio"))
        or _num(info.get("annualReportExpenseRatio")),
        "patrimonio": _num(info.get("totalAssets")),
        "rentabilidadYtdPct": _num(info.get("ytdReturn")),
        # Yahoo da el YTD en puntos porcentuales pero las medias a 3 y 5 años
        # como fracción (0,213 = 21,3 %).
        "rentabilidad3aPct": _a_porcentaje(info.get("threeYearAverageReturn")),
        "rentabilidad5aPct": _a_porcentaje(info.get("fiveYearAverageReturn")),
        "dividendoPct": _a_porcentaje(info.get("yield")),
        "beta": _num(info.get("beta3Year")) or _num(info.get("beta")),
        "per": _num(info.get("trailingPE")),
        "nav": _num(info.get("navPrice")),
        "sectores": None,
        "principalesPosiciones": None,
        "tiposActivo": None,
    }

    try:
        fondo = ticker.funds_data
        sectores = getattr(fondo, "sector_weightings", None)
        if isinstance(sectores, dict) and sectores:
            salida["sectores"] = [
                {"nombre": nombre, "pesoPct": (_num(peso) or 0) * 100}
                for nombre, peso in sorted(
                    sectores.items(), key=lambda kv: _num(kv[1]) or 0, reverse=True
                )
            ]

        activos = getattr(fondo, "asset_classes", None)
        if isinstance(activos, dict) and activos:
            salida["tiposActivo"] = [
                {"nombre": nombre, "pesoPct": (_num(peso) or 0) * 100}
                for nombre, peso in activos.items()
                if (_num(peso) or 0) > 0
            ]

        posiciones = getattr(fondo, "top_holdings", None)
        if posiciones is not None and not posiciones.empty:
            filas = posiciones.head(10).reset_index()
            salida["principalesPosiciones"] = [
                {
                    "simbolo": str(fila.get("Symbol") or ""),
                    "nombre": str(fila.get("Name") or ""),
                    "pesoPct": (_num(fila.get("Holding Percent")) or 0) * 100,
                }
                for fila in filas.to_dict("records")
            ]
    except Exception:  # noqa: BLE001 - la composición solo existe en fondos/ETFs
        pass

    return salida


async def ficha(simbolo: str) -> dict[str, Any]:
    clave = f"detail:{simbolo.upper()}"

    async def cargar() -> dict[str, Any]:
        return await asyncio.to_thread(_ficha_sincrona, simbolo)

    return await cache.get_or_set(clave, TTL_DETAIL, cargar)
