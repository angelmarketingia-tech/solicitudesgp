# Conectar tu agente de IA a GanaPlay Diseño (MCP)

La plataforma tiene un **servidor MCP**: la puerta por la que un agente de IA
—Claude Code, un conector de claude.ai o cualquier cliente compatible— puede
**levantar solicitudes de diseño y consultar el tablero sin abrir la web**,
hablándole en lenguaje normal.

El agente entra **con la identidad de quien lo conecta**: las solicitudes que
cree salen a su nombre, el equipo de Diseño recibe el aviso como siempre, y el
agente solo ve lo que esa persona vería en pantalla.

**Dirección del servidor:** `https://solicitudes.ganaplay.lat/api/mcp`

---

## Paso 0 · Qué necesitas

- Una cuenta en la plataforma (tu correo corporativo y tu contraseña).
- Una cuenta de Claude de pago (**Pro, Max, Team o Enterprise**) o una clave de
  API de la consola de Anthropic. El plan gratuito no incluye Claude Code.
- Para la opción recomendada, **Claude Code** instalado en tu computador:

**Windows** (en PowerShell):

```bash
irm https://claude.ai/install.ps1 | iex
```

**macOS**:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

También sirve `npm install -g @anthropic-ai/claude-code` (requiere Node.js 22
o superior). Para comprobar que quedó instalado:

```bash
claude --version
```

---

## Paso 1 · Saca tu token (cada persona el suyo)

1. Entra a **solicitudes.ganaplay.lat** con tu correo corporativo.
2. Arriba a la derecha, pulsa **Mi perfil** (el icono de la persona).
3. Abajo del todo, abre **Conectar mi agente de IA**.
4. Escribe tu contraseña y pulsa **Mostrar mis datos de conexión**.

Aparecen tres formas de conectar, cada una con su botón **Copiar**. Desde esa
misma pantalla también se descarga esta guía.

> **El token equivale a tu cuenta.** No caduca y no se comparte: quien lo tenga
> puede crear solicitudes a tu nombre. No lo pegues en chats de grupo ni en
> correos. Si se te escapa, avisa al Trafficker (ver Paso 6).

---

## Paso 2 · Conéctalo

### Opción A · Claude Code (recomendada)

Es la más directa y la que está probada de punta a punta. Copia el comando de la
**opción 1** de la pantalla y pégalo en la terminal. Tiene esta forma:

```bash
claude mcp add --transport http --scope user ganaplay https://solicitudes.ganaplay.lat/api/mcp --header "Authorization: Bearer TU_TOKEN"
```

`--scope user` lo deja disponible en **todos** tus proyectos, no solo en la
carpeta donde lo ejecutes.

Comprueba la conexión:

```bash
claude mcp list
```

Debe aparecer `ganaplay: https://solicitudes.ganaplay.lat/api/mcp (HTTP) - ✓ Connected`.
Dentro de una sesión de Claude Code también puedes escribir `/mcp` para verlo.

### Opción B · Conector de claude.ai

claude.ai no deja escribir cabeceras, así que se usa el **enlace que ya lleva
el token dentro** (el de la **opción 2** de la pantalla):

1. En claude.ai: **Customize → Connectors → Add custom connector**.
   En planes Team o Enterprise lo añade quien administra la organización, desde
   **Organization settings → Connectors**.
2. Nombre: `GanaPlay Diseño`.
3. URL: pega el enlace copiado. Tiene esta forma:
   `https://solicitudes.ganaplay.lat/api/mcp/t/TU_TOKEN`
4. Guarda y activa el conector en la conversación.

Ese enlace **es** tu credencial: trátalo igual que una contraseña.

### Opción C · Agentes propios por API

Si el agente lo programas tú contra la API de Anthropic, pásale el servidor y el
token:

```json
{
  "mcp_servers": [{
    "type": "url",
    "url": "https://solicitudes.ganaplay.lat/api/mcp",
    "name": "ganaplay",
    "authorization_token": "TU_TOKEN"
  }]
}
```

### Opción D · Un subagente de Claude Code

Si tienes subagentes definidos en `.claude/agents/`, basta con nombrar el
servidor en su cabecera para que lo usen:

```yaml
mcpServers:
  - ganaplay
```

---

## Paso 3 · Comprueba que quedó bien

Pídele a tu agente, tal cual:

> «¿Con qué cuenta estás conectado a GanaPlay?»

Debe responder con tu nombre, tu correo y tu perfil. Si lo hace, ya está listo.

---

## Paso 4 · Úsalo

Háblale en lenguaje normal. Ejemplos que funcionan:

