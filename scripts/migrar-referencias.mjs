/**
 * Saca las imágenes de referencia de DENTRO de las solicitudes y las deja en
 * Cloud Storage.
 *
 * POR QUÉ: cada solicitud pesaba ~260 KB, de los cuales ~256 KB eran imágenes
 * de referencia en base64 metidas en el propio documento. El tablero se carga
 * entero, así que cada persona que lo abría se bajaba las referencias de las
 * 571 solicitudes: ~145 MB por carga. Eso —no el almacenamiento— es lo que
 * generó la factura de Google. Con las imágenes en Storage, el documento baja
 * a ~4 KB, la carga del tablero a ~2,3 MB, y la imagen se descarga solo cuando
 * alguien abre esa solicitud.
 *
 * La plataforma no necesita ningún cambio para leerlas: `referenceImages` ya es
 * una lista de textos que van tal cual al `src` de la imagen, y da igual si el
 * texto es un `data:` o una URL de Storage. Por eso esta migración no toca la
 * forma de los datos: solo cambia el contenido de esos textos.
 *
 * Va en pasos separados y en este orden, para que el paso sin retorno sea el
 * último y llegue cuando ya está todo comprobado:
 *
 *   node scripts/migrar-referencias.mjs respaldo            # 1. copia en disco
 *   node scripts/migrar-referencias.mjs subir --limite 5    # 2. prueba corta
 *   node scripts/migrar-referencias.mjs aplicar --limite 5  #    y se revisa en la web
 *   node scripts/migrar-referencias.mjs subir               # 3. todas
 *   node scripts/migrar-referencias.mjs aplicar             # 4. el cambio de verdad
 *   node scripts/migrar-referencias.mjs estado              # en cualquier momento
 *   node scripts/migrar-referencias.mjs comprobar --ids GP1 # ver lo que ve la web
 *   node scripts/migrar-referencias.mjs revertir --ids GP1  # si algo saliera mal
 *
 * `subir` NO escribe en la base: sube, comprueba descargando lo subido y
 * compara byte a byte (sha256) contra el original. Solo `aplicar` modifica las
 * solicitudes, y únicamente las imágenes que pasaron esa comprobación.
 *
 * Las dos operaciones se pueden cortar y repetir: lo ya hecho se salta.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, "..");

// Carga .env.local sin dependencias externas.
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
const storage = getStorage(app, `gs://${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}`);

// Todo lo que produce la migración vive aquí, fuera de git.
const CARPETA = path.join(raiz, "migracion-referencias");
const RESPALDO = path.join(CARPETA, "solicitudes");
const MAPA = path.join(CARPETA, "mapa.json");
const REGISTRO = path.join(CARPETA, "registro.log");

/** Campos de texto que pueden traer una imagen incrustada. */
const CAMPO_LISTA = "referenceImages";
const CAMPO_SUELTO = "referenceImage"; // solicitudes viejas, una sola imagen

const EXT_DE_TIPO = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
  "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
};

const args = process.argv.slice(2);
const comando = args[0] || "estado";
const opcion = (nombre) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const limite = opcion("limite") ? Number(opcion("limite")) : Infinity;
const idsPedidos = opcion("ids") ? opcion("ids").split(",").map((s) => s.trim()).filter(Boolean) : null;

const esDataUrl = (v) => typeof v === "string" && v.startsWith("data:");
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

function anotar(linea) {
  fs.mkdirSync(CARPETA, { recursive: true });
  fs.appendFileSync(REGISTRO, `${new Date().toISOString()}  ${linea}\n`);
}

function leerMapa() {
  if (!fs.existsSync(MAPA)) return {};
  return JSON.parse(fs.readFileSync(MAPA, "utf8"));
}
function guardarMapa(mapa) {
  fs.mkdirSync(CARPETA, { recursive: true });
  fs.writeFileSync(MAPA, JSON.stringify(mapa, null, 2));
}

/** Parte un `data:` en sus trozos útiles. */
function partirDataUrl(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const tipo = m[1] || "application/octet-stream";
  const bytes = m[2]
    ? Buffer.from(m[3], "base64")
    : Buffer.from(decodeURIComponent(m[3]), "binary");
  return { tipo, bytes, sha: crypto.createHash("sha256").update(bytes).digest("hex") };
}

/** Las solicitudes, de la base o del respaldo en disco. */
async function traerSolicitudes({ desdeDisco = false } = {}) {
  if (desdeDisco) {
    if (!fs.existsSync(RESPALDO)) throw new Error("No hay respaldo. Ejecuta primero: respaldo");
    return fs.readdirSync(RESPALDO).filter((f) => f.endsWith(".json")).map((f) => ({
      id: path.basename(f, ".json"),
      datos: JSON.parse(fs.readFileSync(path.join(RESPALDO, f), "utf8")),
    }));
  }
  const snap = await getDocs(collection(db, "requests"));
  return snap.docs.map((d) => ({ id: d.id, datos: d.data() }));
}

