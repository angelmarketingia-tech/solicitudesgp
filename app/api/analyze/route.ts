import { NextResponse } from "next/server";
import { getAIClient } from "@/lib/ai";

/**
 * Evaluación IA de una pieza creativa entregada por el diseñador.
 * Devuelve { rating, color, explanation, validation }.
 *
 * Usa la capa de IA multi-proveedor (OpenAI o DeepSeek). Si no hay proveedor
 * configurado, responde en modo simulación para no bloquear la entrega.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageBase64, copy, format, country, dimensions } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: "No se proporcionó la imagen del creativo." },
        { status: 400 }
      );
    }

    const ai = getAIClient();

    // Modo simulación (sin proveedor de IA): no bloquea la entrega de la pieza.
    if (!ai) {
      return NextResponse.json({
        rating: 7,
        explanation:
          "Modo simulación: para una auditoría real, configura OPENAI_API_KEY o DEEPSEEK_API_KEY con saldo.",
        validation: "SIMULADO",
        color: "yellow",
      });
    }

    const prompt = `
Eres experto en marketing digital y Meta Ads, auditando el trabajo de un diseñador de GanaPlay.

DETALLES DEL REQUERIMIENTO:
- País objetivo: "${country || "No especificado"}"
- Dimensiones: "${dimensions || "No especificado"}"
- Formato: "${format || "No especificado"}"
- Copy base: "${copy || "No especificado"}"

Evalúa la viabilidad de la pieza según buenas prácticas de Meta Ads y devuelve ÚNICAMENTE
un objeto JSON válido (sin markdown) con EXACTAMENTE estas claves:
1. "rating": número entero del 1 al 10.
2. "color": "red" (1-4), "yellow" (5-7) o "green" (8-10).
3. "explanation": justificación técnica breve sobre el copy y el formato para ${country || "el país"}.
4. "validation": "APROBADO", "RECHAZADO" o "REQUIERE CAMBIOS".
NO inventes datos: si falta información, indícalo en "explanation".`;

    const response = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed);
  } catch (error: unknown) {
    console.error("Error en /api/analyze:", error);
    const status = typeof error === "object" && error && "status" in error
      ? (error as { status?: number }).status
      : undefined;
    if (status === 402) {
      return NextResponse.json(
        { error: "La cuenta de IA no tiene saldo. Recarga DeepSeek o configura OPENAI_API_KEY." },
        { status: 402 }
      );
    }
    const message = error instanceof Error ? error.message : "Error interno al analizar la pieza.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
