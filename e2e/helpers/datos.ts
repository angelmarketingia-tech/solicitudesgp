/**
 * Datos de prueba: crear y, sobre todo, BORRAR lo que las pruebas dejan.
 *
 * La app trabaja contra el Firestore real (no hay entorno de pruebas), así que
 * cualquier prueba que escriba ensucia el tablero del equipo. Todo lo que se
 * cree aquí lleva el marcador `[E2E]` y se borra al terminar, incluidos sus
 * archivos en Storage y las notificaciones que haya generado.
 *
 * Ya pasó una vez: una prueba escribió sobre una solicitud real y hubo que
 * reconstruirla a mano. De ahí que esto sea explícito y no opcional.
 */
import fs from "fs";
import path from "path";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where,
} from "firebase/firestore";
import { getStorage, ref, listAll, deleteObject } from "firebase/storage";

export const MARCADOR = "[E2E]";

/** Carga .env.local en process.env (Playwright no lo hace solo). */
function cargarEnv() {
  if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) return;
  const archivo = path.join(__dirname, "..", "..", ".env.local");
  if (!fs.existsSync(archivo)) return;
  for (const linea of fs.readFileSync(archivo, "utf8").split("\n")) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

function firebase() {
  cargarEnv();
  const app = getApps()[0] || initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
  return {
    db: getFirestore(app),
    storage: getStorage(app, `gs://${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}`),
  };
}

export function hayFirebase(): boolean {
  cargarEnv();
  return Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
}

/**
 * Crea una solicitud desechable y devuelve su ID.
 * Usa un ID propio fuera del rango real (E2E-…) para no tocar la numeración
 * GP#### del equipo ni arriesgarse a chocar con una solicitud de verdad.
 */
export async function crearSolicitud(extra: Record<string, unknown> = {}): Promise<string> {
  const { db } = firebase();
  const id = `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const hoy = new Date().toISOString().split("T")[0];
  await setDoc(doc(db, "requests", id), {
    title: `${MARCADOR} solicitud de prueba`,
    copy: "", format: "static", requestKind: "Nueva Línea Gráfica",
    dimensions: [], countries: [], channels: [], objective: "",
    requestDate: hoy, deliveryDate: hoy,
    status: "Pendiente", priority: "Medio", area: "Pauta",
    requesterName: "E2E", requesterEmail: "", requesterEmails: [],
    creatives: [], messages: [], history: [],
    ...extra,
  });
  return id;
}

export async function leerSolicitud(id: string) {
  const { db } = firebase();
  const snap = await getDoc(doc(db, "requests", id));
  return snap.exists() ? snap.data() : null;
}

/** Borra una solicitud, sus archivos en Storage y sus notificaciones. */
export async function borrarSolicitud(id: string) {
  const { db, storage } = firebase();
  await deleteDoc(doc(db, "requests", id)).catch(() => { /* ya no está */ });
  try {
    const listado = await listAll(ref(storage, `creatives/${id}`));
    await Promise.all(listado.items.map(i => deleteObject(i).catch(() => { /* */ })));
  } catch { /* sin carpeta */ }
  try {
    const notifs = await getDocs(query(collection(db, "notifications"), where("requestId", "==", id)));
    await Promise.all(notifs.docs.map(d => deleteDoc(d.ref).catch(() => { /* */ })));
  } catch { /* */ }
}

/**
 * Red de seguridad: borra CUALQUIER resto marcado como [E2E] que haya quedado
 * de una ejecución anterior interrumpida.
 */
export async function limpiarRestos(): Promise<number> {
  const { db } = firebase();
  let borrados = 0;
  const solicitudes = await getDocs(collection(db, "requests"));
  for (const d of solicitudes.docs) {
    const t = String(d.data().title || "");
    if (t.includes(MARCADOR) || d.id.startsWith("E2E-")) { await borrarSolicitud(d.id); borrados++; }
  }
  const notifs = await getDocs(collection(db, "notifications"));
  for (const d of notifs.docs) {
    if (String(d.data().message || "").includes(MARCADOR)) { await deleteDoc(d.ref).catch(() => { /* */ }); }
  }
  return borrados;
}

/** Borra una carpeta del CMR por su nombre (limpieza de pruebas). */
export async function borrarCarpetaCmrPorNombre(nombre: string) {
  const { db } = firebase();
  const snap = await getDocs(query(collection(db, "requests"), where("board", "==", "cmr")));
  for (const d of snap.docs) {
    if (String(d.data().name || "") === nombre) await deleteDoc(d.ref).catch(() => { /* */ });
  }
}
