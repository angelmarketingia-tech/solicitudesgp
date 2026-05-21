/**
 * Capa de servicio para la API IFS.
 *
 * ⚠️ Estado: PREPARADA, no conectada a endpoints reales.
 * En el repositorio no existe documentación de la API IFS, por lo que esta capa
 * deja la integración lista (cliente, autenticación, manejo de errores y logs)
 * sin inventar rutas ni contratos. Cuando se disponga de la documentación de IFS,
 * basta con definir los métodos concretos usando `ifsRequest()`.
 *
 * Variables de entorno:
 *  - IFS_BASE_URL   → URL base de la API IFS (p.ej. https://ifs.empresa.com/api)
 *  - IFS_API_KEY    → token / API key de IFS
 *  - IFS_TIMEOUT_MS → (opcional) timeout en milisegundos, por defecto 10000
 *
 * No se hardcodean credenciales: todo se lee de variables de entorno.
 */

export type IfsResult<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
};

/** Indica si la integración IFS tiene las variables mínimas configuradas. */
export function isIfsConfigured(): boolean {
  return Boolean(process.env.IFS_BASE_URL && process.env.IFS_API_KEY);
}

/**
 * Cliente HTTP genérico para IFS. Maneja autenticación, timeout y errores
 * con mensajes claros. Devuelve un resultado tipado en lugar de lanzar.
 */
export async function ifsRequest<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<IfsResult<T>> {
  const baseUrl = process.env.IFS_BASE_URL;
  const apiKey = process.env.IFS_API_KEY;
  const timeoutMs = Number(process.env.IFS_TIMEOUT_MS || 10000);

  if (!baseUrl || !apiKey) {
    return {
      ok: false,
      error: "Integración IFS no configurada (faltan IFS_BASE_URL o IFS_API_KEY).",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
    const res = await fetch(url, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* respuesta no-JSON: se devuelve como texto */
    }

    if (!res.ok) {
      console.error(`[IFS] ${res.status} en ${path}`);
      return {
        ok: false,
        status: res.status,
        error: `IFS respondió ${res.status}.`,
        data: data as T,
      };
    }

    return { ok: true, status: res.status, data: data as T };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    const message = aborted
      ? `Tiempo de espera agotado (${timeoutMs} ms) al contactar IFS.`
      : err instanceof Error
        ? err.message
        : "Error desconocido al contactar IFS.";
    console.error("[IFS] Error de conexión:", message);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Comprobación de estado de la integración IFS.
 * No llama a ningún endpoint real: solo informa si la configuración existe.
 */
export function getIfsStatus(): { configured: boolean; message: string } {
  return isIfsConfigured()
    ? { configured: true, message: "Integración IFS configurada y lista para usar." }
    : {
        configured: false,
        message:
          "Integración IFS preparada pero no configurada. Define IFS_BASE_URL e IFS_API_KEY " +
          "y los endpoints concretos cuando esté disponible la documentación de IFS.",
      };
}
