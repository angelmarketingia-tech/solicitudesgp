// ─────────────────────────────────────────────────────────────────────────
// Informe de solicitudes de diseño: consolidado, desglose y salida a PDF.
// ─────────────────────────────────────────────────────────────────────────
//
// POR QUÉ EXISTE: la contabilidad del Centro de Diseño vivía solo en pantalla.
// Para pasar el dato a dirección —cuántos artes de Nueva Línea Gráfica, cuántos
// E-CARDS, quién hizo qué y en qué rango de fechas— había que copiarlo a mano.
//
// QUÉ ES: un solo cálculo (`resumirSolicitudes`) que alimenta LAS DOS cosas —
// lo que se ve en la pantalla y lo que sale impreso—, para que el informe no
// pueda contradecir al tablero. Encima, una maqueta HTML con la marca GanaPlay
// que el navegador imprime a PDF.
//
// POR QUÉ TABLAS Y ESTILOS EN LÍNEA: el mismo motivo que en
// `influencer-export.ts` — el documento viaja fuera de la app, sin acceso a las
// variables CSS, y el motor de impresión respeta las tablas mucho mejor que
// flex o grid.

// ─── Datos de entrada ───────────────────────────────────────────────────────
//
// La forma de una solicitud y el filtro por fechas viven en `analytics.ts`, que
// es la base: este módulo IMPRIME lo que aquel CALCULA. Se reexportan para no
// romper a quien ya los importaba desde aquí.
import {
  VERDE_MARCA,
  etiquetaMes, fechaDeCorte, filtrarPorFechas, repartoPorCategoria,
  resumenAnalitico, universoDeCategorias,
} from "./analytics";
import type { RangoFechas, SolicitudAnalitica } from "./analytics";

export type { RangoFechas, SolicitudAnalitica };
export type SolicitudInforme = SolicitudAnalitica;
export { fechaDeCorte, filtrarPorFechas };

export type DatosInforme = RangoFechas & {
  solicitudes: SolicitudInforme[];
  /** "Todo el equipo" o el nombre de la persona. Sale en la portada. */
  alcance: string;
  generadoPor: string;
  /** El desglose por diseñador solo tiene sentido en el informe general. */
  incluirPorDisenador: boolean;
};

// ─── Paleta GanaPlay (en literal: el documento sale de la app) ──────────────
const VERDE = "#00783e";
const VERDE_OSCURO = "#034419";
const VERDE_CLARO = "#e6f2ec";
const TEXTO = "#333333";
const APAGADO = "#6b7280";
const BORDE = "#e2e6e3";
const PAPEL = "#ffffff";
const CEBRA = "#f7f9f8";

const FUENTE = "Segoe UI, Helvetica Neue, Arial, sans-serif";

/** Los estados, en el orden en que se leen en el informe. */
export const ESTADOS = [
  "Pendiente", "Planeando", "En Proceso", "Publicado", "Declinada", "Denegado",
] as const;

const COLOR_ESTADO: Record<string, { bg: string; text: string }> = {
  "Publicado":  { bg: "#e6f2ec", text: "#00783e" },
  "En Proceso": { bg: "#e8f1fc", text: "#0b6bcb" },
  "Planeando":  { bg: "#f1ebfb", text: "#7c3aed" },
  "Pendiente":  { bg: "#fdf3e7", text: "#b54708" },
  "Declinada":  { bg: "#f5e8e8", text: "#9c3838" },
  "Denegado":   { bg: "#fdecea", text: "#d92d20" },
};

