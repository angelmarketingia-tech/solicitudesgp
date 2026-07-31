"use client";

/**
 * ─── Vista pública de Promocionales (empresa externa, sin credenciales) ─────
 *
 * URL permanente: /p/<shareCode>
 *
 * La empresa externa puede: VER las piezas, DESCARGARLAS y COMENTAR
 * (comentarios generales y por pieza, p. ej. para pedir cambios).
 * NO puede editar, subir ni borrar.
 *
 * Lee/escribe Firestore con la API key pública. Los comentarios se agregan con
 * arrayUnion (permitido por las reglas ya desplegadas de `requests`).
 */

import React, { use, useEffect, useMemo, useState } from "react";
import { Download, MessageSquare, Send, FileText, Film, Image as ImageIcon, Lock, Megaphone } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  Promo, PromoComment, PromoConfig,
  promoFromDoc, configFromDoc, addGeneralComment, addPromoComment, buildComment,
} from "@/lib/promo";

export default function PublicPromoPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<PromoConfig | null>(null);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [name, setName] = useState("");
  const [generalInput, setGeneralInput] = useState("");
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // Nombre recordado localmente.
  useEffect(() => {
    try { const n = localStorage.getItem("promo_public_name"); if (n) setName(n); } catch { /* */ }
  }, []);
  useEffect(() => {
    try { if (name) localStorage.setItem("promo_public_name", name); } catch { /* */ }
  }, [name]);

  // 1) Validar el código y cargar config.
  useEffect(() => {
    if (!code) return;
    const qy = query(collection(db, "requests"), where("shareCode", "==", code));
    const unsub = onSnapshot(qy, (snap) => {
      const found = snap.docs.find(d => d.data().board === "promo_config");
      setConfig(found ? configFromDoc(found.id, found.data()) : null);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [code]);

  // 2) Cargar promocionales (globales).
  useEffect(() => {
    if (!config) { setPromos([]); return; }
    const qy = query(collection(db, "requests"), where("board", "==", "promo"));
    const unsub = onSnapshot(qy, (snap) => {
      const ps = snap.docs.map(d => promoFromDoc(d.id, d.data()));
      ps.sort((a, b) => (b.createdAt || b.id).localeCompare(a.createdAt || a.id));
      setPromos(ps);
    }, () => { /* */ });
    return () => unsub();
  }, [config]);

  const nameOk = name.trim().length > 0;

  const download = (p: Promo) => {
    // Seguridad: solo esquemas seguros (evita `javascript:` u otros).
    if (!/^https:\/\//i.test(p.fileUrl) && !/^data:(image|video|application)\//i.test(p.fileUrl)) return;
    const a = document.createElement("a");
    a.href = p.fileUrl; a.download = p.fileName || p.title; a.target = "_blank"; a.rel = "noreferrer";
    document.body.appendChild(a); a.click(); a.remove();
  };

  const sendGeneral = async () => {
    if (!generalInput.trim() || !config) return;
    if (!nameOk) return;
    const text = generalInput.trim(); setGeneralInput("");
    try { await addGeneralComment(db, config.id, buildComment(name, text, "public")); }
    catch { setGeneralInput(text); }
  };
  const sendComment = async (promoId: string) => {
    const text = (commentInputs[promoId] || "").trim();
    if (!text || !nameOk) return;
    setCommentInputs(s => ({ ...s, [promoId]: "" }));
    try { await addPromoComment(db, promoId, buildComment(name, text, "public")); }
    catch { setCommentInputs(s => ({ ...s, [promoId]: text })); }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 16px" }}>
        <div className="skeleton" style={{ height: "60px", marginBottom: "16px" }} />
        <div className="skeleton" style={{ height: "360px" }} />
      </div>
    );
  }
  if (!config) {
    return (
      <div style={{ maxWidth: "560px", margin: "0 auto", padding: "80px 16px", textAlign: "center" }}>
        <Lock size={44} style={{ opacity: 0.4, marginBottom: "12px" }} />
        <h1 style={{ fontSize: "22px", color: "var(--text-primary)" }}>Enlace no válido</h1>
        <p style={{ color: "var(--text-secondary)" }}>Este enlace de promocionales no existe o fue desactivado. Pide uno nuevo a tu contacto de GanaPlay.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "24px 16px 60px" }}>
      {/* Encabezado */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
        <img src="/logo.png" alt="GanaPlay" style={{ height: "38px" }} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
        <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
          <Megaphone size={20} color="var(--accent-color)" /> Promocionales
        </div>
      </div>
      <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "18px", display: "flex", alignItems: "center", gap: "6px" }}>
        <Lock size={12} /> Puedes ver, descargar y comentar. No requiere cuenta.
      </p>

      {/* Nombre del comentarista */}
      <div className="card" style={{ padding: "12px 16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 600 }}>Tu nombre / empresa:</span>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Agencia XYZ" style={{ fontSize: "13px", flex: 1, minWidth: "180px" }} />
        {!nameOk && <span style={{ fontSize: "11px", color: "var(--warning)" }}>Escribe tu nombre para poder comentar.</span>}
      </div>

      {/* Comentarios generales */}
      <div className="card" style={{ padding: "16px", marginBottom: "16px" }}>
        <h4 style={{ margin: "0 0 10px", fontSize: "14px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
          <MessageSquare size={15} color="var(--accent-color)" /> Comentarios generales
        </h4>
        <PubCommentList messages={config.generalMessages} emptyText="Sin comentarios generales aún." />
        <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
          <input value={generalInput} onChange={e => setGeneralInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendGeneral()}
            placeholder="Escribe un comentario general…" style={{ fontSize: "13px", flex: 1 }} disabled={!nameOk} />
          <button className="btn" style={{ padding: "10px" }} onClick={sendGeneral} disabled={!nameOk}><Send size={16} /></button>
        </div>
      </div>

      {/* Grid de promocionales */}
      {promos.length === 0 ? (
        <div className="card" style={{ padding: "50px", textAlign: "center", color: "var(--text-muted)" }}>
          <Megaphone size={40} style={{ opacity: 0.35, marginBottom: "10px" }} />
          <p>Aún no hay promocionales publicados.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
          {promos.map(p => (
            <div key={p.id} className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <Preview promo={p} />
              <div style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", wordBreak: "break-word" }}>{p.title}</div>
                {p.description && <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{p.description}</div>}
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                  <button className="btn-secondary" style={{ padding: "7px 12px", fontSize: "12px", borderRadius: "9px", cursor: "pointer" }} onClick={() => download(p)}>
                    <Download size={13} /> Descargar
                  </button>
                  <button className="btn-secondary" style={{ padding: "7px 12px", fontSize: "12px", borderRadius: "9px", cursor: "pointer" }}
                    onClick={() => setOpen(s => ({ ...s, [p.id]: !s[p.id] }))}>
                    <MessageSquare size={13} /> Comentarios ({p.messages.length})
                  </button>
                </div>
                {open[p.id] && (
                  <div style={{ marginTop: "8px", borderTop: "1px solid var(--border-color)", paddingTop: "10px" }}>
                    <PubCommentList messages={p.messages} emptyText="Sin comentarios en esta pieza." />
                    <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                      <input value={commentInputs[p.id] || ""} onChange={e => setCommentInputs(s => ({ ...s, [p.id]: e.target.value }))}
                        onKeyDown={e => e.key === "Enter" && sendComment(p.id)} placeholder="¿Requiere algún cambio?" style={{ fontSize: "12px", flex: 1 }} disabled={!nameOk} />
                      <button className="btn" style={{ padding: "8px" }} onClick={() => sendComment(p.id)} disabled={!nameOk}><Send size={14} /></button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Preview({ promo }: { promo: Promo }) {
  const H = "170px";
  if (promo.fileType === "image") return <img src={promo.fileUrl} alt={promo.title} style={{ width: "100%", height: H, objectFit: "cover", display: "block", background: "var(--surface-2)" }} />;
  if (promo.fileType === "video") return <video src={promo.fileUrl} controls style={{ width: "100%", height: H, objectFit: "cover", display: "block", background: "#000" }} />;
  const Icon = promo.fileType === "pdf" ? FileText : ImageIcon;
  return (
    <div style={{ width: "100%", height: H, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", background: "var(--surface-1)", color: "var(--text-secondary)" }}>
      <Icon size={40} />
      <span style={{ fontSize: "12px", textTransform: "uppercase", fontWeight: 700 }}>{promo.fileType}</span>
    </div>
  );
}

function PubCommentList({ messages, emptyText }: { messages: PromoComment[]; emptyText: string }) {
  if (!messages || messages.length === 0) return <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>{emptyText}</p>;
  const sorted = [...messages].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "220px", overflowY: "auto" }}>
      {sorted.map(m => (
        <div key={m.id} style={{ background: m.source === "public" ? "var(--warning-soft)" : "var(--surface-1)", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "8px 10px" }}>
          <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "3px" }}>
            <strong style={{ color: "var(--text-secondary)" }}>{m.authorName}</strong>
            {m.source === "app" && <span style={{ color: "var(--accent-color)", fontWeight: 700 }}> · GanaPlay</span>}
            {m.createdAt && ` · ${new Date(m.createdAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}`}
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>
        </div>
      ))}
    </div>
  );
}
