"""API de mercado para la app de finanzas.

Expone datos de Yahoo Finance y Morningstar (y, opcionalmente, la cartera real de
Trade Republic) para que el frontend Angular —que es estático y está publicado en
GitHub Pages— pueda consultarlos sin chocar con CORS.
"""

import asyncio
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import morningstar, trade_republic, yahoo
from .config import BASE_CURRENCY, CORS_ORIGINS, TR_ENABLED
from .trade_republic import TradeRepublicError
from .yahoo import YahooError


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await yahoo.close_client()


app = FastAPI(
    title="Finanzas · API de mercado",
    description="Cotizaciones, fichas de fondos/ETFs y cartera de Trade Republic.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "divisaBase": BASE_CURRENCY,
        "tradeRepublic": TR_ENABLED,
    }


# --------------------------------------------------------------------------- #
# Mercado
# --------------------------------------------------------------------------- #


@app.get("/search")
async def search(
    q: str = Query(min_length=2, description="ISIN, ticker o nombre"),
    limite: int = Query(15, ge=1, le=30),
) -> dict[str, Any]:
    try:
        return {"resultados": await yahoo.buscar(q, limite)}
    except YahooError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


async def _cotizacion_en_base(identificador: str) -> dict[str, Any]:
    """Cotización de un ISIN o símbolo, con el precio también en la divisa base."""
    identificador = identificador.strip()
    simbolo = identificador
    nombre_resuelto: str | None = None

    # Un ISIN tiene 12 caracteres alfanuméricos y no sirve como símbolo de Yahoo.
    if len(identificador) == 12 and identificador[:2].isalpha():
        resuelto = await yahoo.resolver_isin(identificador)
        if resuelto is None:
            return {
                "id": identificador,
                "isin": identificador,
                "simbolo": None,
                "precio": None,
                "precioBase": None,
                "moneda": None,
                "divisaBase": BASE_CURRENCY,
                "variacionDiaPct": None,
                "error": "No se encontró el activo en Yahoo Finance",
            }
        simbolo = str(resuelto["simbolo"])
        nombre_resuelto = resuelto.get("nombre")

    try:
        quote = await yahoo.cotizacion(simbolo)
    except YahooError as exc:
        return {
            "id": identificador,
            "isin": identificador if identificador != simbolo else None,
            "simbolo": simbolo,
            "precio": None,
            "precioBase": None,
            "moneda": None,
            "divisaBase": BASE_CURRENCY,
            "variacionDiaPct": None,
            "error": str(exc),
        }

    precio_base = await yahoo.convertir(
        quote.get("precio"), quote.get("moneda"), BASE_CURRENCY
    )

    return {
        "id": identificador,
        "isin": identificador if identificador != simbolo else None,
        "simbolo": quote.get("simbolo"),
        "nombre": quote.get("nombre") or nombre_resuelto,
        "precio": quote.get("precio"),
        "precioBase": precio_base,
        "moneda": quote.get("moneda"),
        "divisaBase": BASE_CURRENCY,
        "cierreAnterior": quote.get("cierreAnterior"),
        "variacionDiaPct": quote.get("variacionDiaPct"),
        "mercado": quote.get("mercado"),
        "tipo": quote.get("tipo"),
        "actualizado": quote.get("actualizado"),
    }


@app.get("/quotes")
async def quotes(
    ids: str = Query(
        description="ISINs o símbolos separados por coma (máx. 50)",
        examples=["IE00B4L5Y983,US08975B1098"],
    ),
) -> dict[str, Any]:
    identificadores = [i.strip() for i in ids.split(",") if i.strip()][:50]
    if not identificadores:
        raise HTTPException(status_code=400, detail="Sin identificadores")

    resultados = await asyncio.gather(
        *(_cotizacion_en_base(i) for i in identificadores),
        return_exceptions=True,
    )

    salida = []
    for identificador, resultado in zip(identificadores, resultados):
        if isinstance(resultado, BaseException):
            salida.append(
                {
                    "id": identificador,
                    "simbolo": None,
                    "precio": None,
                    "precioBase": None,
                    "divisaBase": BASE_CURRENCY,
                    "error": "No se pudo obtener la cotización",
                }
            )
        else:
            salida.append(resultado)

    return {"divisaBase": BASE_CURRENCY, "cotizaciones": salida}


@app.get("/history/{identificador}")
async def history(
    identificador: str,
    rango: str = Query("1y", description="1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, max"),
) -> dict[str, Any]:
    simbolo = identificador
    if len(identificador) == 12 and identificador[:2].isalpha():
        resuelto = await yahoo.resolver_isin(identificador)
        if resuelto is None:
            raise HTTPException(status_code=404, detail="Activo no encontrado")
        simbolo = str(resuelto["simbolo"])

    try:
        return await yahoo.historico(simbolo, rango)
    except YahooError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/fx/series")
