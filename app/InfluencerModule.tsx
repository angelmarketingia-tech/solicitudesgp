"use client";

/**
 * ─── Módulo "Contenido Influencers" (Community Manager + Trafficker) ─────────
 *
 * Autocontenido. Depende solo de:
 *   - `db` de '@/lib/firebase'
 *   - helpers/tipos de '@/lib/influencer'
 *   - props role/userName/addToast
 *
 * Qué hace:
 *   - Lista gestionable de influencers (agregar / borrar / copiar link público).
 *   - Calendario mensual por influencer donde se generan las solicitudes de
 *     contenido del mes (tarjetas con estado, pilares, canal, formato, ideas).
 *   - Cada influencer tiene un enlace secreto de SOLO LECTURA (/i/<código>)
 *     para compartir con el influencer sin que necesite cuenta.
 *
 * Almacenamiento: colección `requests` con discriminador `board` (ver
 * '@/lib/influencer'), para no depender de desplegar nuevas reglas.
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  Users, Plus, Trash2, X, ChevronLeft, ChevronRight, Link2, Copy,
  CalendarDays, ExternalLink, FileDown, FileText,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { publicLink } from "@/lib/public-url";
import { descargarWord, imprimirPdf } from "@/lib/influencer-export";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  Influencer, ContentItem, ContentStatus,
  CONTENT_STATUSES, STATUS_STYLE, CONTENT_PILLARS, PILLAR_STYLE,
  CONTENT_CHANNELS, CONTENT_FORMATS, DOW_ES,
  monthGrid, monthLabel, influencerFromDoc, itemFromDoc,
  createInfluencer, deleteInfluencerDoc, createContentItem, updateContentItem, deleteContentItem,
} from "@/lib/influencer";

type Toast = (msg: string, type?: "success" | "error" | "info") => void;

type Props = { role: string | null; userName: string; addToast: Toast };

const EMPTY_DRAFT = {
  title: "", date: "", contentStatus: "Sin empezar" as ContentStatus,
  pillars: [] as string[], channel: "", contentFormat: "", ideas: "",
  requestDate: "", deliveryDate: "",
};

export default function InfluencerModule({ role, addToast }: Props) {
  const canEdit = role === "admin" || role === "cm";

  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const today = new Date();
  const [viewY, setViewY] = useState(today.getFullYear());
  const [viewM, setViewM] = useState(today.getMonth());

  // Alta de influencer
  const [newName, setNewName] = useState("");
  const [newHandle, setNewHandle] = useState("");
  const [addingInf, setAddingInf] = useState(false);

  // Modal de tarjeta de contenido (crear/editar)
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  const [saving, setSaving] = useState(false);

  // ── Suscripción: perfiles + tarjetas (board influencer / influencer_item) ──
  useEffect(() => {
    const qy = query(collection(db, "requests"), where("board", "in", ["influencer", "influencer_item"]));
    const unsub = onSnapshot(qy, (snap) => {
      const infs: Influencer[] = [];
      const its: ContentItem[] = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.board === "influencer") infs.push(influencerFromDoc(d.id, data));
        else if (data.board === "influencer_item") its.push(itemFromDoc(d.id, data));
      });
      infs.sort((a, b) => a.name.localeCompare(b.name));
      setInfluencers(infs);
      setItems(its);
    }, (err) => console.warn("[influencer] listener:", err));
    return () => unsub();
  }, []);

  // Autoselección del primer influencer.
  useEffect(() => {
    if (!selectedId && influencers.length > 0) setSelectedId(influencers[0].id);
    if (selectedId && !influencers.some(i => i.id === selectedId)) {
      setSelectedId(influencers[0]?.id ?? null);
    }
  }, [influencers, selectedId]);

  const selected = influencers.find(i => i.id === selectedId) || null;
  const weeks = useMemo(() => monthGrid(viewY, viewM), [viewY, viewM]);
  const itemsByDay = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    if (!selected) return map;
    for (const it of items) {
      if (it.influencerId !== selected.id) continue;
      const arr = map.get(it.date) || [];
      arr.push(it);
      map.set(it.date, arr);
    }
    return map;
  }, [items, selected]);

  const monthItems = useMemo(() => {
    if (!selected) return [] as ContentItem[];
    const prefix = `${viewY}-${String(viewM + 1).padStart(2, "0")}`;
    return items.filter(it => it.influencerId === selected.id && it.date.startsWith(prefix));
  }, [items, selected, viewY, viewM]);

  const prevMonth = () => { const m = viewM - 1; if (m < 0) { setViewM(11); setViewY(viewY - 1); } else setViewM(m); };
  const nextMonth = () => { const m = viewM + 1; if (m > 11) { setViewM(0); setViewY(viewY + 1); } else setViewM(m); };

  // ── Acciones ──
  const handleAddInfluencer = async () => {
    if (!newName.trim()) { addToast("Escribe el nombre del influencer.", "error"); return; }
    setAddingInf(true);
    try {
      const id = await createInfluencer(db, newName, newHandle);
      setNewName(""); setNewHandle("");
      setSelectedId(id);
      addToast("Influencer agregado.", "success");
    } catch {
      addToast("No se pudo agregar el influencer.", "error");
    } finally { setAddingInf(false); }
  };

  const handleDeleteInfluencer = async (inf: Influencer) => {
    const count = items.filter(it => it.influencerId === inf.id).length;
    if (!confirm(`¿Eliminar a "${inf.name}"?${count ? ` Se borrarán también sus ${count} solicitud(es) de contenido.` : ""}`)) return;
    try {
      await Promise.all(items.filter(it => it.influencerId === inf.id).map(it => deleteContentItem(db, it.id)));
      await deleteInfluencerDoc(db, inf.id);
      addToast("Influencer eliminado.", "info");
    } catch {
      addToast("No se pudo eliminar.", "error");
    }
  };

  const copyLink = async (inf: Influencer) => {
    // Siempre la dirección PÚBLICA: si se armara con la del navegador y quien
    // copia estuviera en una URL de despliegue de Vercel, el influencer se
    // encontraría con un login de Vercel (ver src/lib/public-url.ts).
    const url = publicLink(`/i/${inf.shareCode}`);
    try {
      await navigator.clipboard.writeText(url);
      addToast(`Link copiado: ${url}`, "success");
    } catch {
      // Fallback: mostrar el link para copiar a mano.
      addToast(url, "info");
    }
  };

  // ── Exportación ──
  // Se exporta el mes que se está viendo, que es lo que el influencer necesita
  // para trabajar. `monthItems` ya viene filtrado a ese mes y a este influencer.
  const exportarPdf = () => {
    if (!selected) return;
    addToast("Preparando el PDF… elige «Guardar como PDF» en la ventana de impresión.", "info");
    imprimirPdf({ influencer: selected, items: monthItems, year: viewY, month: viewM },
      (msg) => addToast(msg, "error"));
  };

  const exportarWord = () => {
    if (!selected) return;
    try {
      descargarWord({ influencer: selected, items: monthItems, year: viewY, month: viewM });
      addToast("Documento de Word descargado.", "success");
    } catch {
      addToast("No se pudo generar el documento de Word.", "error");
    }
  };

  const openNewItem = (date: string) => {
    if (!canEdit || !selected) return;
    setEditingItemId(null);
    setDraft({ ...EMPTY_DRAFT, date, requestDate: new Date().toISOString().split("T")[0] });
    setItemModalOpen(true);
  };

  const openEditItem = (it: ContentItem) => {
    setEditingItemId(it.id);
    setDraft({
      title: it.title, date: it.date, contentStatus: it.contentStatus,
      pillars: [...it.pillars], channel: it.channel, contentFormat: it.contentFormat,
      ideas: it.ideas, requestDate: it.requestDate || "", deliveryDate: it.deliveryDate || "",
    });
    setItemModalOpen(true);
  };

  const togglePillar = (p: string) =>
    setDraft(d => ({ ...d, pillars: d.pillars.includes(p) ? d.pillars.filter(x => x !== p) : [...d.pillars, p] }));

  const saveItem = async () => {
    if (!selected) return;
    if (!draft.title.trim()) { addToast("Ponle un título al contenido.", "error"); return; }
    if (!draft.date) { addToast("Elige la fecha del contenido.", "error"); return; }
    setSaving(true);
    try {
      if (editingItemId) {
        await updateContentItem(db, editingItemId, draft);
        addToast("Contenido actualizado.", "success");
      } else {
        await createContentItem(db, selected.id, draft);
        addToast("Contenido agregado al calendario.", "success");
      }
      setItemModalOpen(false);
    } catch {
      addToast("No se pudo guardar el contenido.", "error");
    } finally { setSaving(false); }
  };

  const removeItem = async () => {
    if (!editingItemId) return;
    if (!confirm("¿Eliminar esta solicitud de contenido?")) return;
    try {
      await deleteContentItem(db, editingItemId);
      setItemModalOpen(false);
      addToast("Contenido eliminado.", "info");
    } catch {
      addToast("No se pudo eliminar.", "error");
    }
  };

  const todayStr = today.toISOString().split("T")[0];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "18px", alignItems: "start" }}>
      {/* ── Panel izquierdo: influencers ── */}
      <div className="card" style={{ padding: "16px", position: "sticky", top: "80px" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: "14px", color: "var(--accent-dark)", display: "flex", alignItems: "center", gap: "8px" }}>
          <Users size={16} /> Influencers ({influencers.length})
        </h3>

        {canEdit && (
          <div style={{ marginBottom: "14px", display: "flex", flexDirection: "column", gap: "6px" }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre del influencer"
              style={{ fontSize: "13px" }} onKeyDown={e => e.key === "Enter" && handleAddInfluencer()} />
            <input value={newHandle} onChange={e => setNewHandle(e.target.value)} placeholder="@usuario (opcional)"
              style={{ fontSize: "13px" }} onKeyDown={e => e.key === "Enter" && handleAddInfluencer()} />
            <button className="btn" disabled={addingInf} style={{ padding: "9px", fontSize: "13px" }} onClick={handleAddInfluencer}>
              <Plus size={15} /> Agregar
            </button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {influencers.length === 0 && (
            <p style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center", padding: "12px 0" }}>
              Aún no hay influencers. Agrega el primero arriba.
            </p>
          )}
          {influencers.map(inf => {
            const active = inf.id === selectedId;
            const count = items.filter(it => it.influencerId === inf.id).length;
            return (
              <div key={inf.id}
                style={{ padding: "10px 12px", borderRadius: "10px", cursor: "pointer", border: `1px solid ${active ? "var(--accent-color)" : "var(--border-color)"}`, background: active ? "var(--accent-soft)" : "var(--surface-1)" }}
                onClick={() => setSelectedId(inf.id)}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inf.name}</div>
                    {inf.handle && <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{inf.handle}</div>}
                  </div>
                  <span className="badge" style={{ background: "var(--surface-2)", color: "var(--text-secondary)", fontSize: "10px", flexShrink: 0 }}>{count}</span>
                </div>
                {active && (
                  <div style={{ display: "flex", gap: "6px", marginTop: "8px" }} onClick={e => e.stopPropagation()}>
                    <button className="btn-secondary" title="Copiar link público (solo lectura)" style={{ flex: 1, padding: "6px", fontSize: "11px", borderRadius: "8px", cursor: "pointer" }} onClick={() => copyLink(inf)}>
                      <Copy size={12} /> Link
                    </button>
                    <a href={publicLink(`/i/${inf.shareCode}`)} target="_blank" rel="noreferrer" title="Abrir vista pública" className="btn-secondary" style={{ padding: "6px 8px", fontSize: "11px", borderRadius: "8px", display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                      <ExternalLink size={12} />
                    </a>
                    {canEdit && (
                      <button className="btn-danger" title="Eliminar influencer" style={{ padding: "6px 8px", fontSize: "11px", borderRadius: "8px", cursor: "pointer" }} onClick={() => handleDeleteInfluencer(inf)}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Panel derecho: calendario del influencer ── */}
      <div>
        {!selected ? (
          <div className="card" style={{ padding: "60px", textAlign: "center", color: "var(--text-muted)" }}>
            <CalendarDays size={44} style={{ opacity: 0.35, marginBottom: "10px" }} />
            <p>Selecciona o agrega un influencer para ver su calendario de contenido.</p>
          </div>
        ) : (
          <>
            {/* Encabezado con navegación de mes + link */}
            <div className="card" style={{ padding: "14px 18px", marginBottom: "14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "17px", fontWeight: 800, color: "var(--text-primary)" }}>Contenido {selected.name}</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                  <Link2 size={12} /> Link público de solo lectura ·
                  <button onClick={() => copyLink(selected)} style={{ background: "none", border: "none", color: "var(--accent-color)", cursor: "pointer", padding: 0, fontSize: "12px", fontWeight: 600, textDecoration: "underline", width: "auto" }}>copiar</button>
                </div>
                {/* Descarga del mes: para quien no consigue abrir el link. */}
                <div style={{ display: "flex", alignItems: "center", gap: "7px", marginTop: "10px" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>Descargar mes:</span>
                  <button className="btn-secondary" onClick={exportarPdf}
                    title={`Descargar ${monthLabel(viewY, viewM)} en PDF`}
                    style={{ padding: "5px 11px", fontSize: "11.5px", borderRadius: "8px", cursor: "pointer", width: "auto" }}>
                    <FileDown size={13} /> PDF
                  </button>
                  <button className="btn-secondary" onClick={exportarWord}
                    title={`Descargar ${monthLabel(viewY, viewM)} en Word`}
                    style={{ padding: "5px 11px", fontSize: "11.5px", borderRadius: "8px", cursor: "pointer", width: "auto" }}>
                    <FileText size={13} /> Word
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button className="btn-ghost" style={{ padding: "8px", borderRadius: "8px", cursor: "pointer" }} onClick={prevMonth}><ChevronLeft size={18} /></button>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", minWidth: "150px", textAlign: "center", textTransform: "capitalize" }}>{monthLabel(viewY, viewM)}</div>
                <button className="btn-ghost" style={{ padding: "8px", borderRadius: "8px", cursor: "pointer" }} onClick={nextMonth}><ChevronRight size={18} /></button>
                {canEdit && (
                  <button className="btn" style={{ padding: "8px 14px", fontSize: "13px", marginLeft: "6px" }}
                    onClick={() => openNewItem(todayStr.startsWith(`${viewY}-${String(viewM + 1).padStart(2, "0")}`) ? todayStr : `${viewY}-${String(viewM + 1).padStart(2, "0")}-01`)}>
                    <Plus size={15} /> Solicitud
                  </button>
                )}
              </div>
            </div>

            {/* Cuadrícula del calendario */}
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
                        <div key={di}
                          onClick={() => day && openNewItem(day)}
                          style={{
                            minHeight: "92px", borderRadius: "10px", padding: "6px",
                            border: `1px solid ${isToday ? "var(--accent-color)" : "var(--border-color)"}`,
                            background: day ? (isToday ? "var(--accent-soft)" : "var(--surface-1)") : "transparent",
                            cursor: day && canEdit ? "pointer" : "default", display: "flex", flexDirection: "column", gap: "4px",
                          }}>
                          {day && (
                            <div style={{ fontSize: "11px", fontWeight: 700, color: isToday ? "var(--accent-color)" : "var(--text-muted)" }}>
                              {parseInt(day.split("-")[2], 10)}
                            </div>
                          )}
                          {dayItems.map(it => {
                            const st = STATUS_STYLE[it.contentStatus] || { text: "var(--text-secondary)", bg: "var(--surface-2)" };
                            return (
                              <div key={it.id}
                                onClick={(e) => { e.stopPropagation(); openEditItem(it); }}
                                title={it.title}
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

            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "10px" }}>
              {monthItems.length} solicitud{monthItems.length !== 1 ? "es" : ""} de contenido este mes.
              {canEdit && " Haz clic en un día para agregar una."}
            </p>
          </>
        )}
      </div>

      {/* ── Modal crear/editar tarjeta de contenido ── */}
      {itemModalOpen && selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "16px" }}
          onClick={() => setItemModalOpen(false)}>
          <div className="card" style={{ width: "560px", maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", padding: "24px" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
              <h2 style={{ fontSize: "19px", margin: 0, color: "var(--text-primary)" }}>{editingItemId ? "Editar contenido" : "Nueva solicitud de contenido"}</h2>
              <X size={22} style={{ cursor: "pointer", color: "var(--text-secondary)" }} onClick={() => setItemModalOpen(false)} />
            </div>

            <div className="form-group">
              <label className="label">Título / Idea principal *</label>
              <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="Ej. Recap del fin de semana deportivo" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div className="form-group">
                <label className="label">Fecha (calendario) *</label>
                <input type="date" value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="label">Estado</label>
                <select value={draft.contentStatus} onChange={e => setDraft(d => ({ ...d, contentStatus: e.target.value as ContentStatus }))}>
                  {CONTENT_STATUSES.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="label">Pilar de contenido</label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {CONTENT_PILLARS.map(p => {
                  const on = draft.pillars.includes(p);
                  const st = PILLAR_STYLE[p];
                  return (
                    <div key={p} onClick={() => togglePillar(p)}
                      style={{ cursor: "pointer", padding: "6px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, border: `1.5px solid ${on ? st.text : "var(--border-color)"}`, background: on ? st.bg : "var(--surface-1)", color: on ? st.text : "var(--text-secondary)" }}>
                      {p}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div className="form-group">
                <label className="label">Canal</label>
                <select value={draft.channel} onChange={e => setDraft(d => ({ ...d, channel: e.target.value }))}>
                  <option value="">—</option>
                  {CONTENT_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Formato</label>
                <select value={draft.contentFormat} onChange={e => setDraft(d => ({ ...d, contentFormat: e.target.value }))}>
                  <option value="">—</option>
                  {CONTENT_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div className="form-group">
                <label className="label">Fecha de petición</label>
                <input type="date" value={draft.requestDate} onChange={e => setDraft(d => ({ ...d, requestDate: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="label">Fecha de entrega</label>
                <input type="date" value={draft.deliveryDate} onChange={e => setDraft(d => ({ ...d, deliveryDate: e.target.value }))} />
              </div>
            </div>

            <div className="form-group">
              <label className="label">Ideas / instrucciones</label>
              <textarea rows={4} value={draft.ideas} onChange={e => setDraft(d => ({ ...d, ideas: e.target.value }))}
                placeholder="Guion, referencias, copy sugerido, hashtags…" />
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
              {editingItemId && (
                <button className="btn-danger" style={{ padding: "12px 16px", cursor: "pointer" }} onClick={removeItem}>
                  <Trash2 size={16} /> Eliminar
                </button>
              )}
              <button className="btn" disabled={saving} style={{ flex: 1, padding: "12px" }} onClick={saveItem}>
                {saving ? "Guardando…" : editingItemId ? "Guardar cambios" : "Agregar al calendario"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
