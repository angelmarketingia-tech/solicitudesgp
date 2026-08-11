"use client";

/**
 * ─── Módulo "Promocionales" estilo Drive ────────────────────────────────────
 *
 * Reemplaza el Drive: carpetas anidadas (2026 → AGOSTO → País → Torneo → PC → …)
 * con archivos dentro. Lo ven TODOS; los DISEÑADORES crean carpetas, suben,
 * renombran, re-suben y borran. Enlace público permanente /p/<código> para la
 * empresa externa (ver, descargar y comentar sin cuenta).
 *
 * Almacenamiento: colección `requests`, discriminador `board` ('promo' /
 * 'promo_config'), jerarquía por `parentId`. Ver '@/lib/promo'.
 */

import React, { useState, useEffect, useMemo, ChangeEvent } from "react";
import {
  Megaphone, UploadCloud, Download, Trash2, Pencil, X, MessageSquare, Send,
  Copy, ExternalLink, FileText, Image as ImageIcon, RefreshCw, Loader2, FileArchive,
  Folder, FolderPlus, ChevronRight, Home, FolderInput, Link2,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { publicLink } from "@/lib/public-url";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { compressImageToDataUrl } from "@/lib/image";
import { uploadToStorage, storageErrorMessage } from "@/lib/storage-upload";
import {
  PromoItem, PromoComment, PromoConfig, PROMO_ROOT,
  itemFromDoc, configFromDoc, fileTypeOf, getOrCreateConfig, sortItems, breadcrumb, descendantIds,
  createFolder, createFile, renamePromoItem, replacePromoFile, deletePromoDoc,
  addPromoComment, addGeneralComment, buildComment, movePromoItem, folderChoices,
  ensureFolderShareCode,
} from "@/lib/promo";

type Toast = (msg: string, type?: "success" | "error" | "info") => void;
type Props = { role: string | null; userName: string; addToast: Toast };

const MAX_BYTES = 150 * 1024 * 1024; // 150 MB
const ALLOWED = ["jpg", "jpeg", "png", "webp", "gif", "pdf", "mp4", "mov", "webm", "rar", "zip", "7z", "tar", "gz"];
const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,.gif,.pdf,.mp4,.mov,.webm,.rar,.zip,.7z,.tar,.gz";

export default function PromoModule({ role, userName, addToast }: Props) {
  const canManage = role === "designer";

  const [items, setItems] = useState<PromoItem[]>([]);
  const [config, setConfig] = useState<PromoConfig | null>(null);
  const [currentId, setCurrentId] = useState<string>(PROMO_ROOT);
  const [uploading, setUploading] = useState(false);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renaming, setRenaming] = useState<PromoItem | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [moving, setMoving] = useState<PromoItem | null>(null);

  const [generalInput, setGeneralInput] = useState("");
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});

  useEffect(() => {
    getOrCreateConfig(db).catch(() => { /* el listener igual leerá */ });
    const qy = query(collection(db, "requests"), where("board", "in", ["promo", "promo_config"]));
    const unsub = onSnapshot(qy, (snap) => {
      const its: PromoItem[] = [];
      let cfg: PromoConfig | null = null;
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.board === "promo") its.push(itemFromDoc(d.id, data));
        else if (data.board === "promo_config") cfg = configFromDoc(d.id, data);
      });
      setItems(its);
      setConfig(cfg);
    }, (err) => console.warn("[promo] listener:", err));
    return () => unsub();
  }, []);

  // Si la carpeta actual dejó de existir (fue borrada), vuelve a la raíz.
  useEffect(() => {
    if (currentId !== PROMO_ROOT && !items.some(i => i.id === currentId)) setCurrentId(PROMO_ROOT);
  }, [items, currentId]);

  const crumbs = useMemo(() => breadcrumb(items, currentId), [items, currentId]);
  const children = useMemo(() => sortItems(items.filter(i => i.parentId === currentId)), [items, currentId]);
  const folders = children.filter(i => i.kind === "folder");
  const files = children.filter(i => i.kind === "file");

  const publicUrl = config ? publicLink(`/p/${config.shareCode}`) : "";
  const copyLink = async () => {
    if (!publicUrl) return;
    try { await navigator.clipboard.writeText(publicUrl); addToast("Link copiado. Compártelo con la empresa externa.", "success"); }
    catch { addToast(publicUrl, "info"); }
  };
  // Link único de UNA carpeta: muestra solo esa carpeta y sus subcarpetas.
  const copyFolderLink = async (folder: PromoItem) => {
    try {
      const code = await ensureFolderShareCode(db, folder);
      const url = publicLink(`/p/${code}`);
      try { await navigator.clipboard.writeText(url); addToast(`Link de "${folder.name}" copiado.`, "success"); }
      catch { addToast(url, "info"); }
    } catch { addToast("No se pudo generar el link de la carpeta.", "error"); }
  };

  // ── Subida ──
  const uploadFile = async (file: File): Promise<{ url: string; type: NonNullable<PromoItem["fileType"]> } | null> => {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED.includes(ext)) { addToast("Formato no permitido (imágenes, PDF, video o carpetas .rar/.zip).", "error"); return null; }
    if (file.size > MAX_BYTES) { addToast("El archivo supera 150 MB.", "error"); return null; }
    const type = fileTypeOf(file.name);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    addToast(`Subiendo "${safeName}"…`, "info");
    try {
      // Ruta bajo `creatives/` (permitida por las reglas de Storage, la misma
      // de los entregables). La carpeta `promos/` estaba bloqueada por reglas.
      const url = await uploadToStorage("creatives/_promos", file);
      return { url, type };
    } catch (err) {
      console.warn("[promo] Storage falló:", err);
      if (type === "image") {
        try {
          const dataUrl = await compressImageToDataUrl(file, { maxDimension: 1800, maxBytes: 700 * 1024 });
          addToast("Storage no respondió; imagen guardada en modo emergencia.", "info");
          return { url: dataUrl, type };
        } catch { /* cae abajo */ }
      }
      addToast(`No se pudo subir "${safeName}". ${storageErrorMessage(err)}`, "error");
      return null;
    }
  };

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    e.target.value = "";
    if (list.length === 0) return;
    setUploading(true);
    let ok = 0;
    try {
      for (const file of list) {
        const up = await uploadFile(file);
        if (!up) continue;
        await createFile(db, currentId, { name: file.name.replace(/\.[^.]+$/, ""), fileUrl: up.url, fileName: file.name, fileType: up.type, uploadedBy: userName });
        ok++;
      }
      if (ok > 0) addToast(`${ok} archivo${ok > 1 ? "s" : ""} subido${ok > 1 ? "s" : ""}.`, "success");
    } finally { setUploading(false); }
  };

  const handleReupload = async (item: PromoItem, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const up = await uploadFile(file);
      if (!up) return;
      await replacePromoFile(db, item.id, { fileUrl: up.url, fileName: file.name, fileType: up.type });
      addToast("Archivo reemplazado.", "success");
    } finally { setUploading(false); }
  };

  const handleNewFolder = async () => {
    if (!newFolderName.trim()) { addToast("Escribe el nombre de la carpeta.", "error"); return; }
    try {
      await createFolder(db, currentId, newFolderName, userName);
      setNewFolderName(""); setNewFolderOpen(false);
      addToast("Carpeta creada.", "success");
    } catch { addToast("No se pudo crear la carpeta.", "error"); }
  };

  const handleDelete = async (item: PromoItem) => {
    if (item.kind === "folder") {
      const kids = descendantIds(items, item.id);
      if (!confirm(`¿Eliminar la carpeta "${item.name}"?${kids.length ? ` Incluye ${kids.length} elemento(s) dentro.` : ""}`)) return;
      try {
        await Promise.all(kids.map(id => deletePromoDoc(db, id).catch(() => undefined)));
        await deletePromoDoc(db, item.id);
        addToast("Carpeta eliminada.", "info");
      } catch { addToast("No se pudo eliminar la carpeta.", "error"); }
    } else {
      if (!confirm(`¿Eliminar "${item.name}"?`)) return;
      try { await deletePromoDoc(db, item.id); addToast("Archivo eliminado.", "info"); }
      catch { addToast("No se pudo eliminar.", "error"); }
    }
  };

  const saveRename = async () => {
    if (!renaming) return;
    try { await renamePromoItem(db, renaming.id, renameVal); setRenaming(null); addToast("Nombre actualizado.", "success"); }
    catch { addToast("No se pudo renombrar.", "error"); }
  };

  const doMove = async (destId: string) => {
    if (!moving) return;
    if (destId === moving.parentId) { setMoving(null); return; }
    try { await movePromoItem(db, moving.id, destId); setMoving(null); addToast("Movido correctamente.", "success"); }
    catch { addToast("No se pudo mover.", "error"); }
  };
  // Destinos válidos: todas las carpetas menos la propia y su descendencia.
  const moveExclude = useMemo(() => {
    if (!moving) return new Set<string>();
    return new Set<string>(moving.kind === "folder" ? [moving.id, ...descendantIds(items, moving.id)] : []);
  }, [moving, items]);
  const moveTargets = useMemo(() => (moving ? folderChoices(items, moveExclude) : []), [moving, items, moveExclude]);

  const download = (item: PromoItem) => {
    if (!item.fileUrl) return;
    if (!/^https:\/\//i.test(item.fileUrl) && !/^data:(image|video|application)\//i.test(item.fileUrl)) {
      addToast("Archivo no válido.", "error"); return;
    }
    const a = document.createElement("a");
    a.href = item.fileUrl; a.download = item.fileName || item.name; a.target = "_blank"; a.rel = "noreferrer";
    document.body.appendChild(a); a.click(); a.remove();
  };

  const sendGeneral = async () => {
    if (!generalInput.trim() || !config) return;
    const text = generalInput.trim(); setGeneralInput("");
    try { await addGeneralComment(db, config.id, buildComment(userName, text, "app")); }
    catch { setGeneralInput(text); addToast("No se pudo enviar el comentario.", "error"); }
  };
  const sendComment = async (id: string) => {
    const text = (commentInputs[id] || "").trim();
    if (!text) return;
    setCommentInputs(s => ({ ...s, [id]: "" }));
    try { await addPromoComment(db, id, buildComment(userName, text, "app")); }
    catch { setCommentInputs(s => ({ ...s, [id]: text })); addToast("No se pudo enviar el comentario.", "error"); }
  };

  return (
    <div>
      {/* Encabezado */}
      <div className="card" style={{ padding: "16px 18px", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "17px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
            <Megaphone size={18} color="var(--accent-color)" /> Promocionales
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
            Carpetas y archivos para la empresa externa. Compártelas con un enlace de solo lectura (ver, descargar y comentar, sin cuenta).
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
            <>
              <button className="btn-secondary" style={{ padding: "9px 14px", fontSize: "13px", borderRadius: "10px", cursor: "pointer" }} onClick={() => { setNewFolderOpen(true); setNewFolderName(""); }}>
                <FolderPlus size={15} /> Nueva carpeta
              </button>
              <label className="btn" style={{ padding: "9px 14px", fontSize: "13px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                {uploading ? <Loader2 size={15} className="spin" /> : <UploadCloud size={15} />} Subir archivos
                <input type="file" multiple accept={ACCEPT_ATTR} style={{ display: "none" }} onChange={handleUpload} disabled={uploading} />
              </label>
            </>
          )}
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="card" style={{ padding: "10px 14px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap", fontSize: "13px" }}>
        <span onClick={() => setCurrentId(PROMO_ROOT)} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px", color: currentId === PROMO_ROOT ? "var(--text-primary)" : "var(--accent-color)", fontWeight: 700 }}>
          <Home size={14} /> Promocionales
        </span>
        {crumbs.map((c) => (
          <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <ChevronRight size={14} color="var(--text-muted)" />
            <span onClick={() => setCurrentId(c.id)} style={{ cursor: "pointer", color: c.id === currentId ? "var(--text-primary)" : "var(--accent-color)", fontWeight: c.id === currentId ? 700 : 600 }}>{c.name}</span>
          </span>
        ))}
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

      {/* Contenido de la carpeta */}
      {children.length === 0 ? (
        <div className="card" style={{ padding: "50px", textAlign: "center", color: "var(--text-muted)" }}>
          <Folder size={40} style={{ opacity: 0.35, marginBottom: "10px" }} />
          <p>Esta carpeta está vacía. {canManage ? "Crea una subcarpeta o sube archivos." : "El equipo de diseño la llenará pronto."}</p>
        </div>
      ) : (
        <>
          {/* Carpetas */}
          {folders.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px", marginBottom: files.length ? "20px" : 0 }}>
              {folders.map(f => (
                <div key={f.id} className="card" style={{ padding: "14px", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }} onClick={() => setCurrentId(f.id)}>
                  <Folder size={26} color="var(--accent-color)" style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{items.filter(i => i.parentId === f.id).length} elemento(s)</div>
                  </div>
                  <div style={{ display: "flex", gap: "4px", flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button className="btn-secondary" title="Copiar link solo de esta carpeta" style={{ padding: "6px", borderRadius: "8px", cursor: "pointer" }} onClick={() => copyFolderLink(f)}><Link2 size={13} /></button>
                    {canManage && (
                      <>
                        <button className="btn-secondary" title="Mover" style={{ padding: "6px", borderRadius: "8px", cursor: "pointer" }} onClick={() => setMoving(f)}><FolderInput size={13} /></button>
                        <button className="btn-secondary" title="Renombrar" style={{ padding: "6px", borderRadius: "8px", cursor: "pointer" }} onClick={() => { setRenaming(f); setRenameVal(f.name); }}><Pencil size={13} /></button>
                        <button className="btn-danger" title="Eliminar" style={{ padding: "6px", borderRadius: "8px", cursor: "pointer" }} onClick={() => handleDelete(f)}><Trash2 size={13} /></button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Archivos */}
          {files.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
              {files.map(p => (
                <div key={p.id} className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <FilePreview item={p} />
                  <div style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", wordBreak: "break-word" }}>{p.name}</div>
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
                          <button className="btn-secondary" title="Mover" style={{ padding: "7px 10px", fontSize: "12px", borderRadius: "9px", cursor: "pointer" }} onClick={() => setMoving(p)}><FolderInput size={13} /></button>
                          <button className="btn-secondary" title="Renombrar" style={{ padding: "7px 10px", fontSize: "12px", borderRadius: "9px", cursor: "pointer" }} onClick={() => { setRenaming(p); setRenameVal(p.name); }}><Pencil size={13} /></button>
                          <label className="btn-secondary" title="Reemplazar archivo" style={{ padding: "7px 10px", fontSize: "12px", borderRadius: "9px", cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
                            <RefreshCw size={13} />
                            <input type="file" accept={ACCEPT_ATTR} style={{ display: "none" }} onChange={(e) => handleReupload(p, e)} disabled={uploading} />
                          </label>
                          <button className="btn-danger" title="Eliminar" style={{ padding: "7px 10px", fontSize: "12px", borderRadius: "9px", cursor: "pointer" }} onClick={() => handleDelete(p)}><Trash2 size={13} /></button>
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
        </>
      )}

      {/* Modal nueva carpeta */}
      {newFolderOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "16px" }} onClick={() => setNewFolderOpen(false)}>
          <div className="card" style={{ width: "420px", maxWidth: "100%", padding: "24px" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "18px", margin: 0, color: "var(--text-primary)" }}>Nueva carpeta</h2>
              <X size={22} style={{ cursor: "pointer", color: "var(--text-secondary)" }} onClick={() => setNewFolderOpen(false)} />
            </div>
            <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleNewFolder()}
              placeholder="Ej. EL SALVADOR, TORNEO DORADO, PC…" style={{ marginBottom: "16px" }} />
            <button className="btn" style={{ width: "100%", padding: "12px" }} onClick={handleNewFolder}><FolderPlus size={16} /> Crear carpeta</button>
          </div>
        </div>
      )}

      {/* Modal renombrar */}
      {renaming && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "16px" }} onClick={() => setRenaming(null)}>
          <div className="card" style={{ width: "420px", maxWidth: "100%", padding: "24px" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "18px", margin: 0, color: "var(--text-primary)" }}>Renombrar {renaming.kind === "folder" ? "carpeta" : "archivo"}</h2>
              <X size={22} style={{ cursor: "pointer", color: "var(--text-secondary)" }} onClick={() => setRenaming(null)} />
            </div>
            <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)} onKeyDown={e => e.key === "Enter" && saveRename()} style={{ marginBottom: "16px" }} />
            <button className="btn" style={{ width: "100%", padding: "12px" }} onClick={saveRename}>Guardar</button>
          </div>
        </div>
      )}

      {/* Modal mover */}
      {moving && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "16px" }} onClick={() => setMoving(null)}>
          <div className="card" style={{ width: "480px", maxWidth: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column", padding: "24px" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <h2 style={{ fontSize: "18px", margin: 0, color: "var(--text-primary)" }}>Mover «{moving.name}»</h2>
              <X size={22} style={{ cursor: "pointer", color: "var(--text-secondary)" }} onClick={() => setMoving(null)} />
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "0 0 14px" }}>Elige la carpeta destino:</p>
            <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
              <button className="btn-secondary" style={{ textAlign: "left", padding: "9px 12px", fontSize: "13px", borderRadius: "9px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", opacity: moving.parentId === PROMO_ROOT ? 0.5 : 1 }}
                disabled={moving.parentId === PROMO_ROOT} onClick={() => doMove(PROMO_ROOT)}>
                <Home size={14} /> Raíz (Promocionales){moving.parentId === PROMO_ROOT ? " · aquí está" : ""}
              </button>
              {moveTargets.map(({ folder, depth }) => (
                <button key={folder.id} className="btn-secondary"
                  style={{ textAlign: "left", padding: "9px 12px", paddingLeft: `${12 + depth * 18}px`, fontSize: "13px", borderRadius: "9px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", opacity: moving.parentId === folder.id ? 0.5 : 1 }}
                  disabled={moving.parentId === folder.id} onClick={() => doMove(folder.id)}>
                  <Folder size={14} color="var(--accent-color)" /> {folder.name}{moving.parentId === folder.id ? " · aquí está" : ""}
                </button>
              ))}
              {moveTargets.length === 0 && (
                <p style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center", padding: "12px" }}>No hay otras carpetas. Muévelo a la raíz o crea carpetas primero.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────
export function FilePreview({ item }: { item: PromoItem }) {
  const H = "170px";
  if (item.fileType === "image" && item.fileUrl) {
    return <img src={item.fileUrl} alt={item.name} style={{ width: "100%", height: H, objectFit: "cover", display: "block", background: "var(--surface-2)" }} />;
  }
  if (item.fileType === "video" && item.fileUrl) {
    return <video src={item.fileUrl} controls style={{ width: "100%", height: H, objectFit: "cover", display: "block", background: "#000" }} />;
  }
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
