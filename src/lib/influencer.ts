// ─────────────────────────────────────────────────────────────────────────
// Módulo "Contenido Influencers" — tipos, constantes y helpers compartidos
// por el módulo interno (InfluencerModule) y la página pública (/i/[code]).
// ─────────────────────────────────────────────────────────────────────────
//
// ALMACENAMIENTO: para no depender de desplegar nuevas reglas de Firestore
// (ver memoria "reglas Firestore sin desplegar"), TODO vive en la colección
// `requests`, que ya tiene permisos de lectura/escritura desplegados. Cada
// documento lleva un discriminador `board`:
//   - board: 'influencer'      → perfil de influencer (nombre + código público)
//   - board: 'influencer_item' → solicitud de contenido (una tarjeta del calendario)
//
// Para satisfacer las reglas de create de `requests` (title string, status en
// el enum de diseño, y clave deliveryDate presente) cada doc incluye:
//   title (no vacío), status: 'Pendiente' (dummy), deliveryDate (string).
// La app de diseño filtra fuera todo doc con `board`, así no se mezclan.

import type { Firestore } from "firebase/firestore";
import {
  collection, doc, setDoc, updateDoc, deleteDoc, serverTimestamp,
} from "firebase/firestore";

// ─── Opciones de contenido (inspiradas en el calendario de Notion) ───────────
export const CONTENT_STATUSES = [
  { id: "Sin empezar",  text: "#6b7280", bg: "#f1f2f4" },
  { id: "En progreso",  text: "#b54708", bg: "#fdf3e7" },
  { id: "En revisión",  text: "#7c3aed", bg: "#f3e8ff" },
  { id: "Aprobado",     text: "#0b6bcb", bg: "#e8f1fc" },
  { id: "Publicado",    text: "#00783e", bg: "#e6f2ec" },
] as const;
export type ContentStatus = typeof CONTENT_STATUSES[number]["id"];

export const STATUS_STYLE: Record<string, { text: string; bg: string }> =
  CONTENT_STATUSES.reduce((acc, s) => { acc[s.id] = { text: s.text, bg: s.bg }; return acc; }, {} as Record<string, { text: string; bg: string }>);

// Pilares de contenido (multi-selección)
export const CONTENT_PILLARS = [
  "Registros", "Informativo", "Experiencia", "Entretenimiento", "Promoción", "Educativo",
] as const;
export const PILLAR_STYLE: Record<string, { text: string; bg: string }> = {
  "Registros":      { text: "#b54708", bg: "#fdf3e7" },
  "Informativo":    { text: "#7c3aed", bg: "#f3e8ff" },
  "Experiencia":    { text: "#0b6bcb", bg: "#e8f1fc" },
  "Entretenimiento":{ text: "#c026a3", bg: "#fbe8f6" },
  "Promoción":      { text: "#00783e", bg: "#e6f2ec" },
  "Educativo":      { text: "#0e7490", bg: "#e0f2f4" },
};

export const CONTENT_CHANNELS = [
  "Reel Instagram", "Post Instagram", "Story Instagram", "TikTok", "YouTube", "Facebook", "Twitter/X",
] as const;

export const CONTENT_FORMATS = [
  "Video", "Foto", "Carrusel", "Texto", "GIF", "En vivo",
] as const;

// ─── Tipos ───────────────────────────────────────────────────────────────────
export type Influencer = {
  id: string;
  name: string;
  shareCode: string;   // código secreto del link público
  handle?: string;     // @usuario (opcional)
};

export type ContentItem = {
  id: string;
  influencerId: string;
  title: string;
  date: string;               // "YYYY-MM-DD" — día del calendario
  contentStatus: ContentStatus;
  pillars: string[];
  channel: string;
  contentFormat: string;
  ideas: string;
  requestDate?: string;       // fecha de petición
  deliveryDate?: string;      // fecha de entrega
};

// ─── Fechas / calendario (sin librerías) ─────────────────────────────────────
export const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
export const DOW_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

