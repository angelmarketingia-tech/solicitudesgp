"use client";

/**
 * ─── Lo que el informe no veía ──────────────────────────────────────────────
 *
 * Dos piezas de la pestaña «Indicadores», juntas porque resuelven el mismo
 * problema: trabajo que SE HIZO pero que el informe contaba como cero.
 *
 *  · `PendientesDeContar` → solicitudes publicadas sin archivos y sin cuenta
 *    declarada. Valen cero piezas. Pasa con quien entrega por fuera (manda el
 *    arte por mensaje, lo deja en una carpeta) y no sube nada al tablero: su
 *    mes entero salía en cero sin que nadie lo notara.
 *
 *  · `RegistroManual` → trabajo que ni siquiera se pidió por la plataforma.
 *    «Me lo pidieron en la oficina para ya: fueron 2 solicitudes y 6 piezas.»
 *    No deja rastro, y a fin de mes no existe.
 *
 * Las dos escriben a través de callbacks: este archivo no toca Firestore, igual
 * que el resto del módulo de indicadores.
 */

import React, { useState } from "react";
import { ClipboardPlus, X } from "lucide-react";
import { SolicitudAnalitica, VERDE_MARCA } from "@/lib/analytics";

type ToastFn = (msg: string, type?: "success" | "error" | "info") => void;

const INK = "var(--text-primary)";
const INK_2 = "var(--text-secondary)";
const INK_3 = "var(--text-muted)";
const REJILLA = "var(--border-color)";

const hoyIso = () => new Date().toISOString().slice(0, 10);

const etiquetaStyle: React.CSSProperties = {
  fontSize: "10px", fontWeight: 700, color: INK_2,
  textTransform: "uppercase", letterSpacing: "0.5px",
};
const campoStyle: React.CSSProperties = { fontSize: "13px", padding: "9px 11px" };

/** Entero a partir de un campo de texto; null si no sirve. */
function entero(texto: string, minimo: number): number | null {
  const n = Math.floor(Number(texto.trim()));
  return texto.trim() !== "" && Number.isFinite(n) && n >= minimo ? n : null;
}

// ─────────────────────────────────────────────────────────────────────────────

