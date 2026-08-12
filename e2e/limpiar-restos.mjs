/**
 * Borra cualquier resto marcado [E2E] que haya quedado de una ejecución
 * interrumpida (Ctrl-C, corte de red, un fallo a mitad).
 *
 *   npm run e2e:limpiar
 *
 * Va en JavaScript plano y con su propia conexión para no depender de nada
 * más: es justo la herramienta que hace falta cuando algo ya salió mal.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, getDocs, deleteDoc } from "firebase/firestore";
import { getStorage, ref, listAll, deleteObject } from "firebase/storage";

const aqui = path.dirname(fileURLToPath(import.meta.url));

// Carga .env.local sin dependencias externas.
const envPath = path.join(aqui, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const linea of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
  console.error("Falta la configuración de Firebase (.env.local).");
  process.exit(1);
}

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
const db = getFirestore(app);
const storage = getStorage(app, `gs://${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}`);

const MARCADOR = "[E2E]";
let borradas = 0;

const solicitudes = await getDocs(collection(db, "requests"));
for (const d of solicitudes.docs) {
  const titulo = String(d.data().title || "");
  if (!titulo.includes(MARCADOR) && !d.id.startsWith("E2E-")) continue;
  await deleteDoc(d.ref).catch(() => {});
  try {
    const archivos = await listAll(ref(storage, `creatives/${d.id}`));
    for (const a of archivos.items) await deleteObject(a).catch(() => {});
  } catch { /* sin carpeta */ }
  console.log("borrada", d.id, "→", titulo.slice(0, 60));
  borradas++;
}

const notifs = await getDocs(collection(db, "notifications"));
for (const d of notifs.docs) {
  if (String(d.data().message || "").includes(MARCADOR)) await deleteDoc(d.ref).catch(() => {});
}

console.log(borradas > 0
  ? `Listo: ${borradas} solicitud(es) de prueba borradas.`
  : "Nada que limpiar: no quedaban restos de pruebas.");
process.exit(0);