// ─── Utilidades ─────────────────────────────────────────────────────────────
const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "3 de septiembre de 2026". Devuelve la cadena tal cual si no es una fecha. */
function fechaLarga(iso: string): string {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return iso || "";
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

// ─── El cálculo, uno solo para pantalla e impresión ─────────────────────────

export type Conteo = {
  clave: string;
  total: number;
  porEstado: Record<string, number>;
};

export type Resumen = {
  total: number;
  porEstado: Record<string, number>;
  publicadas: number;
  enProceso: number;
  pendientes: number;
  declinadas: number;
  porTipo: Conteo[];
  porArea: Conteo[];
  porDisenador: Conteo[];
};

function agrupar(
  solicitudes: SolicitudInforme[],
  clavePara: (r: SolicitudInforme) => string,
  ordenFijo?: readonly string[],
): Conteo[] {
  const mapa = new Map<string, Conteo>();
  for (const r of solicitudes) {
    const clave = clavePara(r);
    let fila = mapa.get(clave);
    if (!fila) { fila = { clave, total: 0, porEstado: {} }; mapa.set(clave, fila); }
    fila.total += 1;
    fila.porEstado[r.status] = (fila.porEstado[r.status] || 0) + 1;
  }
  const filas = [...mapa.values()];
  if (ordenFijo) {
    // Orden del catálogo primero; lo que no esté en él, detrás y por volumen.
    const pos = (c: string) => {
      const i = ordenFijo.indexOf(c);
      return i === -1 ? ordenFijo.length : i;
    };
    return filas.sort((a, b) => pos(a.clave) - pos(b.clave) || b.total - a.total);
  }
  return filas.sort((a, b) => b.total - a.total || a.clave.localeCompare(b.clave));
}

/**
 * Consolidado + desgloses. `ordenTipos` es el catálogo de tipos de la app, para
 * que el informe los liste siempre igual (y muestre en 0 los que no se pidieron
 * en el periodo, que también es dato).
 */
export function resumirSolicitudes(
  solicitudes: SolicitudInforme[],
  ordenTipos: readonly string[] = [],
): Resumen {
  const porEstado: Record<string, number> = {};
  for (const r of solicitudes) porEstado[r.status] = (porEstado[r.status] || 0) + 1;

  const porTipo = agrupar(solicitudes, r => r.requestKind || "Sin tipo", ordenTipos);
  // Los tipos del catálogo que nadie pidió salen en cero: un informe que los
  // omite se lee como si no existieran.
  for (const t of ordenTipos) {
    if (!porTipo.some(f => f.clave === t)) porTipo.push({ clave: t, total: 0, porEstado: {} });
  }
  const pos = (c: string) => {
    const i = ordenTipos.indexOf(c);
    return i === -1 ? ordenTipos.length : i;
  };
  porTipo.sort((a, b) => pos(a.clave) - pos(b.clave) || b.total - a.total);

  return {
    total: solicitudes.length,
    porEstado,
    publicadas: porEstado["Publicado"] || 0,
    enProceso: (porEstado["En Proceso"] || 0) + (porEstado["Planeando"] || 0),
    pendientes: porEstado["Pendiente"] || 0,
    declinadas: porEstado["Declinada"] || 0,
    porTipo,
    porArea: agrupar(solicitudes, r => (r.area || "").trim() || "Sin área"),
    porDisenador: agrupar(solicitudes, r => (r.assignedTo || "").trim() || "Sin asignar"),
  };
}

// ─── Maqueta del documento ──────────────────────────────────────────────────

const th = (texto: string, alineado = "left") =>
  `<th style="text-align:${alineado};padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:${PAPEL};background:${VERDE};font-weight:bold;border:1px solid ${VERDE};">${esc(texto)}</th>`;

const td = (texto: string, alineado = "left", extra = "") =>
  `<td style="text-align:${alineado};padding:7px 10px;font-size:12px;color:${TEXTO};border:1px solid ${BORDE};${extra}">${texto}</td>`;

function tarjeta(valor: number, etiqueta: string, color: string, fondo: string) {
  return `<td style="padding:0 6px 0 0;" width="20%">
    <table width="100%" style="border-collapse:collapse;"><tr>
      <td style="background:${fondo};border:1px solid ${BORDE};border-radius:10px;padding:12px 14px;">
        <div style="font-size:26px;font-weight:bold;color:${color};line-height:1;">${valor}</div>
        <div style="font-size:11px;color:${APAGADO};margin-top:5px;font-weight:bold;">${esc(etiqueta)}</div>
      </td>
    </tr></table>
  </td>`;
}

/** Tabla de un desglose: la clave, el total y el reparto por estado. */
function tablaDesglose(titulo: string, filas: Conteo[], etiquetaClave: string): string {
  if (filas.length === 0) return "";
  const cuerpo = filas.map((f, i) => {
    const fondo = i % 2 ? `background:${CEBRA};` : "";
    const celdas = ESTADOS.map(e =>
      td(String(f.porEstado[e] || 0), "center", fondo + (f.porEstado[e] ? `color:${COLOR_ESTADO[e]?.text || TEXTO};font-weight:bold;` : `color:${APAGADO};`)),
    ).join("");
    return `<tr>
      ${td(`<strong>${esc(f.clave)}</strong>`, "left", fondo)}
      ${td(`<strong>${f.total}</strong>`, "center", fondo + `background:${VERDE_CLARO};color:${VERDE_OSCURO};`)}
      ${celdas}
    </tr>`;
  }).join("");

  return `
  <h2 style="font-size:14px;color:${VERDE_OSCURO};margin:26px 0 10px;padding-bottom:6px;border-bottom:2px solid ${VERDE_CLARO};">${esc(titulo)}</h2>
  <table width="100%" style="border-collapse:collapse;">
    <tr>${th(etiquetaClave)}${th("Total", "center")}${ESTADOS.map(e => th(e, "center")).join("")}</tr>
    ${cuerpo}
  </table>`;
}

/** Detalle solicitud a solicitud, para poder auditar el consolidado. */
function tablaDetalle(solicitudes: SolicitudInforme[]): string {
  if (solicitudes.length === 0) return "";
  const filas = [...solicitudes]
    .sort((a, b) => fechaDeCorte(b).localeCompare(fechaDeCorte(a)) || a.id.localeCompare(b.id))
    .map((r, i) => {
      const fondo = i % 2 ? `background:${CEBRA};` : "";
      const c = COLOR_ESTADO[r.status] || { bg: CEBRA, text: TEXTO };
      return `<tr>
        ${td(`<strong>${esc(r.id)}</strong>`, "left", fondo)}
        ${td(esc(r.title), "left", fondo)}
        ${td(esc(r.requestKind || "—"), "left", fondo)}
        ${td(esc(r.area || "—"), "left", fondo)}
        ${td(esc(r.requesterName || "—"), "left", fondo)}
        ${td(esc(r.assignedTo || "Sin asignar"), "left", fondo)}
        ${td(`<span style="background:${c.bg};color:${c.text};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold;">${esc(r.status)}</span>`, "center", fondo)}
        ${td(esc(fechaDeCorte(r) || "—"), "center", fondo)}
        ${td(esc(r.deliveryDate || "—"), "center", fondo)}
      </tr>`;
    }).join("");

  return `
  <h2 style="font-size:14px;color:${VERDE_OSCURO};margin:26px 0 10px;padding-bottom:6px;border-bottom:2px solid ${VERDE_CLARO};">Detalle de solicitudes</h2>
  <table width="100%" style="border-collapse:collapse;">
    <tr>${th("ID")}${th("Solicitud")}${th("Tipo")}${th("Área")}${th("Solicitante")}${th("Diseñador")}${th("Estado", "center")}${th("Creada", "center")}${th("Entrega", "center")}</tr>
    ${filas}
  </table>`;
}

/** Texto del periodo para la portada. */
export function textoPeriodo({ desde, hasta }: RangoFechas): string {
  if (desde && hasta) return `Del ${fechaLarga(desde)} al ${fechaLarga(hasta)}`;
  if (desde) return `Desde el ${fechaLarga(desde)}`;
  if (hasta) return `Hasta el ${fechaLarga(hasta)}`;
  return "Todo el histórico";
}


// ─── Gráficas del informe (SVG en línea) ────────────────────────────────────
//
// SVG y no imágenes: el PDF sale del motor de impresión del navegador, que las
// dibuja como vectores —se pueden ampliar sin que se pixelen— y no hace falta
// ninguna librería. Los mismos criterios que en pantalla: una sola serie va en
// un solo color, cada marca lleva su cifra escrita al lado, y las porciones se
// separan con un hueco del color del papel, nunca con un borde.

const ALTO_FILA = 26;

/** Barras horizontales con la cifra en la punta. */
function barrasSvg(
  filas: { clave: string; valor: number; color: string }[],
  opciones: { ancho?: number; anchoEtiqueta?: number } = {},
): string {
  if (filas.length === 0) return "";
  const ancho = opciones.ancho ?? 500;
  const anchoEtiqueta = opciones.anchoEtiqueta ?? 132;
  const anchoValor = 40;
  const pista = ancho - anchoEtiqueta - anchoValor;
  const maximo = Math.max(1, ...filas.map(f => f.valor));
  const alto = filas.length * ALTO_FILA;

  const cuerpo = filas.map((f, i) => {
    const y = i * ALTO_FILA;
    const largo = Math.max((f.valor / maximo) * pista, f.valor > 0 ? 2 : 0);
    return `
      <text x="0" y="${y + 15}" style="font-size:11px;fill:${TEXTO};">${esc(recortar(f.clave, 20))}</text>
      <rect x="${anchoEtiqueta}" y="${y + 4}" width="${largo}" height="14" rx="4" ry="4" fill="${f.color}" />
      <text x="${anchoEtiqueta + pista + anchoValor}" y="${y + 15}" text-anchor="end" style="font-size:11px;font-weight:bold;fill:${TEXTO};">${f.valor}</text>`;
  }).join("");

  return `<svg width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;">${cuerpo}</svg>`;
}

/** Anillo de participación, con su leyenda al lado. */
function anilloSvg(filas: { clave: string; valor: number; color: string }[], unidad: string): string {
  const total = filas.reduce((n, f) => n + f.valor, 0);
  if (total <= 0) return "";
  const TAM = 168, GROSOR = 24;
  const r = (TAM - GROSOR) / 2;
  const c = TAM / 2;
  const hueco = 2 / r;

  let angulo = -Math.PI / 2;
  const arcos = filas.map(f => {
    const barrido = (f.valor / total) * Math.PI * 2;
    const ini = angulo + hueco / 2;
    const fin = angulo + barrido - hueco / 2;
    angulo += barrido;
    if (fin <= ini) return "";
    const x1 = c + r * Math.cos(ini), y1 = c + r * Math.sin(ini);
    const x2 = c + r * Math.cos(fin), y2 = c + r * Math.sin(fin);
    const grande = fin - ini > Math.PI ? 1 : 0;
    return `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${grande} 1 ${x2} ${y2}" fill="none" stroke="${f.color}" stroke-width="${GROSOR}" />`;
  }).join("");

  const leyenda = filas.map(f => `
    <tr>
      <td style="padding:3px 6px 3px 0;"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${f.color};"></span></td>
      <td style="padding:3px 10px 3px 0;font-size:11px;color:${TEXTO};">${esc(f.clave)}</td>
      <td style="padding:3px 8px 3px 0;font-size:11px;font-weight:bold;color:${TEXTO};text-align:right;">${f.valor}</td>
      <td style="padding:3px 0;font-size:11px;color:${APAGADO};text-align:right;">${Math.round((f.valor / total) * 100)}%</td>
    </tr>`).join("");

  return `<table style="border-collapse:collapse;"><tr>
    <td style="padding-right:18px;vertical-align:middle;">
      <svg width="${TAM}" height="${TAM}" viewBox="0 0 ${TAM} ${TAM}" xmlns="http://www.w3.org/2000/svg">
        ${arcos}
        <text x="${c}" y="${c - 2}" text-anchor="middle" style="font-size:24px;font-weight:bold;fill:${TEXTO};">${total}</text>
        <text x="${c}" y="${c + 15}" text-anchor="middle" style="font-size:10px;fill:${APAGADO};">${esc(unidad)}</text>
      </svg>
    </td>
    <td style="vertical-align:middle;"><table style="border-collapse:collapse;">${leyenda}</table></td>
  </tr></table>`;
}

/** Columnas por mes. */
function columnasSvg(filas: { clave: string; valor: number }[]): string {
  if (filas.length === 0) return "";
  const ANCHO_COL = 54, ALTO_PLOT = 120, BANDA = 34;
  const ancho = Math.max(filas.length * ANCHO_COL, 120);
  const alto = ALTO_PLOT + BANDA;
  const maximo = Math.max(1, ...filas.map(f => f.valor));

  const cuerpo = filas.map((f, i) => {
    const x = i * ANCHO_COL;
    const h = Math.max((f.valor / maximo) * (ALTO_PLOT - 18), f.valor > 0 ? 2 : 0);
    const y = ALTO_PLOT - h;
    return `
      <text x="${x + ANCHO_COL / 2}" y="${y - 5}" text-anchor="middle" style="font-size:10px;font-weight:bold;fill:${TEXTO};">${f.valor}</text>
      <rect x="${x + ANCHO_COL / 2 - 11}" y="${y}" width="22" height="${h}" rx="4" ry="4" fill="${VERDE}" />
      <text x="${x + ANCHO_COL / 2}" y="${ALTO_PLOT + 16}" text-anchor="middle" style="font-size:10px;fill:${APAGADO};">${esc(f.clave)}</text>`;
  }).join("");

  return `<svg width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;">
    <line x1="0" y1="${ALTO_PLOT}" x2="${ancho}" y2="${ALTO_PLOT}" stroke="${BORDE}" stroke-width="1" />
    ${cuerpo}
  </svg>`;
}

/** Recorta sin cortar a mitad de palabra cuando puede. */
function recortar(texto: string, maximo: number): string {
  const t = String(texto || "");
  return t.length <= maximo ? t : `${t.slice(0, maximo - 1)}…`;
}

/** Marco de una gráfica dentro del documento. */
function panel(titulo: string, subtitulo: string, contenido: string): string {
  if (!contenido) return "";
  return `<td style="vertical-align:top;padding:0 8px 0 0;" width="50%">
    <table width="100%" style="border-collapse:collapse;"><tr><td style="border:1px solid ${BORDE};border-radius:12px;padding:14px 16px;">
      <div style="font-size:12px;font-weight:bold;color:${VERDE_OSCURO};">${esc(titulo)}</div>
      <div style="font-size:10px;color:${APAGADO};margin:2px 0 12px;">${esc(subtitulo)}</div>
      ${contenido}
    </td></tr></table>
  </td>`;
}

/**
 * Indicadores de producción: lo que se mira a fin de mes.
 *
 * Sale del MISMO cálculo que la pantalla de Indicadores (`resumenAnalitico`),
 * así que el PDF no puede decir una cifra distinta de la que se vio antes de
 * pulsar el botón.
 */
function seccionIndicadores(
  solicitudes: SolicitudAnalitica[],
  ordenTipos: readonly string[],
  incluirPorDisenador: boolean,
): string {
  const a = resumenAnalitico(solicitudes, { ordenTipos });
  if (a.solicitudes === 0) return "";

  const universoAreas = universoDeCategorias(solicitudes, r => (r.area || "").trim() || "Sin área");
  const areas = repartoPorCategoria(a.porArea, f => f.piezas, universoAreas);

  const disenadores = a.porDisenador
    .filter(f => f.piezas > 0 || f.solicitudes > 0)
    .map(f => ({ clave: f.clave, valor: f.piezas, color: VERDE_MARCA }));

  // Un solo color: comparación de magnitud, con el nombre al lado de cada barra.
  const tipos = a.porTipo.map(f => ({ clave: f.clave, valor: f.solicitudes, color: VERDE_MARCA }));

  const meses = a.porMes.map(m => ({ clave: etiquetaMes(m.mes), valor: m.solicitudes }));

  const cumplimiento = a.cumplimiento.medidas > 0 ? `${a.cumplimiento.porcentaje}%` : "—";
  const notaCumplimiento = a.cumplimiento.medidas > 0
    ? `${a.cumplimiento.aTiempo} de ${a.cumplimiento.medidas} publicadas dentro de la fecha`
    : "Sin publicaciones con fecha registrada";

  const fichas = `
  <table width="100%" style="border-collapse:collapse;margin-bottom:6px;"><tr>
    ${tarjeta(a.solicitudes, "Solicitudes", TEXTO, PAPEL)}
    ${tarjeta(a.principales, "Diseños principales", TEXTO, PAPEL)}
    ${tarjeta(a.redimensiones, "Redimensiones", TEXTO, PAPEL)}
    ${tarjeta(a.piezas, "Total de piezas", VERDE, VERDE_CLARO)}
    <td style="padding:0;" width="20%">
      <table width="100%" style="border-collapse:collapse;"><tr>
        <td style="background:${PAPEL};border:1px solid ${BORDE};border-radius:10px;padding:12px 14px;">
          <div style="font-size:26px;font-weight:bold;color:${TEXTO};line-height:1;">${cumplimiento}</div>
          <div style="font-size:11px;color:${APAGADO};margin-top:5px;font-weight:bold;">Cumplimiento</div>
        </td>
      </tr></table>
    </td>
  </tr></table>
  <p style="margin:0 0 18px;font-size:10px;color:${APAGADO};">
    Cumplimiento: ${esc(notaCumplimiento)}${a.cumplimiento.sinDato > 0 ? ` · ${a.cumplimiento.sinDato} sin fecha de publicación registrada` : ""}.
    Una pieza es un entregable subido; el primero de cada solicitud cuenta como diseño principal y el resto como redimensiones.
  </p>`;

  const fila1 = [
    incluirPorDisenador ? panel("Producción por diseñador", "Piezas realizadas en el periodo", barrasSvg(disenadores)) : "",
    panel("Producción por área", "Participación sobre el total de piezas", anilloSvg(areas, "piezas")),
  ].filter(Boolean).join("");

  const fila2 = [
    panel("Solicitudes por tipo", "Nueva línea gráfica, E-CARDS, giveaways…", barrasSvg(tipos)),
    panel("Solicitudes por mes", "Cómo se reparte el periodo", columnasSvg(meses)),
  ].filter(Boolean).join("");

  return `
  <h2 style="font-size:14px;color:${VERDE_OSCURO};margin:0 0 12px;padding-bottom:6px;border-bottom:2px solid ${VERDE_CLARO};">Indicadores de producción</h2>
  ${fichas}
  <table width="100%" style="border-collapse:collapse;margin-bottom:10px;"><tr>${fila1}</tr></table>
  <table width="100%" style="border-collapse:collapse;"><tr>${fila2}</tr></table>`;
}

export function construirInforme(datos: DatosInforme, ordenTipos: readonly string[] = []): string {
  const { solicitudes, alcance, generadoPor, incluirPorDisenador } = datos;
  const r = resumirSolicitudes(solicitudes, ordenTipos);
  const hoy = new Date();
  const generado = `${hoy.getDate()} de ${MESES[hoy.getMonth()]} de ${hoy.getFullYear()}`;

  const cabecera = `
  <table width="100%" style="border-collapse:collapse;margin-bottom:22px;">
    <tr>
      <td style="background:${VERDE};padding:24px 26px;border-radius:12px;">
        <div style="color:${PAPEL};font-size:20px;font-weight:bold;">GanaPlay Diseño</div>
        <div style="color:#bfe0ce;font-size:12px;margin-top:3px;">Informe de solicitudes de diseño</div>
        <div style="color:${PAPEL};font-size:15px;font-weight:bold;margin-top:14px;">${esc(alcance)}</div>
        <div style="color:#bfe0ce;font-size:12px;margin-top:3px;">${esc(textoPeriodo(datos))}</div>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 18px;font-size:11px;color:${APAGADO};">
    Generado el ${generado} por ${esc(generadoPor || "—")} · ${r.total} solicitud${r.total === 1 ? "" : "es"} en el periodo ·
    Las solicitudes se sitúan por su fecha de creación.
  </p>`;

  const consolidado = `
  <h2 style="font-size:14px;color:${VERDE_OSCURO};margin:26px 0 12px;padding-bottom:6px;border-bottom:2px solid ${VERDE_CLARO};">Reparto por estado</h2>
  <table width="100%" style="border-collapse:collapse;"><tr>
    ${tarjeta(r.publicadas, "Publicadas", COLOR_ESTADO["Publicado"].text, COLOR_ESTADO["Publicado"].bg)}
    ${tarjeta(r.enProceso, "En proceso", COLOR_ESTADO["En Proceso"].text, COLOR_ESTADO["En Proceso"].bg)}
    ${tarjeta(r.pendientes, "Pendientes", COLOR_ESTADO["Pendiente"].text, COLOR_ESTADO["Pendiente"].bg)}
    ${tarjeta(r.declinadas, "Declinadas", COLOR_ESTADO["Declinada"].text, COLOR_ESTADO["Declinada"].bg)}
  </tr></table>`;

  const vacio = r.total === 0
    ? `<p style="margin:26px 0;padding:20px;background:${CEBRA};border:1px solid ${BORDE};border-radius:10px;font-size:13px;color:${APAGADO};text-align:center;">
         No hay solicitudes en el periodo seleccionado.
       </p>`
    : "";

  const cuerpo = r.total === 0 ? vacio : [
    consolidado,
    tablaDesglose("Por tipo de solicitud", r.porTipo, "Tipo"),
    tablaDesglose("Por área solicitante", r.porArea, "Área"),
    incluirPorDisenador ? tablaDesglose("Por diseñador", r.porDisenador, "Diseñador") : "",
    tablaDetalle(solicitudes),
  ].join("");

  const pie = `
  <p style="margin:28px 0 0;padding-top:12px;border-top:1px solid ${BORDE};font-size:10px;color:#a7a9ac;text-align:center;">
    GanaPlay · Documento generado automáticamente por la plataforma de solicitudes de diseño.
  </p>`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Informe de solicitudes · ${esc(alcance)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { margin:0; padding:0; background:${PAPEL}; color:${TEXTO}; font-family:${FUENTE}; }
  table { border-collapse: collapse; }
  h2 { page-break-after: avoid; }
  tr { page-break-inside: avoid; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div style="max-width:1100px;margin:0 auto;padding:14px;">
${cabecera}${seccionIndicadores(solicitudes, ordenTipos, incluirPorDisenador)}${cuerpo}${pie}
</div>
</body>
</html>`;
}

// ─── Salida: PDF por el diálogo de impresión ────────────────────────────────
/**
 * Se imprime desde un iframe oculto, no abriendo una pestaña: así el bloqueador
 * de ventanas emergentes no se lleva por delante el botón, que es el motivo
 * habitual de que "no pase nada". Quien imprime elige "Guardar como PDF".
 *
 * Sin librerías de PDF: el motor del navegador respeta la maqueta tal cual.
 */
export function imprimirInforme(
  datos: DatosInforme,
  ordenTipos: readonly string[] = [],
  alFallar?: (msg: string) => void,
) {
  const html = construirInforme(datos, ordenTipos);

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
      // En Chrome print() bloquea; en Firefox no, de ahí la espera antes de
      // retirar el iframe.
      setTimeout(limpiar, 1500);
    } catch {
      limpiar();
      alFallar?.("No se pudo abrir la ventana de impresión.");
    }
  };

  const doc = marco.contentDocument;
  if (!doc) {
    limpiar();
    alFallar?.("No se pudo generar el informe.");
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
}
