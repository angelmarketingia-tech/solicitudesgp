# Conectar un agente propio a GanaPlay Diseño

Esta guía es para quien tiene **un agente de IA programado con la API de
Claude** —un bot, una automatización, un asistente interno— y quiere que pueda
**crear solicitudes de diseño y consultar el tablero** por su cuenta.

No hace falta tocar la plataforma: el agente se conecta a su servidor MCP con
una dirección y un token, y a partir de ahí se le habla en lenguaje normal.

**Dirección del servidor:** `https://solicitudes.ganaplay.lat/api/mcp`

---

## Antes de empezar: a nombre de quién va a trabajar

Cada token pertenece a **una persona** de la plataforma. Todo lo que haga el
agente —cada solicitud que cree— sale **a nombre de esa persona** y con sus
mismos permisos.

- **Agente personal** (lo usa una sola persona): usa el token de esa persona.
- **Agente de un área o de la empresa**: pide al Trafficker que lo dé de alta
  como usuario propio (por ejemplo, «Agente IA Comercial»). Así sus solicitudes
  salen con ese nombre, se distinguen de las del equipo y se le puede quitar el
  acceso sin afectar a nadie.

---

## Paso 1 · Saca el token

1. Entra a **solicitudes.ganaplay.lat** con la cuenta con la que trabajará el
   agente.
2. **Mi perfil** (arriba a la derecha) → **Conectar mi agente de IA**.
3. Escribe la contraseña y pulsa **Mostrar mis datos de conexión**.
4. En **«2 · Agente propio (API de Claude)»**, copia la línea de la variable de
   entorno.

> **El token equivale a la cuenta.** No caduca y no se comparte. Nunca lo
> escribas dentro del código ni lo subas a un repositorio: va siempre en una
> variable de entorno o en el gestor de secretos que uses.

---

## Paso 2 · Guarda el token como variable de entorno

**Windows (PowerShell):**

```bash
$env:GANAPLAY_TOKEN = "gpmcp_…tu token…"
```

**macOS / Linux:**

```bash
export GANAPLAY_TOKEN="gpmcp_…tu token…"
```

En un servidor o en la nube, dalo de alta en las variables de entorno o en el
gestor de secretos del servicio (Vercel, AWS, GitHub Actions…), con el nombre
`GANAPLAY_TOKEN`.

Necesitas además tu clave de la API de Anthropic en `ANTHROPIC_API_KEY`, como
cualquier agente hecho con Claude.

---

## Paso 3 · Conecta el agente

Se usa el **conector MCP** de la API de Claude: se le pasa el servidor en la
propia llamada y es Anthropic quien se conecta a él. Hacen falta **las dos
partes**, `mcp_servers` y `tools`, y la beta `mcp-client-2025-11-20`.

### Python

Instala el SDK con `pip install anthropic`.

```python
import os
import anthropic

client = anthropic.Anthropic()

response = client.beta.messages.create(
    model="claude-opus-5",
    max_tokens=16000,
    betas=["mcp-client-2025-11-20"],
    mcp_servers=[{
        "type": "url",
        "url": "https://solicitudes.ganaplay.lat/api/mcp",
        "name": "ganaplay",
        "authorization_token": os.environ["GANAPLAY_TOKEN"],
    }],
    tools=[{"type": "mcp_toolset", "mcp_server_name": "ganaplay"}],
    messages=[{
        "role": "user",
        "content": "Levanta una solicitud para el banner del partido del viernes, "
                   "prioridad media, para Instagram.",
    }],
)

for block in response.content:
    if block.type == "text":
        print(block.text)
```

### TypeScript / JavaScript

