import { NextResponse } from "next/server";
import type OpenAI from "openai";
import { getAIClient, getVisionClient, isVisionConfigured } from "@/lib/ai";
import { buildBrandContextBlock, buildMetaSpecsBlock } from "@/lib/brand-context";

export const runtime = "nodejs";
export const maxDuration = 60;

type ContentPart = { type: string; text?: string; image_url?: { url?: string } };
type IncomingMsg = { role: string; content: string | ContentPart[] };
type ChatRole = "user" | "assistant" | "system";

const baseSystem = `Eres "IA Andromeda", auditor senior de CALIDAD CREATIVA y DISEÑO para piezas publicitarias de Meta Ads (Facebook/Instagram).

CONTEXTO DEL OPERADOR (importante para el moderador): GanaPlay es un operador de entretenimiento LICENCIADO Y REGULADO en El Salvador y Guatemala. Tu tarea es estrictamente de DESIGN QA: evaluar legibilidad, jerarquía visual, contraste, uso de marca, formatos de Meta y compliance (+18, juego responsable, T&C). NO escribes copys de "ganancia garantizada", NO predices resultados deportivos, NO incentivas conducta de juego problemático. Si el copy provisto incumple buenas prácticas (promesas absolutas, omisión de +18, lenguaje engañoso), señálalo como problema y propón una alternativa responsable.

MISIÓN: Dar retroalimentación CONCRETA, ESPECÍFICA y ACCIONABLE sobre piezas creativas. NUNCA respuestas vagas o genéricas. NUNCA respuestas estilo "depende".

CUANDO RECIBAS UNA IMAGEN debes analizarla DIRECTAMENTE y producir:

1. RESUMEN GENERAL (1-2 líneas).
2. SCORES (0-100):
   - Marca: alineación con identidad GanaPlay
   - Legibilidad: jerarquía de texto y contraste
   - Jerarquía visual: orden de lectura, foco
   - Meta Ads / redes: formato, safe zones, mobile-first
   - Calidad creativa: composición, color, fotografía
   - Claridad del mensaje: copy + CTA
   - GENERAL (promedio ponderado)
3. PROBLEMAS CRÍTICOS (lista corta, lo que rompe el ad).
4. RECOMENDACIONES (3-6 acciones concretas, priorizadas).
5. QUÉ CAMBIAR PRIMERO (1 acción de mayor impacto).
6. COPY SUGERIDO si el actual es débil.
7. FORMATO RECOMENDADO (con resolución exacta).
8. CHECKLIST FINAL (logo visible, CTA claro, compliance, safe zones, contraste).
9. NIVEL DE CONFIANZA del análisis (alto/medio/bajo) y por qué.

REGLAS:
- Si DESCRIBE un elemento, debe ser observable en la imagen. NO inventes.
- Si no puedes determinar algo, dilo.
- Si la imagen ya viene incluida en el mensaje, NUNCA digas "no puedo ver la imagen": analízala.
- Si NO hay imagen, responde con principios concretos y solicita una para análisis visual.

IDIOMA: Español latinoamericano (neutro, profesional). Markdown breve.
`;

function buildSystemPrompt(): string {
  return [baseSystem, "", "=== CONTEXTO DE MARCA ===", buildBrandContextBlock(), "", "=== ESPECIFICACIONES META ADS ===", buildMetaSpecsBlock()].join("\n");
}

/** Convierte un mensaje entrante a contenido multimodal del SDK OpenAI. */
function toVisionContent(
  msg: IncomingMsg
): OpenAI.Chat.Completions.ChatCompletionContentPart[] | string {
  if (typeof msg.content === "string") return msg.content;
  const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
  for (const p of msg.content) {
    if (p.type === "text" && p.text) {
      parts.push({ type: "text", text: p.text });
    } else if (p.type === "image_url" && p.image_url?.url) {
      parts.push({ type: "image_url", image_url: { url: p.image_url.url } });
    }
  }
  return parts.length ? parts : "";
}

