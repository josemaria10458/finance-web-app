"""Datos de fondos y ETFs desde Morningstar vía `mstarpy`.

Es una fuente complementaria a Yahoo: aporta el coste corriente real (TER según
el KIID), la categoría Morningstar y el índice de referencia.

Todo es «mejor esfuerzo»: si Morningstar cambia o tarda, la ficha se sirve
igualmente con lo que haya dado Yahoo.
"""

import asyncio
import logging
from typing import Any

from .cache import cache
from .config import TTL_DETAIL

log = logging.getLogger(__name__)

#: `Funds.dataPoint()` ignora los campos que se le piden y responde siempre con
#: este bloque de identificación, así que se aprovecha solo para eso.
CAMPOS_IDENTIDAD = {
    "ticker": "ticker",
    "exchangeName": "mercado",
    "baseCurrency": "moneda",
    "investmentType": "tipoInversion",
}


def _num(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value))
    except (TypeError, ValueError):
        return None


_mstarpy: Any = None


def _cargar_mstarpy() -> Any:
    """Importa `mstarpy` desde el hilo principal.

    Al importarse registra un handler de SIGTERM, y `signal.signal` lanza
    `ValueError` si se ejecuta fuera del hilo principal. Por eso el import no
    puede hacerse dentro del `asyncio.to_thread` que consulta Morningstar.
    """
    global _mstarpy
    if _mstarpy is None:
        import mstarpy

        _mstarpy = mstarpy
    return _mstarpy


def _datos_sincronos(mstarpy: Any, isin: str) -> dict[str, Any]:
    fondo = mstarpy.Funds(term=isin, pageSize=1)

    salida: dict[str, Any] = {
        "nombre": getattr(fondo, "name", None),
        "isin": getattr(fondo, "isin", None),
        "codigoMorningstar": getattr(fondo, "code", None),
    }

    try:
        identidad = fondo.dataPoint("name")
        if isinstance(identidad, list):
            identidad = identidad[0] if identidad else {}
        if isinstance(identidad, dict):
            for origen, destino in CAMPOS_IDENTIDAD.items():
                if identidad.get(origen):
                    salida[destino] = identidad[origen]
    except Exception:  # noqa: BLE001 - la cobertura varía por país y producto
        pass

    try:
        comisiones = fondo.investmentFee() or {}
        reales = comisiones.get("actualInvestmentFees") or {}
        estimadas = comisiones.get("estimatedInvestmentFees") or {}
        coste = _num(reales.get("ongoingCost"))
        if coste is None:
            coste = _num(estimadas.get("ongoingCost"))
        if coste is not None:
            salida["terPct"] = coste
    except Exception:  # noqa: BLE001
        pass

    try:
        mapa = fondo.allocationMap() or {}
        if mapa.get("categoryName"):
            salida["categoria"] = mapa["categoryName"]
        if mapa.get("indexName"):
            salida["indiceReferencia"] = mapa["indexName"]
    except Exception:  # noqa: BLE001
        pass

    return {k: v for k, v in salida.items() if v is not None}


async def datos_fondo(isin: str) -> dict[str, Any]:
    """Devuelve los datos de Morningstar para un ISIN, o `{}` si no hay."""
    if not isin:
        return {}

    clave = f"morningstar:{isin.upper()}"

    async def cargar() -> dict[str, Any]:
        try:
            modulo = _cargar_mstarpy()
            # Morningstar encadena varias peticiones y es lento; el margen es amplio
            # a propósito porque el resultado se cachea durante una hora.
            return await asyncio.wait_for(
                asyncio.to_thread(_datos_sincronos, modulo, isin), timeout=60
            )
        except Exception:  # noqa: BLE001 - fuente opcional, nunca debe romper
            log.warning("Morningstar no devolvió datos para %s", isin, exc_info=True)
            return {}

    return await cache.get_or_set(clave, TTL_DETAIL, cargar)
