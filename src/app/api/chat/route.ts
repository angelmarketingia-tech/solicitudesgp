import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "No messages provided." }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.log("No OPENAI_API_KEY found, returning simulated AI response.");
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return NextResponse.json({
        content: "SIMULACIÓN: Para obtener buenos resultados con el algoritmo Andromeda de Meta Ads, asegúrate de mantener un copy directo, usar colores contrastantes de alto rendimiento (azul/naranja) y evitar excesivo texto en las creatividades. ¿En qué más puedo ayudarte?"
      });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const systemPrompt = {
      role: "system",
      content: "Eres el 'Asistente IA Andromeda', un experto asesor especializado en el algoritmo Andromeda de Meta Ads y diseño de piezas creativas para alto rendimiento (CTR). Ayudas estrictamente a diseñadores a resolver bloqueos creativos y les sugieres buenas prácticas sobre jerarquía visual, uso de llamados a la acción (CTAs) y adaptaciones por país (ej. Guatemala vs El Salvador). Debes ser muy coherente y dar siempre recomendaciones técnicas y fundadas en marketing digital."
    };

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [systemPrompt, ...messages],
    });

    const aiResponse = response.choices[0].message.content;

    return NextResponse.json({ content: aiResponse });
  } catch (error: any) {
    console.error("Error in AI Chat:", error);
    return NextResponse.json({ error: error.message || "Error interno del chatbot." }, { status: 500 });
  }
}
