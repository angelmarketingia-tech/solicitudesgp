import { NextResponse } from "next/server";
import { collection, getDocs, orderBy, query, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * El tablero de solicitudes, servido por NUESTRO servidor.
 *
 * POR QUÉ EXISTE: el navegador lee Firestore por una conexión de streaming
 * (WebChannel) que algunas redes cortan a medias — no falla, se cuelga. Cuando
 * eso pasa, la plataforma entera queda inservible: el tablero sale vacío y no
 * se puede crear nada, porque el número de la nueva solicitud se calcula sobre
 * esa lista. Ha ocurrido varias veces, en distintas redes y países.
 *
 * Este endpoint es la vía de respaldo: el navegador solo tiene que hablar con
 * el dominio del que ya bajó la página, y es el servidor —sin esas
 * restricciones— quien consulta Firestore. Se pierde el tiempo real (el
 * cliente pasa a consultar cada pocos segundos), pero se puede trabajar.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Quita lo que pesa mucho y el tablero no necesita para pintar las tarjetas. */
function aligerar(id: string, data: Record<string, unknown>) {
  const creatives = Array.isArray(data.creatives) ? data.creatives : [];
  const messages = Array.isArray(data.messages) ? data.messages : [];
  return {
    ...data,
    id,
    // Las piezas y referencias antiguas llevan la imagen entera incrustada en
    // base64: mandarlas todas serían megas por consulta. Se conservan las
    // URLs normales y se descartan solo esas.
    creatives: creatives.map((c) => {
      const pieza = c as { url?: string };
      return typeof pieza?.url === "string" && pieza.url.startsWith("data:")
        ? { ...pieza, url: "", pesada: true }
        : pieza;
    }),
    messages,
    referenceImages: (Array.isArray(data.referenceImages) ? data.referenceImages : [])
      .filter((u) => typeof u === "string" && !u.startsWith("data:")),
  };
}

export async function GET() {
  try {
    const snap = await getDocs(
      query(collection(db, "requests"), orderBy("deliveryDate", "desc"), limit(1000))
    );
    // Igual que el listener del cliente: los módulos que viven en la misma
    // colección (influencers, promocionales, CMR) no son solicitudes.
    const requests = snap.docs
      .filter((d) => !d.data().board)
      .map((d) => aligerar(d.id, d.data()));

    return NextResponse.json({ ok: true, requests }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/board] no se pudo leer el tablero:", e);
    return NextResponse.json({ ok: false, error: "No se pudo leer el tablero." }, { status: 503 });
  }
}
