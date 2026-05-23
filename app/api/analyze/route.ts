import { NextResponse } from "next/server";
import type OpenAI from "openai";
import { getAIClient, getVisionClient } from "@/lib/ai";
import { buildBrandContextBlock, buildMetaSpecsBlock } from "@/lib/brand-context";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Evaluación IA de una pieza creativa entregada por el diseñador.
 * Devuelve { rating, color, explanation, validation, scores?, ... }.
 *
 * Si hay proveedor con visión real (OpenAI / OpenRouter / VISION_*),
 * la imagen se envía al modelo y la evaluación es visual.
 *
 * Si solo hay un proveedor de texto (DeepSeek), evalúa por metadatos
 * (copy, formato, país) sin "ver" la imagen y marca confidence="bajo".
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageBase64, copy, format, country, dimensions } = body as {
      imageBase64?: string;
      copy?: string;
      format?: string;
      country?: string;
      dimensions?: string;
    };

    if (!imageBase64) {
      return NextResponse.json(
        { error: "No se proporcionó la imagen del creativo." },
        { status: 400 }
      );
    }

    const vision = getVisionClient();
    const text = getAIClient();
    const provider = vision || text;

    if (!provider) {
      // Modo simulación: NO bloquea la entrega.
      return NextResponse.json({
        rating: 7,
        explanation:
          "Modo simulación: configura OPENAI_API_KEY o DEEPSEEK_API_KEY para evaluación real.",
        validation: "SIMULADO",
        color: "yellow",
        confidence: "bajo",
      });
    }

    const usingVision = !!vision;

    const ctxLines = [
      `País objetivo: "${country || "No especificado"}"`,
      `Dimensiones/Formato pieza: "${dimensions || "No especificado"}"`,
      `Formato técnico: "${format || "No especificado"}"`,
      `Copy base: "${copy || "No especificado"}"`,
    ].join("\n");

    const sysPrompt = `Eres auditor senior de Meta Ads para GanaPlay. Evalúa la pieza y devuelve SOLO JSON válido (sin markdown).

${buildBrandContextBlock()}

${buildMetaSpecsBlock()}

CONTEXTO DE LA SOLICITUD:
${ctxLines}

JSON requerido (claves EXACTAS):
{
  "rating": <1-10>,
  "color": "red" | "yellow" | "green",
  "validation": "APROBADO" | "RECHAZADO" | "REQUIERE CAMBIOS",
  "explanation": "<2-3 frases con la razón principal>",
  "confidence": "alto" | "medio" | "bajo",
  "scores": {
    "marca": <0-100>,
    "legibilidad": <0-100>,
    "jerarquia": <0-100>,
    "meta_ads": <0-100>,
    "calidad_creativa": <0-100>,
    "claridad_mensaje": <0-100>
  },
  "problemas_criticos": ["<...>", "..."],
  "recomendaciones": ["<...>", "..."],
  "primer_cambio": "<acción de mayor impacto>"
}

Reglas:
- color: red(1-4), yellow(5-7), green(8-10).
- Si NO recibiste imagen, confidence DEBE ser "bajo" y debes notarlo en explanation.
- No inventes elementos: solo describe lo que efectivamente observas.`;

    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] | string = usingVision
      ? [
          { type: "text", text: "Analiza esta pieza creativa según las reglas indicadas." },
          { type: "image_url", image_url: { url: imageBase64 } },
        ]
      : "Evalúa la pieza con base en el contexto provisto. No tienes acceso visual.";

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 55000);

    const response = await provider.client.chat.completions.create(
      {
        model: provider.model,
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1200,
        temperature: 0.3,
      },
      { signal: ctrl.signal }
    );
    clearTimeout(timer);

    const raw = response.choices[0]?.message?.content || "{}";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {
        rating: 6,
        color: "yellow",
        validation: "REQUIERE CAMBIOS",
        explanation: "No se pudo parsear la respuesta del modelo. Revisa manualmente.",
        confidence: "bajo",
      };
    }
    return NextResponse.json({
      ...parsed,
      _meta: { provider: provider.name, model: provider.model, vision: usingVision },
    });
  } catch (error: unknown) {
    console.error("Error en /api/analyze:", error);
    const status =
      typeof error === "object" && error && "status" in error
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
