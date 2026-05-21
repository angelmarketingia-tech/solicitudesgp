import { NextResponse } from "next/server";
import { getAIClient } from "@/lib/ai";

/**
 * Análisis de brief con IA — feedback estructurado para el equipo de diseño.
 *
 * Devuelve SIEMPRE el formato:
 * {
 *   resumen: string,
 *   faltantes: string[],
 *   preguntas_sugeridas: string[],
 *   checklist: string[],
 *   riesgos: string[],
 *   recomendaciones: string[]
 * }
 *
 * Regla clave: la IA NO inventa información. Si un dato no está en el brief,
 * debe declararlo como faltante en lugar de suponerlo.
 *
 * Usa la API de DeepSeek (variable DEEPSEEK_API_KEY). Si no hay key, responde
 * en modo simulación para no bloquear el flujo de la aplicación.
 */

type BriefInput = {
  title?: string;
  copy?: string;
  objective?: string;
  area?: string;
  channels?: string[];
  countries?: string[];
  dimensions?: string[];
  format?: string;
  deliveryDate?: string;
  priority?: string;
};

const EMPTY_FEEDBACK = {
  resumen: "",
  faltantes: [] as string[],
  preguntas_sugeridas: [] as string[],
  checklist: [] as string[],
  riesgos: [] as string[],
  recomendaciones: [] as string[],
};

function normalize(parsed: Record<string, unknown>) {
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
  return {
    resumen: typeof parsed.resumen === "string" ? parsed.resumen : "",
    faltantes: arr(parsed.faltantes),
    preguntas_sugeridas: arr(parsed.preguntas_sugeridas),
    checklist: arr(parsed.checklist),
    riesgos: arr(parsed.riesgos),
    recomendaciones: arr(parsed.recomendaciones),
  };
}

export async function POST(req: Request) {
  try {
    const brief: BriefInput = await req.json();

    const missingFields: string[] = [];
    if (!brief.objective) missingFields.push("Objetivo de la pieza no especificado.");
    if (!brief.copy) missingFields.push("Copy / instrucción principal no especificado.");
    if (!brief.deliveryDate) missingFields.push("Fecha límite de entrega no especificada.");
    if (!brief.dimensions || brief.dimensions.length === 0) missingFields.push("Dimensiones / formatos no especificados.");
    if (!brief.channels || brief.channels.length === 0) missingFields.push("Canales de difusión no especificados.");

    const ai = getAIClient();

    // ── Modo simulación (sin proveedor de IA): feedback derivado de los datos reales ──
    if (!ai) {
      const today = new Date().toISOString().split("T")[0];
      const riesgos: string[] = [];
      if (brief.deliveryDate && brief.deliveryDate <= today) {
        riesgos.push("La fecha de entrega es hoy o ya pasó: riesgo alto de incumplimiento.");
      }
      if (brief.priority === "Urgente" || brief.priority === "Alto") {
        riesgos.push(`Prioridad ${brief.priority}: requiere atención inmediata del equipo.`);
      }
      return NextResponse.json({
        ...EMPTY_FEEDBACK,
        resumen:
          `Modo simulación (sin proveedor de IA con saldo). Solicitud "${brief.title || "sin título"}" ` +
          `para ${brief.area || "área no indicada"}. Configura OPENAI_API_KEY o recarga DeepSeek para el análisis completo.`,
        faltantes: missingFields,
        preguntas_sugeridas: missingFields.length
          ? ["¿Puedes completar los datos marcados como faltantes antes de iniciar el diseño?"]
          : [],
        checklist: [
          "Revisar referencias y línea gráfica de marca GanaPlay.",
          "Confirmar dimensiones exactas con el solicitante.",
          "Validar legibilidad del copy y del CTA.",
        ],
        riesgos,
        recomendaciones: ["Aplicar el manual de marca GanaPlay (verde #00783e protagonista)."],
      });
    }

    const prompt = `
Eres asistente del equipo creativo de GanaPlay (apuestas deportivas en El Salvador y Guatemala).
Analiza el siguiente BRIEF de una solicitud de diseño y ayuda al diseñador.

REGLA CRÍTICA: NO inventes información. Si un dato no aparece en el brief, decláralo
en "faltantes" en lugar de suponerlo.

BRIEF:
- Título: ${brief.title || "(no especificado)"}
- Área solicitante: ${brief.area || "(no especificada)"}
- Objetivo de la pieza: ${brief.objective || "(no especificado)"}
- Copy / instrucción: ${brief.copy || "(no especificado)"}
- Formato: ${brief.format || "(no especificado)"}
- Dimensiones: ${(brief.dimensions || []).join(", ") || "(no especificadas)"}
- Canales: ${(brief.channels || []).join(", ") || "(no especificados)"}
- Países: ${(brief.countries || []).join(", ") || "(no especificados)"}
- Fecha de entrega: ${brief.deliveryDate || "(no especificada)"}
- Prioridad: ${brief.priority || "(no especificada)"}
- Fecha de hoy: ${new Date().toISOString().split("T")[0]}

Devuelve ÚNICAMENTE un objeto JSON válido (sin markdown) con EXACTAMENTE estas claves:
{
  "resumen": "string — resumen breve y claro del brief",
  "faltantes": ["datos críticos que faltan para diseñar bien"],
  "preguntas_sugeridas": ["preguntas concretas para el solicitante"],
  "checklist": ["pasos de producción y entrega"],
  "riesgos": ["riesgos de plazo o de claridad"],
  "recomendaciones": ["recomendaciones alineadas a la marca GanaPlay"]
}
Todas las claves son obligatorias. Usa arreglos vacíos si no aplica. Español latinoamericano.`;

    const response = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 1100,
    });

    const raw = response.choices[0]?.message?.content || "{}";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "La IA devolvió una respuesta no válida." },
        { status: 502 }
      );
    }

    const result = normalize(parsed);
    // Garantiza que los faltantes detectados localmente estén presentes.
    for (const m of missingFields) {
      if (!result.faltantes.some((f) => f.toLowerCase().includes(m.toLowerCase().slice(0, 12)))) {
        result.faltantes.push(m);
      }
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Error en brief-feedback:", error);
    const status = typeof error === "object" && error && "status" in error
      ? (error as { status?: number }).status
      : undefined;
    if (status === 402) {
      return NextResponse.json(
        { error: "La cuenta de IA no tiene saldo. Recarga DeepSeek o configura OPENAI_API_KEY." },
        { status: 402 }
      );
    }
    const message = error instanceof Error ? error.message : "Error interno al analizar el brief.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
