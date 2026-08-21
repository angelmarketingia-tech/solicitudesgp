# Conectar un agente de IA a GanaPlay Diseño (MCP)

La plataforma expone un **servidor MCP** en `/api/mcp`. Cualquier agente de IA
compatible —Claude Code, Claude Desktop y otros clientes MCP— puede levantar y
consultar solicitudes de diseño sin abrir la web.

El agente entra **con la identidad de quien lo conecta**: las solicitudes que
cree salen a su nombre y solo ve lo que esa persona vería en pantalla.

---

## 1. Sacar el token (cada persona el suyo)

1. Entrar a la plataforma con el correo corporativo.
2. Botón **Mi perfil** (arriba a la derecha) → **Conectar mi agente de IA**.
3. Confirmar la contraseña. Aparecen la dirección del servidor y el token.

El token **no caduca** y equivale a la cuenta: no se comparte ni se pega en un
chat de grupo. Si se filtra, se revocan todos cambiando `MCP_TOKEN_SECRET` en
Vercel (todo el equipo tendrá que volver a copiar el suyo).

## 2. Conectarlo

**Claude Code** — en la terminal, con el comando que la propia pantalla ofrece
copiar:

```bash
claude mcp add --transport http ganaplay https://solicitudesgp.vercel.app/api/mcp \
  --header "Authorization: Bearer TU_TOKEN"
```

**Otros clientes MCP** — servidor HTTP (Streamable HTTP), URL
`https://solicitudesgp.vercel.app/api/mcp`, cabecera
`Authorization: Bearer TU_TOKEN`.

Para comprobar que quedó bien, pedirle al agente: *"¿con qué cuenta estás
conectado a GanaPlay?"* — usará `quien_soy` y responderá con el nombre, el
correo y el perfil.

---

## Qué puede hacer el agente

| Herramienta | Para qué sirve |
|---|---|
| `crear_solicitud` | Levanta una solicitud en el tablero, en estado Pendiente, y avisa a Diseño. |
| `listar_solicitudes` | Lista lo visible, con filtros de estado, prioridad, área o texto. |
| `ver_solicitud` | Ficha completa de una solicitud por su identificador (`GP6859`). |
| `resumen_tablero` | Cuántas hay en cada estado, cuántas vencen hoy y cuántas van atrasadas. |
| `quien_soy` | Con qué cuenta y permisos está conectado. |

Ejemplos de lo que se le puede pedir:

- *"Levanta una solicitud urgente para el banner del Mundial, entrega el viernes,
  formato 1080x1080, para Facebook e Instagram."*
- *"¿Qué solicitudes mías siguen pendientes?"*
- *"Resúmeme cómo va el tablero hoy."*

## Qué NO puede hacer

- **No cambia estados ni sube entregables.** Solo crea y consulta; mover una
  solicitud a "En Proceso" o "Publicado" sigue siendo cosa de las personas.
- **No salta permisos.** El Ejecutivo Comercial y el Operador tampoco ven por
  aquí las solicitudes que levanta el Trafficker, ni por lista ni pidiendo un
  identificador concreto.
- **El perfil Comercial no consulta el tablero**, igual que en la web: puede
  crear solicitudes, no listarlas.

---

## Configuración del servidor

| Variable | Para qué |
|---|---|
| `MCP_TOKEN_SECRET` | Secreto con el que se derivan los tokens. **Recomendada.** Sin ella se derivan de las contraseñas compartidas, y rotar una contraseña invalidaría también los tokens. |

Los tokens no se guardan en ninguna base: se derivan del correo con ese secreto
y se verifican en cada petición. Dar de baja a alguien es sacarlo del directorio
(`src/lib/team.ts` o la variable `AUTH_USERS`), y su token deja de valer.