/** Las imágenes incrustadas de una solicitud, con su sitio exacto. */
function imagenesIncrustadas(datos) {
  const salida = [];
  const lista = Array.isArray(datos[CAMPO_LISTA]) ? datos[CAMPO_LISTA] : [];
  lista.forEach((v, i) => { if (esDataUrl(v)) salida.push({ campo: CAMPO_LISTA, indice: i, dataUrl: v }); });
  if (esDataUrl(datos[CAMPO_SUELTO])) salida.push({ campo: CAMPO_SUELTO, indice: null, dataUrl: datos[CAMPO_SUELTO] });
  return salida;
}

const clave = (img) => (img.indice === null ? CAMPO_SUELTO : `${CAMPO_LISTA}[${img.indice}]`);

// ─────────────────────────── respaldo ───────────────────────────

async function respaldo() {
  fs.mkdirSync(RESPALDO, { recursive: true });
  const solicitudes = await traerSolicitudes();
  let bytes = 0, conImagenes = 0, imagenes = 0;

  for (const s of solicitudes) {
    const texto = JSON.stringify(s.datos, null, 2);
    fs.writeFileSync(path.join(RESPALDO, `${s.id}.json`), texto);
    bytes += Buffer.byteLength(texto);
    const imgs = imagenesIncrustadas(s.datos);
    if (imgs.length) { conImagenes++; imagenes += imgs.length; }
  }

  console.log(`Respaldadas ${solicitudes.length} solicitudes (${mb(bytes)}) en`);
  console.log(`  ${RESPALDO}`);
  console.log(`${conImagenes} tienen imágenes incrustadas; ${imagenes} imágenes en total.`);
  anotar(`respaldo: ${solicitudes.length} solicitudes, ${imagenes} imágenes incrustadas`);
}

// ──────────────────────────── estado ────────────────────────────

async function estado() {
  const solicitudes = await traerSolicitudes();
  const mapa = leerMapa();
  let incrustadas = 0, bytesIncrustados = 0, enStorage = 0, docsPendientes = 0, pesoTotal = 0;

  for (const s of solicitudes) {
    pesoTotal += Buffer.byteLength(JSON.stringify(s.datos));
    const imgs = imagenesIncrustadas(s.datos);
    if (imgs.length) docsPendientes++;
    for (const img of imgs) {
      incrustadas++;
      bytesIncrustados += img.dataUrl.length;
    }
    const lista = Array.isArray(s.datos[CAMPO_LISTA]) ? s.datos[CAMPO_LISTA] : [];
    enStorage += lista.filter((v) => typeof v === "string" && v.startsWith("http")).length;
  }

  const subidasListas = Object.values(mapa).reduce(
    (n, d) => n + Object.values(d).filter((e) => e.estado === "verificada").length, 0);
  const yaAplicadas = Object.values(mapa).reduce(
    (n, d) => n + Object.values(d).filter((e) => e.estado === "aplicada").length, 0);

  console.log(`Solicitudes: ${solicitudes.length}  ·  peso total ${mb(pesoTotal)}  ·  media ${kb(pesoTotal / solicitudes.length)}`);
  console.log(`Imágenes incrustadas: ${incrustadas} en ${docsPendientes} solicitudes (${mb(bytesIncrustados)})`);
  console.log(`Imágenes ya en Storage: ${enStorage}`);
  console.log(`Subidas comprobadas y a la espera de aplicar: ${subidasListas}`);
  console.log(`Ya aplicadas: ${yaAplicadas}`);
  console.log(`Respaldo en disco: ${fs.existsSync(RESPALDO) ? `${fs.readdirSync(RESPALDO).length} ficheros` : "NO HAY"}`);
}

// ───────────────────────────── subir ─────────────────────────────

