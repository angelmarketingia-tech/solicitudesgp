"use client";

/**
 * Adjuntos de una tarjeta de Contenido Influencers: imágenes de referencia,
 * documentos de apoyo (PDF/Word) y enlaces.
 *
 * POR QUÉ: hasta ahora el brief cabía en el campo «Ideas», así que el guion en
 * Word, el PDF de la campaña o el enlace al video de referencia se mandaban por
 * aparte —y al influencer le llegaba el calendario sin ellos—. Ahora viajan con
 * la tarjeta y se ven también en el enlace público.
 *
 * LOS ARCHIVOS VAN A STORAGE, no dentro del documento. Guardarlos dentro fue lo
 * que disparó la factura de Google en el tablero de diseño: el módulo se carga
 * entero, así que un adjunto metido en una tarjeta se lo descargaba todo el que
 * abriera el calendario. Aquí solo queda la URL.
 *
 * El mismo componente sirve en el panel (editable) y en la página pública
 * (`soloLectura`), para que lo que ve el influencer sea exactamente lo que se
 * cargó, sin una segunda maqueta que se pueda quedar atrás.
 */

import React, { useRef, useState } from "react";
import { FileText, ImageIcon, Link2, Plus, Trash2, UploadCloud } from "lucide-react";
import { uploadToStorage, storageErrorMessage } from "@/lib/storage-upload";
import type { ContentAttachment } from "@/lib/influencer";

type Toast = (msg: string, type?: "success" | "error" | "info") => void;

const EXT_IMAGEN = ["jpg", "jpeg", "png", "webp", "gif"];
const EXT_DOC = ["pdf", "doc", "docx"];
/** Los archivos van a Storage, así que el tope es generoso. */
const MAX_BYTES = 50 * 1024 * 1024;

const extDe = (nombre: string) => (nombre.split(".").pop() || "").toLowerCase();

/** Un enlace pegado se guarda como adjunto de tipo "link". */
export const esEnlace = (a: ContentAttachment) => a.type === "link";