- «Levanta una solicitud urgente para el banner del Mundial, entrega el viernes,
  formato 1080x1080, para Facebook e Instagram.»
- «Crea una E-CARD de cumpleaños para el área de Directiva, entrega el día 30.»
- «¿Qué solicitudes mías siguen pendientes?»
- «Muéstrame la ficha de la GP7054.»
- «Resúmeme cómo va el tablero hoy: cuántas vencen hoy y cuántas van atrasadas.»

Al crear, el agente puede rellenar: **título** (lo único obligatorio), copy,
objetivo, fecha de entrega, prioridad (Bajo, Medio, Alto, Urgente), **área**
(texto libre: Pauta, Redes Sociales, CMR, Directiva o la que haga falta),
**tipo** (Nueva Línea Gráfica, Giveaway, Línea Gráfica Existente o E-CARDS),
formato, dimensiones, países y canales. Si le falta un dato importante, lo
preguntará antes de crearla.

Las herramientas que tiene:

| Herramienta | Para qué sirve |
|---|---|
| `crear_solicitud` | Levanta una solicitud en el tablero, en estado Pendiente, y avisa a Diseño. |
| `listar_solicitudes` | Lista lo que puedes ver, con filtros de estado, prioridad, área o texto. |
| `ver_solicitud` | Ficha completa de una solicitud por su número (`GP7054`). |
| `resumen_tablero` | Cuántas hay en cada estado, cuántas vencen hoy y cuántas van atrasadas. |
| `quien_soy` | Con qué cuenta y permisos está conectado. |

### Qué NO puede hacer

- **No cambia estados, no asigna ni sube entregables.** Solo crea y consulta:
  mover una solicitud a «En Proceso» o «Publicado» sigue siendo cosa de Diseño.
- **No salta permisos.** El Ejecutivo Comercial y el Operador tampoco ven por
  aquí las solicitudes del Trafficker.
- **El perfil Comercial no consulta el tablero**, igual que en la web: puede
  crear solicitudes, no listarlas.

---

## Paso 5 · Si algo no funciona

| Lo que ves | Qué hacer |
|---|---|
| `claude: command not found` | Claude Code no está instalado o hay que abrir una terminal nueva (Paso 0). |
| `claude mcp list` no muestra `ganaplay` | El comando del Paso 2 no se ejecutó. Vuelve a pegarlo. |
| Aparece como `✗ Failed` o `Needs authentication` | El token está mal copiado. Vuelve a copiarlo desde Mi perfil y repite el Paso 2 (antes: `claude mcp remove ganaplay`). |
| «Token no válido» | Igual que arriba. Si le pasa a todo el equipo a la vez, el Trafficker cambió el secreto (Paso 6): todos copian el suyo de nuevo. |
| «Tu perfil no trabaja con el tablero» | Tu perfil es Comercial: puedes crear, no consultar. Es lo esperado. |
| Tarda mucho o da error de conexión | Revisa que la plataforma abra en el navegador. Si la web va lenta, el agente también. |

Para quitar la conexión: `claude mcp remove ganaplay`.

---

## Paso 6 · Si un token se filtra

Los tokens no se guardan en ninguna base: se calculan a partir del correo con un
secreto del servidor. Para invalidarlos **todos** a la vez, el Trafficker cambia
la variable `MCP_TOKEN_SECRET` en Vercel y vuelve a desplegar. Después, cada
persona copia el suyo de nuevo desde Mi perfil.

Para dar de baja a una sola persona, basta con sacarla del directorio de la
plataforma: su token deja de valer al instante.

---

## Anexo · Para quien administra el servidor

| Variable en Vercel | Para qué |
|---|---|
| `MCP_TOKEN_SECRET` | Secreto con el que se calculan los tokens. **Recomendada.** Sin ella se calculan a partir de las contraseñas compartidas, y cambiar una contraseña invalidaría a la vez todos los tokens del equipo. |

Las dos direcciones son el mismo servidor, con los mismos permisos:

| Dirección | Cómo autentica | Para quién |
|---|---|---|
| `POST /api/mcp` | Cabecera `Authorization: Bearer` | Claude Code, API y clientes que admiten cabeceras. Es la recomendada. |
| `POST /api/mcp/t/<token>` | El token va en la dirección | Conectores de claude.ai, que solo piden una URL. |

La segunda existe porque esos clientes no ofrecen dónde escribir una cabecera.
Tiene el coste de que la credencial queda en los registros y en el historial
del navegador, por eso se ofrece como alternativa y no como vía principal.
