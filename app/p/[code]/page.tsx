"use client";

/**
 * ─── Vista pública de Promocionales (empresa externa, sin credenciales) ─────
 *
 * URL permanente: /p/<shareCode>
 * El código puede ser:
 *   - el GLOBAL (config)  → muestra toda la raíz de Promocionales.
 *   - el de UNA CARPETA   → muestra SOLO esa carpeta y sus subcarpetas
 *     (así se puede compartir "2026" sin exponer "CRM", por ejemplo).
 * Navega carpetas, descarga archivos y comenta. NO edita/sube/borra.
 */

import React, { use, useEffect, useMemo, useState } from "react";
import {
  Download, MessageSquare, Send, FileText, Image as ImageIcon, Lock, Megaphone,
  FileArchive, Folder, ChevronRight, Home, WifiOff,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  PromoItem, PromoComment, PROMO_ROOT,
  itemFromDoc, configFromDoc, addGeneralComment, addPromoComment, buildComment,
  sortItems, breadcrumb, subtreeIds,
} from "@/lib/promo";

type Scope = { rootId: string; name?: string; isRoot: boolean; general: PromoComment[]; configId?: string };

export default function PublicPromoPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);

  const [loading, setLoading] = useState(true);
  // Igual que en el calendario de influencers: si la red bloquea el streaming
  // de Firestore, la conexión se cuelga sin dar error y la página se queda en
  // gris para siempre. Se avisa y se ofrece reintentar.
  const [sinConexion, setSinConexion] = useState(false);
  const [scope, setScope] = useState<Scope | "invalid" | null>(null);
  const [items, setItems] = useState<PromoItem[]>([]);
  const [currentId, setCurrentId] = useState<string>(PROMO_ROOT);
  const [name, setName] = useState("");
  const [generalInput, setGeneralInput] = useState("");
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => { try { const n = localStorage.getItem("promo_public_name"); if (n) setName(n); } catch { /* */ } }, []);
  useEffect(() => { try { if (name) localStorage.setItem("promo_public_name", name); } catch { /* */ } }, [name]);

  // 1) Resolver el código: puede ser el global (config) o el de una carpeta.
  useEffect(() => {
    if (!code) return;
    const qy = query(collection(db, "requests"), where("shareCode", "==", code));
    const vigilante = setTimeout(() => setSinConexion(true), 15_000);
    const unsub = onSnapshot(qy, (snap) => {
      clearTimeout(vigilante);
      setSinConexion(false);
      const docSnap = snap.docs.find(d => {
        const b = d.data().board;
        return b === "promo_config" || b === "cmr_config" || ((b === "promo" || b === "cmr") && d.data().kind === "folder");
      });
      // Sin red, Firestore responde desde su caché (vacía): eso no significa
      // que el enlace sea malo, sino que no hubo conexión.
      if (!docSnap && snap.metadata.fromCache) { clearTimeout(vigilante); setSinConexion(true); return; }
      if (!docSnap) { clearTimeout(vigilante); setScope("invalid"); setLoading(false); return; }
      const data = docSnap.data();
      if (data.board === "promo_config") {
        const cfg = configFromDoc(docSnap.id, data);
        setScope({ rootId: PROMO_ROOT, isRoot: true, general: cfg.generalMessages, configId: cfg.id });
      } else {
        const f = itemFromDoc(docSnap.id, data);
        setScope({ rootId: f.id, name: f.name, isRoot: false, general: f.messages });
      }
      setLoading(false);
    }, () => {
      // Fallo de red, no enlace inválido: se avisa de la conexión.
      clearTimeout(vigilante);
      setSinConexion(true);
    });
    return () => unsub();
  }, [code]);

  const rootId = scope && scope !== "invalid" ? scope.rootId : null;

  // Al resolver, sitúa la navegación en la raíz compartida.
  useEffect(() => { if (rootId) setCurrentId(rootId); }, [rootId]);

  // 2) Cargar todos los items de Promocionales (se acota abajo por subárbol).
  useEffect(() => {
    if (!rootId) { setItems([]); return; }
    // Los dos tableros tipo Drive comparten esta vista pública.
    const qy = query(collection(db, "requests"), where("board", "in", ["promo", "cmr"]));
    const unsub = onSnapshot(qy, (snap) => setItems(snap.docs.map(d => itemFromDoc(d.id, d.data()))), () => { /* */ });
    return () => unsub();
  }, [rootId]);

  // Acota a la carpeta compartida (y su descendencia) si NO es el link global.
  const visibleItems = useMemo(() => {
    if (!rootId || rootId === PROMO_ROOT) return items;
    const set = subtreeIds(items, rootId);
    return items.filter(i => set.has(i.id));
  }, [items, rootId]);

  useEffect(() => {
    if (currentId !== PROMO_ROOT && !items.some(i => i.id === currentId)) setCurrentId(rootId || PROMO_ROOT);
  }, [items, currentId, rootId]);

  // Breadcrumb acotado: desde la carpeta compartida hacia abajo.
  const crumbs = useMemo(() => {
    const full = breadcrumb(items, currentId);
    if (!rootId || rootId === PROMO_ROOT) return full;
    const idx = full.findIndex(c => c.id === rootId);
    return idx >= 0 ? full.slice(idx + 1) : full;
  }, [items, currentId, rootId]);

  const children = useMemo(() => sortItems(visibleItems.filter(i => i.parentId === currentId)), [visibleItems, currentId]);
  const folders = children.filter(i => i.kind === "folder");
  const files = children.filter(i => i.kind === "file");
  const nameOk = name.trim().length > 0;
  const isRootScope = scope && scope !== "invalid" ? scope.isRoot : false;

  const download = (item: PromoItem) => {
    if (!item.fileUrl) return;
    if (!/^https:\/\//i.test(item.fileUrl) && !/^data:(image|video|application)\//i.test(item.fileUrl)) return;
    const a = document.createElement("a");
    a.href = item.fileUrl; a.download = item.fileName || item.name; a.target = "_blank"; a.rel = "noreferrer";
    document.body.appendChild(a); a.click(); a.remove();
  };
  // Comentario "general": en el link global va al config; en un link de carpeta,
  // va al doc de esa carpeta (así el diseñador lo ve como comentario de la pieza/carpeta).
  const sendGeneral = async () => {
    if (!generalInput.trim() || !nameOk || !scope || scope === "invalid") return;
    const text = generalInput.trim(); setGeneralInput("");
    try {
      if (scope.isRoot && scope.configId) await addGeneralComment(db, scope.configId, buildComment(name, text, "public"));
      else await addPromoComment(db, scope.rootId, buildComment(name, text, "public"));
    } catch { setGeneralInput(text); }
  };
  const sendComment = async (id: string) => {
    const text = (commentInputs[id] || "").trim();
    if (!text || !nameOk) return;
    setCommentInputs(s => ({ ...s, [id]: "" }));
    try { await addPromoComment(db, id, buildComment(name, text, "public")); } catch { setCommentInputs(s => ({ ...s, [id]: text })); }
  };

  if (loading && sinConexion) {
    return (
      <div style={{ maxWidth: "480px", margin: "0 auto", padding: "70px 20px", textAlign: "center" }}>
        <WifiOff size={44} style={{ opacity: 0.45, marginBottom: "14px" }} />
        <h1 style={{ fontSize: "20px", color: "var(--text-primary)", margin: "0 0 10px" }}>
          No pudimos cargar los archivos
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 22px" }}>
          Parece un problema de conexión. Prueba con datos móviles si estás en wifi
          (o al revés), o ábrelo en Chrome o Safari en vez de dentro de WhatsApp.
        </p>
        <button className="btn" onClick={() => window.location.reload()} style={{ padding: "12px 22px" }}>
          Reintentar
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 16px" }}>
        <div className="skeleton" style={{ height: "60px", marginBottom: "16px" }} />
        <div className="skeleton" style={{ height: "360px" }} />
      </div>
    );
  }
  if (scope === "invalid" || !scope) {
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
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
        <img src="/logo.png" alt="GanaPlay" style={{ height: "38px" }} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
        <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
          <Megaphone size={20} color="var(--accent-color)" /> Promocionales{!isRootScope && scope.name ? ` — ${scope.name}` : ""}
        </div>
      </div>
      <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "18px", display: "flex", alignItems: "center", gap: "6px" }}>
        <Lock size={12} /> Navega las carpetas, descarga y comenta. No requiere cuenta.
      </p>

      {/* Nombre del comentarista */}
      <div className="card" style={{ padding: "12px 16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 600 }}>Tu nombre / empresa:</span>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Agencia XYZ" style={{ fontSize: "13px", flex: 1, minWidth: "180px" }} />
        {!nameOk && <span style={{ fontSize: "11px", color: "var(--warning)" }}>Escribe tu nombre para poder comentar.</span>}
      </div>

      {/* Breadcrumb */}
      <div className="card" style={{ padding: "10px 14px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap", fontSize: "13px" }}>
        <span onClick={() => setCurrentId(rootId || PROMO_ROOT)} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px", color: currentId === rootId ? "var(--text-primary)" : "var(--accent-color)", fontWeight: 700 }}>
          <Home size={14} /> {isRootScope ? "Inicio" : (scope.name || "Inicio")}
        </span>
        {crumbs.map(c => (
          <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <ChevronRight size={14} color="var(--text-muted)" />
            <span onClick={() => setCurrentId(c.id)} style={{ cursor: "pointer", color: c.id === currentId ? "var(--text-primary)" : "var(--accent-color)", fontWeight: c.id === currentId ? 700 : 600 }}>{c.name}</span>
          </span>
        ))}
      </div>

      {/* Comentarios generales (solo en el link global; en carpeta se usa por pieza) */}
      {isRootScope && (
        <div className="card" style={{ padding: "16px", marginBottom: "16px" }}>
          <h4 style={{ margin: "0 0 10px", fontSize: "14px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
            <MessageSquare size={15} color="var(--accent-color)" /> Comentarios generales
          </h4>
          <PubCommentList messages={scope.general} emptyText="Sin comentarios generales aún." />
          <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
            <input value={generalInput} onChange={e => setGeneralInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendGeneral()}
              placeholder="Escribe un comentario general…" style={{ fontSize: "13px", flex: 1 }} disabled={!nameOk} />
            <button className="btn" style={{ padding: "10px" }} onClick={sendGeneral} disabled={!nameOk}><Send size={16} /></button>
          </div>
        </div>
      )}

      {/* Contenido */}
      {children.length === 0 ? (
        <div className="card" style={{ padding: "50px", textAlign: "center", color: "var(--text-muted)" }}>
          <Folder size={40} style={{ opacity: 0.35, marginBottom: "10px" }} />
          <p style={{ margin: 0 }}>Esta carpeta está vacía.</p>
        </div>
      ) : (
        <>
          {folders.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px", marginBottom: files.length ? "20px" : 0 }}>
              {folders.map(f => (
                <div key={f.id} className="card" style={{ padding: "14px", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }} onClick={() => setCurrentId(f.id)}>
                  <Folder size={26} color="var(--accent-color)" style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{items.filter(i => i.parentId === f.id).length} elemento(s)</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {files.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
              {files.map(p => (
                <div key={p.id} className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <Preview item={p} />
                  <div style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", wordBreak: "break-word" }}>{p.name}</div>
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
        </>
      )}
    </div>
  );
}

function Preview({ item }: { item: PromoItem }) {
  const H = "170px";
  if (item.fileType === "image" && item.fileUrl) return <img src={item.fileUrl} alt={item.name} style={{ width: "100%", height: H, objectFit: "cover", display: "block", background: "var(--surface-2)" }} />;
  if (item.fileType === "video" && item.fileUrl) return <video src={item.fileUrl} controls style={{ width: "100%", height: H, objectFit: "cover", display: "block", background: "#000" }} />;
  const isArchive = item.fileType === "archive";
  const Icon = isArchive ? FileArchive : item.fileType === "pdf" ? FileText : ImageIcon;
  const ext = (item.fileName || "").split(".").pop()?.toUpperCase() || "";
  return (
    <div style={{ width: "100%", height: H, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", background: "var(--surface-1)", color: "var(--text-secondary)" }}>
      <Icon size={40} />
      <span style={{ fontSize: "12px", textTransform: "uppercase", fontWeight: 700 }}>{isArchive ? `Carpeta ${ext}` : (item.fileType || ext)}</span>
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
