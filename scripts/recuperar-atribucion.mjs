/**
 * Devuelve el dueño a las solicitudes que no tienen diseñador asignado.
 *
 * EL PROBLEMA: el informe agrupa la producción por `assignedTo`, y 285 de 603
 * solicitudes no lo tienen. Todo ese trabajo aparece como «Sin asignar» y no
 * suma a nadie. Pasó porque durante meses el tablero no exigía asignarse: el
 * diseñador abría la solicitud, la pasaba a En Proceso y la publicaba sin
 * pulsar «Asignarme».
 *
 * LA PISTA: el historial sí guarda quién hizo cada cosa. Una solicitud que
 * alguien movió a «En Proceso», a la que subió entregables y que luego publicó
 * es suya, aunque nadie rellenara el campo.
 *
 * LA REGLA (deliberadamente estricta: antes dejar una sin recuperar que
 * atribuírsela a quien no fue):
 *   1. Se miran SOLO las entradas del historial hechas por alguien del equipo
 *      de Diseño: cambios de estado a En Proceso / Publicado y entregables
 *      subidos. Crear o editar la solicitud NO cuenta — eso lo hace quien la
 *      pide, no quien la trabaja.
 *   2. Si todas esas entradas son de la MISMA persona, esa es.
 *   3. Si hay varias, manda quien la publicó (la última a «Publicado»).
 *   4. Si ni aun así hay una sola clara, se deja como está y se informa.
 *
 * Nunca toca una solicitud que YA tenga `assignedTo`: solo rellena huecos.
 *
 *   node scripts/recuperar-atribucion.mjs            # simula y explica
 *   node scripts/recuperar-atribucion.mjs aplicar    # escribe
 *   node scripts/recuperar-atribucion.mjs revertir   # deshace lo que escribió
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, getDocs, updateDoc, deleteField } from "firebase/firestore";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, "..");

const envPath = path.join(raiz, ".env.local");
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

/** Equipo de Diseño, como aparece en el historial. */
const DISENADORES = ["Eliana", "Verónica", "Veronica", "Juan David", "Caleb"];
/** Nombre con el que se guarda (unifica los acentos de Verónica). */
const CANONICO = { Veronica: "Verónica" };

const REGISTRO = path.join(raiz, "migracion-referencias", "atribucion.json");

const comando = process.argv[2] || "simular";

const esDisenador = (nombre) => DISENADORES.includes(String(nombre || "").trim());
const canon = (n) => CANONICO[String(n || "").trim()] || String(n || "").trim();

/** Quién trabajó esta solicitud, según su historial. null si no está claro. */
function deducirDisenador(datos) {
  const historial = Array.isArray(datos.history) ? datos.history : [];
  const trabajo = [];     // entradas que SOLO hace quien produce
  let ultimoPublico = null;

  for (const h of historial) {
    const accion = String(h?.action || "");
    const por = canon(h?.by);
    if (!esDisenador(por)) continue;

    const cambioRelevante = /Estado cambiado a "(En Proceso|Publicado)"/.test(accion);
    const subioEntregable = /^Entregable subido:/.test(accion);
    if (!cambioRelevante && !subioEntregable) continue;

    trabajo.push(por);
    if (/Estado cambiado a "Publicado"/.test(accion)) ultimoPublico = por;
  }

  if (trabajo.length === 0) return null;
  const distintos = [...new Set(trabajo)];
  if (distintos.length === 1) return { quien: distintos[0], motivo: `${trabajo.length} acción(es) suya(s)` };
  if (ultimoPublico) return { quien: ultimoPublico, motivo: `varios (${distintos.join(", ")}); manda quien publicó` };
  return null;
}

const snap = await getDocs(collection(db, "requests"));
const solicitudes = snap.docs
  .map((d) => ({ id: d.id, datos: d.data() }))
  .filter((s) => !s.datos.board);

const huecos = solicitudes.filter((s) => !String(s.datos.assignedTo || "").trim());
const propuestas = [];
const dudosas = [];

for (const s of huecos) {
  const r = deducirDisenador(s.datos);
  if (r) propuestas.push({ id: s.id, quien: r.quien, motivo: r.motivo, titulo: String(s.datos.title || "").slice(0, 40), estado: s.datos.status });
  else dudosas.push({ id: s.id, titulo: String(s.datos.title || "").slice(0, 40), estado: s.datos.status });
}

const porPersona = {};
for (const p of propuestas) porPersona[p.quien] = (porPersona[p.quien] || 0) + 1;

console.log(`Solicitudes: ${solicitudes.length}  ·  sin diseñador: ${huecos.length}`);
console.log(`Se puede deducir: ${propuestas.length}  ·  queda sin saber: ${dudosas.length}\n`);
console.log("Quedarían atribuidas así:");
Object.entries(porPersona).sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));

if (comando === "simular") {
  console.log("\nMuestra de 12 (esto es una SIMULACIÓN: no se ha escrito nada):");
  propuestas.slice(0, 12).forEach((p) =>
    console.log(`  ${p.id} [${p.estado}] → ${p.quien.padEnd(10)} · ${p.motivo} · ${p.titulo}`));
  if (dudosas.length) {
    console.log(`\nSin pista clara (se quedan como están), muestra de 8:`);
    dudosas.slice(0, 8).forEach((d) => console.log(`  ${d.id} [${d.estado}] ${d.titulo}`));
  }
  console.log(`\nPara aplicarlo:  node scripts/recuperar-atribucion.mjs aplicar`);
  process.exit(0);
}

if (comando === "aplicar") {
  fs.mkdirSync(path.dirname(REGISTRO), { recursive: true });
  const hechas = [];
  let fallos = 0;
  for (const p of propuestas) {
    try {
      await updateDoc(doc(db, "requests", p.id), {
        assignedTo: p.quien,
        // Queda claro que lo puso esta recuperación y no una persona, para
        // poder deshacerlo sin tocar lo que se asignó a mano.
        atribucionRecuperada: true,
      });
      hechas.push({ id: p.id, quien: p.quien });
      process.stdout.write("·");
    } catch (err) {
      fallos++;
      console.log(`\n✗ ${p.id}: ${err?.message || err}`);
    }
  }
  fs.writeFileSync(REGISTRO, JSON.stringify({ fecha: new Date().toISOString(), hechas }, null, 2));
  console.log(`\n\nAtribuidas: ${hechas.length}  ·  fallos: ${fallos}`);
  console.log(`Registro para poder deshacerlo: ${REGISTRO}`);
  process.exit(0);
}

if (comando === "revertir") {
  if (!fs.existsSync(REGISTRO)) {
    console.error("No hay registro de una aplicación anterior.");
    process.exit(1);
  }
  const { hechas } = JSON.parse(fs.readFileSync(REGISTRO, "utf8"));
  let vueltas = 0, saltadas = 0;
  for (const h of hechas) {
    const actual = solicitudes.find((s) => s.id === h.id);
    // Si alguien lo cambió a mano después, no se toca.
    if (!actual || !actual.datos.atribucionRecuperada || actual.datos.assignedTo !== h.quien) { saltadas++; continue; }
    await updateDoc(doc(db, "requests", h.id), {
      assignedTo: deleteField(),
      atribucionRecuperada: deleteField(),
    });
    vueltas++;
  }
  console.log(`Revertidas: ${vueltas}  ·  saltadas (cambiadas después a mano): ${saltadas}`);
  process.exit(0);
}

console.error(`Comando desconocido: ${comando}. Hay: simular, aplicar, revertir`);
process.exit(1);
