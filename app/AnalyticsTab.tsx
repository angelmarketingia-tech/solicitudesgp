"use client";

/**
 * ─── Pestaña "Indicadores" (Design Analytics) ───────────────────────────────
 *
 * PARA QUÉ: el informe de fin de mes del equipo de Diseño. Responde de un
 * vistazo cuántas solicitudes entraron, cuántas piezas salieron, quién produjo
 * qué, para qué área y si se entregó a tiempo — y deja descargar todo eso en
 * PDF.
 *
 * Módulo AISLADO: recibe las solicitudes ya cargadas y no toca Firestore. Todo
 * el cálculo vive en `@/lib/analytics`, que es el MISMO que usa el PDF: la
 * pantalla y el documento no pueden dar números distintos.
 *
 * SOBRE LAS GRÁFICAS (decisiones, no gustos — siguen la guía de visualización):
 *  · Producción por diseñador y por mes son comparaciones de MAGNITUD: una sola
 *    serie, un solo color (el verde de marca). Pintar cada barra de un color
 *    distinto duplicaría en el color lo que ya dice el largo de la barra.
 *  · Solo el anillo de áreas usa la paleta categórica: ahí las porciones no
 *    llevan nombre encima y el color ES quien identifica a cada área. Va en
 *    orden fijo y atado al área, de modo que filtrar no repinta a las que
 *    quedan.
 *  · La paleta está verificada sobre blanco (banda de luminosidad, croma,
 *    separación con daltonismo y visión normal). No añadir un sexto color a
 *    ojo: la cola se agrupa en «Otras». Ver `analytics.ts`.
 *  · Dos de esos colores quedan por debajo de 3:1 contra el blanco, así que
 *    TODA gráfica lleva su valor escrito al lado y existe la pestaña
 *    «Registros» con las mismas cifras en tabla. El color nunca es el único
 *    canal.
 */

import React, { useMemo, useRef, useState } from "react";
import {
  BarChart3, CalendarDays, Download, FileText, Layers, PieChart as PieIcon,
  Target, TrendingUp, User, Users,
} from "lucide-react";
import {
  COLOR_RESTO, MAX_CATEGORIAS, Periodo, RangoFechas, SolicitudAnalitica, VERDE_MARCA,
  etiquetaMes, fechaPublicacion, filtrarPorFechas, piezasDe, rangoDePeriodo,
  repartoPorCategoria, resumenAnalitico, universoDeCategorias,
} from "@/lib/analytics";
import { imprimirInforme } from "@/lib/report-export";

type ToastFn = (msg: string, type?: "success" | "error" | "info") => void;

type Props = {
  solicitudes: SolicitudAnalitica[];
  userName: string;
  /** Equipo de Diseño: salen aunque no hayan producido nada en el periodo. */
  disenadores: readonly string[];
  /** Catálogo de tipos, en el orden en que debe leerse siempre. */
  tipos: readonly string[];
  coloresEstado: Record<string, { bg: string; text: string }>;
  addToast: ToastFn;
};

// ─── Ink y chrome (tokens de texto; el color va en las marcas, no en el texto) ─
const INK = "var(--text-primary)";
const INK_2 = "var(--text-secondary)";
const INK_3 = "var(--text-muted)";
const REJILLA = "var(--border-color)";

const nf = new Intl.NumberFormat("es-ES");
const num = (n: number) => nf.format(n);

const hoyIso = () => new Date().toISOString().slice(0, 10);

// ────────────────────────────────────────────────────────────────────────────
// Tooltip compartido por todas las gráficas.
// Nunca es la ÚNICA forma de leer un valor: cada marca lleva su cifra escrita
// y la pestaña «Registros» tiene la tabla completa.
// ────────────────────────────────────────────────────────────────────────────
type Pista = { x: number; y: number; titulo: string; filas: { color?: string; texto: string; valor: string }[] };

function CapaPista({ pista }: { pista: Pista | null }) {
  if (!pista) return null;
  return (
    <div
      role="tooltip"
      style={{
        position: "fixed", left: pista.x + 14, top: pista.y + 14, zIndex: 300,
        pointerEvents: "none", background: "var(--panel-bg)", color: INK,
        border: `1px solid ${REJILLA}`, borderRadius: "10px",
        boxShadow: "0 8px 24px rgba(51,51,51,0.16)", padding: "10px 12px",
        maxWidth: "260px", fontSize: "12px",
      }}>
      <div style={{ color: INK_2, fontSize: "11px", marginBottom: "6px" }}>{pista.titulo}</div>
      {pista.filas.map((f, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: i ? "4px" : 0 }}>
          {f.color && <span style={{ width: "12px", height: "2px", background: f.color, borderRadius: "1px", flexShrink: 0 }} />}
          {/* El valor manda; el nombre acompaña. */}
          <strong style={{ fontWeight: 800 }}>{f.valor}</strong>
          <span style={{ color: INK_2 }}>{f.texto}</span>
        </div>
      ))}
    </div>
  );
}

