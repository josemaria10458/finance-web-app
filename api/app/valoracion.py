"""Análisis por múltiplos de una empresa a partir de sus cuentas anuales.

Reproduce la hoja «Análisis Ratios» de la plantilla de valoración: cuenta de
resultados, balance y flujos de caja de los últimos ejercicios, los ratios que
se derivan de ellos y unos supuestos de partida para proyectar. La proyección y
los precios objetivo se calculan en el navegador, porque dependen de los
supuestos que el usuario va tocando.

Todos los importes salen en millones y en la divisa en la que cotiza la acción,
aunque la empresa presente sus cuentas en otra (Alibaba reporta en yuanes y
cotiza en dólares): cada ejercicio se convierte con el cambio de su fecha de
cierre, que es el que corresponde al precio de ese mismo día.
"""

import asyncio
import bisect
import math
from datetime import date, datetime, timedelta, timezone
from statistics import median
from typing import Any

from . import yahoo
from .cache import cache
from .config import TTL_DETAIL
from .yahoo import YahooError

MILLON = 1_000_000

#: Tipo impositivo con el que la plantilla calcula el ROIC.
TIPO_ROIC = 0.225

#: Múltiplos de referencia de la plantilla: bajo, medio, alto y media de bolsas.
REFERENCIAS_MULTIPLOS = {
    "per": {"bajo": 10, "medio": 15, "alto": 20, "mediaBolsas": 16},
    "pfcf": {"bajo": 10, "medio": 15, "alto": 20, "mediaBolsas": 16},
    "evEbitda": {"bajo": 6, "medio": 10, "alto": 15, "mediaBolsas": 10},
    "evEbit": {"bajo": 8, "medio": 12, "alto": 17, "mediaBolsas": 12},
}


class ValoracionError(RuntimeError):
    pass


def _num(valor: Any) -> float | None:
    if valor is None or isinstance(valor, bool):
        return None
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(numero) or math.isinf(numero) else numero


def _fila(df: Any, *nombres: str) -> dict[str, float]:
    """Primera fila del estado que exista, indexada por fecha de cierre."""
    if df is None or getattr(df, "empty", True):
        return {}
    for nombre in nombres:
        if nombre in df.index:
            salida = {}
            for columna, valor in df.loc[nombre].items():
                numero = _num(valor)
                if numero is not None:
                    salida[columna.date().isoformat()] = numero
            if salida:
                return salida
    return {}


def _estados_sincronos(simbolo: str) -> dict[str, Any]:
    import yfinance as yf

    ticker = yf.Ticker(simbolo)
    try:
        info = ticker.info or {}
    except Exception:  # noqa: BLE001 - yfinance lanza de todo
        info = {}

    try:
        pyg, balance, flujos = ticker.income_stmt, ticker.balance_sheet, ticker.cashflow
    except Exception as exc:  # noqa: BLE001
        raise ValoracionError(f"Yahoo no devolvió las cuentas de {simbolo}") from exc

    filas = {
        "acciones": _fila(pyg, "Diluted Average Shares", "Basic Average Shares"),
        "ventas": _fila(pyg, "Total Revenue", "Operating Revenue"),
        "costeVentas": _fila(pyg, "Cost Of Revenue", "Reconciled Cost Of Revenue"),
        "ebit": _fila(pyg, "Operating Income", "Total Operating Income As Reported"),
        "amortizaciones": _fila(
            pyg, "Reconciled Depreciation", "Depreciation And Amortization In Income Statement"
        ),
        "beneficioAntesImpuestos": _fila(pyg, "Pretax Income"),
        "extraordinarios": _fila(pyg, "Total Unusual Items"),
        "beneficioNeto": _fila(pyg, "Net Income Common Stockholders", "Net Income"),
        "activoCorriente": _fila(balance, "Current Assets"),
        "activoTotal": _fila(balance, "Total Assets"),
        "patrimonio": _fila(balance, "Stockholders Equity", "Common Stock Equity"),
        "pasivoCorriente": _fila(balance, "Current Liabilities"),
        "deudaTotal": _fila(balance, "Total Debt"),
        "caja": _fila(balance, "Cash And Cash Equivalents"),
        "cajaEInversionesCp": _fila(
            balance, "Cash Cash Equivalents And Short Term Investments"
        ),
        "fondoComercio": _fila(balance, "Goodwill"),
        "flujoOperativo": _fila(flujos, "Operating Cash Flow"),
        "flujoInversion": _fila(flujos, "Investing Cash Flow"),
        "flujoFinanciacion": _fila(flujos, "Financing Cash Flow"),
        "capex": _fila(flujos, "Capital Expenditure"),
        "dividendosPagados": _fila(flujos, "Cash Dividends Paid"),
        "amortizacionesFlujo": _fila(flujos, "Depreciation And Amortization"),
    }

    return {
        "info": {
            "nombre": info.get("longName") or info.get("shortName"),
            "tipo": info.get("quoteType"),
            "sector": info.get("sector"),
            "industria": info.get("industry"),
            "descripcion": info.get("longBusinessSummary"),
            "empleados": _num(info.get("fullTimeEmployees")),
            "mercado": info.get("exchange"),
            "divisa": (info.get("currency") or "").upper() or None,
            "divisaEstados": (info.get("financialCurrency") or "").upper() or None,
            "precio": _num(info.get("currentPrice")) or _num(info.get("regularMarketPrice")),
            "accionesEnCirculacion": _num(info.get("sharesOutstanding")),
        },
        "filas": filas,
    }


