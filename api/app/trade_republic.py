"""Conexión real con Trade Republic usando la librería no oficial `pytr`.

El login es en dos pasos porque Trade Republic exige una confirmación 2FA:

1. `iniciar_sesion(telefono, pin)` crea la sesión y devuelve un `sessionId`.
2. `confirmar_sesion(sessionId, codigo)` la valida con el código recibido.

Se usa el login v2, que no necesita el token de AWS WAF y por tanto evita tener
que instalar Playwright y Chromium en el servidor.

Las credenciales nunca se guardan en disco (`save_cookies=False`): viven solo en
memoria mientras la sesión está abierta.
"""

import asyncio
import secrets
import time
from dataclasses import dataclass, field
from typing import Any

from .config import TR_SESSION_TTL


class TradeRepublicError(RuntimeError):
    pass


@dataclass
class Sesion:
    api: Any
    confirmada: bool = False
    necesita_autenticador: bool = False
    creada: float = field(default_factory=time.monotonic)
    ultimo_uso: float = field(default_factory=time.monotonic)


_sesiones: dict[str, Sesion] = {}


def _purgar() -> None:
    limite = time.monotonic() - TR_SESSION_TTL
    for clave in [k for k, s in _sesiones.items() if s.ultimo_uso < limite]:
        sesion = _sesiones.pop(clave, None)
        if sesion is not None:
            _cerrar(sesion)


def _cerrar(sesion: Sesion) -> None:
    try:
        cerrar = getattr(sesion.api, "close", None)
        if callable(cerrar):
            resultado = cerrar()
            if asyncio.iscoroutine(resultado):
                resultado.close()
    except Exception:  # noqa: BLE001 - cerrar nunca debe propagar
        pass


def _obtener(session_id: str) -> Sesion:
    _purgar()
    sesion = _sesiones.get(session_id)
    if sesion is None:
        raise TradeRepublicError("Sesión no encontrada o caducada. Vuelve a entrar.")
    sesion.ultimo_uso = time.monotonic()
    return sesion


def _crear_api(telefono: str, pin: str) -> Any:
    from pytr.api import TradeRepublicApi

    return TradeRepublicApi(
        phone_no=telefono,
        pin=pin,
        locale="es",
        save_cookies=False,
        use_v2_login=True,
    )


async def iniciar_sesion(telefono: str, pin: str) -> dict[str, Any]:
    _purgar()

    def trabajo() -> tuple[Any, int, bool]:
        api = _crear_api(telefono, pin)
        cuenta_atras = api.initiate_weblogin()
        necesita = bool(getattr(api, "weblogin_needs_authenticator", False))
        return api, int(cuenta_atras or 0), necesita

    try:
        api, cuenta_atras, necesita = await asyncio.to_thread(trabajo)
    except Exception as exc:  # noqa: BLE001 - pytr lanza ValueError y de requests
        raise TradeRepublicError(
            f"Trade Republic rechazó el inicio de sesión: {exc}"
        ) from exc

    session_id = secrets.token_urlsafe(24)
    _sesiones[session_id] = Sesion(
        api=api,
        necesita_autenticador=necesita,
    )
    return {
        "sessionId": session_id,
        "segundosParaSms": cuenta_atras,
        "necesitaAutenticador": necesita,
        "mensaje": (
            "Introduce el código de tu app de autenticación."
            if necesita
            else "Confirma el acceso en la app de Trade Republic o introduce el código recibido."
        ),
    }


async def confirmar_sesion(session_id: str, codigo: str | None) -> dict[str, Any]:
    sesion = _obtener(session_id)

    def trabajo() -> None:
        sesion.api.complete_weblogin(codigo or None)

    try:
        await asyncio.to_thread(trabajo)
    except Exception as exc:  # noqa: BLE001
        raise TradeRepublicError(f"No se pudo validar el código: {exc}") from exc

    sesion.confirmada = True
    return {"sessionId": session_id, "confirmada": True}


async def reenviar_codigo(session_id: str) -> dict[str, Any]:
    sesion = _obtener(session_id)
    try:
        await asyncio.to_thread(sesion.api.resend_weblogin)
    except Exception as exc:  # noqa: BLE001
        raise TradeRepublicError(f"No se pudo reenviar el código: {exc}") from exc
    return {"sessionId": session_id, "reenviado": True}


async def cerrar_sesion(session_id: str) -> dict[str, Any]:
    sesion = _sesiones.pop(session_id, None)
    if sesion is not None:
        _cerrar(sesion)
    return {"cerrada": True}


async def cartera(session_id: str) -> dict[str, Any]:
    """Posiciones y efectivo de la cuenta, leídos por el websocket de la app."""
    sesion = _obtener(session_id)
    if not sesion.confirmada:
        raise TradeRepublicError("La sesión aún no está confirmada con el código 2FA.")

    api = sesion.api
    posiciones: list[dict[str, Any]] = []
    efectivo: list[dict[str, Any]] = []

    async def leer() -> None:
        pendientes = 0
        await api.compact_portfolio()
        pendientes += 1
        await api.cash()
        pendientes += 1

        while pendientes > 0:
            _, suscripcion, respuesta = await api.recv()
            tipo = suscripcion.get("type")
            if tipo == "compactPortfolioByType":
                pendientes -= 1
                for categoria in respuesta.get("categories") or []:
                    for posicion in categoria.get("positions") or []:
                        posiciones.append(posicion)
            elif tipo == "cash":
                pendientes -= 1
                efectivo.extend(respuesta or [])

    try:
        await asyncio.wait_for(leer(), timeout=45)
    except asyncio.TimeoutError as exc:
        raise TradeRepublicError(
            "Trade Republic no respondió a tiempo con la cartera."
        ) from exc
    except Exception as exc:  # noqa: BLE001
        raise TradeRepublicError(f"Error leyendo la cartera: {exc}") from exc

    return {
        "posiciones": [_mapear_posicion(p) for p in posiciones],
        "efectivo": [
            {
                "moneda": (c.get("currencyId") or "EUR").upper(),
                "importe": _num(c.get("amount")),
            }
            for c in efectivo
        ],
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


def _mapear_posicion(posicion: dict[str, Any]) -> dict[str, Any]:
    isin = posicion.get("isin") or posicion.get("instrumentId")
    acciones = _num(posicion.get("netSize")) or _num(posicion.get("quantity"))
    precio_medio = _num(posicion.get("averageBuyIn")) or _num(posicion.get("avgCost"))
    coste = None
    if acciones is not None and precio_medio is not None:
        coste = acciones * precio_medio
    return {
        "isin": isin,
        "nombre": posicion.get("name") or isin,
        "acciones": acciones,
        "precioMedio": precio_medio,
        "costeTotal": coste,
    }
