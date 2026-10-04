"""Conexión real con Trade Republic usando la librería no oficial `pytr`.

El login v2 (el que se usa aquí, porque no necesita el token de AWS WAF ni por
tanto Playwright) tiene dos variantes de segundo factor, y Trade Republic decide
cuál según la cuenta:

- `app`: no hay ningún código. Trade Republic manda un aviso al móvil y hay que
  aprobar el acceso en su aplicación. El servidor sondea el proceso de login
  cada dos segundos hasta que se aprueba, así que el frontend solo tiene que
  preguntar por el estado con `estado_sesion`.
- `autenticador`: la cuenta tiene activada una app de códigos (TOTP) y hay que
  pasar ese código a `confirmar_sesion`.

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


#: Cómo confirma la cuenta el segundo factor.
METODO_APP = "app"
METODO_AUTENTICADOR = "autenticador"


@dataclass
class Sesion:
    api: Any
    metodo: str
    #: `esperando` (aprobación en el móvil), `codigo` (falta el TOTP),
    #: `confirmada` o `error`.
    estado: str
    error: str | None = None
    tarea: Any = None
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
    if sesion.tarea is not None and not sesion.tarea.done():
        sesion.tarea.cancel()
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

    metodo = METODO_AUTENTICADOR if necesita else METODO_APP
    sesion = Sesion(
        api=api,
        metodo=metodo,
        estado="codigo" if necesita else "esperando",
    )
    session_id = secrets.token_urlsafe(24)
    _sesiones[session_id] = sesion

    # Con la confirmación por app no hay nada que teclear: el aviso ya está en
    # el móvil, así que hay que empezar a sondear sin esperar al usuario.
    if metodo == METODO_APP:
        sesion.tarea = asyncio.create_task(_esperar_aprobacion(sesion))

    return {
        "sessionId": session_id,
        "metodo": metodo,
        "segundosParaConfirmar": cuenta_atras,
        "mensaje": (
            "Introduce el código de tu app de autenticación."
            if necesita
            else "Abre la app de Trade Republic en el móvil y aprueba el acceso."
        ),
    }


async def _esperar_aprobacion(sesion: Sesion) -> None:
    """Espera a que el acceso se apruebe en el móvil.

    `complete_weblogin(None)` bloquea sondeando el proceso de login cada dos
    segundos hasta que Trade Republic lo marca como confirmado o caduca, así que
    se ejecuta en un hilo y el resultado se guarda en la sesión.
    """
    try:
        await asyncio.to_thread(sesion.api.complete_weblogin, None)
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001 - pytr lanza ValueError y TimeoutError
        sesion.estado = "error"
        sesion.error = str(exc) or type(exc).__name__
    else:
        sesion.estado = "confirmada"
        sesion.error = None


async def estado_sesion(session_id: str) -> dict[str, Any]:
    """Estado del login, para que el frontend lo consulte mientras espera."""
    sesion = _obtener(session_id)
    return {
        "estado": sesion.estado,
        "metodo": sesion.metodo,
        "mensaje": sesion.error,
    }


async def confirmar_sesion(session_id: str, codigo: str | None) -> dict[str, Any]:
    sesion = _obtener(session_id)
    if sesion.metodo == METODO_APP:
        raise TradeRepublicError(
            "Esta cuenta se confirma aprobando el acceso en la app de Trade "
            "Republic, no con un código."
        )
    if not codigo:
        raise TradeRepublicError("Introduce el código de tu app de autenticación.")

    try:
        await asyncio.to_thread(sesion.api.complete_weblogin, codigo)
    except Exception as exc:  # noqa: BLE001
        raise TradeRepublicError(f"No se pudo validar el código: {exc}") from exc

    sesion.estado = "confirmada"
    sesion.error = None
    return {"estado": sesion.estado, "metodo": sesion.metodo, "mensaje": None}


async def cerrar_sesion(session_id: str) -> dict[str, Any]:
    sesion = _sesiones.pop(session_id, None)
    if sesion is not None:
        _cerrar(sesion)
    return {"cerrada": True}


async def cartera(session_id: str) -> dict[str, Any]:
    """Posiciones y efectivo de la cuenta, leídos por el websocket de la app."""
    sesion = _obtener(session_id)
    if sesion.estado != "confirmada":
        raise TradeRepublicError("La sesión aún no está confirmada.")

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