async function subir() {
  if (!fs.existsSync(RESPALDO)) {
    console.error("Primero el respaldo: node scripts/migrar-referencias.mjs respaldo");
    process.exit(1);
  }
  const solicitudes = await traerSolicitudes();
  const mapa = leerMapa();
  let tratadas = 0, subidas = 0, fallos = 0;

  for (const s of solicitudes) {
    if (idsPedidos && !idsPedidos.includes(s.id)) continue;
    const imgs = imagenesIncrustadas(s.datos);
    if (!imgs.length) continue;
    if (tratadas >= limite) break;

    // El respaldo de ESTA solicitud tiene que existir antes de tocarla.
    const ficheroRespaldo = path.join(RESPALDO, `${s.id}.json`);
    if (!fs.existsSync(ficheroRespaldo)) {
      console.log(`! ${s.id}: sin respaldo, se salta (vuelve a ejecutar "respaldo")`);
      fallos++;
      continue;
    }

    tratadas++;
    mapa[s.id] = mapa[s.id] || {};
    process.stdout.write(`${s.id} (${imgs.length} img) `);

    for (const img of imgs) {
      const k = clave(img);
      if (mapa[s.id][k]?.estado === "verificada" || mapa[s.id][k]?.estado === "aplicada") {
        process.stdout.write("·");
        continue;
      }
      const trozos = partirDataUrl(img.dataUrl);
      if (!trozos) {
        mapa[s.id][k] = { estado: "ilegible" };
        process.stdout.write("?");
        fallos++;
        continue;
      }
      const ext = EXT_DE_TIPO[trozos.tipo] || "bin";
      // Plana dentro de creatives/<id>: así la limpieza que ya hace la
      // plataforma al eliminar una solicitud (listAll de creatives/<id>)
      // también se lleva estas imágenes y no quedan huérfanas.
      const ruta = `creatives/${s.id}/ref_${Date.now()}_${crypto.randomBytes(3).toString("hex")}.${ext}`;
      try {
        const destino = ref(storage, ruta);
        await uploadBytes(destino, trozos.bytes, { contentType: trozos.tipo });
        const url = await getDownloadURL(destino);

        // Comprobación: se descarga lo subido y se compara con el original.
        const respuesta = await fetch(url);
        if (!respuesta.ok) throw new Error(`descarga ${respuesta.status}`);
        const bajado = Buffer.from(await respuesta.arrayBuffer());
        const shaBajado = crypto.createHash("sha256").update(bajado).digest("hex");
        if (shaBajado !== trozos.sha) {
          await deleteObject(destino).catch(() => {});
          throw new Error("lo descargado no coincide con el original");
        }

        mapa[s.id][k] = {
          estado: "verificada", url, ruta, bytes: trozos.bytes.length,
          sha256: trozos.sha, tipo: trozos.tipo, ahorro: img.dataUrl.length,
        };
        subidas++;
        process.stdout.write("✓");
      } catch (err) {
        mapa[s.id][k] = { estado: "fallo", error: String(err?.message || err) };
        fallos++;
        process.stdout.write("✗");
        anotar(`subir FALLO ${s.id} ${k}: ${err?.message || err}`);
      }
      guardarMapa(mapa); // tras cada imagen: se puede cortar sin perder nada
    }
    process.stdout.write("\n");
  }

  console.log(`\nSolicitudes tratadas: ${tratadas}  ·  imágenes subidas y comprobadas: ${subidas}  ·  fallos: ${fallos}`);
  anotar(`subir: ${tratadas} solicitudes, ${subidas} subidas, ${fallos} fallos`);
  if (subidas) console.log(`Nada cambió todavía en la plataforma. El siguiente paso es "aplicar".`);
}

// ──────────────────────────── aplicar ────────────────────────────

async function aplicar() {
  const mapa = leerMapa();
  const solicitudes = await traerSolicitudes();
  let cambiadas = 0, imagenes = 0, ahorro = 0, fallos = 0;

  for (const s of solicitudes) {
    if (idsPedidos && !idsPedidos.includes(s.id)) continue;
    const entradas = mapa[s.id];
    if (!entradas) continue;
    if (cambiadas >= limite) break;

    const imgs = imagenesIncrustadas(s.datos);
    if (!imgs.length) continue;

    const lista = Array.isArray(s.datos[CAMPO_LISTA]) ? [...s.datos[CAMPO_LISTA]] : [];
    const parche = {};
    const aplicadas = [];
    let ahorroDoc = 0;

    for (const img of imgs) {
      const k = clave(img);
      const e = entradas[k];
      if (!e || e.estado !== "verificada") continue;

      // Última comprobación antes de escribir: la URL sigue sirviendo.
      try {
        const r = await fetch(e.url, { method: "GET" });
        if (!r.ok) throw new Error(`descarga ${r.status}`);
        const bajado = Buffer.from(await r.arrayBuffer());
        if (crypto.createHash("sha256").update(bajado).digest("hex") !== e.sha256) {
          throw new Error("lo descargado no coincide");
        }
      } catch (err) {
        console.log(`! ${s.id} ${k}: ${err?.message || err} — se deja como estaba`);
        fallos++;
        continue;
      }

      if (img.campo === CAMPO_SUELTO) parche[CAMPO_SUELTO] = e.url;
      else lista[img.indice] = e.url;
      aplicadas.push(k);
      ahorroDoc += (e.ahorro || 0) - e.url.length;
    }

    if (!aplicadas.length) continue;
    if (aplicadas.some((k) => k.startsWith(CAMPO_LISTA))) parche[CAMPO_LISTA] = lista;

    try {
      await updateDoc(doc(db, "requests", s.id), parche);
    } catch (err) {
      console.log(`✗ ${s.id}: no se pudo guardar (${err?.message || err})`);
      fallos++;
      continue;
    }

    for (const k of aplicadas) entradas[k].estado = "aplicada";
    guardarMapa(mapa);
    cambiadas++;
    imagenes += aplicadas.length;
    ahorro += ahorroDoc;
    console.log(`✓ ${s.id}: ${aplicadas.length} imagen(es) fuera del documento (−${kb(ahorroDoc)})`);
    anotar(`aplicar ${s.id}: ${aplicadas.join(", ")}`);
  }

  console.log(`\nSolicitudes cambiadas: ${cambiadas}  ·  imágenes movidas: ${imagenes}  ·  fallos: ${fallos}`);
  console.log(`Peso quitado de la base: ${mb(ahorro)}`);
  anotar(`aplicar: ${cambiadas} solicitudes, ${imagenes} imágenes, ${mb(ahorro)}`);
}