// Devuelve una matriz de semanas (lunes→domingo) para el mes (y, m0 = 0-11).
// Cada celda es el "YYYY-MM-DD" o null (relleno de otros meses).
export function monthGrid(y: number, m0: number): (string | null)[][] {
  const first = new Date(y, m0, 1);
  // getDay(): 0=domingo. Convertimos a lunes=0.
  const startDow = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m0 + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(ymd(y, m0, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function monthLabel(y: number, m0: number) {
  return `${MONTHS_ES[m0]} de ${y}`;
}

// ─── Mapeo Firestore ↔ objetos ───────────────────────────────────────────────
// (Los docs viven en `requests` con discriminador `board`.)

export function influencerFromDoc(id: string, data: Record<string, unknown>): Influencer {
  return {
    id,
    name: String(data.influencerName || data.title || "Sin nombre"),
    shareCode: String(data.shareCode || ""),
    handle: data.handle ? String(data.handle) : undefined,
  };
}

export function itemFromDoc(id: string, data: Record<string, unknown>): ContentItem {
  return {
    id,
    influencerId: String(data.influencerId || ""),
    title: String(data.title || ""),
    date: String(data.date || data.deliveryDate || ""),
    contentStatus: (String(data.contentStatus || "Sin empezar") as ContentStatus),
    pillars: Array.isArray(data.pillars) ? (data.pillars as string[]) : [],
    channel: String(data.channel || ""),
    contentFormat: String(data.contentFormat || ""),
    ideas: String(data.ideas || ""),
    requestDate: data.requestDate ? String(data.requestDate) : undefined,
    deliveryDate: data.deliveryDate ? String(data.deliveryDate) : undefined,
  };
}

// Código aleatorio no adivinable para el link público.
export function genShareCode(): string {
  const rnd = () => Math.random().toString(36).slice(2);
  return (rnd() + rnd()).slice(0, 16);
}

// ─── Escrituras (usadas solo por el módulo interno) ──────────────────────────
export async function createInfluencer(db: Firestore, name: string, handle?: string): Promise<string> {
  const id = `INF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await setDoc(doc(db, "requests", id), {
    board: "influencer",
    // Campos exigidos por las reglas de `requests`:
    title: name.trim() || "Influencer",
    status: "Pendiente",
    deliveryDate: "",
    // Datos propios:
    influencerName: name.trim(),
    ...(handle ? { handle: handle.trim() } : {}),
    shareCode: genShareCode(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function deleteInfluencerDoc(db: Firestore, id: string) {
  await deleteDoc(doc(db, "requests", id));
}

export async function createContentItem(
  db: Firestore,
  influencerId: string,
  data: Omit<ContentItem, "id" | "influencerId">,
): Promise<string> {
  const id = `ICO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await setDoc(doc(db, "requests", id), {
    board: "influencer_item",
    // Campos exigidos por las reglas de `requests`:
    title: data.title.trim() || "Contenido",
    status: "Pendiente",
    deliveryDate: data.deliveryDate || data.date || "",
    // Datos propios:
    influencerId,
    date: data.date,
    contentStatus: data.contentStatus,
    pillars: data.pillars,
    channel: data.channel,
    contentFormat: data.contentFormat,
    ideas: data.ideas,
    ...(data.requestDate ? { requestDate: data.requestDate } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function updateContentItem(
  db: Firestore,
  itemId: string,
  data: Partial<ContentItem>,
) {
  const patch: Record<string, unknown> = { updatedAt: serverTimestamp(), status: "Pendiente" };
  if (data.title !== undefined) patch.title = data.title.trim() || "Contenido";
  if (data.date !== undefined) patch.date = data.date;
  if (data.contentStatus !== undefined) patch.contentStatus = data.contentStatus;
  if (data.pillars !== undefined) patch.pillars = data.pillars;
  if (data.channel !== undefined) patch.channel = data.channel;
  if (data.contentFormat !== undefined) patch.contentFormat = data.contentFormat;
  if (data.ideas !== undefined) patch.ideas = data.ideas;
  if (data.requestDate !== undefined) patch.requestDate = data.requestDate;
  if (data.deliveryDate !== undefined) patch.deliveryDate = data.deliveryDate;
  await updateDoc(doc(db, "requests", itemId), patch);
}

export async function deleteContentItem(db: Firestore, itemId: string) {
  await deleteDoc(doc(db, "requests", itemId));
}
