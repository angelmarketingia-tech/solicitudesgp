// ─────────────────────────────────────────────────────────────────────────
// Módulo "Promocionales" — tipos, constantes y helpers compartidos por el
// módulo interno (PromoModule) y la página pública (/p/[code]).
// ─────────────────────────────────────────────────────────────────────────
//
// ALMACENAMIENTO: como en el módulo de influencers, para NO depender de
// desplegar reglas nuevas (ver memoria "reglas Firestore sin desplegar"),
// todo vive en la colección `requests` con discriminador `board`:
//   - board: 'promo_config' → doc único de configuración (código del link
//     público permanente + hilo de "comentarios generales")
//   - board: 'promo'        → una pieza promocional (archivo + comentarios)
//
// La empresa externa entra por /p/<código> SIN credenciales: solo ve,
// descarga y comenta (los comentarios se escriben con arrayUnion, permitido
// por las reglas ya desplegadas de `requests`). Editar/eliminar/re-subir es
// exclusivo de los diseñadores dentro de la app.

import type { Firestore } from "firebase/firestore";
import {
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc, arrayUnion,
  serverTimestamp, query, where,
} from "firebase/firestore";

export const PROMO_CONFIG_ID = "PROMO_CONFIG";

export type PromoComment = {
  id: string;
  authorName: string;
  text: string;
  createdAt: string;          // ISO string
  source: "app" | "public";   // origen del comentario
};

export type Promo = {
  id: string;
  title: string;
  description: string;
  fileUrl: string;
  fileName: string;
  fileType: "image" | "pdf" | "video" | "other";
  uploadedBy: string;
  createdAt?: string;
  messages: PromoComment[];
};

export type PromoConfig = {
  id: string;
  shareCode: string;
  generalMessages: PromoComment[];
};

export function fileTypeOf(name: string): Promo["fileType"] {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (["mp4", "mov", "webm", "m4v", "avi"].includes(ext)) return "video";
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
export function promoFromDoc(id: string, data: Record<string, unknown>): Promo {
  return {
    id,
    title: String(data.title || "Promocional"),
    description: String(data.description || ""),
    fileUrl: String(data.fileUrl || ""),
    fileName: String(data.fileName || ""),
    fileType: (String(data.fileType || "other") as Promo["fileType"]),
    uploadedBy: String(data.uploadedBy || ""),
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

// ─── Config: obtener o crear el doc único (con su código permanente) ─────────
export async function getOrCreateConfig(db: Firestore): Promise<PromoConfig> {
  const snap = await getDocs(query(collection(db, "requests"), where("board", "==", "promo_config")));
  const existing = snap.docs[0];
  if (existing) return configFromDoc(existing.id, existing.data());
  // Crear el doc de configuración (código permanente).
  await setDoc(doc(db, "requests", PROMO_CONFIG_ID), {
    board: "promo_config",
    // Campos exigidos por las reglas de `requests`:
    title: "Promocionales — configuración",
    status: "Pendiente",
    deliveryDate: "",
    // Datos propios:
    shareCode: genCode(),
    generalMessages: [],
    createdAt: serverTimestamp(),
  });
  const again = await getDocs(query(collection(db, "requests"), where("board", "==", "promo_config")));
  const created = again.docs[0];
  return configFromDoc(created.id, created.data());
}

// ─── Piezas promocionales ────────────────────────────────────────────────────
export async function createPromo(
  db: Firestore,
  data: { title: string; description: string; fileUrl: string; fileName: string; fileType: Promo["fileType"]; uploadedBy: string },
): Promise<string> {
  const id = `PRO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await setDoc(doc(db, "requests", id), {
    board: "promo",
    // Campos exigidos por las reglas de `requests`:
    title: data.title.trim() || data.fileName || "Promocional",
    status: "Pendiente",
    deliveryDate: "",
    // Datos propios:
    description: data.description,
    fileUrl: data.fileUrl,
    fileName: data.fileName,
    fileType: data.fileType,
    uploadedBy: data.uploadedBy,
    messages: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function updatePromo(
  db: Firestore,
  id: string,
  patch: Partial<Pick<Promo, "title" | "description" | "fileUrl" | "fileName" | "fileType">>,
) {
  const p: Record<string, unknown> = { updatedAt: serverTimestamp(), status: "Pendiente" };
  if (patch.title !== undefined) p.title = patch.title.trim() || "Promocional";
  if (patch.description !== undefined) p.description = patch.description;
  if (patch.fileUrl !== undefined) p.fileUrl = patch.fileUrl;
  if (patch.fileName !== undefined) p.fileName = patch.fileName;
  if (patch.fileType !== undefined) p.fileType = patch.fileType;
  await updateDoc(doc(db, "requests", id), p);
}

export async function deletePromo(db: Firestore, id: string) {
  await deleteDoc(doc(db, "requests", id));
}

// ─── Comentarios (arrayUnion; escribible también desde la página pública) ────
export function buildComment(authorName: string, text: string, source: "app" | "public"): PromoComment {
  return { id: newCommentId(), authorName: authorName.trim() || "Anónimo", text: text.trim(), createdAt: new Date().toISOString(), source };
}

export async function addPromoComment(db: Firestore, promoId: string, comment: PromoComment) {
  await updateDoc(doc(db, "requests", promoId), { messages: arrayUnion(comment), status: "Pendiente" });
}

export async function addGeneralComment(db: Firestore, configId: string, comment: PromoComment) {
  await updateDoc(doc(db, "requests", configId), { generalMessages: arrayUnion(comment), status: "Pendiente" });
}
