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

/** Lo mínimo que el informe necesita de una solicitud. */
export type SolicitudInforme = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  requestKind?: string;
  area?: string;
  requesterName?: string;
  assignedTo?: string;
  requestDate?: string;   // yyyy-mm-dd
  deliveryDate?: string;  // yyyy-mm-dd
};

export type RangoFechas = {
  /** yyyy-mm-dd. Cadena vacía = sin límite por ese lado. */
  desde: string;
  hasta: string;
};

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

/**
 * Fecha por la que se filtra y se ordena una solicitud.
 *
 * Es la de CREACIÓN: el informe responde "cuántas solicitudes entraron en este
 * periodo", no "cuántas se entregaron". Las solicitudes viejas sin
 * `requestDate` caen en su fecha de entrega para no quedarse fuera del informe
 * sin que nadie se entere.
 */
export function fechaDeCorte(r: SolicitudInforme): string {
  return (r.requestDate || r.deliveryDate || "").slice(0, 10);
}

/** Filtra por rango de fechas. Los extremos entran (>= desde, <= hasta). */
export function filtrarPorFechas<T extends SolicitudInforme>(
  solicitudes: T[],
  { desde, hasta }: RangoFechas,
): T[] {
  if (!desde && !hasta) return solicitudes;
  return solicitudes.filter(r => {
    const f = fechaDeCorte(r);
    // Sin fecha no se puede situar en el periodo: queda fuera de un informe
    // acotado (en el informe sin rango sí aparece).
    if (!f) return false;
    if (desde && f < desde) return false;
    if (hasta && f > hasta) return false;
    return true;
  });
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
  <h2 style="font-size:14px;color:${VERDE_OSCURO};margin:0 0 12px;padding-bottom:6px;border-bottom:2px solid ${VERDE_CLARO};">Consolidado</h2>
  <table width="100%" style="border-collapse:collapse;"><tr>
    ${tarjeta(r.total, "Total", TEXTO, PAPEL)}
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
${cabecera}${consolidado}${cuerpo}${pie}
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
