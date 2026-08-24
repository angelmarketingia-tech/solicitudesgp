"use client";

/**
 * ─── Vista pública de solo lectura para un influencer ───────────────────────
 *
 * URL: /i/<shareCode>  (código secreto no adivinable)
 *
 * NO requiere login. El influencer solo VE su calendario; no edita nada.
 *
 * Los datos NO se leen de Firestore desde el navegador, sino de
 * `/api/influencer/<code>`, que consulta desde el servidor. Firestore usa una
 * conexión de streaming que algunas redes móviles dejan colgada sin dar error,
 * y esta pantalla se quedaba cargando para siempre (le pasó a una influencer en
 * El Salvador con un enlace correcto). Contra nuestro dominio es una petición
 * normal: si funciona la página, funcionan los datos.
 */

import React, { use, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, X, Lock, WifiOff, FileDown, FileText } from "lucide-react";
import {
  Influencer, ContentItem,
  STATUS_STYLE, PILLAR_STYLE, DOW_ES,
  monthGrid, monthLabel, influencerFromDoc, itemFromDoc,
} from "@/lib/influencer";
import { descargarWord, imprimirPdf } from "@/lib/influencer-export";

export default function PublicInfluencerPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);

  const [loading, setLoading] = useState(true);
  // Si la conexión se queda colgada (redes que bloquean el streaming de
  // Firestore), la página mostraba un gris eterno sin explicación. Pasados
  // unos segundos se avisa y se ofrece reintentar.
  const [sinConexion, setSinConexion] = useState(false);
  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [detail, setDetail] = useState<ContentItem | null>(null);

  const today = new Date();
  const [viewY, setViewY] = useState(today.getFullYear());
  const [viewM, setViewM] = useState(today.getMonth());

  // Los datos los sirve NUESTRO servidor (/api/influencer/<code>), no Firestore
  // directamente. En algunas redes móviles la conexión de streaming de
  // Firestore se queda colgada sin dar error y esta pantalla no salía nunca del
  // "Cargando…". Contra nuestro dominio —el mismo del que ya bajó la página—
  // es una petición normal, y si falla, falla rápido y se puede reintentar.
  const [intento, setIntento] = useState(0);
  const [enlaceInvalido, setEnlaceInvalido] = useState(false);

  useEffect(() => {
    if (!code) return;
    let vigente = true;
    const corte = new AbortController();
    const vigilante = setTimeout(() => corte.abort(), 20_000);

    (async () => {
      setLoading(true);
      setSinConexion(false);
      try {
        const res = await fetch(`/api/influencer/${encodeURIComponent(code)}`, {
          signal: corte.signal,
          cache: "no-store",
        });
        if (!vigente) return;
        if (res.status === 404) { setEnlaceInvalido(true); setLoading(false); return; }
        if (!res.ok) { setSinConexion(true); return; }
        const datos = await res.json();
        if (!vigente) return;
        setInfluencer(influencerFromDoc(datos.influencer.id, datos.influencer));
        setItems((datos.items || []).map((it: { id: string }) => itemFromDoc(it.id, it)));
        setEnlaceInvalido(false);
        setLoading(false);
      } catch {
        if (vigente) setSinConexion(true);
      } finally {
        clearTimeout(vigilante);
      }
    })();

    return () => { vigente = false; clearTimeout(vigilante); corte.abort(); };
  }, [code, intento]);

  const weeks = useMemo(() => monthGrid(viewY, viewM), [viewY, viewM]);
  const itemsByDay = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    for (const it of items) {
      const arr = map.get(it.date) || [];
      arr.push(it); map.set(it.date, arr);
    }
    return map;
  }, [items]);
  const monthItems = useMemo(() => {
    const prefix = `${viewY}-${String(viewM + 1).padStart(2, "0")}`;
    return items.filter(it => it.date.startsWith(prefix));
  }, [items, viewY, viewM]);
  const monthCount = monthItems.length;

  const prevMonth = () => { const m = viewM - 1; if (m < 0) { setViewM(11); setViewY(viewY - 1); } else setViewM(m); };
  const nextMonth = () => { const m = viewM + 1; if (m > 11) { setViewM(0); setViewY(viewY + 1); } else setViewM(m); };
  const todayStr = today.toISOString().split("T")[0];

  // ── Descarga del mes ──
  // El influencer no tiene sesión ni sistema de avisos, así que un fallo se
  // cuenta con alert(): es feo, pero es lo único que verá con seguridad.
  const exportarPdf = () => {
    if (!influencer) return;
    imprimirPdf({ influencer, items: monthItems, year: viewY, month: viewM },
      (msg) => alert(msg));
  };

  const exportarWord = () => {
    if (!influencer) return;
    try {
      descargarWord({ influencer, items: monthItems, year: viewY, month: viewM });
    } catch {
      alert("No se pudo generar el documento de Word. Prueba con la descarga en PDF.");
    }
  };

  if (loading && sinConexion) {
    return (
      <div style={{ maxWidth: "480px", margin: "0 auto", padding: "70px 20px", textAlign: "center" }}>
        <WifiOff size={44} style={{ opacity: 0.45, marginBottom: "14px" }} />
        <h1 style={{ fontSize: "20px", color: "var(--text-primary)", margin: "0 0 10px" }}>
          No pudimos cargar tu calendario
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 22px" }}>
          Parece un problema de conexión. Prueba con datos móviles si estás en wifi
          (o al revés), o ábrelo en Chrome o Safari en vez de dentro de WhatsApp.
        </p>
        <button className="btn" onClick={() => setIntento(n => n + 1)} style={{ padding: "12px 22px" }}>
          Reintentar
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 16px" }}>
        <div className="skeleton" style={{ height: "60px", marginBottom: "16px" }} />
        <div className="skeleton" style={{ height: "420px" }} />
        <p style={{ textAlign: "center", fontSize: "13px", color: "var(--text-muted)", marginTop: "18px" }}>
          Cargando tu calendario de contenido…
        </p>
      </div>
    );
  }

  // Sin influencer solo puede ser un enlace que el servidor no reconoció.
  if (enlaceInvalido || !influencer) {
    return (
      <div style={{ maxWidth: "560px", margin: "0 auto", padding: "80px 16px", textAlign: "center" }}>
        <Lock size={44} style={{ opacity: 0.4, marginBottom: "12px" }} />
        <h1 style={{ fontSize: "22px", color: "var(--text-primary)" }}>Enlace no válido</h1>
        <p style={{ color: "var(--text-secondary)" }}>Este enlace de contenido no existe o fue desactivado. Pide uno nuevo a tu contacto de GanaPlay.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "24px 16px 60px" }}>
      {/* Encabezado */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
        <img src="/logo.png" alt="GanaPlay" style={{ height: "38px" }} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
        <div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)" }}>Contenido {influencer.name}</div>
          {influencer.handle && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{influencer.handle}</div>}
        </div>
      </div>
      <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
        <Lock size={12} /> Vista de solo lectura · calendario de contenido
      </p>

      {/* Descarga del mes. Va arriba y bien visible: para quien abre esto desde
          el móvil con mala conexión, llevarse el archivo es más útil que
          volver a entrar cada vez. */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "18px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}>
          Descargar {monthLabel(viewY, viewM).toLowerCase()}:
        </span>
        <button className="btn-secondary" onClick={exportarPdf}
          style={{ padding: "6px 12px", fontSize: "12px", borderRadius: "8px", cursor: "pointer", width: "auto" }}>
          <FileDown size={13} /> PDF
        </button>
        <button className="btn-secondary" onClick={exportarWord}
          style={{ padding: "6px 12px", fontSize: "12px", borderRadius: "8px", cursor: "pointer", width: "auto" }}>
          <FileText size={13} /> Word
        </button>
      </div>

      {/* Navegación de mes */}
      <div className="card" style={{ padding: "12px 16px", marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button className="btn-ghost" style={{ padding: "8px", borderRadius: "8px", cursor: "pointer" }} onClick={prevMonth}><ChevronLeft size={18} /></button>
        <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", textTransform: "capitalize" }}>{monthLabel(viewY, viewM)}</div>
        <button className="btn-ghost" style={{ padding: "8px", borderRadius: "8px", cursor: "pointer" }} onClick={nextMonth}><ChevronRight size={18} /></button>
      </div>

      {/* Calendario */}
      <div className="card" style={{ padding: "10px", overflowX: "auto" }}>
        <div style={{ minWidth: "720px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "6px", marginBottom: "6px" }}>
            {DOW_ES.map(d => (
              <div key={d} style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.5px" }}>{d}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "6px", marginBottom: "6px" }}>
              {week.map((day, di) => {
                const dayItems = day ? (itemsByDay.get(day) || []) : [];
                const isToday = day === todayStr;
                return (
                  <div key={di} style={{ minHeight: "92px", borderRadius: "10px", padding: "6px", border: `1px solid ${isToday ? "var(--accent-color)" : "var(--border-color)"}`, background: day ? (isToday ? "var(--accent-soft)" : "var(--surface-1)") : "transparent", display: "flex", flexDirection: "column", gap: "4px" }}>
                    {day && <div style={{ fontSize: "11px", fontWeight: 700, color: isToday ? "var(--accent-color)" : "var(--text-muted)" }}>{parseInt(day.split("-")[2], 10)}</div>}
                    {dayItems.map(it => {
                      const st = STATUS_STYLE[it.contentStatus] || { text: "var(--text-secondary)", bg: "var(--surface-2)" };
                      return (
                        <div key={it.id} onClick={() => setDetail(it)} title={it.title}
                          style={{ background: st.bg, borderLeft: `3px solid ${st.text}`, borderRadius: "6px", padding: "4px 6px", cursor: "pointer" }}>
                          <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
                          {it.channel && <div style={{ fontSize: "9px", color: st.text, fontWeight: 700 }}>{it.channel}</div>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {monthCount === 0 && (
        <div style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)", fontSize: "13px" }}>
          <CalendarDays size={28} style={{ opacity: 0.35, marginBottom: "6px" }} />
          <p style={{ margin: 0 }}>No hay contenido programado para este mes.</p>
        </div>
      )}

      {/* Detalle (solo lectura) */}
      {detail && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "16px" }} onClick={() => setDetail(null)}>
          <div className="card" style={{ width: "520px", maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", padding: "24px" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "14px" }}>
              <h2 style={{ fontSize: "18px", margin: 0, color: "var(--text-primary)" }}>{detail.title}</h2>
              <X size={22} style={{ cursor: "pointer", color: "var(--text-secondary)", flexShrink: 0 }} onClick={() => setDetail(null)} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <Row label="Estado">
                <span className="badge" style={{ background: (STATUS_STYLE[detail.contentStatus] || {}).bg, color: (STATUS_STYLE[detail.contentStatus] || {}).text, fontSize: "12px" }}>{detail.contentStatus}</span>
              </Row>
              {detail.pillars.length > 0 && (
                <Row label="Pilar de contenido">
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {detail.pillars.map(p => {
                      const st = PILLAR_STYLE[p] || { text: "var(--text-secondary)", bg: "var(--surface-2)" };
                      return <span key={p} className="badge" style={{ background: st.bg, color: st.text, fontSize: "11px" }}>{p}</span>;
                    })}
                  </div>
                </Row>
              )}
              <Row label="Fecha"><span style={{ fontSize: "13px", color: "var(--text-primary)" }}>{detail.date}</span></Row>
              {detail.deliveryDate && <Row label="Fecha de entrega"><span style={{ fontSize: "13px", color: "var(--text-primary)" }}>{detail.deliveryDate}</span></Row>}
              {detail.channel && <Row label="Canal"><span style={{ fontSize: "13px", color: "var(--text-primary)" }}>{detail.channel}</span></Row>}
              {detail.contentFormat && <Row label="Formato"><span style={{ fontSize: "13px", color: "var(--text-primary)" }}>{detail.contentFormat}</span></Row>}
              {detail.ideas && (
                <Row label="Ideas / instrucciones">
                  <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.6, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{detail.ideas}</p>
                </Row>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "4px" }}>{label}</div>
      {children}
    </div>
  );
}