async def fx_series(
    desde: str = Query(min_length=3, max_length=3),
    hasta: str = Query(min_length=3, max_length=3),
    rango: str = Query("10y"),
) -> dict[str, Any]:
    """Serie diaria de un par de divisas.

    La usa la cartera para convertir el coste de cada compra con el cambio que
    había en su fecha, en vez de aplicar el de hoy a operaciones antiguas.
    """
    desde = desde.upper()
    hasta = hasta.upper()
    if desde == hasta:
        return {"simbolo": f"{desde}{hasta}", "moneda": hasta, "rango": rango, "puntos": []}

    try:
        return await yahoo.historico(f"{desde}{hasta}=X", rango)
    except YahooError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/instrument/{identificador}")
async def instrument(identificador: str) -> dict[str, Any]:
    """Ficha completa: cotización + datos de Yahoo + datos de Morningstar."""
    identificador = identificador.strip()
    isin: str | None = None
    simbolo = identificador

    if len(identificador) == 12 and identificador[:2].isalpha():
        isin = identificador.upper()
        resuelto = await yahoo.resolver_isin(isin)
        if resuelto is None:
            raise HTTPException(status_code=404, detail="Activo no encontrado")
        simbolo = str(resuelto["simbolo"])

    cotizacion, ficha_yahoo, datos_ms = await asyncio.gather(
        _cotizacion_en_base(simbolo),
        yahoo.ficha(simbolo),
        morningstar.datos_fondo(isin) if isin else _vacio(),
    )

    if isin is None:
        # Con un símbolo suelto, Morningstar se consulta por el ISIN que devuelva Yahoo.
        isin = ficha_yahoo.get("isin")

    return {
        "simbolo": simbolo,
        "isin": isin,
        "cotizacion": cotizacion,
        "yahoo": ficha_yahoo,
        "morningstar": datos_ms,
    }


async def _vacio() -> dict[str, Any]:
    return {}


# --------------------------------------------------------------------------- #
# Trade Republic (opcional)
# --------------------------------------------------------------------------- #


class LoginRequest(BaseModel):
    telefono: str = Field(description="Con prefijo internacional, p. ej. +34600111222")
    pin: str


class ConfirmRequest(BaseModel):
    sessionId: str
    codigo: str | None = None


class SessionRequest(BaseModel):
    sessionId: str


def _exigir_tr() -> None:
    if not TR_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="La conexión con Trade Republic está desactivada en este servidor.",
        )


@app.post("/tr/login")
async def tr_login(body: LoginRequest) -> dict[str, Any]:
    _exigir_tr()
    try:
        return await trade_republic.iniciar_sesion(body.telefono, body.pin)
    except TradeRepublicError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/tr/confirm")
async def tr_confirm(body: ConfirmRequest) -> dict[str, Any]:
    _exigir_tr()
    try:
        return await trade_republic.confirmar_sesion(body.sessionId, body.codigo)
    except TradeRepublicError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/tr/resend")
async def tr_resend(body: SessionRequest) -> dict[str, Any]:
    _exigir_tr()
    try:
        return await trade_republic.reenviar_codigo(body.sessionId)
    except TradeRepublicError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/tr/logout")
async def tr_logout(body: SessionRequest) -> dict[str, Any]:
    return await trade_republic.cerrar_sesion(body.sessionId)


@app.post("/tr/portfolio")
async def tr_portfolio(body: SessionRequest) -> dict[str, Any]:
    _exigir_tr()
    try:
        cartera = await trade_republic.cartera(body.sessionId)
    except TradeRepublicError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Las posiciones de Trade Republic vienen en EUR, pero aun así se enriquecen
    # con la cotización para mostrar precio actual y variación del día.
    isins = [p["isin"] for p in cartera["posiciones"] if p.get("isin")]
    cotizaciones: dict[str, Any] = {}
    if isins:
        resultados = await asyncio.gather(
            *(_cotizacion_en_base(i) for i in isins), return_exceptions=True
        )
        for isin, resultado in zip(isins, resultados):
            if not isinstance(resultado, BaseException):
                cotizaciones[isin] = resultado

    for posicion in cartera["posiciones"]:
        cotizacion = cotizaciones.get(posicion.get("isin") or "")
        precio = (cotizacion or {}).get("precioBase")
        posicion["precioActual"] = precio
        posicion["simbolo"] = (cotizacion or {}).get("simbolo")
        posicion["variacionDiaPct"] = (cotizacion or {}).get("variacionDiaPct")
        acciones = posicion.get("acciones")
        if precio is not None and acciones is not None:
            posicion["valorMercado"] = precio * acciones
            if posicion.get("costeTotal") is not None:
                posicion["plusvalia"] = posicion["valorMercado"] - posicion["costeTotal"]
        else:
            posicion["valorMercado"] = None
            posicion["plusvalia"] = None

    cartera["divisaBase"] = BASE_CURRENCY
    return cartera