def _cierre_en(fechas: list[str], valores: list[float], dia: str) -> float | None:
    """Último cierre conocido en o antes de `dia`."""
    posicion = bisect.bisect_right(fechas, dia) - 1
    return valores[posicion] if posicion >= 0 else None


async def _cierres_diarios(simbolo: str, desde: str) -> tuple[list[str], list[float]]:
    try:
        datos = await yahoo.historico_desde(simbolo, desde)
    except YahooError:
        return [], []
    fechas, valores = [], []
    for punto in datos["puntos"]:
        fechas.append(datetime.fromtimestamp(punto["t"], tz=timezone.utc).date().isoformat())
        valores.append(punto["c"])
    return fechas, valores


def _var(actual: float | None, anterior: float | None) -> float | None:
    if actual is None or anterior is None or anterior == 0:
        return None
    return (actual - anterior) / abs(anterior)


def _cagr(primero: float | None, ultimo: float | None, periodos: int) -> float | None:
    if primero is None or ultimo is None or periodos <= 0 or primero <= 0 or ultimo <= 0:
        return None
    return (ultimo / primero) ** (1 / periodos) - 1


def _div(a: float | None, b: float | None) -> float | None:
    if a is None or b is None or b == 0:
        return None
    return a / b


def _suma(*valores: float | None) -> float | None:
    if any(v is None for v in valores):
        return None
    return sum(valores)  # type: ignore[arg-type]


def _resta(a: float | None, *b: float | None) -> float | None:
    """`a - b1 - b2…`, o nada si falta alguno (los bancos no tienen activo corriente)."""
    if a is None or any(v is None for v in b):
        return None
    return a - sum(b)  # type: ignore[arg-type]


def _redondear(valor: float, paso: float) -> float:
    return round(round(valor / paso) * paso, 6)


def _acotar(valor: float, minimo: float, maximo: float) -> float:
    return max(minimo, min(maximo, valor))


def _mediana_positiva(valores: list[float | None]) -> float | None:
    utiles = [v for v in valores if v is not None and v > 0]
    return median(utiles) if utiles else None


async def analisis(simbolo: str) -> dict[str, Any]:
    clave = f"valoracion:{simbolo.upper()}"

    async def cargar() -> dict[str, Any]:
        return await _construir(simbolo)

    return await cache.get_or_set(clave, TTL_DETAIL, cargar)


