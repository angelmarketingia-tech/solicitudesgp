"use client";

/**
 * ─── Módulo "Promocionales" ─────────────────────────────────────────────────
 *
 * Lo ven TODOS los perfiles. Los DISEÑADORES suben, editan, re-suben y borran.
 * Existe un enlace público permanente (/p/<código>) para que una empresa
 * externa vea y descargue las piezas y deje comentarios (generales y por
 * pieza) SIN credenciales.
 *
 * Almacenamiento: colección `requests` con discriminador `board`
 * ('promo' / 'promo_config'). Archivos en Firebase Storage (con respaldo a
 * data URL para imágenes si Storage falla). Ver '@/lib/promo'.
 */

import React, { useState, useEffect, ChangeEvent } from "react";
import {
  Megaphone, UploadCloud, Download, Trash2, Pencil, X, MessageSquare, Send,
  Copy, ExternalLink, FileText, Image as ImageIcon, RefreshCw, Loader2, FileArchive,
} from "lucide-react";
import { db, storage } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { compressImageToDataUrl } from "@/lib/image";
import {
  Promo, PromoComment, PromoConfig,
  promoFromDoc, configFromDoc, fileTypeOf, getOrCreateConfig,
  createPromo, updatePromo, deletePromo, addPromoComment, addGeneralComment, buildComment,
} from "@/lib/promo";

type Toast = (msg: string, type?: "success" | "error" | "info") => void;
type Props = { role: string | null; userName: string; addToast: Toast };

const MAX_BYTES = 150 * 1024 * 1024; // 150 MB (carpetas .rar/.zip pueden ser grandes)
const ALLOWED = ["jpg", "jpeg", "png", "webp", "gif", "pdf", "mp4", "mov", "webm", "rar", "zip", "7z", "tar", "gz"];
const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,.gif,.pdf,.mp4,.mov,.webm,.rar,.zip,.7z,.tar,.gz";

