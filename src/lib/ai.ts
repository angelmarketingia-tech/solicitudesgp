import OpenAI from "openai";

/**
 * Capa de IA multi-proveedor.
 *
 * Detecta automáticamente qué proveedor usar según las variables de entorno:
 *  1. OPENAI_API_KEY   → OpenAI (api.openai.com)
 *  2. DEEPSEEK_API_KEY → DeepSeek (api.deepseek.com), compatible con el SDK de OpenAI
 *
 * Así basta con configurar UNA clave con saldo. Si ninguna está presente,
 * getAIClient() devuelve null y las rutas usan un modo simulación que NO
 * bloquea el flujo de la aplicación.
 */

export type AIProvider = {
  client: OpenAI;
  model: string;
  name: "openai" | "deepseek";
};

export function getAIClient(): AIProvider | null {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return {
      client: new OpenAI({ apiKey: openaiKey }),
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      name: "openai",
    };
  }

  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (deepseekKey) {
    return {
      client: new OpenAI({ apiKey: deepseekKey, baseURL: "https://api.deepseek.com" }),
      model: "deepseek-chat",
      name: "deepseek",
    };
  }

  return null;
}

/** true si hay al menos un proveedor de IA configurado. */
export function isAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY);
}
