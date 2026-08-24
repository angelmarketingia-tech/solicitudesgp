// ─────────────────────────────────────────────────────────────────────────
// Exportación del calendario de un influencer a PDF y a Word.
// ─────────────────────────────────────────────────────────────────────────
//
// POR QUÉ EXISTE: varios influencers no consiguen abrir el link público
// (/i/<código>). Mientras se aclara la causa, el calendario tiene que poder
// salir de la plataforma como un archivo que se manda por WhatsApp o correo.
//
// UN SOLO DOCUMENTO, DOS SALIDAS: se construye un HTML y de ahí salen las dos
// entregas —imprimir a PDF y descargar .doc—, así ambas se ven igual y no hay
// dos maquetas que mantener.
//
// POR QUÉ TABLAS Y ESTILOS EN LÍNEA: Word importa HTML con un motor antiguo
// que ignora flex, grid y buena parte de las hojas de estilo. Las tablas con
// estilo en cada celda son lo único que se ve igual en Word y en el navegador.
// Si algún día se toca esta maqueta, conviene abrirla en Word antes de dar el
// cambio por bueno.

import {
  ContentItem, Influencer, MONTHS_ES, monthGrid, STATUS_STYLE, PILLAR_STYLE,
} from "./influencer";

// ─── Paleta (la misma de globals.css, aquí en literal porque el documento
//     viaja fuera de la app y no tiene acceso a las variables CSS) ──────────
const VERDE = "#00783e";
const VERDE_OSCURO = "#034419";
const VERDE_CLARO = "#e6f2ec";
const VERDE_TENUE = "#8fd0ac";
const TEXTO = "#333333";
const APAGADO = "#6b7280";
const BORDE = "#e2e6e3";
const PAPEL = "#ffffff";

const DOW_LARGO = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DOW_CORTO = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

const FUENTE = "Segoe UI, Helvetica Neue, Arial, sans-serif";

// ─── Utilidades de texto ────────────────────────────────────────────────────
const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Escapa y conserva los saltos de línea del guion. */
const escMultilinea = (s: unknown) => esc(s).replace(/\r?\n/g, "<br>");

function partesFecha(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7;
  return { y, m0: m - 1, d, dow };
}

/** "Lunes 3 de agosto de 2026" */
function fechaLarga(iso: string) {
  const p = partesFecha(iso);
  if (!p) return iso;
  return `${DOW_LARGO[p.dow]} ${p.d} de ${MONTHS_ES[p.m0].toLowerCase()} de ${p.y}`;
}

/** "3 mar" — para las fechas secundarias de la ficha. */
function fechaCorta(iso?: string) {
  if (!iso) return "";
  const p = partesFecha(iso);
  if (!p) return iso;
  return `${p.d} ${MONTHS_ES[p.m0].slice(0, 3).toLowerCase()}`;
}

// ─── Piezas visuales ────────────────────────────────────────────────────────
function etiqueta(texto: string, color: string, fondo: string) {
  return `<span style="display:inline-block;background:${fondo};color:${color};`
    + `font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;`
    + `margin:0 4px 4px 0;white-space:nowrap;">${esc(texto)}</span>`;
}

function etiquetaEstado(estado: string) {
  const s = STATUS_STYLE[estado] || { text: APAGADO, bg: "#f1f2f4" };
  return etiqueta(estado, s.text, s.bg);
}

function etiquetasPilares(pilares: string[]) {
  return pilares.map(p => {
    const s = PILLAR_STYLE[p] || { text: APAGADO, bg: "#f1f2f4" };
    return etiqueta(p, s.text, s.bg);
  }).join("");
}

/** Fila "Canal · Formato" de la ficha, en tabla para que Word la respete. */
function filaDato(clave: string, valor: string) {
  if (!valor) return "";
  return `<tr>`
    + `<td style="padding:3px 14px 3px 0;font-size:10px;font-weight:700;color:${APAGADO};`
    + `letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;vertical-align:top;">${esc(clave)}</td>`
    + `<td style="padding:3px 0;font-size:12.5px;color:${TEXTO};vertical-align:top;">${esc(valor)}</td>`
    + `</tr>`;
}

