# Conectar tu agente de IA a GanaPlay Diseño

La plataforma tiene un **servidor MCP**: la puerta por la que un agente de IA
—Claude Code, un conector de claude.ai, Claude Desktop o cualquier cliente
compatible— puede **levantar solicitudes de diseño y consultar el tablero sin
abrir la web**.

El agente entra **con la identidad de quien lo conecta**: las solicitudes que
cree salen a su nombre y solo ve lo que esa persona vería en pantalla.

---

## Paso 1 · Saca tu token (cada persona el suyo)

1. Entra a la plataforma con tu correo corporativo.
2. Arriba a la derecha, pulsa **Mi perfil** (el icono de la persona).
3. Abajo del todo, abre **Conectar mi agente de IA**.
4. Escribe tu contraseña y pulsa **Mostrar mis datos de conexión**.

Aparecen las tres formas de conectar, cada una con su botón de **Copiar**.

> **El token equivale a tu cuenta.** No caduca y no se comparte: quien lo tenga
> puede crear solicitudes a tu nombre. Si se te escapa, avisa al Trafficker
> para revocarlo (Paso 5).

---

## Paso 2 · Conéctalo

Elige el camino según dónde viva tu agente.

### A · Claude Code (terminal)

Pega el comando que te dio la pantalla. Es así:

```bash
claude mcp add --transport http --scope user ganaplay \
  https://solicitudes.ganaplay.lat/api/mcp \
  --header "Authorization: Bearer TU_TOKEN"
```

`--scope user` lo deja disponible en **todos** tus proyectos. Si lo quieres solo
en uno, cambia a `--scope project` desde la carpeta de ese proyecto.

Para comprobarlo:

```bash
claude mcp list          # debe decir "ganaplay: connected"
```

### B · Conector de claude.ai o Claude Desktop

Estos no dejan escribir cabeceras, así que se usa el **enlace que ya lleva el
token dentro** (el de la opción 2 de la pantalla):

1. Ajustes → **Conectores** → **Añadir conector personalizado**.
2. Nombre: `GanaPlay Diseño`.
3. URL: pega el enlace copiado, con esta forma:
   `https://solicitudes.ganaplay.lat/api/mcp/t/TU_TOKEN`
4. Guarda y activa el conector.

Ese enlace **es** tu credencial: trátalo como una contraseña y no lo pegues en
un chat de grupo.

### C · Por API (agentes propios)

Si el agente lo llamas tú desde código, pásale el servidor y el token:

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

---

## Paso 3 · Comprueba que quedó bien

Pídele a tu agente, tal cual:

> «¿Con qué cuenta estás conectado a GanaPlay?»

Debe responder con tu nombre, tu correo y tu perfil. Si dice que no encuentra
la herramienta o que el token no vale, vuelve al Paso 1 y copia de nuevo.

---

## Paso 4 · Qué puede hacer tu agente

| Herramienta | Para qué sirve |
|---|---|
| `crear_solicitud` | Levanta una solicitud en el tablero, en estado Pendiente, y avisa a Diseño. |
| `listar_solicitudes` | Lista lo que puedes ver, con filtros de estado, prioridad, área o texto. |
| `ver_solicitud` | Ficha completa de una solicitud por su identificador (`GP7054`). |
| `resumen_tablero` | Cuántas hay en cada estado, cuántas vencen hoy y cuántas van atrasadas. |
| `quien_soy` | Con qué cuenta y permisos está conectado. |

Cosas que le puedes pedir, en lenguaje normal:

- «Levanta una solicitud urgente para el banner del Mundial, entrega el viernes,
  formato 1080x1080, para Facebook e Instagram.»
- «Crea una E-CARD de cumpleaños para el área de Directiva, entrega el día 30.»
- «¿Qué solicitudes mías siguen pendientes?»
- «Resúmeme cómo va el tablero hoy.»

Al crear, el agente puede rellenar: título (lo único obligatorio), copy,
objetivo, fecha de entrega, prioridad, **área** (texto libre: Pauta, Redes
Sociales, CMR, Directiva o la que haga falta), **tipo** (Nueva Línea Gráfica,
Giveaway, Línea Gráfica Existente o E-CARDS), formato, dimensiones, países y
canales.

### Qué NO puede hacer

- **No cambia estados ni sube entregables.** Solo crea y consulta; mover una
  solicitud a «En Proceso» o «Publicado» sigue siendo cosa de las personas.
- **No salta permisos.** El Ejecutivo Comercial y el Operador tampoco ven por
  aquí las solicitudes que levanta el Trafficker.
- **El perfil Comercial no consulta el tablero**, igual que en la web: puede
  crear solicitudes, no listarlas.

---

## Paso 5 · Si un token se filtra

Los tokens no se guardan en ninguna base: se derivan del correo con un secreto
del servidor. Para invalidarlos **todos** a la vez, se cambia la variable
`MCP_TOKEN_SECRET` en Vercel. Después, cada persona vuelve a copiar el suyo
desde Mi perfil.

Para dar de baja a UNA persona, basta sacarla del directorio
(`src/lib/team.ts` o la variable `AUTH_USERS`): su token deja de valer al
instante.

---

## Para quien administra el servidor

| Variable | Para qué |
|---|---|
| `MCP_TOKEN_SECRET` | Secreto con el que se derivan los tokens. **Recomendada.** Sin ella se derivan de las contraseñas compartidas, y rotar una contraseña invalidaría también todos los tokens. |

Las dos direcciones son el mismo servidor y respetan los mismos permisos:

| Dirección | Cómo autentica | Para quién |
|---|---|---|
| `POST /api/mcp` | Cabecera `Authorization: Bearer` | Claude Code, API, clientes que admiten cabeceras. Es lo recomendado. |
| `POST /api/mcp/t/<token>` | El token va en la dirección | Conectores de claude.ai y Claude Desktop, que solo piden una URL. |

La segunda existe porque esos clientes no ofrecen dónde escribir una cabecera.
Tiene el coste de que la credencial queda en los registros del servidor y en el
historial del navegador, así que se ofrece como alternativa, nunca como la vía
principal.