export function PendientesDeContar({ solicitudes, onDeclarar, addToast }: {
  solicitudes: SolicitudAnalitica[];
  onDeclarar: (id: string, artes: number, redimensiones: number) => Promise<boolean>;
  addToast: ToastFn;
}) {
  const [abierto, setAbierto] = useState(true);
  const [valores, setValores] = useState<Record<string, { artes: string; redim: string }>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [listos, setListos] = useState<string[]>([]);

  const pendientes = solicitudes.filter(r => !listos.includes(r.id));
  if (pendientes.length === 0) return null;

  const valorDe = (id: string) => valores[id] || { artes: "", redim: "" };
  const fijar = (id: string, campo: "artes" | "redim", v: string) =>
    setValores(prev => ({ ...prev, [id]: { ...valorDe(id), [campo]: v } }));

  const guardar = async (id: string, artes: number, redim: number) => {
    setGuardando(id);
    const ok = await onDeclarar(id, artes, redim);
    setGuardando(null);
    if (ok) {
      setListos(prev => [...prev, id]);
      addToast(`${id}: ${artes + redim} pieza(s) contadas.`, "success");
    }
  };

  return (
    <div className="card" style={{ padding: "14px 16px", border: `1px solid ${VERDE_MARCA}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <ClipboardPlus size={16} color={VERDE_MARCA} />
        <strong style={{ fontSize: "13px", color: INK }}>
          {pendientes.length} entrega{pendientes.length === 1 ? "" : "s"} tuya{pendientes.length === 1 ? "" : "s"} sin piezas contadas
        </strong>
        <span style={{ fontSize: "11.5px", color: INK_3 }}>
          Están publicadas, pero cuentan cero en el informe: no tienen archivos ni cuenta.
        </span>
        <button type="button" onClick={() => setAbierto(a => !a)}
          style={{ marginLeft: "auto", width: "auto", background: "none", border: "none", color: VERDE_MARCA, fontSize: "12px", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
          {abierto ? "Ocultar" : "Completar ahora"}
        </button>
      </div>

      {abierto && (
        <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px", maxHeight: "330px", overflowY: "auto" }}>
          {pendientes.map(r => {
            const v = valorDe(r.id);
            const artes = entero(v.artes, 0);
            const redim = v.redim.trim() === "" ? 0 : entero(v.redim, 0);
            const valido = artes !== null && redim !== null;
            return (
              <div key={r.id} style={{
                display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap",
                padding: "8px 10px", borderRadius: "10px",
                background: "var(--surface-1)", border: `1px solid ${REJILLA}`,
              }}>
                <span style={{ fontSize: "11px", fontWeight: 800, color: VERDE_MARCA, minWidth: "56px" }}>{r.id}</span>
                <span style={{ fontSize: "12px", color: INK, flex: 1, minWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.title}
                </span>
                <input type="number" min={0} step={1} inputMode="numeric" placeholder="Artes"
                  value={v.artes} onChange={e => fijar(r.id, "artes", e.target.value)}
                  style={{ width: "78px", fontSize: "12px", padding: "6px 8px" }} />
                <input type="number" min={0} step={1} inputMode="numeric" placeholder="Redim."
                  value={v.redim} onChange={e => fijar(r.id, "redim", e.target.value)}
                  style={{ width: "84px", fontSize: "12px", padding: "6px 8px" }} />
                <button type="button" className="btn-secondary" disabled={!valido || guardando === r.id}
                  onClick={() => { if (valido) guardar(r.id, artes, redim); }}
                  style={{ width: "auto", padding: "6px 12px", fontSize: "11.5px", borderRadius: "8px", opacity: valido ? 1 : 0.5 }}>
                  {guardando === r.id ? "…" : "Guardar"}
                </button>
                {/* El caso de lejos más común: una sola pieza. Un clic, en vez
                    de escribir un 1 doscientas veces. */}
                <button type="button" disabled={guardando === r.id}
                  onClick={() => guardar(r.id, 1, 0)}
                  style={{ width: "auto", padding: "6px 10px", fontSize: "11.5px", borderRadius: "8px", background: "none", border: `1px solid ${REJILLA}`, color: INK_2, cursor: "pointer" }}>
                  Fue 1
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export type DatosEntregaManual = {
  titulo: string; fecha: string; area: string; tipo: string;
  solicitante: string; solicitudes: number; artes: number; redimensiones: number;
};

export function RegistroManual({ areasSugeridas, tipos, onGuardar, onCerrar, addToast }: {
  areasSugeridas: readonly string[];
  tipos: readonly string[];
  onGuardar: (datos: DatosEntregaManual) => Promise<boolean>;
  onCerrar: () => void;
  addToast: ToastFn;
}) {
  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState(hoyIso());
  const [area, setArea] = useState(areasSugeridas[0] || "Pauta");
  const [tipo, setTipo] = useState(tipos[0] || "");
  const [solicitante, setSolicitante] = useState("");
  const [nSolicitudes, setNSolicitudes] = useState("1");
  const [artes, setArtes] = useState("1");
  const [redim, setRedim] = useState("0");
  const [guardando, setGuardando] = useState(false);

  const nSol = entero(nSolicitudes, 1);
  const nArtes = entero(artes, 0);
  const nRedim = entero(redim, 0);
  const total = (nArtes ?? 0) + (nRedim ?? 0);
  const valido = titulo.trim().length > 0 && nSol !== null && nArtes !== null && nRedim !== null && total > 0;

  const guardar = async () => {
    if (!valido) {
      addToast("Falta decir qué hiciste, o las cifras no son válidas.", "error");
      return;
    }
    setGuardando(true);
    const ok = await onGuardar({
      titulo, fecha, area, tipo, solicitante,
      solicitudes: nSol, artes: nArtes, redimensiones: nRedim,
    });
    setGuardando(false);
    if (ok) onCerrar();
  };

  return (
    <div onClick={onCerrar} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: "16px",
    }}>
      <div className="card" data-testid="registro-manual" onClick={e => e.stopPropagation()} style={{
        width: "min(560px, 100%)", maxHeight: "calc(100vh - 48px)", overflowY: "auto",
        overscrollBehavior: "contain", padding: "20px 22px",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: INK, flex: 1 }}>
            Registrar trabajo pedido fuera de la plataforma
          </h3>
          <button type="button" onClick={onCerrar}
            style={{ width: "auto", background: "none", border: "none", cursor: "pointer", color: INK_3, padding: 0 }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: "12px", color: INK_3, margin: "6px 0 16px", lineHeight: 1.55 }}>
          Para lo que te pidieron en la oficina, por mensaje o de viva voz y entregaste sin que
          pasara por el tablero. No hace falta adjuntar las piezas: con las cifras basta para que
          cuente en tu informe del mes.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "4px", margin: 0 }}>
            <span style={etiquetaStyle}>Qué hiciste</span>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} style={campoStyle}
              placeholder="Ej: Banners urgentes para el partido del domingo" />
          </label>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px", margin: 0, flex: 1, minWidth: "150px" }}>
              <span style={etiquetaStyle}>Cuándo</span>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={campoStyle} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px", margin: 0, flex: 1, minWidth: "150px" }}>
              <span style={etiquetaStyle}>Quién lo pidió</span>
              <input value={solicitante} onChange={e => setSolicitante(e.target.value)} style={campoStyle}
                placeholder="Opcional" />
            </label>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px", margin: 0, flex: 1, minWidth: "150px" }}>
              <span style={etiquetaStyle}>Área que lo pidió</span>
              <input list="areas-registro-manual" value={area} onChange={e => setArea(e.target.value)} style={campoStyle} />
              <datalist id="areas-registro-manual">
                {areasSugeridas.map(a => <option key={a} value={a} />)}
              </datalist>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px", margin: 0, flex: 1, minWidth: "150px" }}>
              <span style={etiquetaStyle}>Tipo</span>
              <select value={tipo} onChange={e => setTipo(e.target.value)} style={campoStyle}>
                {tipos.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>

          <div style={{ background: "var(--surface-1)", border: `1px solid ${REJILLA}`, borderRadius: "12px", padding: "12px 14px" }}>
            <div style={{ ...etiquetaStyle, marginBottom: "8px" }}>Cuánto fue</div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", margin: 0, width: "auto" }}>
                <span style={{ fontSize: "11px", color: INK_2, fontWeight: 600 }}>Solicitudes</span>
                <input type="number" min={1} step={1} inputMode="numeric" value={nSolicitudes}
                  onChange={e => setNSolicitudes(e.target.value)} style={{ ...campoStyle, width: "94px" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", margin: 0, width: "auto" }}>
                <span style={{ fontSize: "11px", color: INK_2, fontWeight: 600 }}>Artes</span>
                <input type="number" min={0} step={1} inputMode="numeric" value={artes}
                  onChange={e => setArtes(e.target.value)} style={{ ...campoStyle, width: "94px" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", margin: 0, width: "auto" }}>
                <span style={{ fontSize: "11px", color: INK_2, fontWeight: 600 }}>Redimensiones</span>
                <input type="number" min={0} step={1} inputMode="numeric" value={redim}
                  onChange={e => setRedim(e.target.value)} style={{ ...campoStyle, width: "112px" }} />
              </label>
              <div style={{ alignSelf: "flex-end", fontSize: "12px", color: INK_2, paddingBottom: "9px" }}>
                Total: <strong style={{ color: INK }}>{total}</strong> pieza{total === 1 ? "" : "s"}
                {nSol !== null && nSol > 1 ? ` en ${nSol} solicitudes` : ""}
              </div>
            </div>
            <p style={{ fontSize: "11px", color: INK_3, margin: "10px 0 0", lineHeight: 1.5 }}>
              Si fueron varios encargos de una vez —«2 solicitudes, 6 piezas»— ponlo tal cual: el
              informe contará las 2 solicitudes y las 6 piezas, sin tener que anotarlo dos veces.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "18px", justifyContent: "flex-end" }}>
          <button type="button" className="btn-secondary" onClick={onCerrar}
            style={{ width: "auto", padding: "10px 18px", fontSize: "13px" }}>
            Cancelar
          </button>
          <button type="button" className="btn" onClick={guardar} disabled={!valido || guardando}
            style={{ width: "auto", padding: "10px 18px", fontSize: "13px", opacity: valido ? 1 : 0.6 }}>
            {guardando ? "Guardando…" : "Registrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
