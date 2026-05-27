/**
 * Rate limiter in-memory por IP.
 *
 * Limitación honesta: en serverless (Vercel) cada instancia de función tiene
 * su propio mapa. Un atacante distribuyendo entre regiones podría obtener
 * más intentos que el límite teórico. Aún así, frena el caso típico de un
 * script desde una IP intentando brute force de passwords (que es la 99%
 * de los ataques reales contra endpoints como /api/auth).
 *
 * Para seguridad enterprise real se debe migrar a Vercel KV / Upstash Redis.
 *
 * Uso:
 *   import { checkRateLimit } from "@/lib/rate-limit";
 *   const limited = checkRateLimit(`auth:${ip}`, { max: 10, windowMs: 60_000 });
 *   if (limited) return new Response(...) con 429.
 */

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

// Limpieza opportunística para evitar memory leak en instancias long-lived.
let lastCleanup = 0;
function cleanup(now: number) {
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, b] of store.entries()) {
    if (b.resetAt < now) store.delete(key);
  }
}

export type RateLimitOptions = {
  max: number;
  windowMs: number;
};

export type RateLimitResult = {
  limited: boolean;
  remaining: number;
  resetInMs: number;
};

export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  cleanup(now);

  const bucket = store.get(key);
  if (!bucket || bucket.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { limited: false, remaining: opts.max - 1, resetInMs: opts.windowMs };
  }

  if (bucket.count >= opts.max) {
    return { limited: true, remaining: 0, resetInMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { limited: false, remaining: opts.max - bucket.count, resetInMs: bucket.resetAt - now };
}

/**
 * Extrae la IP del cliente. Vercel pone la IP real en x-forwarded-for o
 * x-real-ip. Si no hay header, usamos un valor por defecto que efectivamente
 * agrupa requests no identificables (defensa en profundidad).
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