function normalizarUrl(texto: string): string | null {
  const limpio = texto.trim();
  if (!limpio) return null;
  const conEsquema = /^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`;
  try {
    const u = new URL(conEsquema);
    return u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Nombre corto y legible de un enlace, para no pintar la URL entera. */
export function etiquetaDeEnlace(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    return url;
  }
}

export default function AdjuntosContenido({
  imagenes, archivos, onChange, addToast, soloLectura = false,
}: {
  imagenes: string[];
  archivos: ContentAttachment[];
  onChange?: (datos: { imagenes: string[]; archivos: ContentAttachment[] }) => void;
  addToast?: Toast;
  soloLectura?: boolean;
}) {
  const [progreso, setProgreso] = useState<string | null>(null);
  const [enlace, setEnlace] = useState("");
  const inputArchivo = useRef<HTMLInputElement>(null);

  const avisar: Toast = (msg, tipo) => addToast?.(msg, tipo);
  const enlaces = archivos.filter(esEnlace);
  const documentos = archivos.filter(a => !esEnlace(a));
  const vacio = imagenes.length === 0 && archivos.length === 0;

  if (soloLectura && vacio) return null;

  const subir = async (files: File[]) => {
    if (!onChange || files.length === 0) return;
    const nuevasImgs: string[] = [];
    const nuevosDocs: ContentAttachment[] = [];
    const problemas: string[] = [];

    for (const file of files) {
      const ext = extDe(file.name);
      const esImagen = file.type.startsWith("image/") || EXT_IMAGEN.includes(ext);
      const esDoc = EXT_DOC.includes(ext);
      if (!esImagen && !esDoc) {
        problemas.push(`"${file.name}": usa imágenes, PDF o Word.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        problemas.push(`"${file.name}" supera los ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`);
        continue;
      }
      setProgreso(`Subiendo "${file.name}"…`);
      try {
        const url = await uploadToStorage("creatives/_influencers", file, {
          onProgress: pct => setProgreso(`Subiendo "${file.name}"… ${pct}%`),
        });
        if (esImagen) nuevasImgs.push(url);
        else nuevosDocs.push({ name: file.name, url, type: ext });
      } catch (err) {
        // El `.doc` antiguo lo rechaza el bucket por su tipo, no por tamaño.
        problemas.push(`No se pudo subir "${file.name}". ${storageErrorMessage(err)}`);
      } finally {
        setProgreso(null);
      }
    }

    if (nuevasImgs.length || nuevosDocs.length) {
      onChange({ imagenes: [...imagenes, ...nuevasImgs], archivos: [...archivos, ...nuevosDocs] });
      const total = nuevasImgs.length + nuevosDocs.length;
      avisar(`${total} adjunto${total === 1 ? "" : "s"} listo${total === 1 ? "" : "s"}.`, "success");
    }
    problemas.forEach(p => avisar(p, "error"));
  };

  const agregarEnlace = () => {
    const url = normalizarUrl(enlace);
    if (!url) { avisar("Ese enlace no parece válido.", "error"); return; }
    if (archivos.some(a => a.url === url)) { avisar("Ese enlace ya está.", "info"); return; }
    onChange?.({ imagenes, archivos: [...archivos, { name: etiquetaDeEnlace(url), url, type: "link" }] });
    setEnlace("");
  };

  const quitarImagen = (i: number) =>
    onChange?.({ imagenes: imagenes.filter((_, idx) => idx !== i), archivos });
  const quitarArchivo = (url: string) =>
    onChange?.({ imagenes, archivos: archivos.filter(a => a.url !== url) });

  const chip: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: "8px",
    background: "var(--surface-1)", border: "1px solid var(--border-color)",
    borderRadius: "10px", padding: "8px 12px", fontSize: "13px",
  };

  return (
    <div className="form-group">
      {!soloLectura && <label className="label">Referencias y documentos de apoyo</label>}

      {imagenes.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: "10px", marginBottom: "10px" }}>
          {imagenes.map((img, i) => (
            <div key={img} style={{ position: "relative", borderRadius: "10px", overflow: "hidden", border: "1px solid var(--border-color)" }}>
              <a href={img} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt={`Referencia ${i + 1}`} loading="lazy"
                  style={{ width: "100%", height: "100px", objectFit: "cover", display: "block" }} />
              </a>
              {!soloLectura && (
                <button type="button" title="Quitar" onClick={() => quitarImagen(i)}
                  style={{ position: "absolute", top: "6px", right: "6px", width: "auto", padding: "4px", borderRadius: "50%", border: "none", background: "var(--danger)", cursor: "pointer", display: "flex" }}>
                  <Trash2 size={13} color="#fff" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {(documentos.length > 0 || enlaces.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
          {documentos.map(a => (
            <div key={a.url} style={chip}>
              <FileText size={15} color={a.type === "pdf" ? "var(--danger)" : "var(--info)"} />
              <a href={a.url} target="_blank" rel="noopener noreferrer" download={a.name}
                style={{ flex: 1, color: "var(--text-primary)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.name}
              </a>
              <span className="badge" style={{ background: "var(--surface-2)", color: "var(--text-secondary)", fontSize: "10px" }}>
                {a.type.toUpperCase()}
              </span>
              {!soloLectura && (
                <Trash2 size={15} style={{ cursor: "pointer", color: "var(--danger)" }} onClick={() => quitarArchivo(a.url)} />
              )}
            </div>
          ))}
          {enlaces.map(a => (
            <div key={a.url} style={chip}>
              <Link2 size={15} color="var(--accent-color)" />
              <a href={a.url} target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, color: "var(--accent-color)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.name}
              </a>
              {!soloLectura && (
                <Trash2 size={15} style={{ cursor: "pointer", color: "var(--danger)" }} onClick={() => quitarArchivo(a.url)} />
              )}
            </div>
          ))}
        </div>
      )}

      {!soloLectura && (
        <>
          <label
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); void subir(Array.from(e.dataTransfer?.files || [])); }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
              padding: "16px", background: "var(--surface-1)", borderRadius: "12px",
              border: "2px dashed var(--accent-color)", cursor: "pointer", width: "auto", margin: 0,
            }}>
            <UploadCloud size={22} color="var(--accent-color)" />
            <span style={{ fontSize: "12.5px", color: "var(--text-secondary)", textAlign: "center" }}>
              {progreso || "Arrastra aquí imágenes, PDF o Word, o haz clic"}
            </span>
            <input ref={inputArchivo} type="file" multiple style={{ display: "none" }}
              accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void subir(f); }} />
          </label>

          <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
            <input value={enlace} onChange={e => setEnlace(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); agregarEnlace(); } }}
              placeholder="Pega un enlace de referencia (video, carpeta, publicación…)"
              style={{ flex: 1, fontSize: "13px" }} />
            <button type="button" className="btn-secondary" onClick={agregarEnlace}
              style={{ width: "auto", padding: "0 14px", fontSize: "12px", whiteSpace: "nowrap" }}>
              <Plus size={14} /> Enlace
            </button>
          </div>

          <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "8px 0 0", lineHeight: 1.5 }}>
            <ImageIcon size={11} style={{ display: "inline", verticalAlign: "-1px" }} /> Todo esto lo
            ve el influencer en su enlace público. Los Word antiguos (.doc) no se admiten: guárdalos
            como .docx o PDF.
          </p>
        </>
      )}
    </div>
  );
}
