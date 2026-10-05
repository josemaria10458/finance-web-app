"""Evolución histórica de la cartera, comparable con índices de referencia.

Un índice se mueve solo por precio, pero el valor de una cartera también cambia
porque se mete dinero nuevo. Comparar su valor contra un índice haría que cada
aportación pareciese una subida, así que la línea de la cartera se calcula
encadenando sus variaciones diarias y descontando lo aportado ese día. Eso es
la rentabilidad ponderada por tiempo, que mide cómo se han comportado los
activos y no cuánto se ha ingresado.
"""

import asyncio
import bisect
from datetime import date, datetime, timedelta, timezone
from typing import Any

from . import yahoo
from .config import BASE_CURRENCY

#: Índices contra los que se compara la cartera.
REFERENCIAS: tuple[tuple[str, str], ...] = (
    ("^GSPC", "S&P 500"),
    ("URTH", "MSCI World"),
)


class CarteraError(RuntimeError):
    pass


def _dia(marca: int) -> str:
    return datetime.fromtimestamp(marca, tz=timezone.utc).date().isoformat()


class _Escalonada:
    """Serie diaria que devuelve el último valor conocido para una fecha.

    Hace falta porque los calendarios no coinciden: cada plaza tiene sus
    festivos y las compras pueden caer en fin de semana.
    """

    def __init__(self, serie: dict[str, float]) -> None:
        self._fechas = sorted(serie)
        self._valores = [serie[f] for f in self._fechas]

    def __bool__(self) -> bool:
        return bool(self._fechas)

    @property
    def fechas(self) -> list[str]:
        return self._fechas

    def en(self, fecha: str) -> float | None:
        posicion = bisect.bisect_right(self._fechas, fecha) - 1
        return self._valores[posicion] if posicion >= 0 else None

    def en_o_primero(self, fecha: str) -> float | None:
        """Como `en`, pero antes del inicio de la serie usa el dato más antiguo."""
        if not self._fechas:
            return None
        return self.en(fecha) if fecha >= self._fechas[0] else self._valores[0]


def _por_dia(puntos: list[dict[str, Any]]) -> dict[str, float]:
    serie: dict[str, float] = {}
    for punto in puntos:
        cierre = punto.get("c")
        if cierre is None:
            continue
        serie[_dia(int(punto["t"]))] = float(cierre)
    return serie


async def _serie_cambio(moneda: str, base: str, inicio: str) -> _Escalonada | None:
    moneda, base = moneda.upper(), base.upper()
    if moneda == base:
        return None
    try:
        datos = await yahoo.historico_desde(f"{moneda}{base}=X", inicio)
    except yahoo.YahooError:
        return None
    serie = _por_dia(datos["puntos"])
    return _Escalonada(serie) if serie else None


async def _simbolo_de(identificador: str) -> str | None:
    identificador = identificador.strip()
    if len(identificador) == 12 and identificador[:2].isalpha():
        resuelto = await yahoo.resolver_isin(identificador)
        return str(resuelto["simbolo"]) if resuelto else None
    return identificador or None


async def _cierres_en_base(simbolo: str, inicio: str) -> dict[str, float]:
    """Cierres diarios de un símbolo, pasados a la divisa base."""
    datos = await yahoo.historico_desde(simbolo, inicio)
    serie = _por_dia(datos["puntos"])
    moneda = (datos.get("moneda") or BASE_CURRENCY).upper()
    if not serie or moneda == BASE_CURRENCY:
        return serie

    cambio = await _serie_cambio(moneda, BASE_CURRENCY, inicio)
    if cambio is None:
        # Sin el cambio, mezclar divisas falsearía el total: mejor no aportar.
        return {}
    convertida: dict[str, float] = {}
    for fecha, cierre in serie.items():
        tasa = cambio.en_o_primero(fecha)
        if tasa is not None:
            convertida[fecha] = cierre * tasa
    return convertida


def _calendario(series: list[list[str]]) -> list[str]:
    fechas: set[str] = set()
    for serie in series:
        fechas |= set(serie)
    return sorted(fechas)


