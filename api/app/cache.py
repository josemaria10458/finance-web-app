import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Any


class TtlCache:
    """Caché en memoria con expiración y una sola carga concurrente por clave.

    Las cotizaciones se piden en lote y la pantalla se refresca a menudo, así que
    sin esto una recarga de la cartera dispararía una petición a Yahoo por cada
    posición y por cada pestaña abierta.
    """

    def __init__(self) -> None:
        self._values: dict[str, tuple[float, Any]] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    async def get_or_set(
        self,
        key: str,
        ttl: int,
        factory: Callable[[], Awaitable[Any]],
    ) -> Any:
        hit = self._values.get(key)
        if hit and hit[0] > time.monotonic():
            return hit[1]

        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            # Otra corrutina pudo resolverlo mientras esperábamos el lock.
            hit = self._values.get(key)
            if hit and hit[0] > time.monotonic():
                return hit[1]

            value = await factory()
            self._values[key] = (time.monotonic() + ttl, value)
            return value

    def clear(self) -> None:
        self._values.clear()
        self._locks.clear()


cache = TtlCache()
