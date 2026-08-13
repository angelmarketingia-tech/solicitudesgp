// ─────────────────────────────────────────────────────────────────────────
// Módulo "Promocionales" (estilo Drive) — tipos y helpers compartidos por el
// módulo interno (PromoModule) y la página pública (/p/[code]).
// ─────────────────────────────────────────────────────────────────────────
//
// ALMACENAMIENTO: todo vive en la colección `requests` con discriminador
// `board` (para no depender de desplegar reglas nuevas):
//   - board: 'promo_config' → doc único: código del link público + comentarios generales
//   - board: 'promo'        → un ITEM: carpeta o archivo, con `parentId` para
//                             armar la jerarquía (2026 → AGOSTO → País → Torneo → PC → ...)

import type { Firestore } from "firebase/firestore";
import {
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc, arrayUnion,
  serverTimestamp, query, where,
} from "firebase/firestore";

export const PROMO_CONFIG_ID = "PROMO_CONFIG";
export const PROMO_ROOT = "ROOT"; // parentId del nivel superior

/**
 * Tableros tipo Drive que usan este mismo código. Se distinguen por el campo
 * `board` del documento, así que sus contenidos no se mezclan aunque vivan en
 * la misma colección.
 *   - "promo" → Promocionales (empresa externa)
 *   - "cmr"   → CMR, que sustituye al Drive del equipo comercial
 */
export type Tablero = "promo" | "cmr";
export const boardItem = (t: Tablero) => t;                    // 'promo' | 'cmr'
export const boardConfig = (t: Tablero) => `${t}_config`;       // 'promo_config' | 'cmr_config'
export const configIdDe = (t: Tablero) => t === "promo" ? PROMO_CONFIG_ID : "CMR_CONFIG";

export type PromoComment = {
  id: string;
  authorName: string;
  text: string;
  createdAt: string;          // ISO string
  source: "app" | "public";
};

// Un item puede ser una CARPETA o un ARCHIVO.
export type PromoItem = {
  id: string;
  kind: "folder" | "file";
  name: string;               // nombre visible (carpeta o archivo)
  parentId: string;           // PROMO_ROOT o id de la carpeta padre
  shareCode?: string;         // solo carpetas: código de su link público propio
  // Solo archivos:
  fileUrl?: string;
  fileName?: string;
  fileType?: "image" | "pdf" | "video" | "archive" | "other";
  uploadedBy?: string;
  createdAt?: string;
  messages: PromoComment[];   // comentarios (por archivo)
};

export type PromoConfig = {
  id: string;
  shareCode: string;
  generalMessages: PromoComment[];
};

export function fileTypeOf(name: string): NonNullable<PromoItem["fileType"]> {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (["mp4", "mov", "webm", "m4v", "avi"].includes(ext)) return "video";
  if (["rar", "zip", "7z", "tar", "gz"].includes(ext)) return "archive"; // carpetas comprimidas
  return "other";
}

export function genCode(): string {
  const rnd = () => Math.random().toString(36).slice(2);
  return (rnd() + rnd()).slice(0, 16);
}
export function newCommentId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Mapeo Firestore ↔ objetos ───────────────────────────────────────────────
// Compatibilidad: los promocionales antiguos (sin kind/parentId) se muestran
// como archivos en la raíz.
export function itemFromDoc(id: string, data: Record<string, unknown>): PromoItem {
  const kind = (data.kind === "folder" ? "folder" : "file") as PromoItem["kind"];
  return {
    id,
    kind,
    name: String(data.name || data.title || (kind === "folder" ? "Carpeta" : "Archivo")),
    parentId: String(data.parentId || PROMO_ROOT),
    shareCode: data.shareCode ? String(data.shareCode) : undefined,
    fileUrl: data.fileUrl ? String(data.fileUrl) : undefined,
    fileName: data.fileName ? String(data.fileName) : undefined,
    fileType: data.fileType ? (String(data.fileType) as PromoItem["fileType"]) : undefined,
    uploadedBy: data.uploadedBy ? String(data.uploadedBy) : undefined,
    createdAt: data.createdAt ? String(data.createdAt) : undefined,
    messages: Array.isArray(data.messages) ? (data.messages as PromoComment[]) : [],
  };
}

export function configFromDoc(id: string, data: Record<string, unknown>): PromoConfig {
  return {
    id,
    shareCode: String(data.shareCode || ""),
    generalMessages: Array.isArray(data.generalMessages) ? (data.generalMessages as PromoComment[]) : [],
  };
}

// Ordena: carpetas primero (alfabético), luego archivos (alfabético).
export function sortItems(items: PromoItem[]): PromoItem[] {
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, "es", { numeric: true });
  });
}

// Ruta (breadcrumb) desde la raíz hasta `folderId`.
export function breadcrumb(items: PromoItem[], folderId: string): PromoItem[] {
  const byId = new Map(items.map(i => [i.id, i]));
  const chain: PromoItem[] = [];
  let cur = folderId;
  let guard = 0;
  while (cur && cur !== PROMO_ROOT && guard < 50) {
    const node = byId.get(cur);
    if (!node) break;
    chain.unshift(node);
    cur = node.parentId;
    guard++;
  }
  return chain;
}

// Todos los ids descendientes de una carpeta (para borrado recursivo).
export function descendantIds(items: PromoItem[], folderId: string): string[] {
  const childrenOf = (pid: string) => items.filter(i => i.parentId === pid);
  const out: string[] = [];
  const stack = [...childrenOf(folderId)];
  let guard = 0;
  while (stack.length && guard < 10000) {
    const node = stack.pop()!;
    out.push(node.id);
    if (node.kind === "folder") stack.push(...childrenOf(node.id));
    guard++;
  }
  return out;
}