// ─────────────────────────── comprobar ───────────────────────────

/** Lee de la base lo que ve la plataforma y descarga cada imagen. */
async function comprobar() {
  const solicitudes = await traerSolicitudes();
  const elegidas = solicitudes.filter((s) => (idsPedidos ? idsPedidos.includes(s.id) : true)).slice(0, limite === Infinity ? 20 : limite);
  let malas = 0;

  for (const s of elegidas) {
    const lista = Array.isArray(s.datos[CAMPO_LISTA]) ? s.datos[CAMPO_LISTA] : [];
    const sueltas = s.datos[CAMPO_SUELTO] ? [s.datos[CAMPO_SUELTO]] : [];
    const peso = Buffer.byteLength(JSON.stringify(s.datos));
    const titulo = String(s.datos.title || "").slice(0, 44);
    console.log(`${s.id}: documento ${kb(peso)} · ${lista.length + sueltas.length} imagen(es) · "${titulo}" · ${s.datos.status || "?"}`);
    for (const u of [...lista, ...sueltas]) {
      if (esDataUrl(u)) { console.log(`   incrustada todavía (${kb(u.length)})`); continue; }
      try {
        const r = await fetch(u);
        const bytes = Buffer.from(await r.arrayBuffer());
        const ok = r.ok && bytes.length > 0;
        if (!ok) malas++;
        console.log(`   ${ok ? "✓" : "✗"} ${r.status} ${r.headers.get("content-type")} ${kb(bytes.length)}`);
      } catch (err) {
        malas++;
        console.log(`   ✗ ${err?.message || err}`);
      }
    }
  }
  console.log(`\nRevisadas ${elegidas.length} solicitudes · imágenes que no abren: ${malas}`);
}

// ─────────────────────────── revertir ────────────────────────────

async function revertir() {
  if (!idsPedidos) {
    console.error('Hay que decir qué solicitudes: --ids GP7054,GP7055  (o --ids TODAS)');
    process.exit(1);
  }
  const deDisco = await traerSolicitudes({ desdeDisco: true });
  const todas = idsPedidos.includes("TODAS");
  let hechas = 0;

  for (const s of deDisco) {
    if (!todas && !idsPedidos.includes(s.id)) continue;
    const parche = {};
    if (Array.isArray(s.datos[CAMPO_LISTA])) parche[CAMPO_LISTA] = s.datos[CAMPO_LISTA];
    if (s.datos[CAMPO_SUELTO] !== undefined) parche[CAMPO_SUELTO] = s.datos[CAMPO_SUELTO];
    if (!Object.keys(parche).length) continue;
    await updateDoc(doc(db, "requests", s.id), parche);
    hechas++;
    console.log(`↩ ${s.id} vuelto a como estaba en el respaldo`);
    anotar(`revertir ${s.id}`);
  }
  console.log(`\nRevertidas: ${hechas}`);
}

// ─────────────────────────────────────────────────────────────────

const comandos = { respaldo, estado, subir, aplicar, comprobar, revertir };
if (!comandos[comando]) {
  console.error(`Comando desconocido: ${comando}. Hay: ${Object.keys(comandos).join(", ")}`);
  process.exit(1);
}
await comandos[comando]();
process.exit(0);
