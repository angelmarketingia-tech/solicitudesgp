/**
 * Genera la guía en PDF para conectar un agente de IA.
 *
 *   npm run guia:pdf          (genera las dos guías)
 *   node scripts/generar-guia-pdf.mjs ORIGEN.md public/DESTINO.pdf
 *
 * POR QUÉ ASÍ: el texto vive SOLO en `GUIA_AGENTE_IA.md`. Este script lo lee,
 * lo maqueta con la marca GanaPlay y lo imprime a `public/guia-agente-ia.pdf`,
 * que es lo que descarga el equipo desde la plataforma. Si el PDF tuviera su
 * propio texto, a la segunda corrección ya dirían cosas distintas.
 *
 * El conversor de Markdown de aquí abajo entiende solo lo que usa esa guía
 * —títulos, listas, tablas, bloques de código, negritas, citas—. No pretende
 * ser completo: si algún día la guía usa algo más, se amplía aquí.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, "..");
// Por defecto, la guía de conexión; con argumentos, cualquier otra guía.
const ORIGEN = path.join(raiz, process.argv[2] || "GUIA_AGENTE_IA.md");
const DESTINO = path.join(raiz, process.argv[3] || "public/guia-agente-ia.pdf");

// ─── Marca ──────────────────────────────────────────────────────────────────
const VERDE = "#00783e";
const VERDE_OSCURO = "#034419";
const VERDE_CLARO = "#e6f2ec";
const TEXTO = "#333333";
const APAGADO = "#6b7280";
const BORDE = "#e2e6e3";
const FUENTE = "Segoe UI, Helvetica Neue, Arial, sans-serif";

const esc = s => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Negritas, código y enlaces dentro de una línea. */
function enLinea(t) {
  return esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/** Markdown → HTML, solo lo que la guía usa. */
function aHtml(md) {
  const lineas = md.split(/\r?\n/);
  const salida = [];
  let i = 0;

  const cerrarLista = pila => { while (pila.length) salida.push(pila.pop()); };
  const pila = [];

  while (i < lineas.length) {
    const linea = lineas[i];

    // Bloque de código
    if (/^```/.test(linea)) {
      cerrarLista(pila);
      const cuerpo = [];
      i++;
      while (i < lineas.length && !/^```/.test(lineas[i])) cuerpo.push(lineas[i++]);
      i++;
      salida.push(`<pre>${esc(cuerpo.join("\n"))}</pre>`);
      continue;
    }

    // Tabla
    if (/^\|/.test(linea) && /^\|[\s:|-]+\|$/.test(lineas[i + 1] || "")) {
      cerrarLista(pila);
      const celdas = l => l.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      const cabecera = celdas(linea);
      i += 2;
      const filas = [];
      while (i < lineas.length && /^\|/.test(lineas[i])) filas.push(celdas(lineas[i++]));
      salida.push(
        `<table><tr>${cabecera.map(c => `<th>${enLinea(c)}</th>`).join("")}</tr>` +
        filas.map(f => `<tr>${f.map(c => `<td>${enLinea(c)}</td>`).join("")}</tr>`).join("") +
        `</table>`,
      );
      continue;
    }

    // Separador
    if (/^---+$/.test(linea.trim())) { cerrarLista(pila); salida.push("<hr>"); i++; continue; }

    // Títulos
    const t = linea.match(/^(#{1,4})\s+(.*)$/);
    if (t) {
      cerrarLista(pila);
      salida.push(`<h${t[1].length}>${enLinea(t[2])}</h${t[1].length}>`);
      i++;
      continue;
    }

    // Cita
    if (/^>\s?/.test(linea)) {
      cerrarLista(pila);
      const cuerpo = [];
      while (i < lineas.length && /^>\s?/.test(lineas[i])) cuerpo.push(lineas[i++].replace(/^>\s?/, ""));
      salida.push(`<blockquote>${enLinea(cuerpo.join(" "))}</blockquote>`);
      continue;
    }

    // Listas (numeradas o con guion), admitiendo continuación indentada
    const li = linea.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (li) {
      const tipo = /\d/.test(li[2]) ? "ol" : "ul";
      if (!pila.length) { salida.push(`<${tipo}>`); pila.push(`</${tipo}>`); }
      let texto = li[3];
      // Líneas siguientes indentadas: son del mismo punto.
      while (/^\s{2,}\S/.test(lineas[i + 1] || "") && !/^\s*([-*]|\d+\.)\s/.test(lineas[i + 1])) {
        texto += " " + lineas[++i].trim();
      }
      salida.push(`<li>${enLinea(texto)}</li>`);
      i++;
      continue;
    }

    if (!linea.trim()) { cerrarLista(pila); i++; continue; }

    // Párrafo (con sus continuaciones)
    cerrarLista(pila);
    const parrafo = [linea];
    while (i + 1 < lineas.length && lineas[i + 1].trim() && !/^(#{1,4}\s|[-*]\s|\d+\.\s|\||>|```|---)/.test(lineas[i + 1])) {
      parrafo.push(lineas[++i]);
    }
    salida.push(`<p>${enLinea(parrafo.join(" "))}</p>`);
    i++;
  }
  cerrarLista(pila);
  return salida.join("\n");
}

// El título principal del .md pasa a la portada; el cuerpo va detrás.
const md = fs.readFileSync(ORIGEN, "utf8");
const titulo = (md.match(/^#\s+(.*)$/m) || [, "Conectar tu agente de IA"])[1];
const cuerpo = aHtml(md.replace(/^#\s+.*$/m, ""));

const hoy = new Date();
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fecha = `${hoy.getDate()} de ${MESES[hoy.getMonth()]} de ${hoy.getFullYear()}`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(titulo)}</title>
<style>
  @page { size: A4; margin: 17mm 15mm 16mm; }
  body { font-family: ${FUENTE}; color: ${TEXTO}; font-size: 11.5pt; line-height: 1.55; margin: 0; }
  .portada { background: ${VERDE}; color: #fff; border-radius: 14px; padding: 26px 28px; margin-bottom: 22px; }
  .portada .marca { font-size: 19pt; font-weight: bold; }
  .portada .sub { color: #bfe0ce; font-size: 10pt; margin-top: 2px; }
  .portada h1 { font-size: 20pt; margin: 16px 0 0; }
  .portada .fecha { color: #bfe0ce; font-size: 9.5pt; margin-top: 6px; }
  h2 { font-size: 14pt; color: ${VERDE_OSCURO}; margin: 22px 0 8px;
       padding-bottom: 5px; border-bottom: 2px solid ${VERDE_CLARO};
       page-break-after: avoid; }
  h3 { font-size: 12pt; color: ${VERDE_OSCURO}; margin: 16px 0 6px; page-break-after: avoid; }
  p { margin: 0 0 9px; }
  ul, ol { margin: 0 0 10px; padding-left: 20px; }
  li { margin-bottom: 4px; }
  code { font-family: Consolas, "Courier New", monospace; font-size: 10pt;
         background: ${VERDE_CLARO}; color: ${VERDE_OSCURO};
         padding: 1px 4px; border-radius: 4px; }
  pre { font-family: Consolas, "Courier New", monospace; font-size: 9.5pt;
        background: #f7f9f8; border: 1px solid ${BORDE}; border-left: 3px solid ${VERDE};
        border-radius: 8px; padding: 10px 12px; margin: 0 0 12px;
        white-space: pre-wrap; word-break: break-all; page-break-inside: avoid; }
  pre code { background: none; color: ${TEXTO}; padding: 0; }
  blockquote { margin: 0 0 12px; padding: 10px 14px; background: #fdf3e7;
               border-left: 3px solid #b54708; border-radius: 0 8px 8px 0; font-size: 10.5pt; }
  blockquote p { margin: 0; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 14px; font-size: 10pt;
          page-break-inside: avoid; }
  th { background: ${VERDE}; color: #fff; text-align: left; padding: 7px 9px;
       font-size: 9pt; text-transform: uppercase; letter-spacing: .4px; }
  td { border: 1px solid ${BORDE}; padding: 6px 9px; vertical-align: top; }
  tr:nth-child(even) td { background: #f7f9f8; }
  hr { border: none; border-top: 1px solid ${BORDE}; margin: 20px 0; }
  a { color: ${VERDE}; }
  .pie { margin-top: 26px; padding-top: 10px; border-top: 1px solid ${BORDE};
         color: #a7a9ac; font-size: 8.5pt; text-align: center; }
</style></head><body>
<div class="portada">
  <div class="marca">GanaPlay Diseño</div>
  <div class="sub">Guía de conexión</div>
  <h1>${esc(titulo)}</h1>
  <div class="fecha">Actualizada el ${fecha}</div>
</div>
${cuerpo}
<div class="pie">GanaPlay · Plataforma de solicitudes de diseño · solicitudes.ganaplay.lat</div>
</body></html>`;

// Para revisar la maqueta sin abrir el PDF: GUIA_HTML=ruta.html npm run guia:pdf
if (process.env.GUIA_HTML) fs.writeFileSync(process.env.GUIA_HTML, html);

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
await pagina.setContent(html, { waitUntil: "load" });
fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
await pagina.pdf({
  path: DESTINO,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate:
    `<div style="width:100%;font-size:8pt;color:#a7a9ac;font-family:${FUENTE};padding:0 15mm;text-align:right;">` +
    `Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>`,
  margin: { top: "17mm", bottom: "16mm", left: "15mm", right: "15mm" },
});
await navegador.close();

const kb = Math.round(fs.statSync(DESTINO).size / 1024);
console.log(`PDF generado: ${path.relative(raiz, DESTINO)} (${kb} KB)`);