// ─── Vista de mes (cuadrícula de 7 columnas) ────────────────────────────────
function vistaMes(y: number, m0: number, porDia: Map<string, ContentItem[]>) {
  const semanas = monthGrid(y, m0);

  const cabecera = DOW_CORTO.map(d =>
    `<td style="background:${VERDE_OSCURO};color:#ffffff;font-size:9.5px;font-weight:700;`
    + `letter-spacing:.1em;padding:7px 4px;text-align:center;width:14.28%;">${d}</td>`
  ).join("");

  const filas = semanas.map(semana => {
    const celdas = semana.map(iso => {
      if (!iso) {
        return `<td style="background:#fafbfa;border:1px solid ${BORDE};height:74px;"></td>`;
      }
      const p = partesFecha(iso)!;
      const delDia = porDia.get(iso) || [];
      const numero = `<div style="font-size:11px;font-weight:700;`
        + `color:${delDia.length ? VERDE : APAGADO};margin-bottom:3px;">${p.d}</div>`;
      const piezas = delDia.map(it =>
        `<div style="background:${VERDE_CLARO};border-left:2px solid ${VERDE};padding:3px 4px;`
        + `margin-bottom:2px;font-size:8.5px;line-height:1.25;color:${VERDE_OSCURO};font-weight:600;">`
        + `${esc(it.title)}</div>`
      ).join("");
      return `<td style="border:1px solid ${BORDE};height:74px;padding:4px;vertical-align:top;background:${PAPEL};">`
        + numero + piezas + `</td>`;
    }).join("");
    return `<tr>${celdas}</tr>`;
  }).join("");

  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:26px;">`
    + `<tr>${cabecera}</tr>${filas}</table>`;
}

// ─── Ficha de un contenido ──────────────────────────────────────────────────
function ficha(it: ContentItem, indice: number, total: number) {
  const p = partesFecha(it.date);
  const bloqueFecha = p
    ? `<div style="font-size:9.5px;font-weight:700;color:${VERDE};letter-spacing:.08em;">${DOW_CORTO[p.dow]}</div>`
      + `<div style="font-size:34px;font-weight:800;color:${VERDE_OSCURO};line-height:1.05;">${p.d}</div>`
      + `<div style="font-size:9.5px;color:${APAGADO};text-transform:uppercase;letter-spacing:.06em;">`
      + `${MONTHS_ES[p.m0].slice(0, 3)}</div>`
    : `<div style="font-size:11px;color:${APAGADO};">Sin fecha</div>`;

  const fechasSecundarias = [
    it.requestDate ? `Solicitado ${fechaCorta(it.requestDate)}` : "",
    it.deliveryDate && it.deliveryDate !== it.date ? `Entrega ${fechaCorta(it.deliveryDate)}` : "",
  ].filter(Boolean).join(" · ");

  const guion = it.ideas.trim()
    ? `<div style="background:#fbfcfb;border:1px solid ${BORDE};border-left:3px solid ${VERDE};padding:12px 14px;">`
      + `<div style="font-size:9.5px;font-weight:700;color:${VERDE};letter-spacing:.1em;`
      + `text-transform:uppercase;margin-bottom:7px;">Guion</div>`
      + `<div style="font-size:12.5px;line-height:1.65;color:${TEXTO};">${escMultilinea(it.ideas)}</div>`
      + `</div>`
    : `<div style="font-size:11.5px;color:${APAGADO};font-style:italic;padding:8px 0;">Sin guion todavía.</div>`;

  return `<table style="width:100%;border-collapse:collapse;margin-bottom:18px;page-break-inside:avoid;`
    + `border:1px solid ${BORDE};background:${PAPEL};"><tr>`
    // Columna izquierda: la fecha, que es el ancla visual de la ficha.
    + `<td style="width:78px;background:${VERDE_CLARO};padding:14px 8px;text-align:center;vertical-align:top;">`
    + bloqueFecha + `</td>`
    // Columna derecha: todo el contenido.
    + `<td style="padding:14px 18px;vertical-align:top;">`
    + `<div style="font-size:9.5px;color:${APAGADO};letter-spacing:.06em;margin-bottom:3px;">`
    + `CONTENIDO ${indice} DE ${total} · ${esc(fechaLarga(it.date))}</div>`
    + `<div style="font-size:17px;font-weight:800;color:${TEXTO};line-height:1.3;margin-bottom:8px;">`
    + `${esc(it.title)}</div>`
    + `<div style="margin-bottom:10px;">${etiquetaEstado(it.contentStatus)}${etiquetasPilares(it.pillars)}</div>`
    + `<table style="border-collapse:collapse;margin-bottom:11px;">`
    + filaDato("Canal", it.channel)
    + filaDato("Formato", it.contentFormat)
    + filaDato("Fechas", fechasSecundarias)
    + `</table>`
    + guion
    + `</td></tr></table>`;
}

