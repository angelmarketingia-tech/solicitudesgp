# Pruebas E2E — GanaPlay Diseño

Red de seguridad de la app: comprueba que el acceso, los permisos por perfil,
el ciclo de una solicitud y los enlaces públicos siguen funcionando después de
cada cambio.

## Cómo se corren

```bash
# Contra el servidor local (lo levanta solo)
E2E_ADMIN_PASS=… E2E_GENERAL_PASS=… E2E_DESIGNER_PASS=… npm run e2e

# Contra producción
E2E_BASE_URL=https://solicitudes.ganaplay.lat E2E_ADMIN_PASS=… … npm run e2e

# Solo un archivo
npx playwright test e2e/permisos.spec.ts

# Si una ejecución se corta a la mitad y deja basura
npm run e2e:limpiar
```

### Variables

| Variable | Para qué | Si falta |
|---|---|---|
| `E2E_ADMIN_PASS` | Trafficker (`AUTH_PASS_TRAFFICKER`) | se saltan sus pruebas |
| `E2E_GENERAL_PASS` | CM, Operador, Directivos (`AUTH_PASS_GENERAL`) | se saltan sus pruebas |
| `E2E_DESIGNER_PASS` | Diseño (`AUTH_PASS_DESIGNER`) | se saltan sus pruebas |
| `E2E_BASE_URL` | A dónde apuntar | `http://localhost:3000` |
| `E2E_ALLOW_WRITES=1` | Habilita las pruebas que crean cuentas de Firebase Auth | esas se saltan |
| `E2E_INFLUENCER_CODE` | Código de una influencer con contenido | se saltan las del link |
| `E2E_LIVE=1` | Llama de verdad a la IA (gasta créditos) | se saltan |

Nunca se escriben contraseñas en el código: si falta una variable, la prueba se
salta con un motivo visible en vez de fallar.

## Cómo está montada

**Se inicia sesión UNA vez por perfil.** `auth.setup.ts` entra con los cinco
perfiles y guarda el estado en `e2e/.auth/`; el resto de pruebas arrancan ya
dentro. No es una optimización: `/api/auth` limita a **15 intentos por minuto y
por IP**, así que una suite donde cada prueba hace login se bloquea a sí misma y
falla en sitios al azar, aparentando errores de la app.

El único archivo que hace login de verdad es `acceso.spec.ts`, y va en serie.

**Lo que se escribe, se borra.** Las pruebas que crean datos usan
`helpers/datos.ts`: todo lleva el marcador `[E2E]` y se borra en `afterAll`,
incluidos los archivos en Storage y las notificaciones. Ya pasó una vez que una
prueba escribió sobre una solicitud real y hubo que reconstruirla a mano; de ahí
que esto sea explícito.

## Qué cubre cada archivo

| Archivo | Qué garantiza |
|---|---|
| `salud.spec.ts` | El sitio responde, carga en tiempo razonable y sin errores de consola. Rutas y códigos inválidos no rompen nada. |
| `acceso.spec.ts` | Se entra por rol; la contraseña de un perfil **no** abre otro; la sesión sobrevive al recargar y se cierra bien. |
| `permisos.spec.ts` | Matriz completa: qué secciones ve cada perfil, quién tiene la IA, quién puede borrar, y que Quota no ve lo del Trafficker. |
| `flujo-solicitud.spec.ts` | Crear (solo el nombre es obligatorio), numeración sin repetidos, cambiar estado, entregar GIF y MP4, comentar y declinar. |
| `perfil-password.spec.ts` | "Mi perfil": cambio de contraseña, validaciones y ciclo completo. |
| `link-influencer.spec.ts` | El link público abre **sin sesión** y el que copia el CM es siempre el público, nunca el de su navegador. |
| `social-media.spec.ts` | Calendario de Redes Sociales, carpetas y permisos de solo lectura. |
| `flujo.spec.ts` | Navegación del tablero y preselecciones por perfil. |
| `referencias-upload.spec.ts` | Adjuntar un Word pesado como referencia. |
| `chat-vision*.spec.ts` | IA Andromeda (la versión `-live` solo con `E2E_LIVE=1`). |

## Si algo falla

1. **"Demasiados intentos"** → se superó el límite de `/api/auth`. Espera un
   minuto; si sale siempre, revisa que no se haya colado un login manual en
   alguna prueba (deben usar `storageState`).
2. **Fallos solo al correr todo junto** → suele ser tiempo, no un fallo real.
   Prueba el archivo suelto antes de dar por rota la app.
3. **Sesiones caducadas** → borra `e2e/.auth/` y vuelve a correr.