#: Días naturales que cubre cada ventana del gráfico.
_DIAS_RANGO = {
    "1mo": 31,
    "3mo": 92,
    "6mo": 183,
    "1y": 365,
    "2y": 730,
    "5y": 1826,
    "10y": 3653,
}


def _desde_rango(rango: str, fechas: list[str]) -> int:
    """Índice desde el que se recorta la serie para el rango pedido."""
    if rango == "max" or not fechas:
        return 0

    ultima = date.fromisoformat(fechas[-1])
    if rango == "ytd":
        inicio = date(ultima.year, 1, 1)
    else:
        inicio = ultima - timedelta(days=_DIAS_RANGO.get(rango, 365))

    # El primer punto en o después del inicio; si la cartera es más joven que
    # la ventana, se devuelve entera.
    return min(bisect.bisect_left(fechas, inicio.isoformat()), len(fechas) - 1)


def _rebasar(valores: list[float | None], desde: int) -> list[float | None]:
    """Recorta la serie y la vuelve a poner en base 100 en su nuevo inicio."""
    recorte = valores[desde:]
    base = next((v for v in recorte if v), None)
    if not base:
        return recorte
    return [(v / base) * 100.0 if v else None for v in recorte]


def _variacion(valores: list[float | None]) -> float | None:
    """Variación en puntos porcentuales de una serie que empieza en 100."""
    ultimo = next((v for v in reversed(valores) if v is not None), None)
    return None if ultimo is None else ultimo - 100.0


def _anualizada(fechas: list[str], valores: list[float | None]) -> float | None:
    ultimo = next((v for v in reversed(valores) if v is not None), None)
    if ultimo is None or ultimo <= 0 or len(fechas) < 2:
        return None
    dias = (date.fromisoformat(fechas[-1]) - date.fromisoformat(fechas[0])).days
    # Anualizar unas pocas semanas daría cifras absurdas.
    if dias < 90:
        return None
    return ((ultimo / 100.0) ** (365.0 / dias) - 1.0) * 100.0


def _serie(
    clave: str,
    nombre: str,
    fechas: list[str],
    completa: list[float | None],
    desde: int,
) -> dict[str, Any]:
    """Serie lista para el gráfico, con la rentabilidad de cada periodo.

    `completa` cubre desde la primera compra, y de ahí se saca tanto el tramo
    que se dibuja como el año en curso y el total, todo con la misma base.
    """
    valores = _rebasar(completa, desde)
    recortadas = fechas[desde:]
    inicio_ano = _desde_rango("ytd", fechas)

    return {
        "clave": clave,
        "nombre": nombre,
        "valores": valores,
        "totalPct": _variacion(valores),
        "anualPct": _anualizada(recortadas, valores),
        "ytdPct": _variacion(_rebasar(completa, inicio_ano)),
        "maxPct": _variacion(completa),
        "maxAnualPct": _anualizada(fechas, completa),
    }


