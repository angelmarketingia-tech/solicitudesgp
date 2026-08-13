import { NextResponse } from "next/server";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Calendario público de un influencer, servido por NUESTRO servidor.
 *
 * POR QUÉ EXISTE: la página leía Firestore directamente desde el navegador.
 * Firestore usa una conexión de streaming (WebChannel) que algunas redes
 * móviles bloquean a medias: no falla, se queda colgada. Una influencer en El
 * Salvador se quedaba en la pantalla de carga para siempre mientras el mismo
 * enlace abría bien desde Colombia. Ni el cambio a long-polling automático lo
 * resolvió en su red.
 *
 * Con esto, su navegador solo habla con solicitudes.ganaplay.lat —que le
 * responde sin problema, tanto que la página le carga— y es el servidor, sin
 * esas restricciones, el que consulta Firestore.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { code } = await params;
  if (!code) return NextResponse.json({ ok: false, error: "Falta el código." }, { status: 400 });

  try {
    // 1) El influencer, por su código secreto.
    const perfilSnap = await getDocs(
      query(collection(db, "requests"), where("shareCode", "==", code))
    );
    const perfil = perfilSnap.docs.find(d => d.data().board === "influencer");
    if (!perfil) {
      return NextResponse.json({ ok: false, error: "no-encontrado" }, { status: 404 });
    }

    // 2) Sus tarjetas de contenido.
    const itemsSnap = await getDocs(
      query(collection(db, "requests"), where("influencerId", "==", perfil.id))
    );
    const items = itemsSnap.docs
      .filter(d => d.data().board === "influencer_item")
      .map(d => ({ id: d.id, ...d.data() }));

    return NextResponse.json(
      { ok: true, influencer: { id: perfil.id, ...perfil.data() }, items },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("[api/influencer] no se pudo leer:", e);
    return NextResponse.json({ ok: false, error: "servidor" }, { status: 503 });
  }
}