async def _construir(simbolo: str) -> dict[str, Any]:
    datos = await asyncio.to_thread(_estados_sincronos, simbolo)
    info, filas = datos["info"], datos["filas"]

    if info.get("tipo") not in (None, "EQUITY"):
        raise ValoracionError("El análisis por múltiplos solo tiene sentido para acciones.")

    # Los ejercicios son los que traen ventas; el resto de estados se cruzan por fecha.
    cierres = sorted(filas["ventas"])
    if len(cierres) < 2:
        raise ValoracionError(f"Yahoo no tiene suficientes cuentas anuales de {simbolo}.")

    divisa = info.get("divisa") or "USD"
    divisa_estados = info.get("divisaEstados") or divisa
    inicio = (date.fromisoformat(cierres[0]) - timedelta(days=15)).isoformat()

    precios_fut = _cierres_diarios(simbolo, inicio)
    cambio_fut = (
        _cierres_diarios(f"{divisa_estados}{divisa}=X", inicio)
        if divisa_estados != divisa
        else None
    )
    fechas_precio, precios = await precios_fut
    cambio_hoy = 1.0
    cambios: list[float | None] = [1.0] * len(cierres)
    avisos: list[str] = []

    if cambio_fut is not None:
        fechas_fx, valores_fx = await cambio_fut
        cambio_hoy = await yahoo.tipo_cambio(divisa_estados, divisa) or 0.0
        cambios = [_cierre_en(fechas_fx, valores_fx, dia) or cambio_hoy or None for dia in cierres]
        if any(c is None for c in cambios):
            raise ValoracionError(
                f"No se pudo obtener el cambio {divisa_estados}/{divisa} para convertir las cuentas."
            )
        avisos.append(
            f"La empresa presenta sus cuentas en {divisa_estados}; se han convertido a {divisa} "
            "con el cambio de la fecha de cierre de cada ejercicio."
        )

    def serie(nombre: str, convertir: bool = True) -> list[float | None]:
        datos_fila = filas[nombre]
        salida: list[float | None] = []
        for dia, cambio in zip(cierres, cambios):
            valor = datos_fila.get(dia)
            if valor is None:
                salida.append(None)
            elif convertir:
                salida.append(valor * (cambio or 1.0) / MILLON)
            else:
                salida.append(valor / MILLON)
        return salida

    acciones = serie("acciones", convertir=False)
    precio = [_cierre_en(fechas_precio, precios, dia) for dia in cierres]

    # Algunas empresas extranjeras dan las acciones ordinarias mientras que en
    # bolsa americana cotiza un ADR que agrupa varias: se reescala a la unidad
    # que cotiza comparándolo con las acciones en circulación de hoy.
    en_circulacion = info.get("accionesEnCirculacion")
    ultimas = next((a for a in reversed(acciones) if a), None)
    if en_circulacion and ultimas:
        proporcion = (en_circulacion / MILLON) / ultimas
        if proporcion < 0.5 or proporcion > 2:
            acciones = [a * proporcion if a is not None else None for a in acciones]
            avisos.append(
                "El número de acciones de las cuentas no está en la misma unidad que la "
                "cotización (habitual en ADR); se ha reescalado a las acciones en circulación."
            )

    ventas = serie("ventas")
    coste = [-abs(v) if v is not None else None for v in serie("costeVentas")]
    ebit = serie("ebit")
    amortizaciones = serie("amortizaciones")
    amortizaciones_flujo = serie("amortizacionesFlujo")
    amortizaciones = [a if a is not None else b for a, b in zip(amortizaciones, amortizaciones_flujo)]
    ebitda = [_suma(e, a) for e, a in zip(ebit, amortizaciones)]
    bai = serie("beneficioAntesImpuestos")
    extraordinarios = [e or 0.0 for e in serie("extraordinarios")]
    # Los extraordinarios vienen con signo, así que restarlos los deshace.
    bai_sin_extra = [_resta(b, e) for b, e in zip(bai, extraordinarios)]
    beneficio_neto = serie("beneficioNeto")

    activo_corriente = serie("activoCorriente")
    activo_total = serie("activoTotal")
    patrimonio = serie("patrimonio")
    pasivo_corriente = serie("pasivoCorriente")
    deuda_total = serie("deudaTotal")
    caja = serie("caja")
    caja_inv = serie("cajaEInversionesCp")
    caja_inv = [ci if ci is not None else c for ci, c in zip(caja_inv, caja)]
    inversiones_cp = [_resta(ci, c) for ci, c in zip(caja_inv, caja)]
    deuda_neta = [_resta(d or 0.0, ci) for d, ci in zip(deuda_total, caja_inv)]
    fondo_comercio = serie("fondoComercio")

    flujo_operativo = serie("flujoOperativo")
    flujo_inversion = serie("flujoInversion")
    flujo_financiacion = serie("flujoFinanciacion")
    capex = [-abs(c) if c is not None else None for c in serie("capex")]
    fcf = [_suma(f, c) for f, c in zip(flujo_operativo, capex)]
    dividendos = serie("dividendosPagados")
    dpa = [_div(abs(d), a) if d is not None else None for d, a in zip(dividendos, acciones)]

    capitalizacion = [p * a if p is not None and a is not None else None for p, a in zip(precio, acciones)]
    ev = [_suma(c, d) for c, d in zip(capitalizacion, deuda_neta)]
    bruto = [_suma(v, c) for v, c in zip(ventas, coste)]
    bpa = [_div(b, a) for b, a in zip(beneficio_neto, acciones)]
    activo_no_corriente = [_resta(t, c) for t, c in zip(activo_total, activo_corriente)]
    pasivo_no_corriente = [
        _resta(t, p, c) for t, p, c in zip(activo_total, patrimonio, pasivo_corriente)
    ]
    fondo_maniobra = [_resta(a, p) for a, p in zip(activo_corriente, pasivo_corriente)]
    intereses = [_resta(e, b) for e, b in zip(ebit, bai_sin_extra)]
    capital_invertido = [_suma(p, d) for p, d in zip(patrimonio, deuda_neta)]

    def ratio(a: list[float | None], b: list[float | None]) -> list[float | None]:
        return [_div(x, y) for x, y in zip(a, b)]

    cobertura = []
    for e, i in zip(ebit, intereses):
        valor = _div(e, i)
        cobertura.append(valor if valor is not None and valor >= 0 else None)

    grupos = [
        ("Mercado", [
            ("acciones", "Acciones diluidas (M)", acciones, "numero"),
            ("precio", "Precio al cierre del ejercicio", precio, "precio"),
            ("capitalizacion", "Capitalización", capitalizacion, "importe"),
            ("ev", "Valor empresa (EV)", ev, "importe"),
        ]),
        ("Cuenta de resultados", [
            ("ventas", "Ventas", ventas, "importe"),
            ("costeVentas", "Coste de ventas", coste, "importe"),
            ("margenBruto", "Margen bruto", bruto, "importe"),
            ("ebitda", "EBITDA", ebitda, "importe"),
            ("ebit", "EBIT (resultado operativo)", ebit, "importe"),
            ("baiSinExtra", "BAI sin extraordinarios", bai_sin_extra, "importe"),
            ("beneficioNeto", "Beneficio neto", beneficio_neto, "importe"),
            ("bpa", "BPA", bpa, "precio"),
        ]),
        ("Balance", [
            ("activoNoCorriente", "Activo no corriente", activo_no_corriente, "importe"),
            ("activoCorriente", "Activo corriente", activo_corriente, "importe"),
            ("activoTotal", "Activo total", activo_total, "importe"),
            ("patrimonio", "Patrimonio neto", patrimonio, "importe"),
            ("pasivoNoCorriente", "Pasivo no corriente", pasivo_no_corriente, "importe"),
            ("pasivoCorriente", "Pasivo corriente", pasivo_corriente, "importe"),
            ("fondoManiobra", "Fondo de maniobra", fondo_maniobra, "importe"),
            ("deudaTotal", "Deuda total", deuda_total, "importe"),
            ("deudaNeta", "Deuda neta", deuda_neta, "importe"),
            ("caja", "Caja y equivalentes", caja, "importe"),
            ("inversionesCp", "Inversiones a corto plazo", inversiones_cp, "importe"),
        ]),
        ("Flujos de caja", [
            ("flujoOperativo", "Flujo de operaciones", flujo_operativo, "importe"),
            ("flujoInversion", "Flujo de inversión", flujo_inversion, "importe"),
            ("flujoFinanciacion", "Flujo de financiación", flujo_financiacion, "importe"),
            ("capex", "Capex", capex, "importe"),
            ("fcf", "Flujo de caja libre", fcf, "importe"),
            ("dpa", "Dividendo por acción", dpa, "precio"),
        ]),
        ("Márgenes", [
            ("margenBrutoPct", "Margen bruto", ratio(bruto, ventas), "pct"),
            ("margenEbitdaPct", "Margen EBITDA", ratio(ebitda, ventas), "pct"),
            ("margenEbitPct", "Margen EBIT", ratio(ebit, ventas), "pct"),
            ("margenBaiPct", "Margen BAI", ratio(bai_sin_extra, ventas), "pct"),
            ("margenNetoPct", "Margen neto", ratio(beneficio_neto, ventas), "pct"),
        ]),
        ("Rentabilidad", [
            ("roe", "ROE", ratio(beneficio_neto, patrimonio), "pct"),
            ("roa", "ROA", ratio(beneficio_neto, activo_total), "pct"),
            ("roce", "ROCE", [
                _div(e, _resta(t, c)) for e, t, c in zip(ebit, activo_total, pasivo_corriente)
            ], "pct"),
            ("roic", "ROIC", [
                _div(e * (1 - TIPO_ROIC), c) if e is not None else None
                for e, c in zip(ebit, capital_invertido)
            ], "pct"),
        ]),
        ("Deuda", [
            ("deudaCapital", "Deuda / capital", [
                _div(d, _suma(d, p)) for d, p in zip(deuda_total, patrimonio)
            ], "pct"),
            ("deudaPatrimonio", "Deuda / patrimonio", ratio(deuda_total, patrimonio), "veces"),
            ("deudaNetaEbitda", "Deuda neta / EBITDA", ratio(deuda_neta, ebitda), "veces"),
            ("coberturaIntereses", "Cobertura de intereses", cobertura, "veces"),
            ("liquidez", "Ratio de liquidez", ratio(activo_corriente, pasivo_corriente), "veces"),
        ]),
        ("Valoración", [
            ("per", "PER", ratio(precio, bpa), "veces"),
            ("pfcf", "Precio / FCF", ratio(capitalizacion, fcf), "veces"),
            ("evEbitda", "EV / EBITDA", ratio(ev, ebitda), "veces"),
            ("evEbit", "EV / EBIT", ratio(ev, ebit), "veces"),
            ("fcfYield", "Rentabilidad FCF", ratio(fcf, capitalizacion), "pct"),
            ("rentabilidadDividendo", "Rentabilidad por dividendo", ratio(dpa, precio), "pct"),
            ("payout", "Payout", ratio(dpa, bpa), "pct"),
        ]),
        ("Eficiencia", [
            ("rotacionFondoManiobra", "Ventas / fondo de maniobra", ratio(ventas, fondo_maniobra), "veces"),
            ("ventasCapitalInvertido", "Ventas / capital invertido", ratio(ventas, capital_invertido), "veces"),
        ]),
    ]

    periodos = len(cierres) - 1
    salida_grupos = []
    por_clave: dict[str, list[float | None]] = {}
    for titulo, filas_grupo in grupos:
        salida_filas = []
        for clave, etiqueta, valores, formato in filas_grupo:
            por_clave[clave] = valores
            tendencia = formato in ("importe", "numero", "precio")
            salida_filas.append({
                "clave": clave,
                "etiqueta": etiqueta,
                "formato": formato,
                "valores": valores,
                "varAnual": _var(valores[-1], valores[-2]) if tendencia else None,
                "cagr": _cagr(valores[0], valores[-1], periodos) if tendencia else None,
            })
        salida_grupos.append({"titulo": titulo, "filas": salida_filas})

    # Bancos y aseguradoras no presentan resultado operativo: se proyecta desde
    # el beneficio antes de impuestos y los múltiplos sobre EV no aplican.
    sin_ebit = ebit[-1] is None
    if sin_ebit:
        avisos.append(
            "La empresa no presenta resultado operativo (habitual en bancos y aseguradoras): "
            "la proyección parte del margen antes de impuestos y no se valora por EV/EBITDA ni EV/EBIT."
        )

    supuestos = _supuestos(por_clave, periodos, sin_ebit)

    precio_actual = info.get("precio") or next((p for p in reversed(precios) if p), None)
    acciones_hoy = (en_circulacion / MILLON) if en_circulacion else acciones[-1]

    return {
        "simbolo": simbolo.upper(),
        "nombre": info.get("nombre"),
        "sector": info.get("sector"),
        "industria": info.get("industria"),
        "descripcion": info.get("descripcion"),
        "mercado": info.get("mercado"),
        "empleados": info.get("empleados"),
        "divisa": divisa,
        "divisaEstados": divisa_estados,
        "cambioHoy": cambio_hoy if divisa_estados != divisa else None,
        "precioActual": precio_actual,
        "accionesActuales": acciones_hoy,
        "ejercicios": [date.fromisoformat(d).year for d in cierres],
        "fechasCierre": cierres,
        "grupos": salida_grupos,
        "sinEbit": sin_ebit,
        "base": {
            "ventas": ventas[-1],
            "amortizaciones": 0.0 if sin_ebit else amortizaciones[-1] or 0.0,
            "ebit": bai_sin_extra[-1] if sin_ebit else ebit[-1],
            "intereses": 0.0 if sin_ebit else intereses[-1] or 0.0,
            "capex": abs(capex[-1]) if capex[-1] is not None else None,
            "acciones": acciones[-1],
            "deudaNeta": deuda_neta[-1],
            "patrimonio": patrimonio[-1],
        },
        "supuestos": supuestos,
        "referencias": REFERENCIAS_MULTIPLOS,
        "tipoRoic": TIPO_ROIC,
        "avisos": avisos,
    }


