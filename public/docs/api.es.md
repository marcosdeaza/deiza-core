# API de Deiza

La API de Deiza le da a tu código los mismos modelos que responden en deiza.org: **Liquid 5.1**, **Solid 5** y **Gas 4.5**. Habla el formato **OpenAI Chat Completions**, así que cualquier SDK de OpenAI o herramienta compatible funciona cambiando la URL base y la clave.

| | |
|---|---|
| URL base | `https://deiza.org/api/v1` |
| Autenticación | `Authorization: Bearer dz_...` |
| Formato | OpenAI Chat Completions (JSON, Server-Sent Events para streaming) |
| Facturación | Tu plan de Deiza (Friend o Signet). Sin tarjeta aparte ni facturas por petición |
| Para máquinas | [llms.txt](/llms.txt) · [llms-full.txt](/llms-full.txt) · [openapi.json](/openapi.json) · [esta página en Markdown](/docs/api.es.md) |

Esta documentación es pública: sin login y sin JavaScript. Se puede leer, citar, rastrear y pasar a cualquier IA libremente.

## Inicio rápido

1. Crea una clave en [deiza.org/api-keys](/api-keys). Se muestra una sola vez: guárdala en una variable de entorno.
2. Haz una petición:

```bash
export DEIZA_API_KEY="dz_..."

curl https://deiza.org/api/v1/chat/completions \
  -H "Authorization: Bearer $DEIZA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deiza-liquid-5.1",
    "messages": [
      {"role": "system", "content": "Responde breve."},
      {"role": "user", "content": "¿Qué es un transformer? En tres frases."}
    ]
  }'
```

Con el SDK oficial de OpenAI para Python (`pip install openai`):

```python
import os
from openai import OpenAI

client = OpenAI(base_url="https://deiza.org/api/v1", api_key=os.environ["DEIZA_API_KEY"])

resp = client.chat.completions.create(
    model="deiza-liquid-5.1",
    messages=[{"role": "user", "content": "Resume la relatividad en cinco líneas."}],
)
print(resp.choices[0].message.content)
```

Con el SDK de OpenAI para Node.js (`npm install openai`):

```javascript
import OpenAI from "openai";

const client = new OpenAI({ baseURL: "https://deiza.org/api/v1", apiKey: process.env.DEIZA_API_KEY });

const stream = await client.chat.completions.create({
  model: "deiza-liquid-5.1",
  stream: true,
  messages: [{ role: "user", content: "Tres ideas de nombre para una cafetería." }],
});
for await (const chunk of stream) process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
```

## Autenticación

Cada petición necesita una clave de API. Envíala en cualquiera de estas cabeceras:

