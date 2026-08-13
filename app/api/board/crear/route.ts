import { NextResponse } from "next/server";
import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Crear una solicitud desde el servidor.
 *
 * Es el respaldo de la creación cuando la red del navegador no deja hablar con
 * Firestore: sin esto, el tablero se veía (vía /api/board) pero al pulsar
 * "Crear" no pasaba nada, que es justo lo que reportó el equipo.
 *
 * Reserva el número igual que el cliente —comprobándolo contra el servidor y
 * escribiendo dentro de una transacción— para no repetir un ID y pisar una
 * solicitud existente, que ya ocurrió una vez.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function reservarId(): Promise<string> {
  const todas = await getDocs(collection(db, "requests"));
  const numeros = todas.docs
    .map((d) => parseInt(d.id.replace("GP", ""), 10))
    .filter((n) => !isNaN(n));
  const inicio = (numeros.length ? Math.max(...numeros) : 6611) + 1;

  for (let n = inicio; n < inicio + 100; n++) {
    const id = `GP${n}`;
    const existe = await getDoc(doc(db, "requests", id));
    if (!existe.exists()) return id;
  }
  throw new Error("SIN_NUMERO");
}

export async function POST(req: Request) {
  try {
    const solicitud = (await req.json()) as Record<string, unknown>;
    if (typeof solicitud?.title !== "string" || !solicitud.title.trim()) {
      return NextResponse.json({ ok: false, error: "Falta el nombre de la solicitud." }, { status: 400 });
    }

    const id = await reservarId();
    await runTransaction(db, async (tx) => {
      const ref = doc(db, "requests", id);
      const yaExiste = await tx.get(ref);
      if (yaExiste.exists()) throw new Error("ID_OCUPADO");
      tx.set(ref, { ...solicitud, id, updatedAt: serverTimestamp() });
    });

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    console.error("[api/board/crear] no se pudo crear:", e);
    if (msg === "ID_OCUPADO") {
      return NextResponse.json(
        { ok: false, error: "Ese número se acaba de ocupar. Pulsa crear otra vez." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: false, error: "No se pudo crear la solicitud." }, { status: 503 });
  }
}