Instala el SDK con `npm install @anthropic-ai/sdk`.

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const response = await client.beta.messages.create({
  model: "claude-opus-5",
  max_tokens: 16000,
  betas: ["mcp-client-2025-11-20"],
  mcp_servers: [{
    type: "url",
    url: "https://solicitudes.ganaplay.lat/api/mcp",
    name: "ganaplay",
    authorization_token: process.env.GANAPLAY_TOKEN,
  }],
  tools: [{ type: "mcp_toolset", mcp_server_name: "ganaplay" }],
  messages: [{
    role: "user",
    content: "Levanta una solicitud para el banner del partido del viernes, prioridad media, para Instagram.",
  }],
});

for (const block of response.content) {
  if (block.type === "text") console.log(block.text);
}
```

La respuesta trae, además del texto final, los bloques `mcp_tool_use` (qué
herramienta llamó y con qué datos) y `mcp_tool_result` (qué contestó la
plataforma). Sirven para guardar un registro de lo que hizo el agente.

---

## Paso 4 · Compruébalo

Cambia el mensaje por este y ejecuta:

> «¿Con qué cuenta estás conectado a GanaPlay?»

Debe contestar con el nombre, el correo y el perfil de la cuenta del token. Si
lo hace, el agente ya está listo.

---

## Qué puede hacer el agente

| Herramienta | Para qué sirve |
|---|---|
| `crear_solicitud` | Levanta una solicitud en el tablero, en estado Pendiente, y avisa a Diseño. |
| `listar_solicitudes` | Lista las solicitudes visibles, con filtros de estado, prioridad, área o texto. |
| `ver_solicitud` | Ficha completa de una solicitud por su número (`GP7054`). |
| `resumen_tablero` | Cuántas hay en cada estado, cuántas vencen hoy y cuántas van atrasadas. |
| `quien_soy` | Con qué cuenta y permisos está conectado. |

Al crear, el agente puede rellenar: **título** (lo único obligatorio), copy,
objetivo, fecha de entrega (`AAAA-MM-DD`), prioridad (Bajo, Medio, Alto,
Urgente), **área** (texto libre: Pauta, Redes Sociales, CMR, Directiva…),
**tipo** (Nueva Línea Gráfica, Giveaway, Línea Gráfica Existente o E-CARDS),
formato, dimensiones, países y canales.

**No puede** cambiar estados, asignar ni subir entregables: solo crea y
consulta. Tampoco salta permisos: ve exactamente lo que vería la persona dueña
del token.

---

## Recomendación: dale instrucciones de sistema

Para que el agente no cree solicitudes incompletas, añade un `system` a la
llamada:

```text
Cuando crees solicitudes en GanaPlay, confirma siempre el título y la fecha de
entrega antes de llamar a crear_solicitud. Si falta la fecha, pregúntala.
Usa prioridad Urgente solo si el usuario lo dice explícitamente.
```

Y si el agente trabaja solo, sin una persona que confirme, conviene que use
prioridad **Bajo** o **Medio** por defecto: las prioridades Alto y Urgente
envían un correo inmediato al equipo de Diseño.

---

## Si algo no funciona

| Lo que ves | Qué hacer |
|---|---|
| Error de validación sobre `mcp_servers` o `mcp_toolset` | Faltan las dos partes juntas, o el `mcp_server_name` no coincide con el `name` del servidor. |
| Error sobre un parámetro desconocido | La llamada tiene que ser `client.beta.messages` y llevar la beta `mcp-client-2025-11-20`. |
| «Token no válido» | El token está mal copiado o se invalidaron los tokens. Vuelve a copiarlo desde Mi perfil. |
| «Tu perfil no trabaja con el tablero» | La cuenta es Comercial: puede crear, no consultar. Es lo esperado. |
| El agente responde pero no crea nada | Revisa los bloques `mcp_tool_result`: ahí viene el motivo que dio la plataforma. |

---

## Seguridad

- El token va **siempre** en una variable de entorno o gestor de secretos.
- Un token por agente o por persona. No reutilices el tuyo en un agente
  compartido.
- Si un token se filtra, el Trafficker los invalida todos cambiando
  `MCP_TOKEN_SECRET` en Vercel, o solo el de esa cuenta sacándola del
  directorio de la plataforma.