```http
Authorization: Bearer dz_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
X-Api-Key: dz_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- Las claves empiezan por `dz_` y son de tu cuenta: las peticiones gastan el uso de tu plan.
- Se gestionan en [deiza.org/api-keys](/api-keys): nombre, caducidad opcional (7, 30, 90 o 365 días), último uso, número de peticiones, renombrar y revocar.
- La clave completa se enseña una sola vez. Deiza guarda un hash, nunca la clave.
- Una clave revocada o caducada recibe `401` al instante.
- Nunca pongas una clave en el código del navegador ni en un repositorio público. Llama a la API desde tu servidor.

## Modelos

| Modelo | Contexto | Salida máx. | Visión | Herramientas | Para qué |
|---|---|---|---|---|---|
| `deiza-liquid-5.1` (por defecto) | 262.144 | 32.768 | sí | sí | Equilibrado y agéntico: código, herramientas, trabajo diario |
| `deiza-solid-5` | 1.048.576 | 32.768 | sí | sí | Razonamiento profundo, documentos largos, arquitectura, depuración difícil |
| `deiza-gas-4.5` | 131.072 | 32.768 | no | sí | El más rápido y barato: tareas cortas, clasificar, respuestas al momento |

Los alias siguen funcionando: `deiza-liquid`, `liquid`, `deiza-omniscient` → Liquid 5.1; `deiza-solid`, `solid` → Solid 5; `deiza-gas`, `gas` → Gas 4.5. Un modelo que no existe devuelve `404 model_not_found`.

`GET /models` los lista (público, sin clave):

```bash
curl https://deiza.org/api/v1/models
```

```json
{
  "data": [
    {
      "id": "deiza-liquid-5.1", "object": "model", "owned_by": "deizalab",
      "name": "Deiza Liquid 5.1", "default": true,
      "context_window": 262144, "max_output_tokens": 32768,
      "vision": true, "tools": true, "reasoning_effort": true,
      "aliases": ["deiza-liquid", "liquid", "deiza-omniscient"]
    }
  ]
}
```

## Chat completions

`POST /chat/completions`

| Parámetro | Tipo | Notas |
|---|---|---|
| `messages` | array | Obligatorio. Roles `system`, `user`, `assistant`, `tool`. `content` es un texto o una lista de partes (`text`, `image_url`) |
| `model` | string | Opcional, por defecto `deiza-liquid-5.1` |
| `stream` | boolean | `true` para Server-Sent Events |
| `max_tokens` | integer | Por defecto 16.384, máximo 32.768 |
| `temperature` | number | De 0 a 1,5, por defecto 0,2 |
| `reasoning_effort` | string | `low`, `medium` o `high`. Solid piensa en `high` por defecto; Gas siempre piensa poco |
| `tools` | array | Herramientas (funciones) en formato OpenAI, hasta 64 |
| `tool_choice` | string u objeto | `auto`, `none`, `required` o `{"type": "function", "function": {"name": "..."}}` |
| `parallel_tool_calls` | boolean | Permite varias llamadas a herramientas en un turno |

El resto de parámetros de OpenAI (`n`, `top_p`, `seed`, `response_format`, `logprobs`...) se aceptan y se ignoran.

Respuesta:

```json
{
  "id": "chatcmpl-360bbd1c-87aa-4bf2-9190-da6a414c48a8",
  "object": "chat.completion",
  "created": 1791074949,
  "model": "deiza-liquid-5.1",
  "choices": [
    { "index": 0, "message": { "role": "assistant", "content": "..." }, "finish_reason": "stop" }
  ],
  "usage": { "prompt_tokens": 71, "completion_tokens": 35, "total_tokens": 106 },
  "deiza_usage_state": "ok"
}
```

`deiza_usage_state` vale `ok`, o `grace` cuando tu plan se agotó en mitad del trabajo y Deiza está terminando con el margen de cortesía (ver [Uso y límites](#uso-y-limites)).

### Streaming

Con `"stream": true` la respuesta llega como Server-Sent Events, una línea `data:` por fragmento, y termina con `data: [DONE]`:

```text
data: {"id":"chatcmpl-...","object":"chat.completion.chunk","model":"deiza-gas-4.5","choices":[{"index":0,"delta":{"role":"assistant","content":"Ho"},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","model":"deiza-gas-4.5","choices":[{"index":0,"delta":{"content":"la"},"finish_reason":"stop"}]}

: deiza-usage {"state": "ok", "pct": 0.4, "weekly_pct": 0.1}

data: [DONE]
```

Las líneas que empiezan por `:` son comentarios SSE (pings para mantener la conexión y un resumen de uso al final). Los clientes SSE normales y los SDK de OpenAI los ignoran. Los modelos que razonan pueden mandar `delta.reasoning` antes del texto visible.

### Visión

Liquid 5.1 y Solid 5 leen imágenes. Mándalas como partes `image_url`, con una URL `https://` o una URL `data:`:

```json
{
  "model": "deiza-liquid-5.1",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "¿Qué hay en esta foto?" },
      { "type": "image_url", "image_url": { "url": "https://example.com/foto.jpg" } }
    ]
  }]
}
```

### Herramientas (function calling)

Funciona igual que en OpenAI: declaras `tools`, el modelo responde con `tool_calls`, ejecutas la función y devuelves el resultado como mensaje `tool`.

```python
tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Tiempo actual en una ciudad",
        "parameters": {
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"],
        },
    },
}]

first = client.chat.completions.create(model="deiza-liquid-5.1", tools=tools,
    messages=[{"role": "user", "content": "¿Qué tiempo hace en Valencia?"}])
call = first.choices[0].message.tool_calls[0]

second = client.chat.completions.create(model="deiza-liquid-5.1", tools=tools, messages=[
    {"role": "user", "content": "¿Qué tiempo hace en Valencia?"},
    first.choices[0].message,
    {"role": "tool", "tool_call_id": call.id, "content": '{"temp_c": 24, "cielo": "despejado"}'},
])
print(second.choices[0].message.content)
```

## Búsqueda web

`POST /search` da a tus agentes la misma búsqueda que usa Deiza: respuestas de la web con fuentes, o fotos verificadas.

| Campo | Tipo | Notas |
|---|---|---|
| `query` | string | Obligatorio, hasta 300 caracteres |
| `type` | string | `web` o `images` (por defecto `images`) |
| `num` | integer | De 1 a 12, por defecto 6 |
| `language` | string | Código ISO, por defecto `es` |

```bash
curl https://deiza.org/api/v1/search \
  -H "Authorization: Bearer $DEIZA_API_KEY" -H "Content-Type: application/json" \
  -d '{"query": "torre eiffel", "type": "images", "num": 4}'
```

```json
{
  "type": "images",
  "query": "torre eiffel",
  "results": [
    { "url": "https://.../La-Torre-Eiffel.jpg", "title": "...", "source": "https://..." }
  ]
}
```

Con `"type": "web"` la respuesta trae además `answer`, un resumen corto, y en `results` el `title` y la `url` de cada fuente. Límite: 40 búsquedas por minuto y cuenta.

## Uso y límites

La API está incluida en los planes **Friend** y **Signet** (con el plan Free devuelve `403 plan_required`). Gasta el mismo uso que el chat y Deiza Code:

| Plan | Por ventana de 5 h | Por semana |
|---|---|---|
| Friend | 4M | 35M |
| Signet | 8M | 85M |

- **Ventana de 5 horas.** Se abre con tu primera petición y vuelve a cero 5 horas después.
- **Semana.** Un periodo fijo de 7 días que se reinicia entero, siempre el mismo día y a la misma hora (lo ves en [Planes](/plans) y en `GET /usage`).
- **Unidades de uso.** Cada petición se mide por lo que cuesta de verdad: entrada nueva ×1, entrada en caché ×0,1, contexto releído ×0,25, salida y razonamiento ×5. Después se aplica el multiplicador del modelo:

| Modelo | Friend | Signet |
|---|---|---|
| Gas 4.5 | ×0,35 | ×0,35 |
| Liquid 5.1 | ×1 | ×1 |
| Solid 5 | ×2 | ×1,8 |

- **Margen de cortesía.** Si el límite se acaba mientras trabajas (alguna petición en los últimos 15 minutos), se sirve hasta un 12 % más de la ventana para no cortar lo que está a medias. Mientras tanto `deiza_usage_state` y la cabecera `X-Deiza-Usage-State` dicen `grace`.

`GET /usage` devuelve el estado en vivo:

```json
{
  "plan": "friend",
  "tokens_used": 1240800, "token_limit": 4000000, "tokens_remaining": 2759200,
  "pct": 31.0, "state": "ok", "limit_scope": "window",
  "next_reset": "2026-10-04T05:26:55Z", "reset_in_seconds": 15320,
  "weekly_used": 9800000, "weekly_limit": 35000000, "weekly_pct": 28.0,
  "weekly_reset_at": "2026-10-10T16:00:00Z", "weekly_reset_in_seconds": 486000,
  "exhausted": false
}
```

## Errores

Los errores siguen el formato de OpenAI, así que los SDK lanzan la excepción correcta:

```json
{
  "error": {
    "message": "The model 'gpt-9' does not exist. Use one of: deiza-liquid-5.1, deiza-solid-5, deiza-gas-4.5 (GET https://deiza.org/api/v1/models).",
    "type": "not_found_error",
    "code": "model_not_found",
    "param": "model"
  }
}
```

| Estado | `code` | Significado |
|---|---|---|
| 400 | `invalid_request` | Cuerpo mal formado (por ejemplo, sin `messages`) |
| 401 | `missing_api_key`, `invalid_api_key` | Sin clave, o una incorrecta, revocada o caducada |
| 403 | `plan_required` | Tu plan no incluye la API (Free) o ese modelo |
| 404 | `model_not_found` | Id de modelo desconocido |
| 429 | `usage_limit` | Se agotó la ventana de 5 h o la semana. `Retry-After` dice cuándo se reinicia |
| 429 | `model_sublimit` | Límite propio de ese modelo en la ventana actual |
| 5xx | `api_error`, `overloaded_error` | Problema temporal. Reintenta con espera exponencial (1 s, 2 s, 4 s...) |

Durante un stream, un error llega como una línea `data:` con un objeto `error`.

## Herramientas compatibles

Funciona todo lo que acepte un endpoint compatible con OpenAI: los SDK de OpenAI, LangChain, LlamaIndex, Vercel AI SDK, Cursor, Continue, Cline, Aider, Open WebUI, LibreChat, n8n...

```bash
OPENAI_BASE_URL=https://deiza.org/api/v1
OPENAI_API_KEY=dz_...
OPENAI_MODEL=deiza-liquid-5.1
```

La URL base anterior, `https://deiza.org/api/code`, sigue funcionando con las mismas rutas.

## Para IAs y rastreadores

Todo esto es público y estable, para que asistentes, agentes y rastreadores lo lean sin login:

- [`/llms.txt`](/llms.txt): índice corto de la API para modelos de lenguaje.
- [`/llms-full.txt`](/llms-full.txt): toda esta documentación en Markdown (inglés).
- [`/openapi.json`](/openapi.json): especificación OpenAPI 3.1 de todos los endpoints.
- [`/docs/api.es.md`](/docs/api.es.md) y [`/docs/api.md`](/docs/api.md): esta página en Markdown (español e inglés).
- `GET https://deiza.org/api/v1`: la API se describe a sí misma en JSON.

Todos permiten peticiones desde otros orígenes (`Access-Control-Allow-Origin: *`).

## Cambios

- **4-oct-2026 (más tarde).** Topes semanales: Friend 35M, Signet 85M. La API y Deiza Code son de los planes de pago (Free recibe `403 plan_required`).
- **4-oct-2026.** URL base versionada `/api/v1`. Errores en formato OpenAI. `404 model_not_found` para modelos desconocidos. `GET /models` público con ventanas de contexto y capacidades. `GET /usage` con la fecha de reinicio semanal. Documentación pública y rastreable con llms.txt y OpenAPI. Consola de claves con caducidad, número de peticiones y renombrar.