export default function PromoModule({ role, userName, addToast }: Props) {
  const canManage = role === "designer";

  const [config, setConfig] = useState<PromoConfig | null>(null);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [uploading, setUploading] = useState(false);

  // Comentario general
  const [generalInput, setGeneralInput] = useState("");
  // Comentario por pieza: { [promoId]: texto }
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});

  // Edición
  const [editing, setEditing] = useState<Promo | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // ── Config (get-or-create) + suscripción a promos + comentarios ──
  useEffect(() => {
    getOrCreateConfig(db).catch(() => { /* si falla, el listener igual intentará leer */ });
    const qy = query(collection(db, "requests"), where("board", "in", ["promo", "promo_config"]));
    const unsub = onSnapshot(qy, (snap) => {
      const ps: Promo[] = [];
      let cfg: PromoConfig | null = null;
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.board === "promo") ps.push(promoFromDoc(d.id, data));
        else if (data.board === "promo_config") cfg = configFromDoc(d.id, data);
      });
      ps.sort((a, b) => (b.createdAt || b.id).localeCompare(a.createdAt || a.id));
      setPromos(ps);
      setConfig(cfg);
    }, (err) => console.warn("[promo] listener:", err));
    return () => unsub();
  }, []);

  const publicUrl = config ? `${typeof window !== "undefined" ? window.location.origin : ""}/p/${config.shareCode}` : "";

  const copyLink = async () => {
    if (!publicUrl) return;
    try { await navigator.clipboard.writeText(publicUrl); addToast("Link copiado. Compártelo con la empresa externa.", "success"); }
    catch { addToast(publicUrl, "info"); }
  };

  // ── Subida de archivo a Storage (con respaldo data URL para imágenes) ──
  const uploadFile = async (file: File): Promise<{ url: string; type: Promo["fileType"] } | null> => {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED.includes(ext)) { addToast(`Formato no permitido (usa imágenes, PDF, video o carpetas .rar/.zip).`, "error"); return null; }
    if (file.size > MAX_BYTES) { addToast("El archivo supera 150 MB.", "error"); return null; }
    const type = fileTypeOf(file.name);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    addToast(`Subiendo "${safeName}"…`, "info");
    try {
      const storageRef = ref(storage, `promos/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${safeName}`);
      // Timeout amplio: las carpetas comprimidas pueden pesar bastante.
      const snap = await Promise.race([
        uploadBytes(storageRef, file),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 120000)),
      ]);
      const url = await getDownloadURL(snap.ref);
      return { url, type };
    } catch (err) {
      console.warn("[promo] Storage falló:", err);
      // Respaldo solo para imágenes: data URL en Firestore.
      if (type === "image") {
        try {
          const dataUrl = await compressImageToDataUrl(file, { maxDimension: 1800, maxBytes: 700 * 1024 });
          addToast("Storage no respondió; imagen guardada en modo emergencia.", "info");
          return { url: dataUrl, type };
        } catch { /* cae abajo */ }
      }
      addToast(`No se pudo subir "${safeName}". Para PDF, video o carpetas (.rar/.zip) debe estar activo Firebase Storage.`, "error");
      return null;
    }
  };

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    let ok = 0;
    try {
      for (const file of files) {
        const up = await uploadFile(file);
        if (!up) continue;
        await createPromo(db, {
          title: file.name.replace(/\.[^.]+$/, ""),
          description: "",
          fileUrl: up.url, fileName: file.name, fileType: up.type,
          uploadedBy: userName,
        });
        ok++;
      }
      if (ok > 0) addToast(`${ok} promocional${ok > 1 ? "es" : ""} subido${ok > 1 ? "s" : ""}.`, "success");
    } finally { setUploading(false); }
  };

  const handleReupload = async (promo: Promo, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const up = await uploadFile(file);
      if (!up) return;
      await updatePromo(db, promo.id, { fileUrl: up.url, fileName: file.name, fileType: up.type });
      addToast("Promocional actualizado con el nuevo archivo.", "success");
    } finally { setUploading(false); }
  };

  const handleDelete = async (promo: Promo) => {
    if (!confirm(`¿Eliminar "${promo.title}"? Esta acción no se puede deshacer.`)) return;
    try { await deletePromo(db, promo.id); addToast("Promocional eliminado.", "info"); }
    catch { addToast("No se pudo eliminar.", "error"); }
  };

  const openEdit = (p: Promo) => { setEditing(p); setEditTitle(p.title); setEditDesc(p.description); };
  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      await updatePromo(db, editing.id, { title: editTitle, description: editDesc });
      setEditing(null);
      addToast("Cambios guardados.", "success");
    } catch { addToast("No se pudo guardar.", "error"); }
    finally { setSavingEdit(false); }
  };

  const download = (p: Promo) => {
    // Seguridad: solo esquemas seguros. Evita ejecución de `javascript:` u otros
    // esquemas si el fileUrl fuera manipulado.
    if (!/^https:\/\//i.test(p.fileUrl) && !/^data:(image|video|application)\//i.test(p.fileUrl)) {
      addToast("Archivo no válido.", "error"); return;
    }
    const a = document.createElement("a");
    a.href = p.fileUrl; a.download = p.fileName || p.title; a.target = "_blank"; a.rel = "noreferrer";
    document.body.appendChild(a); a.click(); a.remove();
  };

  const sendGeneral = async () => {
    if (!generalInput.trim() || !config) return;
    const text = generalInput.trim(); setGeneralInput("");
    try { await addGeneralComment(db, config.id, buildComment(userName, text, "app")); }
    catch { setGeneralInput(text); addToast("No se pudo enviar el comentario.", "error"); }
  };

  const sendComment = async (promoId: string) => {
    const text = (commentInputs[promoId] || "").trim();
    if (!text) return;
    setCommentInputs(s => ({ ...s, [promoId]: "" }));
    try { await addPromoComment(db, promoId, buildComment(userName, text, "app")); }
    catch { setCommentInputs(s => ({ ...s, [promoId]: text })); addToast("No se pudo enviar el comentario.", "error"); }
  };

  return (
    <div>
      {/* Encabezado */}
      <div className="card" style={{ padding: "16px 18px", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "17px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
            <Megaphone size={18} color="var(--accent-color)" /> Promocionales ({promos.length})
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
            Piezas para la empresa externa. Compártelas con un enlace de solo lectura (ver, descargar y comentar, sin cuenta).
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn-secondary" style={{ padding: "9px 14px", fontSize: "13px", borderRadius: "10px", cursor: "pointer" }} onClick={copyLink} disabled={!config}>
            <Copy size={15} /> Copiar link público
          </button>
          {config && (
            <a href={publicUrl} target="_blank" rel="noreferrer" className="btn-secondary" style={{ padding: "9px 12px", fontSize: "13px", borderRadius: "10px", display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
              <ExternalLink size={15} />
            </a>
          )}
          {canManage && (
            <label className="btn" style={{ padding: "9px 14px", fontSize: "13px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {uploading ? <Loader2 size={15} className="spin" /> : <UploadCloud size={15} />} Subir promocional
              <input type="file" multiple accept={ACCEPT_ATTR} style={{ display: "none" }} onChange={handleUpload} disabled={uploading} />
            </label>
          )}
        </div>
      </div>

      {/* Comentarios generales */}
      <div className="card" style={{ padding: "16px", marginBottom: "16px" }}>
        <h4 style={{ margin: "0 0 10px", fontSize: "14px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
          <MessageSquare size={15} color="var(--accent-color)" /> Comentarios generales
        </h4>
        <CommentList messages={config?.generalMessages || []} emptyText="Sin comentarios generales aún." />
        <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
          <input value={generalInput} onChange={e => setGeneralInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendGeneral()}
            placeholder="Escribe un comentario general…" style={{ fontSize: "13px", flex: 1 }} disabled={!config} />
          <button className="btn" style={{ padding: "10px" }} onClick={sendGeneral} disabled={!config}><Send size={16} /></button>
        </div>
      </div>

      {/* Grid de promocionales */}
      {promos.length === 0 ? (
        <div className="card" style={{ padding: "50px", textAlign: "center", color: "var(--text-muted)" }}>
          <Megaphone size={40} style={{ opacity: 0.35, marginBottom: "10px" }} />
          <p>Aún no hay promocionales. {canManage ? "Sube el primero con el botón de arriba." : "El equipo de diseño los subirá pronto."}</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
          {promos.map(p => (
            <div key={p.id} className="card" style={{ padding: "0", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <PromoPreview promo={p} />
              <div style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", wordBreak: "break-word" }}>{p.title}</div>
                {p.description && <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{p.description}</div>}
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Subido por {p.uploadedBy || "—"}</div>

                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                  <button className="btn-secondary" style={{ padding: "7px 12px", fontSize: "12px", borderRadius: "9px", cursor: "pointer" }} onClick={() => download(p)}>
                    <Download size={13} /> Descargar
                  </button>
                  <button className="btn-secondary" style={{ padding: "7px 12px", fontSize: "12px", borderRadius: "9px", cursor: "pointer" }}
                    onClick={() => setOpenComments(s => ({ ...s, [p.id]: !s[p.id] }))}>
                    <MessageSquare size={13} /> Comentarios ({p.messages.length})
                  </button>
                  {canManage && (
                    <>
                      <button className="btn-secondary" title="Editar" style={{ padding: "7px 10px", fontSize: "12px", borderRadius: "9px", cursor: "pointer" }} onClick={() => openEdit(p)}>
                        <Pencil size={13} />
                      </button>
                      <label className="btn-secondary" title="Re-subir archivo" style={{ padding: "7px 10px", fontSize: "12px", borderRadius: "9px", cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
                        <RefreshCw size={13} />
                        <input type="file" accept={ACCEPT_ATTR} style={{ display: "none" }} onChange={(e) => handleReupload(p, e)} disabled={uploading} />
                      </label>
                      <button className="btn-danger" title="Eliminar" style={{ padding: "7px 10px", fontSize: "12px", borderRadius: "9px", cursor: "pointer" }} onClick={() => handleDelete(p)}>
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>

                {openComments[p.id] && (
                  <div style={{ marginTop: "8px", borderTop: "1px solid var(--border-color)", paddingTop: "10px" }}>
                    <CommentList messages={p.messages} emptyText="Sin comentarios en esta pieza." />
                    <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                      <input value={commentInputs[p.id] || ""} onChange={e => setCommentInputs(s => ({ ...s, [p.id]: e.target.value }))}
                        onKeyDown={e => e.key === "Enter" && sendComment(p.id)} placeholder="Comentario / cambio requerido…" style={{ fontSize: "12px", flex: 1 }} />
                      <button className="btn" style={{ padding: "8px" }} onClick={() => sendComment(p.id)}><Send size={14} /></button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal editar */}
      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "16px" }} onClick={() => setEditing(null)}>
          <div className="card" style={{ width: "480px", maxWidth: "100%", padding: "24px" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "18px", margin: 0, color: "var(--text-primary)" }}>Editar promocional</h2>
              <X size={22} style={{ cursor: "pointer", color: "var(--text-secondary)" }} onClick={() => setEditing(null)} />
            </div>
            <div className="form-group">
              <label className="label">Título</label>
              <input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Descripción</label>
              <textarea rows={3} value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Notas o contexto de la pieza…" />
            </div>
            <button className="btn" disabled={savingEdit} style={{ width: "100%", padding: "12px" }} onClick={saveEdit}>
              {savingEdit ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────
function PromoPreview({ promo }: { promo: Promo }) {
  const H = "170px";
  if (promo.fileType === "image") {
    return <img src={promo.fileUrl} alt={promo.title} style={{ width: "100%", height: H, objectFit: "cover", display: "block", background: "var(--surface-2)" }} />;
  }
  if (promo.fileType === "video") {
    return <video src={promo.fileUrl} controls style={{ width: "100%", height: H, objectFit: "cover", display: "block", background: "#000" }} />;
  }
  const isArchive = promo.fileType === "archive";
  const Icon = isArchive ? FileArchive : promo.fileType === "pdf" ? FileText : ImageIcon;
  const ext = (promo.fileName.split(".").pop() || "").toUpperCase();
  return (
    <div style={{ width: "100%", height: H, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", background: "var(--surface-1)", color: "var(--text-secondary)" }}>
      <Icon size={40} />
      <span style={{ fontSize: "12px", textTransform: "uppercase", fontWeight: 700 }}>{isArchive ? `Carpeta ${ext}` : promo.fileType}</span>
    </div>
  );
}

export function CommentList({ messages, emptyText }: { messages: PromoComment[]; emptyText: string }) {
  if (!messages || messages.length === 0) {
    return <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>{emptyText}</p>;
  }
  const sorted = [...messages].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "220px", overflowY: "auto" }}>
      {sorted.map(m => (
        <div key={m.id} style={{ background: m.source === "public" ? "var(--warning-soft)" : "var(--surface-1)", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "8px 10px" }}>
          <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "3px" }}>
            <strong style={{ color: "var(--text-secondary)" }}>{m.authorName}</strong>
            {m.source === "public" && <span style={{ color: "var(--warning)", fontWeight: 700 }}> · empresa externa</span>}
            {m.createdAt && ` · ${new Date(m.createdAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}`}
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>
        </div>
      ))}
    </div>
  );
}