async def historico_comparado(
    lotes: list[dict[str, Any]],
    rango: str = "1y",
) -> dict[str, Any]:
    if not lotes:
        raise CarteraError("Sin compras con las que calcular la cartera.")

    identificadores = sorted(
        {str(l.get("id") or "").strip().upper() for l in lotes} - {""}
    )
    if not identificadores:
        raise CarteraError("Las compras no traen ISIN ni símbolo.")

    simbolos = await asyncio.gather(
        *(_simbolo_de(i) for i in identificadores), return_exceptions=True
    )
    por_identificador = {
        identificador: simbolo
        for identificador, simbolo in zip(identificadores, simbolos)
        if isinstance(simbolo, str)
    }
    if not por_identificador:
        raise CarteraError("No se pudo identificar ninguno de los activos.")

    # Se descarga siempre todo el histórico desde la primera compra y de ahí se
    # recortan los rangos. Así el año en curso y el máximo salen de la misma
    # serie diaria, en vez de pedir a Yahoo ventanas distintas que además
    # devuelven granularidad semanal o mensual en los plazos largos.
    primera = min(
        (str(l.get("fecha") or "")[:10] for l in lotes if l.get("fecha")),
        default="",
    )
    if not primera:
        raise CarteraError("Las compras no traen fecha.")
    # Un margen por detrás asegura que el primer día de cartera ya tenga
    # cotización previa con la que comparar.
    inicio = (date.fromisoformat(primera) - timedelta(days=15)).isoformat()

    activos, indices = await asyncio.gather(
        asyncio.gather(
            *(_cierres_en_base(s, inicio) for s in por_identificador.values()),
            return_exceptions=True,
        ),
        asyncio.gather(
            *(_cierres_en_base(s, inicio) for s, _ in REFERENCIAS),
            return_exceptions=True,
        ),
    )

    precios: dict[str, _Escalonada] = {}
    for identificador, serie in zip(por_identificador, activos):
        if isinstance(serie, dict) and serie:
            precios[identificador] = _Escalonada(serie)
    if not precios:
        raise CarteraError("No hay histórico de precios para tus posiciones.")

    series_indices = [s if isinstance(s, dict) else {} for s in indices]

    # Se usa el calendario de los índices, que es el más completo y estable; si
    # fallan, el de los propios activos.
    fechas = _calendario(
        [list(s) for s in series_indices if s]
    ) or _calendario([p.fechas for p in precios.values()])
    if not fechas:
        raise CarteraError("No se pudo construir el calendario de fechas.")

    compras: list[tuple[str, str, float]] = []
    for lote in lotes:
        identificador = str(lote.get("id") or "").strip().upper()
        if identificador not in precios:
            continue
        compras.append(
            (
                str(lote.get("fecha") or "")[:10],
                identificador,
                float(lote.get("acciones") or 0.0),
            )
        )
    compras.sort()

    acciones_por_activo: dict[str, float] = {}
    serie_cartera: list[float | None] = []
    indice = 100.0
    valor_anterior: float | None = None
    pendiente = 0

    for fecha in fechas:
        aportacion = 0.0
        while pendiente < len(compras) and compras[pendiente][0] <= fecha:
            _, identificador, acciones = compras[pendiente]
            acciones_por_activo[identificador] = (
                acciones_por_activo.get(identificador, 0.0) + acciones
            )
            # La aportación se valora al precio de mercado del día en vez de al
            # coste registrado: así la serie no se descuadra si el coste venía
            # en otra divisa o si el histórico está ajustado por splits.
            precio_compra = precios[identificador].en(fecha)
            if precio_compra is not None:
                aportacion += acciones * precio_compra
            pendiente += 1

        valor = 0.0
        for identificador, acciones in acciones_por_activo.items():
            precio = precios[identificador].en(fecha)
            if precio is not None:
                valor += precio * acciones

        if valor <= 0:
            serie_cartera.append(None)
            valor_anterior = None
            continue

        if valor_anterior is None or valor_anterior <= 0:
            # Primer día con posiciones: la línea arranca en 100.
            indice = 100.0
        else:
            factor = (valor - aportacion) / valor_anterior
            if factor > 0:
                indice *= factor
        serie_cartera.append(indice)
        valor_anterior = valor

    primero = next((i for i, v in enumerate(serie_cartera) if v is not None), None)
    if primero is None:
        raise CarteraError("No se pudo valorar la cartera en ninguna fecha.")

    # Serie completa (desde la primera compra) y el recorte que se va a dibujar.
    fechas_completas = fechas[primero:]
    completa_cartera = serie_cartera[primero:]
    desde = _desde_rango(rango, fechas_completas)
    fechas = fechas_completas[desde:]

    series = [
        _serie("cartera", "Mi cartera", fechas_completas, completa_cartera, desde)
    ]

    for (simbolo, nombre), serie in zip(REFERENCIAS, series_indices):
        if not serie:
            continue
        escalonada = _Escalonada(serie)
        base = escalonada.en_o_primero(fechas_completas[0])
        if not base:
            continue
        completa = [
            (cierre / base) * 100.0 if (cierre := escalonada.en(f)) else None
            for f in fechas_completas
        ]
        series.append(_serie(simbolo, nombre, fechas_completas, completa, desde))

    return {
        "divisaBase": BASE_CURRENCY,
        "rango": rango,
        "fechas": fechas,
        "series": series,
    }
