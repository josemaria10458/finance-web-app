import os

DEFAULT_ORIGINS = (
    "https://josemaria10458.github.io",
    "http://localhost:4200",
    "http://127.0.0.1:4200",
)


def _csv_env(name: str, default: tuple[str, ...]) -> list[str]:
    raw = os.getenv(name, "")
    if raw.strip():
        return [item.strip() for item in raw.split(",") if item.strip()]
    return list(default)


CORS_ORIGINS = _csv_env("CORS_ORIGINS", DEFAULT_ORIGINS)

#: Divisa en la que se expresan las cotizaciones de fondos y acciones.
BASE_CURRENCY = os.getenv("BASE_CURRENCY", "USD").upper()

TTL_QUOTE = int(os.getenv("TTL_QUOTE", "60"))
TTL_FX = int(os.getenv("TTL_FX", "900"))
TTL_RESOLVE = int(os.getenv("TTL_RESOLVE", "604800"))
TTL_SEARCH = int(os.getenv("TTL_SEARCH", "600"))
TTL_DETAIL = int(os.getenv("TTL_DETAIL", "3600"))
TTL_HISTORY = int(os.getenv("TTL_HISTORY", "1800"))

#: La conexión real con Trade Republic pide teléfono y PIN, así que se puede
#: desactivar por completo en despliegues donde no se quiera ofrecer.
TR_ENABLED = os.getenv("TR_ENABLED", "true").lower() not in ("0", "false", "no")

#: Minutos que se mantiene viva una sesión de Trade Republic sin usarse.
TR_SESSION_TTL = int(os.getenv("TR_SESSION_TTL", "1800"))
