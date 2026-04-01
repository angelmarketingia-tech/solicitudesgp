import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageBase64, copy, format, country, dimensions } = body;

    if (!imageBase64) {
      return NextResponse.json({ error: "No se proporcionó la imagen del creativo." }, { status: 400 });
    }

    // SI NO HAY API KEY, SIMULAMOS UNA RESPUESTA DE IA PARA QUE EL USUARIO PUEDA PROBAR
    if (!process.env.OPENAI_API_KEY) {
      console.log("No OPENAI_API_KEY found, returning simulated AI response.");
      
      // Retraso artificial para simular el procesamiento de IA
      await new Promise((resolve) => setTimeout(resolve, 2500));
      
      // Generar un score aleatorio o determinista basado en el contenido para variar
      const rating = Math.floor(Math.random() * 10) + 1;
      let color = "red";
      let validation = "Rechazado";
      let explanation = "";

      if (rating >= 8) {
        color = "green";
        validation = "Aprobado";
        explanation = `El creativo cumple de manera excelente con las dimensiones solicitadas (${dimensions}) y está perfectamente adaptado para la audiencia de ${country}. El contraste visual es atractivo, el llamado a la acción es claro y se alinea perfectamente con el copy provisto. Tiene un alto potencial para generar CTR a bajo costo.`;
      } else if (rating >= 5) {
        color = "yellow";
        validation = "Regular";
        explanation = `El diseño está bien estructurado para el formato ${format}, pero podría mejorar la legibilidad del texto principal y generar un poco más de impacto visual para la cultura visual de ${country}. Se recomienda revisar el balance de colores.`;
      } else {
        color = "red";
        validation = "Rechazado";
        explanation = `El creativo no cumple con las mejores prácticas de Meta Ads. Demasiado texto o mala jerarquía visual. Es probable que no encaje bien en las dimensiones (${dimensions}) o que el mensaje sea confuso para el usuario en ${country}. No se recomienda lanzarlo así.`;
      }

      return NextResponse.json({
        rating,
        explanation,
        validation,
        color
      });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `
Eres un experto en marketing digital y Meta Ads, y tu tarea es auditar de forma estricta el trabajo final de un diseñador para la agencia GanaPlay.
Aquí están las instrucciones dadas originalmente al diseñador:
- País Objetivo: "${country || 'No especificado'}"
- Dimensiones Requeridas: "${dimensions || 'No especificado'}"
- Formato: "${format}"
- Copy Base / Orientativo: "${copy}"

Tu objetivo principal es evaluar de manera crítica esta imagen que es el "Arte Final" entregado por el diseñador.
Analiza si las proporciones parecen coincidir con ${dimensions}, si la composición es apta para ${country}, y, especialmente, califica qué tan viable es, qué tanto triunfaría y qué tan altos serían los CTR y la retención en Meta Ads. 

Requisitos de la evaluación:
1. Una calificación ('rating') de número entero estricto del 1 al 10. (Sé riguroso, solo dales 9 o 10 si realmente es un diseño premium que convierte).
2. Un color asociado estrictamente basado en la calificación ('color'):
   - Rojo ('red') para nota del 1 al 4 (Malo).
   - Amarillo ('yellow') para nota del 5 al 7 (Regular).
   - Verde ('green') para nota del 8 al 10 (Bueno).
3. Una justificación técnica y persuasiva ('explanation') respondiendo a por qué das esa nota, tocando jerarquía visual, uso del espacio, legibilidad, y el match con el país y el copy.
4. Un veredicto final en la clave 'validation' (ej. "APROBADO", "RECHAZADO", "REQUIERE CAMBIOS").

**OBLIGATORIO**: Devuelve únicamente el resultado en formato JSON válido con las claves mencionadas, sin Markdown adicional previo ni posterior.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: imageBase64 },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const aiResponse = response.choices[0].message.content;
    const parsed = JSON.parse(aiResponse || "{}");

    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error("Error analyzing image:", error);
    return NextResponse.json({ error: error.message || "Error interno del servidor al analizar la imagen." }, { status: 500 });
  }
}
