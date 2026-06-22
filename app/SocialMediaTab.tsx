"use client";

/**
 * ─── Pestaña "Redes Sociales" ──────────────────────────────────────────────
 *
 * Módulo AISLADO y autocontenido. No modifica ni depende del resto de la app
 * más allá de:
 *   - `db` / `storage` de '@/lib/firebase' (ya configurados)
 *   - props `role` y `userName` (para permisos y autoría)
 *   - prop `addToast` (para mensajes, reusa el sistema existente)
 *
 * Qué hace:
 *   - Calendario mensual interactivo. Clic en un día → abre ese día.
 *   - Dentro de cada día: carpetas (estilo Drive) + archivos.
 *   - Subida de archivos diaria, con soporte de VIDEOS (hasta 150 MB) e imágenes.
 *   - Solo el rol 'designer' sube / crea carpetas / borra. Todos ven y descargan.
 *
 * Almacenamiento:
 *   - Archivos binarios → Firebase Storage en `social-media/{YYYY-MM-DD}/...`
 *   - Metadatos → Firestore, colección `social_media` (un doc por archivo o carpeta)
 *
 * Requiere añadir la colección `social_media` a firestore.rules (ver ese archivo).
 */

import React, { useState, useEffect, useMemo, useRef, ChangeEvent, useCallback } from "react";
import {
  Calendar, ChevronLeft, ChevronRight, Folder, FolderPlus, UploadCloud,
  Film, Image as ImageIcon, FileText, Download, Trash2, X, ArrowLeft, Loader2,
} from "lucide-react";
import { db, storage } from "@/lib/firebase";
import {
  collection, doc, onSnapshot, addDoc, deleteDoc, query, where,
  serverTimestamp, getDocs,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";

// ─── Tipos ──────────────────────────────────────────────────────────────────
type SocialItem = {
  id: string;
  date: string;            // "YYYY-MM-DD"
  kind: "folder" | "file"; // carpeta o archivo
  folder: string;          // ruta de carpeta donde vive ("" = raíz del día)
  name: string;            // nombre de carpeta o de archivo
  url?: string;            // download URL (solo file)
  storagePath?: string;    // ruta en Storage (solo file, para poder borrar)
  fileKind?: "video" | "image" | "other";
  size?: number;           // bytes (solo file)
  uploadedBy?: string;
};

const MAX_VIDEO_BYTES = 150 * 1024 * 1024; // 150 MB
const MAX_OTHER_BYTES = 50 * 1024 * 1024;  // 50 MB para imágenes/otros

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DOW_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// ─── Helpers de fecha (sin libs externas) ────────────────────────────────────
function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function ymd(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

function fileKindOf(name: string): "video" | "image" | "other" {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["mp4", "mov", "webm", "avi", "mkv", "m4v"].includes(ext)) return "video";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  return "other";
}
function humanSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ToastFn = (msg: string, type?: "success" | "error" | "info") => void;

export default function SocialMediaTab({
  role,
  userName,
  addToast,
}: {
  role: string | null;
  userName: string;
  addToast: ToastFn;
}) {
  const canManage = role === "designer"; // diseñadores suben; todos ven
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-11
  const [openDay, setOpenDay] = useState<string | null>(null);  // "YYYY-MM-DD" o null
  const [currentFolder, setCurrentFolder] = useState<string>(""); // ruta dentro del día
  const [items, setItems] = useState<SocialItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [preview, setPreview] = useState<SocialItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Suscripción en vivo a TODOS los items (para pintar puntos en el calendario)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "social_media"), (snap) => {
      const list: SocialItem[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<SocialItem, "id">) }));
      setItems(list);
    });
    return () => unsub();
  }, []);

  // ── Días del mes con contenido (para mostrar indicador) ──
  const daysWithContent = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) if (it.kind === "file") set.add(it.date);
    return set;
  }, [items]);

  // ── Items del día y carpeta abiertos ──
  const visibleItems = useMemo(() => {
    if (!openDay) return [];
    return items
      .filter((it) => it.date === openDay && (it.folder || "") === currentFolder)
      .sort((a, b) => {
        // carpetas primero, luego archivos; ambos alfabéticos
        if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [items, openDay, currentFolder]);

  // ── Calendario: matriz de semanas ──
  const calendarCells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    // getDay(): 0=Dom..6=Sáb → queremos Lun=0
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const goPrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const goNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  // ── Crear carpeta ──
  const createFolder = async () => {
    if (!canManage || !openDay) return;
    const name = window.prompt("Nombre de la nueva carpeta:");
    if (!name || !name.trim()) return;
    const clean = name.trim().slice(0, 80);
    // Evitar duplicado en el mismo nivel
    const exists = items.some(
      (it) => it.kind === "folder" && it.date === openDay &&
        (it.folder || "") === currentFolder && it.name === clean
    );
    if (exists) { addToast("Ya existe una carpeta con ese nombre aquí.", "error"); return; }
    try {
      await addDoc(collection(db, "social_media"), {
        date: openDay, kind: "folder", folder: currentFolder, name: clean,
        uploadedBy: userName, createdAt: serverTimestamp(),
      });
      addToast(`Carpeta "${clean}" creada.`, "success");
    } catch (e) {
      addToast("No se pudo crear la carpeta: " + (e instanceof Error ? e.message : ""), "error");
    }
  };

  // ── Subir archivos (uno o varios) ──
  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!canManage || !openDay || files.length === 0) return;

    setUploading(true);
    let ok = 0, fail = 0;
    for (const file of files) {
      const fk = fileKindOf(file.name);
      const limit = fk === "video" ? MAX_VIDEO_BYTES : MAX_OTHER_BYTES;
      if (file.size > limit) {
        addToast(`"${file.name}" supera el límite (${fk === "video" ? "150" : "50"} MB).`, "error");
        fail++; continue;
      }
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const folderSeg = currentFolder ? `${currentFolder}/` : "";
      const storagePath = `social-media/${openDay}/${folderSeg}${Date.now()}_${safe}`;
      try {
        setUploadPct(0);
        const task = uploadBytesResumable(ref(storage, storagePath), file);
        await new Promise<void>((resolve, reject) => {
          task.on(
            "state_changed",
            (snap) => setUploadPct(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
            (err) => reject(err),
            () => resolve()
          );
        });
        const url = await getDownloadURL(task.snapshot.ref);
        await addDoc(collection(db, "social_media"), {
          date: openDay, kind: "file", folder: currentFolder, name: file.name,
          url, storagePath, fileKind: fk, size: file.size,
          uploadedBy: userName, createdAt: serverTimestamp(),
        });
        ok++;
      } catch (err) {
        console.error("[SocialMedia] upload error", err);
        const code = (err && typeof err === "object" && "code" in err) ? String((err as { code: string }).code) : "";
        addToast(
          `Error subiendo "${file.name}". ${code === "storage/unauthorized"
            ? "Storage rechazó la subida (revisar reglas de Storage)." : code || ""}`,
          "error"
        );
        fail++;
      }
    }
    setUploading(false);
    setUploadPct(0);
    if (ok > 0) addToast(`${ok} archivo(s) subido(s).`, "success");
    if (fail > 0 && ok === 0) addToast("No se subió ningún archivo.", "error");
  };

  // ── Borrar (carpeta con su contenido, o archivo) ──
  const removeItem = async (it: SocialItem) => {
    if (!canManage) return;
    if (it.kind === "folder") {
      const childPath = it.folder ? `${it.folder}/${it.name}` : it.name;
      if (!window.confirm(`¿Eliminar la carpeta "${it.name}" y TODO su contenido?`)) return;
      try {
        // Borrar todos los items que viven dentro de esta carpeta (en este día)
        const q = query(collection(db, "social_media"), where("date", "==", it.date));
        const snap = await getDocs(q);
        const toDelete: SocialItem[] = [];
        snap.forEach((d) => {
          const data = d.data() as Omit<SocialItem, "id">;
          const f = data.folder || "";
          if (f === childPath || f.startsWith(`${childPath}/`)) {
            toDelete.push({ id: d.id, ...data });
          }
        });
        // Borrar archivos en Storage de los hijos
        for (const child of toDelete) {
          if (child.kind === "file" && child.storagePath) {
            try { await deleteObject(ref(storage, child.storagePath)); } catch { /* ignore */ }
          }
          await deleteDoc(doc(db, "social_media", child.id));
        }
        await deleteDoc(doc(db, "social_media", it.id));
        addToast(`Carpeta "${it.name}" eliminada.`, "success");
      } catch (e) {
        addToast("No se pudo eliminar la carpeta: " + (e instanceof Error ? e.message : ""), "error");
      }
    } else {
      if (!window.confirm(`¿Eliminar el archivo "${it.name}"?`)) return;
      try {
        if (it.storagePath) { try { await deleteObject(ref(storage, it.storagePath)); } catch { /* ignore */ } }
        await deleteDoc(doc(db, "social_media", it.id));
        addToast("Archivo eliminado.", "success");
      } catch (e) {
        addToast("No se pudo eliminar: " + (e instanceof Error ? e.message : ""), "error");
      }
    }
  };

  const downloadFile = useCallback((it: SocialItem) => {
    if (!it.url) return;
    const a = document.createElement("a");
    a.href = it.url; a.download = it.name; a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  }, []);

  // ── Navegación de carpetas (breadcrumb) ──
  const enterFolder = (it: SocialItem) => {
    setCurrentFolder(it.folder ? `${it.folder}/${it.name}` : it.name);
  };
  const folderCrumbs = currentFolder ? currentFolder.split("/") : [];
  const goToCrumb = (idx: number) => {
    setCurrentFolder(folderCrumbs.slice(0, idx + 1).join("/"));
  };

  const accent = "var(--accent-color)";
  const card = "var(--surface-1, #f7f8fa)";

  // ════════════════════ VISTA: CALENDARIO ════════════════════
  if (!openDay) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px", flexWrap: "wrap", gap: "12px" }}>
          <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "10px", fontSize: "18px", color: "var(--text-primary)" }}>
            <Calendar size={20} color={accent} /> Calendario de Redes Sociales
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button onClick={goPrevMonth} style={navBtn} title="Mes anterior" aria-label="Mes anterior"><ChevronLeft size={18} /></button>
            <div data-testid="sm-month-label" style={{ fontWeight: 700, minWidth: "150px", textAlign: "center", color: "var(--text-primary)" }}>
              {MONTHS_ES[viewMonth]} {viewYear}
            </div>
            <button onClick={goNextMonth} style={navBtn} title="Mes siguiente" aria-label="Mes siguiente"><ChevronRight size={18} /></button>
          </div>
        </div>

        {!canManage && (
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>
            Modo solo lectura — puedes ver y descargar. La subida está habilitada para el equipo de diseño.
          </div>
        )}

        {/* Encabezado días de la semana */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "8px", marginBottom: "8px" }}>
          {DOW_ES.map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{d}</div>
          ))}
        </div>

        {/* Celdas */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "8px" }}>
          {calendarCells.map((d, i) => {
            if (d === null) return <div key={i} />;
            const dateStr = ymd(viewYear, viewMonth, d);
            const isToday = dateStr === ymd(today.getFullYear(), today.getMonth(), today.getDate());
            const hasContent = daysWithContent.has(dateStr);
            const count = items.filter((it) => it.kind === "file" && it.date === dateStr).length;
            return (
              <button
                key={i}
                onClick={() => { setOpenDay(dateStr); setCurrentFolder(""); }}
                style={{
                  minHeight: "78px", borderRadius: "12px", cursor: "pointer", textAlign: "left",
                  padding: "8px 10px", display: "flex", flexDirection: "column", justifyContent: "space-between",
                  background: hasContent ? "var(--accent-soft, #e6f2ec)" : card,
                  border: isToday ? `2px solid ${accent}` : "1px solid var(--border-color)",
                  transition: "transform .08s ease",
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                <span style={{ fontWeight: 700, fontSize: "14px", color: isToday ? accent : "var(--text-primary)" }}>{d}</span>
                {hasContent && (
                  <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--accent-dark, #00783e)", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Film size={11} /> {count} archivo{count !== 1 ? "s" : ""}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ════════════════════ VISTA: DÍA ABIERTO (carpetas + archivos) ════════════════════
  const dayLabel = (() => {
    const [yy, mm, dd] = openDay.split("-").map(Number);
    return `${dd} de ${MONTHS_ES[mm - 1]} de ${yy}`;
  })();

  return (
    <div>
      {/* Cabecera del día + volver */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button onClick={() => { setOpenDay(null); setCurrentFolder(""); }} style={navBtn} title="Volver al calendario">
            <ArrowLeft size={18} />
          </button>
          <h3 style={{ margin: 0, fontSize: "18px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
            <Calendar size={18} color={accent} /> {dayLabel}
          </h3>
        </div>
        {canManage && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button onClick={createFolder} style={secondaryBtn} disabled={uploading}>
              <FolderPlus size={15} /> Nueva carpeta
            </button>
            <button onClick={() => fileInputRef.current?.click()} style={primaryBtn} disabled={uploading}>
              {uploading ? <Loader2 size={15} className="spin" /> : <UploadCloud size={15} />}
              {uploading ? ` Subiendo… ${uploadPct}%` : " Subir archivos"}
            </button>
            <input ref={fileInputRef} type="file" multiple accept="video/*,image/*" style={{ display: "none" }} onChange={handleUpload} />
          </div>
        )}
      </div>

      {/* Breadcrumb de carpetas */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "14px", fontSize: "13px", flexWrap: "wrap" }}>
        <button onClick={() => setCurrentFolder("")} style={crumbBtn(currentFolder === "")}>
          <Folder size={13} /> Inicio del día
        </button>
        {folderCrumbs.map((c, i) => (
          <React.Fragment key={i}>
            <ChevronRight size={13} color="var(--text-muted)" />
            <button onClick={() => goToCrumb(i)} style={crumbBtn(i === folderCrumbs.length - 1)}>{c}</button>
          </React.Fragment>
        ))}
      </div>

      {/* Barra de progreso de subida */}
      {uploading && (
        <div style={{ height: "6px", background: "var(--border-color)", borderRadius: "4px", marginBottom: "14px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${uploadPct}%`, background: accent, transition: "width .2s ease" }} />
        </div>
      )}

      {/* Grid de carpetas + archivos */}
      {visibleItems.length === 0 ? (
        <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--text-muted)", border: "2px dashed var(--border-color)", borderRadius: "14px" }}>
          <Folder size={40} color="var(--text-muted)" style={{ marginBottom: "10px", opacity: 0.5 }} />
          <div style={{ fontWeight: 600 }}>Esta carpeta está vacía</div>
          {canManage && <div style={{ fontSize: "13px", marginTop: "4px" }}>Sube archivos o crea una carpeta con los botones de arriba.</div>}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "14px" }}>
          {visibleItems.map((it) => (
            <div key={it.id} style={{ position: "relative", borderRadius: "14px", border: "1px solid var(--border-color)", background: card, overflow: "hidden" }}>
              {/* Botón borrar */}
              {canManage && (
                <button onClick={() => removeItem(it)} title="Eliminar"
                  style={{ position: "absolute", top: "8px", right: "8px", zIndex: 2, background: "var(--danger)", border: "none", borderRadius: "50%", width: "26px", height: "26px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <Trash2 size={13} color="#fff" />
                </button>
              )}

              {it.kind === "folder" ? (
                <button onClick={() => enterFolder(it)}
                  style={{ width: "100%", border: "none", background: "transparent", cursor: "pointer", padding: "26px 14px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                  <Folder size={46} color={accent} fill="var(--accent-soft, #e6f2ec)" />
                  <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)", textAlign: "center", wordBreak: "break-word" }}>{it.name}</span>
                </button>
              ) : (
                <>
                  <div onClick={() => setPreview(it)}
                    style={{ height: "120px", background: "#0d0d0d", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-in", position: "relative" }}>
                    {it.fileKind === "image" && it.url ? (
                      <img src={it.url} alt={it.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : it.fileKind === "video" && it.url ? (
                      <>
                        <video src={it.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted preload="metadata" />
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.25)" }}>
                          <Film size={34} color="#fff" />
                        </div>
                      </>
                    ) : (
                      <FileText size={40} color="#bbb" />
                    )}
                  </div>
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 600, fontSize: "12.5px", color: "var(--text-primary)", wordBreak: "break-word", marginBottom: "2px" }}>{it.name}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "6px" }}>
                      <span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>{humanSize(it.size)}</span>
                      <button onClick={() => downloadFile(it)} title="Descargar"
                        style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "var(--accent-dark, #00783e)", background: "var(--accent-soft, #e6f2ec)", border: "none", borderRadius: "7px", padding: "4px 9px", cursor: "pointer" }}>
                        <Download size={12} /> Descargar
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox / reproductor */}
      {preview && preview.url && (
        <div onClick={() => setPreview(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px" }}>
          <button onClick={() => setPreview(null)} style={{ position: "absolute", top: "20px", right: "20px", background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={20} color="#fff" />
          </button>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "85vh", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
            {preview.fileKind === "video" ? (
              <video src={preview.url} controls autoPlay style={{ maxWidth: "90vw", maxHeight: "78vh", borderRadius: "10px" }} />
            ) : preview.fileKind === "image" ? (
              <img src={preview.url} alt={preview.name} style={{ maxWidth: "90vw", maxHeight: "78vh", objectFit: "contain", borderRadius: "10px" }} />
            ) : (
              <div style={{ color: "#fff", padding: "40px" }}>Vista previa no disponible para este tipo de archivo.</div>
            )}
            <button onClick={() => downloadFile(preview)} style={{ ...primaryBtn, color: "#fff" }}>
              <Download size={15} /> Descargar {preview.name}
            </button>
          </div>
        </div>
      )}

      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── Estilos compartidos ──────────────────────────────────────────────────────
const navBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: "38px", height: "38px", borderRadius: "10px",
  border: "1px solid var(--border-color)", background: "var(--surface-1, #fff)",
  cursor: "pointer", color: "var(--text-primary)",
};
const primaryBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "6px", padding: "9px 14px",
  borderRadius: "10px", border: "none", background: "var(--accent-color)",
  color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer",
};
const secondaryBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "6px", padding: "9px 14px",
  borderRadius: "10px", border: "1px solid var(--accent-color)",
  background: "var(--accent-soft, #e6f2ec)", color: "var(--accent-dark, #00783e)",
  fontSize: "13px", fontWeight: 600, cursor: "pointer",
};
function crumbBtn(active: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: "5px", padding: "5px 10px",
    borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 600,
    fontSize: "12.5px",
    background: active ? "var(--accent-soft, #e6f2ec)" : "transparent",
    color: active ? "var(--accent-dark, #00783e)" : "var(--text-secondary)",
  };
}
