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

/**
 * Quita del documento cualquier imagen incrustada en base64 (`data:…`).
 *
 * Muchas piezas, referencias y comentarios antiguos llevan la imagen ENTERA
 * dentro del documento. Enviarlas todas dejaba esta respuesta en 3,6 MB, y se
 * consulta cada 25 s por persona. Se recorre el documento entero porque
 * aparecen en sitios variados (piezas, referencias, imágenes de comentarios).
 *
 * Lo que se pierde en modo respaldo es ver esas imágenes antiguas; las que
 * están en Storage (todas las nuevas) se ven igual, porque son URLs normales.
 */
function sinBase64(valor: unknown): unknown {
  if (typeof valor === "string") return valor.startsWith("data:") ? "" : valor;
  if (Array.isArray(valor)) return valor.map(sinBase64);
  if (valor && typeof valor === "object") {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) salida[k] = sinBase64(v);
    return salida;
  }
  return valor;
}

function aligerar(id: string, data: Record<string, unknown>) {
  return { ...(sinBase64(data) as Record<string, unknown>), id };
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