// ─── Documento completo ─────────────────────────────────────────────────────
export type DatosExport = {
  influencer: Influencer;
  items: ContentItem[];   // ya filtrados al mes que se exporta
  year: number;
  month: number;          // 0-11
};

export function construirDocumento({ influencer, items, year, month }: DatosExport): string {
  const ordenados = [...items].sort((a, b) => a.date.localeCompare(b.date));

  const porDia = new Map<string, ContentItem[]>();
  for (const it of ordenados) {
    const arr = porDia.get(it.date) || [];
    arr.push(it);
    porDia.set(it.date, arr);
  }

  const titulo = `Contenido ${influencer.name} — ${MONTHS_ES[month]} ${year}`;

  // Resumen: cuántos contenidos y por qué canal. Da contexto de un vistazo.
  const porCanal = new Map<string, number>();
  for (const it of ordenados) {
    if (it.channel) porCanal.set(it.channel, (porCanal.get(it.channel) || 0) + 1);
  }
  const resumenCanales = [...porCanal.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${c} (${n})`)
    .join(" · ");

  const cabecera =
    `<table style="width:100%;border-collapse:collapse;margin-bottom:22px;"><tr>`
    + `<td style="background:${VERDE_OSCURO};padding:26px 28px;vertical-align:middle;">`
    + `<div style="font-size:10px;font-weight:700;color:${VERDE_TENUE};letter-spacing:.18em;margin-bottom:9px;">`
    + `GANAPLAY · CALENDARIO DE CONTENIDO</div>`
    + `<div style="font-size:31px;font-weight:800;color:#ffffff;line-height:1.15;">${esc(influencer.name)}</div>`
    + (influencer.handle
      ? `<div style="font-size:13px;color:${VERDE_TENUE};margin-top:4px;">${esc(influencer.handle)}</div>`
      : "")
    + `</td>`
    + `<td style="background:${VERDE_OSCURO};padding:26px 28px;text-align:right;vertical-align:middle;width:190px;">`
    + `<div style="font-size:23px;font-weight:800;color:#ffffff;line-height:1.1;">${MONTHS_ES[month]}</div>`
    + `<div style="font-size:15px;color:${VERDE_TENUE};font-weight:600;">${year}</div>`
    + `</td></tr></table>`;

  const resumen =
    `<table style="width:100%;border-collapse:collapse;margin-bottom:24px;border:1px solid ${BORDE};"><tr>`
    + `<td style="padding:13px 18px;background:${VERDE_CLARO};vertical-align:middle;">`
    + `<span style="font-size:22px;font-weight:800;color:${VERDE_OSCURO};">${ordenados.length}</span>`
    + `<span style="font-size:12px;color:${VERDE_OSCURO};font-weight:600;margin-left:7px;">`
    + `${ordenados.length === 1 ? "contenido programado" : "contenidos programados"}</span>`
    + (resumenCanales
      ? `<span style="font-size:11.5px;color:${APAGADO};margin-left:14px;">${esc(resumenCanales)}</span>`
      : "")
    + `</td></tr></table>`;

  const cuerpo = ordenados.length === 0
    ? `<div style="border:1px dashed ${BORDE};padding:44px;text-align:center;color:${APAGADO};font-size:13px;">`
      + `No hay contenido programado para ${MONTHS_ES[month].toLowerCase()} de ${year}.</div>`
    : vistaMes(year, month, porDia)
      + `<div style="font-size:11px;font-weight:700;color:${VERDE};letter-spacing:.14em;`
      + `border-bottom:2px solid ${VERDE};padding-bottom:7px;margin-bottom:16px;">DETALLE DE CADA CONTENIDO</div>`
      + ordenados.map((it, i) => ficha(it, i + 1, ordenados.length)).join("");

  const pie =
    `<div style="margin-top:26px;padding-top:12px;border-top:1px solid ${BORDE};`
    + `font-size:10px;color:${APAGADO};text-align:center;">`
    + `GanaPlay · Calendario de contenido de ${esc(influencer.name)} · ${MONTHS_ES[month]} ${year}</div>`;

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${esc(titulo)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page { size: A4 portrait; margin: 13mm; }
  body { margin:0; padding:0; background:${PAPEL}; color:${TEXTO}; font-family:${FUENTE}; }
  table { border-collapse: collapse; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div style="max-width:820px;margin:0 auto;padding:16px;">
${cabecera}${resumen}${cuerpo}${pie}
</div>
</body>
</html>`;
}

// ─── Nombre de archivo ──────────────────────────────────────────────────────
export function nombreArchivo({ influencer, year, month }: Omit<DatosExport, "items">) {
  // Los acentos y las eñes rompen la descarga en algunos navegadores y
  // clientes de correo, así que el nombre sale en ASCII puro.
  //
  // El orden importa: "NFD" separa la letra de su tilde ("í" → "i" + ´), y
  // ESE resto hay que borrarlo, no convertirlo en guion; si no, "Rodríguez"
  // acababa como "Rodri-guez".
  const limpio = influencer.name
    .normalize("NFD")
    .replace(/[^\x20-\x7E]/g, "")     // fuera tildes sueltas y demás no-ASCII
    .replace(/[^a-zA-Z0-9]+/g, "-")   // el resto de separadores, a guion
    .replace(/^-|-$/g, "");
  return `Contenido-${limpio || "Influencer"}-${MONTHS_ES[month]}-${year}`;
}

// ─── Salida 1: Word (.doc) ──────────────────────────────────────────────────
/**
 * Word abre HTML si el archivo llega como application/msword. El BOM del
 * principio es lo que le dice que el texto es UTF-8; sin él, se comen las
 * tildes y las eñes.
 */
const BOM_UTF8 = "﻿";

export function descargarWord(datos: DatosExport) {
  const html = construirDocumento(datos);
  const blob = new Blob([BOM_UTF8, html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombreArchivo(datos)}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Se libera con margen: si se revoca de inmediato, alguna versión de Safari
  // cancela la descarga a medias.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ─── Salida 2: PDF (diálogo de impresión del navegador) ─────────────────────
/**
 * Se imprime desde un iframe oculto en lugar de abrir una pestaña: así no hay
 * bloqueador de ventanas emergentes de por medio, que es el motivo habitual
 * de que "no pase nada" al pulsar el botón.
 *
 * El usuario elige "Guardar como PDF" en el diálogo. No se usa ninguna
 * librería de PDF: el motor del navegador respeta la maqueta tal cual.
 */
export function imprimirPdf(datos: DatosExport, alFallar?: (msg: string) => void) {
  const html = construirDocumento(datos);

  const marco = document.createElement("iframe");
  marco.setAttribute("aria-hidden", "true");
  marco.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(marco);

  const limpiar = () => { if (marco.parentNode) document.body.removeChild(marco); };

  marco.onload = () => {
    try {
      const ventana = marco.contentWindow;
      if (!ventana) throw new Error("sin ventana");
      ventana.focus();
      ventana.print();
      // El iframe se retira después de que el diálogo se haya cerrado. En
      // Chrome print() es bloqueante; en Firefox no, de ahí la espera.
      setTimeout(limpiar, 1500);
    } catch {
      limpiar();
      alFallar?.("No se pudo abrir la ventana de impresión. Prueba con la descarga en Word.");
    }
  };

  const doc = marco.contentDocument;
  if (!doc) {
    limpiar();
    alFallar?.("No se pudo generar el PDF. Prueba con la descarga en Word.");
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
}