// ─── Config: obtener o crear el doc único ────────────────────────────────────
export async function getOrCreateConfig(db: Firestore, tablero: Tablero = "promo"): Promise<PromoConfig> {
  const snap = await getDocs(query(collection(db, "requests"), where("board", "==", boardConfig(tablero))));
  const existing = snap.docs[0];
  if (existing) return configFromDoc(existing.id, existing.data());
  await setDoc(doc(db, "requests", configIdDe(tablero)), {
    board: boardConfig(tablero),
    title: `${tablero === "promo" ? "Promocionales" : "CMR"} — configuración`,
    status: "Pendiente",
    deliveryDate: "",
    shareCode: genCode(),
    generalMessages: [],
    createdAt: serverTimestamp(),
  });
  const again = await getDocs(query(collection(db, "requests"), where("board", "==", boardConfig(tablero))));
  return configFromDoc(again.docs[0].id, again.docs[0].data());
}

// ─── Carpetas y archivos ─────────────────────────────────────────────────────
export async function createFolder(db: Firestore, parentId: string, name: string, by: string, tablero: Tablero = "promo"): Promise<string> {
  const id = `PRF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await setDoc(doc(db, "requests", id), {
    board: boardItem(tablero), kind: "folder",
    // Requeridos por reglas de `requests`:
    title: name.trim() || "Carpeta", status: "Pendiente", deliveryDate: "",
    // Propios:
    name: name.trim() || "Carpeta",
    parentId: parentId || PROMO_ROOT,
    uploadedBy: by,
    messages: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function createFile(
  db: Firestore,
  parentId: string,
  data: { name: string; fileUrl: string; fileName: string; fileType: NonNullable<PromoItem["fileType"]>; uploadedBy: string },
  tablero: Tablero = "promo",
): Promise<string> {
  const id = `PRO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await setDoc(doc(db, "requests", id), {
    board: boardItem(tablero), kind: "file",
    title: data.name.trim() || data.fileName || "Archivo", status: "Pendiente", deliveryDate: "",
    name: data.name.trim() || data.fileName || "Archivo",
    parentId: parentId || PROMO_ROOT,
    fileUrl: data.fileUrl, fileName: data.fileName, fileType: data.fileType,
    uploadedBy: data.uploadedBy,
    messages: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function renamePromoItem(db: Firestore, id: string, name: string) {
  const clean = name.trim() || "Sin nombre";
  await updateDoc(doc(db, "requests", id), { name: clean, title: clean, status: "Pendiente", updatedAt: serverTimestamp() });
}

export async function replacePromoFile(
  db: Firestore, id: string,
  data: { fileUrl: string; fileName: string; fileType: NonNullable<PromoItem["fileType"]> },
) {
  await updateDoc(doc(db, "requests", id), {
    fileUrl: data.fileUrl, fileName: data.fileName, fileType: data.fileType,
    status: "Pendiente", updatedAt: serverTimestamp(),
  });
}

export async function deletePromoDoc(db: Firestore, id: string) {
  await deleteDoc(doc(db, "requests", id));
}

// Asegura que una carpeta tenga su propio código de link público. Si ya lo
// tiene, lo devuelve; si no, genera uno y lo guarda. Así cada carpeta puede
// compartirse por separado (/p/<código>) sin exponer las demás.
export async function ensureFolderShareCode(db: Firestore, folder: PromoItem): Promise<string> {
  if (folder.shareCode) return folder.shareCode;
  const code = genCode();
  await updateDoc(doc(db, "requests", folder.id), { shareCode: code, status: "Pendiente", updatedAt: serverTimestamp() });
  return code;
}

// Ids de una carpeta MÁS toda su descendencia (para acotar la vista pública).
export function subtreeIds(items: PromoItem[], rootId: string): Set<string> {
  return new Set<string>([rootId, ...descendantIds(items, rootId)]);
}

// Mueve un item (carpeta o archivo) a otra carpeta.
export async function movePromoItem(db: Firestore, id: string, newParentId: string) {
  await updateDoc(doc(db, "requests", id), {
    parentId: newParentId || PROMO_ROOT, status: "Pendiente", updatedAt: serverTimestamp(),
  });
}

// Lista ordenada de carpetas (con profundidad) para elegir destino al mover.
// `excludeIds` evita mover una carpeta dentro de sí misma o de su descendencia.
export function folderChoices(items: PromoItem[], excludeIds: Set<string>): { folder: PromoItem; depth: number }[] {
  const out: { folder: PromoItem; depth: number }[] = [];
  const walk = (parentId: string, depth: number) => {
    if (depth > 50) return;
    sortItems(items.filter(i => i.parentId === parentId && i.kind === "folder")).forEach(f => {
      if (excludeIds.has(f.id)) return;
      out.push({ folder: f, depth });
      walk(f.id, depth + 1);
    });
  };
  walk(PROMO_ROOT, 0);
  return out;
}

// ─── Comentarios (arrayUnion; escribibles desde la página pública) ───────────
export function buildComment(authorName: string, text: string, source: "app" | "public"): PromoComment {
  return { id: newCommentId(), authorName: authorName.trim() || "Anónimo", text: text.trim(), createdAt: new Date().toISOString(), source };
}
export async function addPromoComment(db: Firestore, itemId: string, comment: PromoComment) {
  await updateDoc(doc(db, "requests", itemId), { messages: arrayUnion(comment), status: "Pendiente" });
}
export async function addGeneralComment(db: Firestore, configId: string, comment: PromoComment) {
  await updateDoc(doc(db, "requests", configId), { generalMessages: arrayUnion(comment), status: "Pendiente" });
}