/** Marca con zona sensible propia: el objetivo es mayor que lo pintado. */
function usePista() {
  const [pista, setPista] = useState<Pista | null>(null);
  const mostrar = (e: React.PointerEvent | React.MouseEvent, titulo: string, filas: Pista["filas"]) =>
    setPista({ x: e.clientX, y: e.clientY, titulo, filas });
  const enfocar = (e: React.FocusEvent<HTMLElement>, titulo: string, filas: Pista["filas"]) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPista({ x: r.left + r.width / 2, y: r.bottom, titulo, filas });
  };
  const ocultar = () => setPista(null);
  return { pista, mostrar, enfocar, ocultar };
}

// ────────────────────────────────────────────────────────────────────────────
// Piezas de interfaz
// ────────────────────────────────────────────────────────────────────────────

function Tarjeta({ titulo, subtitulo, icono, children }: {
  titulo: string; subtitulo?: string; icono?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: "18px", display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ marginBottom: "14px" }}>
        <h3 style={{ margin: 0, fontSize: "14px", color: INK, display: "flex", alignItems: "center", gap: "8px", fontWeight: 700 }}>
          {icono} {titulo}
        </h3>
        {subtitulo && <div style={{ fontSize: "11px", color: INK_3, marginTop: "3px" }}>{subtitulo}</div>}
      </div>
      {children}
    </div>
  );
}

function SinDatos({ texto = "No hay datos en el periodo elegido." }: { texto?: string }) {
  return <div style={{ padding: "28px 8px", textAlign: "center", color: INK_3, fontSize: "12px" }}>{texto}</div>;
}

/** Ficha de indicador: etiqueta, valor y una nota. */
function Indicador({ etiqueta, valor, nota, destacado }: {
  etiqueta: string; valor: string; nota?: string; destacado?: boolean;
}) {
  return (
    <div className="card" style={{
      padding: "16px 18px",
      background: destacado ? "var(--accent-soft)" : "var(--panel-bg)",
      borderColor: destacado ? VERDE_MARCA : "var(--border-color)",
    }}>
      <div style={{ fontSize: "11px", color: INK_2, fontWeight: 700, marginBottom: "8px" }}>{etiqueta}</div>
      {/* Figura grande: cifras proporcionales, nunca tabulares. */}
      <div style={{ fontSize: "32px", lineHeight: 1, fontWeight: 800, color: destacado ? "var(--accent-dark)" : INK }}>{valor}</div>
      {nota && <div style={{ fontSize: "11px", color: INK_3, marginTop: "7px" }}>{nota}</div>}
    </div>
  );
}

/**
 * Barras horizontales. Una sola serie ⇒ un solo color; el valor va escrito en
 * la punta, así que la gráfica se lee sin pasar el ratón.
 */
