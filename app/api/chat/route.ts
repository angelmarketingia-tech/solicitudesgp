import { NextResponse } from "next/server";
import type OpenAI from "openai";
import { getAIClient } from "@/lib/ai";

const SYSTEM_PROMPT = `Eres "Andromeda", la IA especialista en diseño creativo para Meta Ads (Facebook/Instagram) de GanaPlay, una empresa de apuestas deportivas en Latinoamérica (El Salvador y Guatemala).

TU MISIÓN: Dar retroalimentación CONCRETA, ESPECÍFICA y ACCIONABLE sobre piezas creativas. NUNCA des respuestas vagas o genéricas.

CUANDO TE MUESTREN UNA IMAGEN, analiza SIEMPRE:
1. 🎨 Jerarquía Visual: ¿El ojo sigue el orden correcto? ¿Qué domina la composición?
2. 📝 Copy y Texto: ¿Es legible? ¿El CTA está visible? ¿Cuánto texto hay (Meta penaliza >20%)?
3. 🎯 Rendimiento Estimado: Predice CTR probable (Bajo/Medio/Alto) y por qué.
4. 🌍 Adaptación Regional: Señala si el copy o diseño es apropiado para ES/GT.
5. ✅ 3 Mejoras Específicas: Lista puntual de cambios con impacto directo.

CUANDO TE HAGAN UNA PREGUNTA SIN IMAGEN, responde con:
- Principios concretos del algoritmo de Meta
- Ejemplos numéricos cuando aplique (% de texto, resoluciones, duraciones)
- Comparaciones entre formatos (Story vs Feed vs Reels)

REGLAS:
- Sé preciso. Si el copy dice "Regístrate y gana Q50", evalúa ESE copy específico.
- Nunca respondas "depende" o "podría funcionar" sin justificación.
- NO inventes información. Si falta un dato, dilo.

IDIOMA: Español latinoamericano (neutro, profesional). Usa markdown con emojis.`;

type ContentPart = { type: string; text?: string; image_url?: { url?: string } };
type IncomingMsg = { role: string; content: string | ContentPart[] };
type ChatRole = "user" | "assistant" | "system";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "No se proporcionaron mensajes." }, { status: 400 });
    }

    const ai = getAIClient();
    if (!ai) {
      return NextResponse.json({
        content:
          "⚠️ La IA no está configurada. Agrega una `OPENAI_API_KEY` o `DEEPSEEK_API_KEY` con saldo " +
          "en las variables de entorno para activar las respuestas reales.",
      });
    }

    // Algunos modelos no procesan imágenes: se resumen como texto con su URL.
    const sanitizedMessages = (messages as IncomingMsg[]).map((msg): { role: ChatRole; content: string } => {
      let content = "";
      if (Array.isArray(msg.content)) {
        const textParts: string[] = [];
        const imageParts: string[] = [];
        for (const part of msg.content) {
          if (part.type === "text") textParts.push(part.text ?? "");
          else if (part.type === "image_url") imageParts.push(part.image_url?.url ?? "");
        }
        const imageNote = imageParts.length > 0
          ? `\n[El usuario adjuntó ${imageParts.length} imagen(es). URL: ${imageParts.join(", ")}. Analízala según el contexto del requerimiento.]`
          : "";
        content = textParts.join("\n") + imageNote;
      } else {
        content = msg.content;
      }
      const role: ChatRole = msg.role === "assistant" || msg.role === "system" ? msg.role : "user";
      return { role, content };
    });

    const response = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...sanitizedMessages,
      ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      max_tokens: 1000,
    });

    return NextResponse.json({ content: response.choices[0]?.message?.content ?? "" });
  } catch (error: unknown) {
    console.error("Error en /api/chat:", error);
    const status = typeof error === "object" && error && "status" in error
      ? (error as { status?: number }).status
      : undefined;
    if (status === 402) {
      return NextResponse.json(
        { error: "La cuenta de IA no tiene saldo. Recarga DeepSeek o configura OPENAI_API_KEY." },
        { status: 402 }
      );
    }
    const message = error instanceof Error ? error.message : "Error interno del chatbot.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