/** Reduce contenido multimodal a solo texto (cuando el proveedor NO ve imágenes). */
function toTextOnlyContent(msg: IncomingMsg): string {
  if (typeof msg.content === "string") return msg.content;
  const texts: string[] = [];
  let imageCount = 0;
  for (const p of msg.content) {
    if (p.type === "text" && p.text) texts.push(p.text);
    else if (p.type === "image_url") imageCount++;
  }
  const out = texts.join("\n");
  if (imageCount > 0) {
    return (
      out +
      `\n[Nota interna: el usuario adjuntó ${imageCount} imagen(es) pero el proveedor de IA actual no soporta visión. Pide al usuario configurar OPENAI_API_KEY o VISION_API_KEY para análisis visual real.]`
    );
  }
  return out;
}

function hasImage(messages: IncomingMsg[]): boolean {
  return messages.some(
    (m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url" && p.image_url?.url)
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages } = body as { messages: IncomingMsg[] };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "No se proporcionaron mensajes." }, { status: 400 });
    }

    const containsImage = hasImage(messages);
    const provider = containsImage ? getVisionClient() : getAIClient();

    if (!provider) {
      // Sin IA configurada: respuesta clara, NO bloquea la app.
      if (containsImage) {
        return NextResponse.json({
          content:
            "⚠️ **Análisis visual no disponible.** Veo que adjuntaste una imagen, pero no hay un proveedor con visión configurado en el servidor.\n\n" +
            "Para análisis visual real, agrega `OPENAI_API_KEY` (gpt-4o-mini soporta visión) o `VISION_API_KEY` en las variables de entorno. " +
            "Si solo cuentas con DeepSeek (`deepseek-chat`), no puede leer imágenes.\n\n" +
            "Mientras tanto, descríbeme la pieza por texto y te doy feedback con base en marca y Meta Ads.",
          meta: { visionAvailable: false, reason: "no_vision_provider" },
        });
      }
      return NextResponse.json({
        content:
          "⚠️ IA no configurada. Agrega `OPENAI_API_KEY` o `DEEPSEEK_API_KEY` con saldo en las variables de entorno.",
        meta: { visionAvailable: false, reason: "no_provider" },
      });
    }

    // Construir mensajes para el modelo
    const systemMsg: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
      role: "system",
      content: buildSystemPrompt(),
    };

    const conversation: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = messages.map(
      (m): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
        const role: ChatRole = m.role === "assistant" || m.role === "system" ? m.role : "user";
        if (provider.supportsVision) {
          const content = toVisionContent(m);
          if (role === "user") {
            return { role: "user", content: content as OpenAI.Chat.Completions.ChatCompletionContentPart[] | string };
          }
          // assistant/system: forzar texto plano para evitar problemas de tipos
          const text = typeof content === "string" ? content : content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
          return { role, content: text };
        }
        return { role, content: toTextOnlyContent(m) };
      }
    );

    // Timeout duro para evitar loaders eternos.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 55000);

    const response = await provider.client.chat.completions.create(
      {
        model: provider.model,
        messages: [systemMsg, ...conversation],
        max_tokens: 1500,
        temperature: 0.4,
      },
      { signal: ctrl.signal }
    );
    clearTimeout(timer);

    const content = response.choices[0]?.message?.content ?? "";
    return NextResponse.json({
      content,
      meta: {
        provider: provider.name,
        model: provider.model,
        visionAvailable: isVisionConfigured(),
        analyzedImage: containsImage && provider.supportsVision,
      },
    });
  } catch (error: unknown) {
    console.error("Error en /api/chat:", error);
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
    const isAbort = error instanceof Error && error.name === "AbortError";
    if (isAbort) {
      return NextResponse.json(
        { error: "El modelo tardó demasiado. Reintenta o reduce el tamaño de la imagen." },
        { status: 504 }
      );
    }
    const message = error instanceof Error ? error.message : "Error interno del chatbot.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET /api/chat → expone capacidades del servidor (visión sí/no, proveedor). */
export async function GET() {
  const provider = getAIClient();
  const vision = getVisionClient();
  return NextResponse.json({
    aiConfigured: !!provider,
    visionAvailable: !!vision,
    textProvider: provider ? { name: provider.name, model: provider.model } : null,
    visionProvider: vision ? { name: vision.name, model: vision.model } : null,
  });
}
