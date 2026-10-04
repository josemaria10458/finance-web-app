# API de mercado

Servicio Python (FastAPI) que alimenta la pantalla **Fondos & ETFs** de la app.
Existe porque el frontend es estático (GitHub Pages) y ni Yahoo Finance ni
Morningstar envían cabeceras CORS, así que el navegador no puede llamarlos.

## Fuentes

| Dato | Fuente |
| --- | --- |
| Cotización, histórico, búsqueda | Yahoo Finance (endpoint `chart`, sin API key) |
| Composición del fondo, TER, rentabilidades | Yahoo Finance vía `yfinance` |
| TER del KIID, categoría e índice Morningstar | Morningstar vía `mstarpy` |
| Posiciones y efectivo reales | Trade Republic vía `pytr` (no oficial) |

Morningstar es complementario: si falla o tarda, la ficha se sirve igualmente
con los datos de Yahoo.

## Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/health` | Estado y divisa configurada |
| GET | `/search?q=&limite=` | Busca por ISIN, ticker o nombre |
| GET | `/quotes?ids=` | Cotizaciones en lote (ISIN o símbolo, separados por coma) |
| GET | `/history/{id}?rango=` | Serie de cierres (`1d`…`max`) |
| GET | `/instrument/{id}` | Ficha completa: cotización + Yahoo + Morningstar |
| POST | `/tr/login` | Paso 1 del acceso a Trade Republic (teléfono + PIN) |
| POST | `/tr/status` | Estado del login mientras se aprueba en el móvil |
| POST | `/tr/confirm` | Paso 2, solo si la cuenta usa app de códigos (TOTP) |
| POST | `/tr/portfolio` | Posiciones y efectivo de la cuenta |
| POST | `/tr/logout` | Cierra la sesión |

`/quotes` e `/instrument` aceptan tanto ISIN (`IE00B4L5Y983`) como símbolo de
Yahoo (`EUNL.DE`, `BBAI`, `BTC-EUR`). Cuando el activo cotiza en otra divisa, el
campo `precioBase` lo devuelve convertido a `BASE_CURRENCY`.

## Variables de entorno

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `CORS_ORIGINS` | GitHub Pages + localhost:4200 | Orígenes permitidos, separados por coma |
| `BASE_CURRENCY` | `USD` | Divisa de `precioBase` |
| `TR_ENABLED` | `true` | Ponlo en `false` para que el servidor no acepte credenciales de Trade Republic |
| `TTL_QUOTE` | `60` | Segundos de caché de cotizaciones |
| `TR_SESSION_TTL` | `1800` | Segundos que vive una sesión de Trade Republic inactiva |

## Desarrollo

La primera vez hay que crear el entorno e instalar las dependencias:

```powershell
cd api
python -m venv .venv
.\.venv\Scripts\Activate.ps1      # en bash: source .venv/Scripts/activate
pip install -r requirements.txt
```

A partir de ahí, para arrancar basta con:

```powershell
cd api
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Llamar al Python del entorno por su ruta evita tener que activarlo y funciona
aunque `python` no esté en el `PATH`.

Para comprobar que responde: <http://localhost:8000/health>. Documentación
interactiva en <http://localhost:8000/docs>.

El frontend en modo desarrollo (`npm start`) ya apunta a `http://localhost:8000`,
así que con el backend levantado la pestaña **Bolsa** funciona sin tocar nada.

## Despliegue en Render

`render.yaml` ya describe el servicio. En Render: **New → Blueprint**, apunta al
repositorio y se crea solo. Al terminar, pon la URL pública en
`marketApiBase` dentro de `src/environments/environment.ts`.

Notas del plan gratuito:

- El servicio se duerme tras unos minutos sin tráfico, así que la primera
  consulta tras un rato tarda bastante. Las cotizaciones se cachean para
  amortiguarlo.
- `mstarpy` arrastra `selenium` y `matplotlib`. Si el plan gratuito se queda sin
  memoria, quita `mstarpy` de `requirements.txt`: la app sigue funcionando sin
  los datos de Morningstar.

## Sobre Trade Republic

No hay API oficial. `pytr` habla con la misma API que la web de Trade Republic,
usando el login v2 para no necesitar Playwright ni Chromium en el servidor.

El segundo factor tiene dos variantes y la elige Trade Republic según la cuenta.
`/tr/login` devuelve en `metodo` cuál toca:

- `app`: no hay ningún código. Llega un aviso al móvil y hay que aprobar el
  acceso en la aplicación de Trade Republic. El servidor empieza a sondear el
  proceso de login en cuanto se llama a `/tr/login`, y el frontend consulta
  `/tr/status` hasta que el estado pasa a `confirmada`. La ventana para aprobar
  es la que diga `segundosParaConfirmar` (unos dos minutos).
- `autenticador`: la cuenta tiene una app de códigos TOTP y hay que mandar ese
  código a `/tr/confirm`.

Trade Republic retiró el reenvío de SMS junto con el login v1, así que no hay
endpoint para pedir otro código.

El teléfono y el PIN viajan al servicio, se usan para abrir la sesión y **no se
guardan en disco** (`save_cookies=False`): viven en memoria mientras la sesión
está activa y se descartan al cerrarla o caducar. Aun así, es una integración no
oficial: si prefieres no enviar credenciales, deja `TR_ENABLED=false` y usa la
cartera calculada a partir de los CSV que ya importas.
