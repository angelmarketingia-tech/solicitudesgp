import OpenAI from "openai";

/**
 * Capa de IA multi-proveedor con soporte real de visión.
 *
 * Detección por variables de entorno:
 *  1. OPENAI_API_KEY        → OpenAI (api.openai.com). Soporta texto + visión.
 *  2. OPENROUTER_API_KEY    → OpenRouter. Soporta texto + visión (modelo configurable).
 *  3. DEEPSEEK_API_KEY      → DeepSeek (api.deepseek.com). Solo texto (deepseek-chat).
 *
 * Para análisis de imágenes:
 *  - getVisionClient() selecciona el primer proveedor con visión real.
 *  - Si solo hay DeepSeek, se devuelve null para que la ruta responda
 *    honestamente que falta configurar visión (no se finge ver imágenes).
 *
 * NOTA IMPORTANTE — POLÍTICAS DE CONTENIDO Y APUESTAS:
 *  OpenAI puede aplicar "safe completions" a contenido de operadores de
 *  juego, incluso licenciados. Si el chat empieza a rechazar o suavizar
 *  feedback creativo, cambia a OpenRouter con un modelo de visión más
 *  permisivo. Sugerencias probadas con sportsbooks LATAM:
 *
 *    OPENROUTER_API_KEY=sk-or-v1-...
 *    OPENROUTER_MODEL=google/gemini-2.5-flash        # vision, políticas moderadas
 *    OPENROUTER_MODEL=anthropic/claude-haiku-4-5     # vision, calidad alta
 *    OPENROUTER_MODEL=qwen/qwen2.5-vl-72b-instruct   # open, muy permisivo
 *    OPENROUTER_MODEL=meta-llama/llama-3.2-90b-vision-instruct  # open
 *
 *  Para texto puro de razonamiento (sin imagen) DeepSeek sigue siendo la
 *  opción más permisiva y barata. Combinación recomendada:
 *
 *    DEEPSEEK_API_KEY=...        # razonamiento textual (preferida)
 *    OPENROUTER_API_KEY=...      # visión cuando se adjunta imagen
 *
 *  Si solo configuras OPENROUTER_API_KEY, el sistema lo usa para ambos.
 */

export type AIProvider = {
  client: OpenAI;
  model: string;
  name: "openai" | "openrouter" | "deepseek";
  supportsVision: boolean;
};

function envFlag(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/** Proveedor para tareas de texto/razonamiento. */
export function getAIClient(): AIProvider | null {
  const openaiKey = envFlag("OPENAI_API_KEY");
  if (openaiKey) {
    return {
      client: new OpenAI({ apiKey: openaiKey }),
      model: envFlag("OPENAI_MODEL") || "gpt-4o-mini",
      name: "openai",
      supportsVision: true,
    };
  }

  const openrouterKey = envFlag("OPENROUTER_API_KEY");
  if (openrouterKey) {
    return {
      client: new OpenAI({
        apiKey: openrouterKey,
        baseURL: "https://openrouter.ai/api/v1",
      }),
      model: envFlag("OPENROUTER_MODEL") || "openai/gpt-4o-mini",
      name: "openrouter",
      supportsVision: true,
    };
  }

  const deepseekKey = envFlag("DEEPSEEK_API_KEY");
  if (deepseekKey) {
    return {
      client: new OpenAI({ apiKey: deepseekKey, baseURL: "https://api.deepseek.com" }),
      model: "deepseek-chat",
      name: "deepseek",
      supportsVision: false,
    };
  }

  return null;
}

/**
 * Proveedor con capacidad de visión real. Devuelve null si no hay ninguno.
 * Preferencia: OpenAI > OpenRouter. DeepSeek-chat NO se considera vision-capable.
 */
export function getVisionClient(): AIProvider | null {
  const provider = getAIClient();
  if (provider && provider.supportsVision) return provider;

  // Fallback explícito: si hay DEEPSEEK_API_KEY pero NO una key con visión,
  // intentamos una segunda key específica de visión si está configurada.
  const visionKey = envFlag("VISION_API_KEY");
  if (visionKey) {
    return {
      client: new OpenAI({
        apiKey: visionKey,
        baseURL: envFlag("VISION_BASE_URL") || "https://api.openai.com/v1",
      }),
      model: envFlag("VISION_MODEL") || "gpt-4o-mini",
      name: "openai",
      supportsVision: true,
    };
  }

  return null;
}

export function isAIConfigured(): boolean {
  return Boolean(
    envFlag("OPENAI_API_KEY") || envFlag("DEEPSEEK_API_KEY") || envFlag("OPENROUTER_API_KEY")
  );
}

export function isVisionConfigured(): boolean {
  return getVisionClient() !== null;
}