function Barras({ datos, color, unidad, pista }: {
  datos: { clave: string; valor: number; color?: string; detalle?: { texto: string; valor: string }[] }[];
  color: string;
  unidad: string;
  pista: ReturnType<typeof usePista>;
}) {
  const maximo = Math.max(1, ...datos.map(d => d.valor));
  if (datos.length === 0) return <SinDatos />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {datos.map(d => {
        const pct = (d.valor / maximo) * 100;
        const filas = d.detalle?.map(x => ({ color: d.color || color, texto: x.texto, valor: x.valor }))
          || [{ color: d.color || color, texto: unidad, valor: num(d.valor) }];
        return (
          <div key={d.clave}
            tabIndex={0}
            onPointerMove={e => pista.mostrar(e, d.clave, filas)}
            onPointerLeave={pista.ocultar}
            onFocus={e => pista.enfocar(e, d.clave, filas)}
            onBlur={pista.ocultar}
            style={{
              display: "grid", gridTemplateColumns: "minmax(72px, 132px) 1fr auto",
              gap: "10px", alignItems: "center", outline: "none",
              // La zona sensible es más alta que la barra: nadie tiene que
              // acertarle a 14 px.
              padding: "5px 4px", borderRadius: "8px", cursor: "default",
            }}>
            <span style={{ fontSize: "12px", color: INK, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {d.clave}
            </span>
            <span style={{ display: "block", height: "14px", position: "relative" }}>
              <span style={{
                display: "block", height: "100%", width: `${Math.max(pct, d.valor > 0 ? 1.5 : 0)}%`,
                background: d.color || color,
                // Punta redondeada, escuadra en la línea base.
                borderRadius: "0 4px 4px 0",
              }} />
            </span>
            <span style={{ fontSize: "12px", fontWeight: 800, color: INK, fontVariantNumeric: "tabular-nums", minWidth: "34px", textAlign: "right" }}>
              {num(d.valor)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Anillo (torta con centro). Parte-respecto-al-todo de un vistazo.
 *
 * Las porciones se separan con un HUECO del color de la superficie, no con un
 * borde: un trazo alrededor añade tinta que no es dato. Cada porción lleva
 * además su nombre y su cifra en la leyenda, porque el color no puede ser el
 * único canal.
 */
function Anillo({ datos, total, unidad, pista }: {
  datos: { clave: string; valor: number; color: string }[];
  total: number;
  unidad: string;
  pista: ReturnType<typeof usePista>;
}) {
  const [resaltada, setResaltada] = useState<string | null>(null);
  if (total <= 0 || datos.length === 0) return <SinDatos />;

  const TAM = 190, GROSOR = 26;
  const r = (TAM - GROSOR) / 2;
  const cx = TAM / 2, cy = TAM / 2;
  // 2 px de hueco, expresados en ángulo a este radio.
  const hueco = 2 / r;

  // El ángulo de arranque de cada porción se calcula sumando las anteriores,
  // sin ir acumulando en una variable de fuera: mutar algo durante el pintado
  // deja la gráfica a merced del orden en que React decida repintar.
  const arcos = datos.map((d, i) => {
    const previas = datos.slice(0, i).reduce((s, x) => s + x.valor, 0);
    const angulo = -Math.PI / 2 + (previas / total) * Math.PI * 2;
    const barrido = (d.valor / total) * Math.PI * 2;
    const ini = angulo + hueco / 2;
    const fin = angulo + barrido - hueco / 2;
    // Una porción más fina que el hueco no se dibuja como arco: se vería como
    // una raya suelta. Igual está en la leyenda y en la tabla.
    if (fin <= ini) return { ...d, d: "" };
    const x1 = cx + r * Math.cos(ini), y1 = cy + r * Math.sin(ini);
    const x2 = cx + r * Math.cos(fin), y2 = cy + r * Math.sin(fin);
    const grande = fin - ini > Math.PI ? 1 : 0;
    return { ...d, d: `M ${x1} ${y1} A ${r} ${r} 0 ${grande} 1 ${x2} ${y2}` };
  });

  return (
    <div style={{ display: "flex", gap: "18px", alignItems: "center", flexWrap: "wrap" }}>
      <svg width={TAM} height={TAM} viewBox={`0 0 ${TAM} ${TAM}`} role="img"
        aria-label={`Reparto de ${unidad}: ${datos.map(d => `${d.clave} ${d.valor}`).join(", ")}`}
        style={{ flexShrink: 0 }}>
        {arcos.map(a => a.d && (
          <path key={a.clave} d={a.d} fill="none" stroke={a.color}
            strokeWidth={resaltada === a.clave ? GROSOR + 4 : GROSOR}
            strokeLinecap="butt"
            style={{ transition: "stroke-width .12s", cursor: "default" }}
            tabIndex={0}
            onPointerMove={e => { setResaltada(a.clave); pista.mostrar(e, a.clave, [{ color: a.color, texto: `${unidad} · ${Math.round((a.valor / total) * 100)}%`, valor: num(a.valor) }]); }}
            onPointerLeave={() => { setResaltada(null); pista.ocultar(); }}
            onFocus={e => { setResaltada(a.clave); pista.enfocar(e as unknown as React.FocusEvent<HTMLElement>, a.clave, [{ color: a.color, texto: unidad, valor: num(a.valor) }]); }}
            onBlur={() => { setResaltada(null); pista.ocultar(); }} />
        ))}
        <text x={cx} y={cy - 2} textAnchor="middle" style={{ fontSize: "26px", fontWeight: 800, fill: INK }}>{num(total)}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" style={{ fontSize: "11px", fill: INK_3 }}>{unidad}</text>
      </svg>

      {/* Leyenda: siempre presente. Con su cifra, que es lo que salva el
          contraste flojo de un par de tonos sobre blanco. */}
      <div style={{ display: "flex", flexDirection: "column", gap: "7px", minWidth: "160px", flex: 1 }}>
        {datos.map(d => (
          <div key={d.clave}
            onPointerEnter={() => setResaltada(d.clave)}
            onPointerLeave={() => setResaltada(null)}
            style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
            <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: d.color, flexShrink: 0 }} />
            <span style={{ color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{d.clave}</span>
            <span style={{ color: INK, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{num(d.valor)}</span>
            <span style={{ color: INK_3, fontVariantNumeric: "tabular-nums", minWidth: "36px", textAlign: "right" }}>
              {Math.round((d.valor / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Columnas por mes. Una serie, un color; la altura es el dato. */
function Columnas({ datos, color, unidad, pista }: {
  datos: { clave: string; valor: number; detalle?: { texto: string; valor: string }[] }[];
  color: string;
  unidad: string;
  pista: ReturnType<typeof usePista>;
}) {
  if (datos.length === 0) return <SinDatos />;
  const maximo = Math.max(1, ...datos.map(d => d.valor));
  const ALTO = 150;
  const etiquetarTodas = datos.length <= 8;
  const cima = Math.max(...datos.map(d => d.valor));
  return (
    // El alto reservado incluye la banda de los meses: la tarjeta crece con su
    // contenido en vez de recortar el eje. La línea base va en el contenedor,
    // no bajo cada columna: si no, se ve troceada entre columna y columna.
    <div style={{
      display: "flex", alignItems: "flex-end", gap: "8px", overflowX: "auto",
      paddingTop: "18px", position: "relative",
    }}>
      {datos.map((d, i) => {
        const alto = (d.valor / maximo) * ALTO;
        const filas = d.detalle?.map(x => ({ color, texto: x.texto, valor: x.valor }))
          || [{ color, texto: unidad, valor: num(d.valor) }];
        const conEtiqueta = etiquetarTodas || d.valor === cima || i === datos.length - 1;
        return (
          <div key={d.clave}
            tabIndex={0}
            onPointerMove={e => pista.mostrar(e, d.clave, filas)}
            onPointerLeave={pista.ocultar}
            onFocus={e => pista.enfocar(e, d.clave, filas)}
            onBlur={pista.ocultar}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", minWidth: "44px", flex: "1 0 44px", outline: "none" }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: conEtiqueta ? INK : "transparent", fontVariantNumeric: "tabular-nums" }}>
              {num(d.valor)}
            </span>
            <span style={{ display: "block", width: "100%", maxWidth: "24px", height: `${Math.max(alto, d.valor > 0 ? 3 : 0)}px`, background: color, borderRadius: "4px 4px 0 0" }} />
            <span style={{ fontSize: "10px", color: INK_2, whiteSpace: "nowrap" }}>{d.clave}</span>
          </div>
        );
      })}
      <span aria-hidden style={{
        position: "absolute", left: 0, right: 0, bottom: "17px",
        height: "1px", background: REJILLA,
      }} />
    </div>
  );
}

/** Barra apilada: el reparto por estado sobre el total. */
function Apilada({ datos, total, pista }: {
  datos: { clave: string; valor: number; color: string }[];
  total: number;
  pista: ReturnType<typeof usePista>;
}) {
  if (total <= 0) return <SinDatos />;
  return (
    <div>
      <div style={{ display: "flex", gap: "2px", height: "22px", marginBottom: "12px" }}>
        {datos.map(d => (
          <span key={d.clave}
            tabIndex={0}
            onPointerMove={e => pista.mostrar(e, d.clave, [{ color: d.color, texto: `solicitudes · ${Math.round((d.valor / total) * 100)}%`, valor: num(d.valor) }])}
            onPointerLeave={pista.ocultar}
            onFocus={e => pista.enfocar(e, d.clave, [{ color: d.color, texto: "solicitudes", valor: num(d.valor) }])}
            onBlur={pista.ocultar}
            style={{
              flex: d.valor, background: d.color, minWidth: "3px", outline: "none",
              borderRadius: "3px", display: "block",
            }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
        {datos.map(d => (
          <span key={d.clave} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: INK }}>
            <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: d.color }} />
            {d.clave} <strong style={{ fontVariantNumeric: "tabular-nums" }}>{num(d.valor)}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Medidor de cumplimiento: la pista es un paso claro del mismo tono. */
function Medidor({ porcentaje, color }: { porcentaje: number; color: string }) {
  return (
    <div style={{ height: "10px", borderRadius: "5px", background: "var(--accent-soft)", overflow: "hidden" }}>
      <span style={{ display: "block", height: "100%", width: `${Math.min(100, Math.max(0, porcentaje))}%`, background: color, borderRadius: "5px" }} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// La pestaña
// ────────────────────────────────────────────────────────────────────────────

export default function AnalyticsTab({ solicitudes, userName, disenadores, tipos, coloresEstado, addToast }: Props) {
  const [vista, setVista] = useState<"Dashboard" | "Registros" | "Mis solicitudes">("Dashboard");
  const [periodo, setPeriodo] = useState<Periodo>("Mensual");
  const [ancla, setAncla] = useState(() => hoyIso().slice(0, 7)); // AAAA-MM
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [filtroDisenador, setFiltroDisenador] = useState("Todos");
  const [filtroArea, setFiltroArea] = useState("Todas");
  const pista = usePista();
  const imprimiendo = useRef(false);

  // Universo estable de áreas: sale de TODAS las solicitudes, no de las
  // filtradas, para que el color de un área no cambie al filtrar.
  const universoAreas = useMemo(
    () => universoDeCategorias(solicitudes, r => (r.area || "").trim() || "Sin área"),
    [solicitudes],
  );
  /** Para el desplegable, alfabético: ahí se busca por nombre, no por volumen. */
  const areasAlfabeticas = useMemo(
    () => [...universoAreas].sort((a, b) => a.localeCompare(b)),
    [universoAreas],
  );

  const rango: RangoFechas = useMemo(() => {
    if (periodo === "Personalizado") return { desde, hasta };
    return rangoDePeriodo(periodo, `${ancla}-01`);
  }, [periodo, ancla, desde, hasta]);

  const filtradas = useMemo(() => {
    let base = filtrarPorFechas(solicitudes, rango);
    if (filtroDisenador !== "Todos") base = base.filter(r => (r.assignedTo || "Sin asignar") === filtroDisenador);
    if (filtroArea !== "Todas") base = base.filter(r => ((r.area || "").trim() || "Sin área") === filtroArea);
    if (vista === "Mis solicitudes") base = base.filter(r => r.assignedTo === userName);
    return base;
  }, [solicitudes, rango, filtroDisenador, filtroArea, vista, userName]);

  const resumen = useMemo(
    () => resumenAnalitico(filtradas, { disenadores, ordenTipos: tipos }),
    [filtradas, disenadores, tipos],
  );

  const etiquetaRango = useMemo(() => {
    if (!rango.desde && !rango.hasta) return "Todo el histórico";
    if (rango.desde && rango.hasta) return `${rango.desde} → ${rango.hasta}`;
    return rango.desde ? `Desde ${rango.desde}` : `Hasta ${rango.hasta}`;
  }, [rango]);

  const descargar = () => {
    if (imprimiendo.current) return;
    if (filtradas.length === 0) {
      addToast("No hay solicitudes en el periodo: el informe saldría vacío.", "info");
      return;
    }
    imprimiendo.current = true;
    const partes = [
      filtroDisenador !== "Todos" ? filtroDisenador : "",
      filtroArea !== "Todas" ? `Área ${filtroArea}` : "",
      vista === "Mis solicitudes" ? userName : "",
    ].filter(Boolean);
    imprimirInforme({
      solicitudes: filtradas,
      desde: rango.desde,
      hasta: rango.hasta,
      alcance: partes.length ? partes.join(" · ") : "Todo el equipo",
      generadoPor: userName || "GanaPlay Diseño",
      incluirPorDisenador: filtroDisenador === "Todos" && vista !== "Mis solicitudes",
    }, tipos, msg => addToast(msg, "error"));
    setTimeout(() => { imprimiendo.current = false; }, 1200);
  };

  // ─── Datos de cada gráfica ───
  const barrasDisenador = resumen.porDisenador.map(f => ({
    clave: f.clave,
    valor: f.piezas,
    detalle: [
      { texto: "piezas", valor: num(f.piezas) },
      { texto: "diseños principales", valor: num(f.principales) },
      { texto: "redimensiones", valor: num(f.redimensiones) },
      { texto: "solicitudes", valor: num(f.solicitudes) },
    ],
  }));

  const anilloAreas = repartoPorCategoria(
    resumen.porArea,
    f => f.piezas,
    universoAreas,
  );
  const totalAreas = anilloAreas.reduce((s, f) => s + f.valor, 0);

  // Un solo color, como en "por diseñador": es una comparación de magnitud y
  // cada barra ya lleva su nombre escrito. Darle a cada tipo un color propio
  // repetiría en el color lo que ya dice el largo, y además chocaría con la
  // paleta del anillo de áreas, donde los mismos tonos significan otra cosa.
  const barrasTipo = resumen.porTipo.map(f => ({
    clave: f.clave,
    valor: f.solicitudes,
    detalle: [
      { texto: "solicitudes", valor: num(f.solicitudes) },
      { texto: "piezas", valor: num(f.piezas) },
      { texto: "publicadas", valor: num(f.publicadas) },
    ],
  }));

  const columnasMes = resumen.porMes.map(m => ({
    clave: etiquetaMes(m.mes),
    valor: m.solicitudes,
    detalle: [
      { texto: "solicitudes", valor: num(m.solicitudes) },
      { texto: "piezas", valor: num(m.piezas) },
    ],
  }));

  const apiladaEstado = resumen.porEstado.map(e => ({
    clave: e.clave,
    valor: e.solicitudes,
    color: coloresEstado[e.clave]?.text || COLOR_RESTO,
  }));

  const selectStyle: React.CSSProperties = { fontSize: "12px", padding: "8px 10px", minWidth: "120px" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <CapaPista pista={pista.pista} />

      {/* Encabezado */}
      <div>
        <h2 style={{ margin: 0, fontSize: "26px", fontWeight: 800, color: INK, letterSpacing: "-0.4px" }}>
          Indicadores <span style={{ color: VERDE_MARCA }}>de Diseño</span>
        </h2>
        <div style={{ fontSize: "12px", color: INK_2, marginTop: "4px" }}>
          Producción del equipo · carga por diseñador · cumplimiento de entregas
        </div>
      </div>

      {/* UNA fila de filtros, encima de todo lo que acota. Cada gráfica, cifra
          y tabla de abajo se recalcula con este mismo recorte. */}
      <div className="card" style={{ padding: "12px 14px", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, color: INK_2, textTransform: "uppercase", letterSpacing: "0.5px" }}>Periodo</span>
          <select value={periodo} onChange={e => setPeriodo(e.target.value as Periodo)} style={selectStyle}>
            {(["Mensual", "Trimestral", "Anual", "Personalizado"] as const).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>

        {periodo !== "Personalizado" ? (
          <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "10px", fontWeight: 700, color: INK_2, textTransform: "uppercase", letterSpacing: "0.5px" }}>Mes</span>
            <input type="month" value={ancla} onChange={e => setAncla(e.target.value)} style={selectStyle} />
          </label>
        ) : (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "10px", fontWeight: 700, color: INK_2, textTransform: "uppercase", letterSpacing: "0.5px" }}>Desde</span>
              <input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} style={selectStyle} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "10px", fontWeight: 700, color: INK_2, textTransform: "uppercase", letterSpacing: "0.5px" }}>Hasta</span>
              <input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} style={selectStyle} />
            </label>
          </>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, color: INK_2, textTransform: "uppercase", letterSpacing: "0.5px" }}>Diseñador</span>
          <select value={filtroDisenador} onChange={e => setFiltroDisenador(e.target.value)} style={selectStyle}>
            <option value="Todos">Todos</option>
            {disenadores.map(d => <option key={d} value={d}>{d}</option>)}
            <option value="Sin asignar">Sin asignar</option>
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, color: INK_2, textTransform: "uppercase", letterSpacing: "0.5px" }}>Área</span>
          <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)} style={selectStyle}>
            <option value="Todas">Todas</option>
            {areasAlfabeticas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>

        <button type="button" className="btn" style={{ padding: "9px 16px", fontSize: "12px", marginLeft: "auto" }}
          onClick={descargar}>
          <Download size={14} /> Descargar informe PDF
        </button>
      </div>

      {/* Sub-vistas */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {([
          { id: "Dashboard", icono: <BarChart3 size={14} /> },
          { id: "Registros", icono: <FileText size={14} /> },
          { id: "Mis solicitudes", icono: <User size={14} /> },
        ] as const).map(v => (
          <div key={v.id} onClick={() => setVista(v.id)}
            style={{
              cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
              padding: "8px 14px", borderRadius: "10px", fontSize: "13px", fontWeight: 700,
              background: vista === v.id ? "var(--accent-soft)" : "var(--surface-1)",
              color: vista === v.id ? "var(--accent-dark)" : INK_2,
              border: `1px solid ${vista === v.id ? VERDE_MARCA : "var(--border-color)"}`,
            }}>
            {v.icono} {v.id}
          </div>
        ))}
        <div style={{ marginLeft: "auto", alignSelf: "center", fontSize: "11px", color: INK_3 }}>
          {etiquetaRango} · {num(resumen.solicitudes)} solicitud{resumen.solicitudes === 1 ? "" : "es"}
        </div>
      </div>

      {/* ─── Indicadores (en las tres vistas: son el encabezado del informe) ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
        <Indicador etiqueta="Solicitudes" valor={num(resumen.solicitudes)} nota={`${num(resumen.publicadas)} publicadas`} />
        <Indicador etiqueta="Diseños principales" valor={num(resumen.principales)} nota="Uno por solicitud entregada" />
        <Indicador etiqueta="Redimensiones" valor={num(resumen.redimensiones)} nota="Piezas adicionales del mismo arte" />
        <Indicador etiqueta="Total de piezas" valor={num(resumen.piezas)} nota="Principales + redimensiones" destacado />
        <div className="card" style={{ padding: "16px 18px" }}>
          <div style={{ fontSize: "11px", color: INK_2, fontWeight: 700, marginBottom: "8px" }}>Cumplimiento</div>
          <div style={{ fontSize: "32px", lineHeight: 1, fontWeight: 800, color: INK, marginBottom: "10px" }}>
            {resumen.cumplimiento.medidas > 0 ? `${resumen.cumplimiento.porcentaje}%` : "—"}
          </div>
          <Medidor porcentaje={resumen.cumplimiento.porcentaje} color={VERDE_MARCA} />
          <div style={{ fontSize: "11px", color: INK_3, marginTop: "7px" }}>
            {resumen.cumplimiento.medidas > 0
              ? `${num(resumen.cumplimiento.aTiempo)} de ${num(resumen.cumplimiento.medidas)} publicadas dentro de la fecha`
              : "Sin publicaciones con fecha registrada"}
            {resumen.cumplimiento.sinDato > 0 && ` · ${num(resumen.cumplimiento.sinDato)} sin fecha de publicación`}
          </div>
        </div>
      </div>

      {vista === "Dashboard" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
            <Tarjeta titulo="Producción por diseñador" subtitulo="Piezas realizadas en el periodo" icono={<Users size={15} color={VERDE_MARCA} />}>
              <Barras datos={barrasDisenador} color={VERDE_MARCA} unidad="piezas" pista={pista} />
            </Tarjeta>

            <Tarjeta titulo="Producción por área" subtitulo="Participación sobre el total de piezas" icono={<PieIcon size={15} color={VERDE_MARCA} />}>
              <Anillo datos={anilloAreas} total={totalAreas} unidad="piezas" pista={pista} />
              {resumen.porArea.length > MAX_CATEGORIAS && (
                <div style={{ fontSize: "10px", color: INK_3, marginTop: "10px" }}>
                  Las áreas de menor volumen se agrupan en «Otras»; el detalle completo está en Registros.
                </div>
              )}
            </Tarjeta>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
            <Tarjeta titulo="Solicitudes por tipo" subtitulo="Nueva línea gráfica, E-CARDS, giveaways…" icono={<Layers size={15} color={VERDE_MARCA} />}>
              <Barras datos={barrasTipo} color={VERDE_MARCA} unidad="solicitudes" pista={pista} />
            </Tarjeta>

            <Tarjeta titulo="Solicitudes por mes" subtitulo="Cómo se reparte el periodo" icono={<TrendingUp size={15} color={VERDE_MARCA} />}>
              <Columnas datos={columnasMes} color={VERDE_MARCA} unidad="solicitudes" pista={pista} />
            </Tarjeta>
          </div>

          <Tarjeta titulo="Estado de las solicitudes" subtitulo="En qué punto está el trabajo del periodo" icono={<Target size={15} color={VERDE_MARCA} />}>
            <Apilada datos={apiladaEstado} total={resumen.solicitudes} pista={pista} />
          </Tarjeta>
        </>
      )}

      {(vista === "Registros" || vista === "Mis solicitudes") && (
        <>
          {/* La tabla es el gemelo accesible de las gráficas: las mismas cifras,
              sin depender del color ni del ratón. */}
          <Tarjeta titulo="Producción por diseñador" subtitulo="Las mismas cifras de las gráficas, en tabla" icono={<Users size={15} color={VERDE_MARCA} />}>
            <TablaProduccion filas={resumen.porDisenador} etiqueta="Diseñador" resaltar={userName} />
          </Tarjeta>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
            <Tarjeta titulo="Producción por área" icono={<BarChart3 size={15} color={VERDE_MARCA} />}>
              <TablaProduccion filas={resumen.porArea} etiqueta="Área" />
            </Tarjeta>
            <Tarjeta titulo="Producción por tipo" icono={<Layers size={15} color={VERDE_MARCA} />}>
              <TablaProduccion filas={resumen.porTipo} etiqueta="Tipo" />
            </Tarjeta>
          </div>

          <Tarjeta titulo={vista === "Mis solicitudes" ? "Mis solicitudes del periodo" : "Detalle de solicitudes"}
            subtitulo={`${num(filtradas.length)} en el periodo`} icono={<CalendarDays size={15} color={VERDE_MARCA} />}>
            <TablaDetalle solicitudes={filtradas} />
          </Tarjeta>
        </>
      )}
    </div>
  );
}

// ─── Tablas ────────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "8px 10px", fontSize: "10px", textTransform: "uppercase",
  letterSpacing: "0.5px", color: INK_2, borderBottom: `1px solid ${REJILLA}`, whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = {
  padding: "8px 10px", fontSize: "12px", color: INK, borderBottom: `1px solid ${REJILLA}`,
  fontVariantNumeric: "tabular-nums",
};

function TablaProduccion({ filas, etiqueta, resaltar }: {
  filas: { clave: string; solicitudes: number; principales: number; redimensiones: number; piezas: number; publicadas: number }[];
  etiqueta: string;
  resaltar?: string;
}) {
  if (filas.length === 0) return <SinDatos />;
  const cols = ["Solicitudes", "Principales", "Redimensiones", "Piezas", "Publicadas"];
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>{etiqueta}</th>
            {cols.map(c => <th key={c} style={{ ...thStyle, textAlign: "center" }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.clave}>
              <td style={{ ...tdStyle, fontWeight: 700, color: f.clave === resaltar ? VERDE_MARCA : INK }}>{f.clave}</td>
              <td style={{ ...tdStyle, textAlign: "center" }}>{num(f.solicitudes)}</td>
              <td style={{ ...tdStyle, textAlign: "center" }}>{num(f.principales)}</td>
              <td style={{ ...tdStyle, textAlign: "center" }}>{num(f.redimensiones)}</td>
              <td style={{ ...tdStyle, textAlign: "center", fontWeight: 800 }}>{num(f.piezas)}</td>
              <td style={{ ...tdStyle, textAlign: "center" }}>{num(f.publicadas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaDetalle({ solicitudes }: { solicitudes: SolicitudAnalitica[] }) {
  if (solicitudes.length === 0) return <SinDatos />;
  const filas = [...solicitudes].sort((a, b) => (b.requestDate || "").localeCompare(a.requestDate || ""));
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["ID", "Solicitud", "Tipo", "Área", "Diseñador", "Estado", "Piezas", "Creada", "Entrega", "Publicada"].map((c, i) => (
              <th key={c} style={{ ...thStyle, textAlign: i >= 6 ? "center" : "left" }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map(r => (
            <tr key={r.id}>
              <td style={{ ...tdStyle, fontWeight: 700 }}>{r.id}</td>
              <td style={{ ...tdStyle, maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</td>
              <td style={tdStyle}>{r.requestKind || "—"}</td>
              <td style={tdStyle}>{r.area || "—"}</td>
              <td style={tdStyle}>{r.assignedTo || "Sin asignar"}</td>
              <td style={tdStyle}>{r.status}</td>
              <td style={{ ...tdStyle, textAlign: "center", fontWeight: 800 }}>{num(piezasDe(r))}</td>
              <td style={{ ...tdStyle, textAlign: "center" }}>{r.requestDate || "—"}</td>
              <td style={{ ...tdStyle, textAlign: "center" }}>{r.deliveryDate || "—"}</td>
              <td style={{ ...tdStyle, textAlign: "center" }}>{fechaPublicacion(r) || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