def _supuestos(
    filas: dict[str, list[float | None]], periodos: int, sin_ebit: bool
) -> dict[str, float]:
    """Punto de partida razonable para la proyección, sacado del histórico.

    Son conservadores a propósito: el crecimiento pasado se recorta al 10 %
    porque extrapolar una racha excepcional infla el precio objetivo.
    """
    ventas = filas["ventas"]
    crecimiento = _cagr(ventas[0], ventas[-1], periodos)
    margenes = [m for m in filas["margenBaiPct" if sin_ebit else "margenEbitPct"] if m is not None]
    margen = sum(margenes) / len(margenes) if margenes else 0.15

    tipos = [
        _div(_resta(b, n), b)
        for b, n in zip(filas["baiSinExtra"], filas["beneficioNeto"])
        if b is not None and b > 0
    ]
    tipos = [t for t in tipos if t is not None and 0 <= t <= 0.5]
    tipo = median(tipos) if tipos else 0.21

    acciones = filas["acciones"]
    variacion_acciones = _cagr(acciones[0], acciones[-1], periodos) or 0.0

    def multiplo(clave: str, defecto: float) -> float:
        historico = _mediana_positiva(filas[clave])
        valor = historico if historico is not None else defecto
        return _redondear(_acotar(valor, 5, 40), 0.5)

    return {
        "crecimiento": _redondear(_acotar(crecimiento if crecimiento is not None else 0.05, -0.05, 0.10), 0.005),
        "margenEbit": _redondear(_acotar(margen, 0.0, 0.6), 0.005),
        "tipoImpositivo": _redondear(_acotar(tipo, 0.0, 0.35), 0.005),
        "variacionAcciones": _redondear(_acotar(variacion_acciones, -0.05, 0.05), 0.0025),
        "per": multiplo("per", 16),
        "pfcf": multiplo("pfcf", 16),
        "evEbitda": multiplo("evEbitda", 10),
        "evEbit": multiplo("evEbit", 12),
    }
