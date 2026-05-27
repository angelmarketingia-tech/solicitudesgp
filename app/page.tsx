"use client";

import React, { useState, ChangeEvent, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Calendar, Layout, List, Plus, Search, User,
  FileText, Image as ImageIcon, MessageSquare,
  ChevronRight, CalendarDays, Maximize2, X,
  CheckCircle2, Clock,
  LogOut, AlertCircle, UploadCloud, Bot, Send, Trash2,
  Download, Bell, Sparkles, Target, Building2, ClipboardList, AtSign
} from 'lucide-react';

// ─── Firebase ───
import { db, storage } from '@/lib/firebase';
import {
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc,
  addDoc, query, orderBy, serverTimestamp, getDocs, limit, limitToLast
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import { emailForUser, DEFAULT_TRAFFICKER_EMAIL } from '@/lib/users';
import { compressImageToDataUrl, validateImage } from '@/lib/image';

// ─── Configuración visual de estados y prioridades (tema claro GanaPlay) ───
const STATUS_COLORS: Record<string, string> = {
  "Publicado": "#e6f2ec",
  "Denegado": "#fdecea",
  "Declinada": "#f5e8e8",
  "En Proceso": "#e8f1fc",
  "Planeando": "#f1ebfb",
  "Pendiente": "#fdf3e7",
};

const STATUS_TEXT_COLORS: Record<string, string> = {
  "Publicado": "#00783e",
  "Denegado": "#d92d20",
  "Declinada": "#9c3838",
  "En Proceso": "#0b6bcb",
  "Planeando": "#7c3aed",
  "Pendiente": "#b54708",
};

// Motivos preestablecidos para declinar (selector + opción libre "Otro").
const DECLINE_REASONS = [
  "Información incompleta",
  "Solicitud duplicada",
  "Fuera de alcance",
  "Material incorrecto",
  "Fecha no viable",
  "Otro",
] as const;

const PRIORITY_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  "Bajo":    { bg: "#e6f2ec", text: "#00783e", label: "Bajo" },
  "Medio":   { bg: "#e8f1fc", text: "#0b6bcb", label: "Medio" },
  "Alto":    { bg: "#fdf3e7", text: "#b54708", label: "Alto" },
  "Urgente": { bg: "#fdecea", text: "#d92d20", label: "Urgente" },
};
const priorityConfig = PRIORITY_CONFIG;

// Áreas solicitantes y canales de difusión
const AREAS = ["Pauta", "Redes Sociales", "CMR"];
const CHANNELS = ["Facebook", "Instagram", "Página Web", "CMR"];

const DIMENSION_OPTIONS = [
  // ── Redes sociales (sugerido por defecto: Instagram Feed vertical) ──
  { key: "Post de redes",      label: "Post de redes",      sub: "Pieza para redes sociales" },
  { key: "IG Feed cuadrado",   label: "IG Feed cuadrado",   sub: "1080 × 1080 px" },
  { key: "IG Feed vertical",   label: "IG Feed vertical",   sub: "1080 × 1350 px ★" },
  { key: "IG Feed horizontal", label: "IG Feed horizontal", sub: "1080 × 566 px" },
  { key: "IG Story/Reel",      label: "IG Story / Reel",    sub: "1080 × 1920 px" },
  { key: "Post",               label: "Post",               sub: "Publicación general" },
  // ── Formatos existentes (se mantienen por compatibilidad) ──
  { key: "1080x1080",  label: "1080×1080", sub: "Feed cuadrado" },
  { key: "Historia",   label: "Historia",  sub: "9:16 vertical" },
  { key: "General",    label: "General",   sub: "Formato libre" },
  { key: "Banner Web", label: "Banner Web", sub: "728×90" },
  { key: "Display",    label: "Display",   sub: "300×250" },
  { key: "Hero Web",   label: "Hero Web",  sub: "1920×1080" },
  { key: "Half Page",  label: "Half Page", sub: "300×600" },
];

// Formato sugerido por defecto para piezas de redes sociales.
const DEFAULT_SOCIAL_DIMENSION = "IG Feed vertical";

// Preselección por perfil: área y nombre del solicitante.
const PROFILE_DEFAULTS: Record<string, { area: string; requesterName: string }> = {
  admin:          { area: "Pauta",          requesterName: "Trafficker" },
  cm:             { area: "Redes Sociales", requesterName: "Community Manager" },
  designer:       { area: "Redes Sociales", requesterName: "" },
  operator:       { area: "Pauta",          requesterName: "" },
  administrative: { area: "Pauta",          requesterName: "" },
};

// ─── Diseñadores del sistema ───
// Las contraseñas NO viven aquí: se validan en el servidor vía /api/auth.
const DESIGNER_USERS = ["Juan David", "Eliana", "Verónica", "Caleb"];

// ─── Operadores (Quota, Juan) ───
// Perfiles con mismos permisos que CM pero cada uno con su nombre propio.
// NO acceden al panel interno de diseñadores ni a la IA Andromeda.
const OPERATOR_USER_LIST = ["Quota", "Juan"];

// ─── DIRECTIVOS (Andres, Sebastian, Roberto) ───
// Mismos permisos que CM/operador. Label en UI: "DIRECTIVOS".
// Internamente el rol se llama "administrative" (clave técnica histórica).
const ADMINISTRATIVE_USER_LIST = ["Andres", "Sebastian", "Roberto"];

type RequestStatus = "Publicado" | "Denegado" | "Declinada" | "En Proceso" | "Planeando" | "Pendiente";
type RequestPriority = "Bajo" | "Medio" | "Alto" | "Urgente";

type AIEvaluation = {
  rating: number;
  color: "red" | "yellow" | "green";
  explanation: string;
  validation: string;
};

type Creative = {
  url: string;
  type: string;
  aiEvaluation?: AIEvaluation;
};

type AIFeedback = {
  resumen: string;
  faltantes: string[];
  preguntas_sugeridas: string[];
  checklist: string[];
  riesgos: string[];
  recomendaciones: string[];
  generatedAt?: string;
};

type HistoryEntry = {
  action: string;
  by: string;
  at: string;
};

type RequestType = {
  id: string;
  title: string;
  copy: string;
  format: string;
  dimensions: string[];
  countries: string[];
  requestDate: string;
  deliveryDate: string;
  postPublishDate?: string;
  status: RequestStatus;
  priority: RequestPriority;
  referenceImage?: string;
  assignedTo?: string;
  creatives: Creative[];
  comments?: number;
  // ── Campos ampliados (opcionales: compatibilidad con datos previos) ──
  area?: string;
  requesterName?: string;
  requesterEmail?: string;
  objective?: string;
  channels?: string[];
  aiFeedback?: AIFeedback;
  history?: HistoryEntry[];
  updatedAt?: unknown;
  // ── Declinación (no destructiva) ──
  declineReason?: string;
  declineComment?: string;
  declinedBy?: string;
  declinedAt?: string;
};

type DesignerChatMsg = {
  sender: string;
  text: string;
  time: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string | { type: string; text?: string; image_url?: { url: string } }[];
};

// Mensaje del chat propio de cada solicitud
type RequestMessage = {
  id: string;
  authorName: string;
  authorRole: string;
  message: string;
  image?: string;
  isInternal?: boolean;
  createdAt?: { seconds: number } | null;
};

type NotificationItem = {
  id: string;
  type: 'new_request' | 'status_change' | 'creative_uploaded' | 'assignment' | 'deadline_overdue' | 'deadline_today' | 'deadline_tomorrow';
  title: string;
  message: string;
  requestId?: string;
  targetRole: 'admin' | 'designer';
  read: boolean;
  createdAt?: unknown;
  triggeredBy?: string;
};

export default function GanaPlayMainApp() {
  const [role, setRole] = useState<"admin" | "cm" | "designer" | "operator" | "administrative" | null>(() => {
    try { return (sessionStorage.getItem('gp_role') as "admin" | "cm" | "designer" | "operator" | "administrative" | null) || null; } catch { return null; }
  });
  const [userName, setUserName] = useState<string>(() => {
    try { return sessionStorage.getItem('gp_userName') || ''; } catch { return ''; }
  });

  const [toasts, setToasts] = useState<{ id: number; msg: string; type: 'success' | 'error' | 'info' }[]>([]);
  const addToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  const [requests, setRequests] = useState<RequestType[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // ── Login ──
  const [loginRole, setLoginRole] = useState<"admin" | "cm" | "designer" | "operator" | "administrative" | null>(null);
  const [loginDesignerName, setLoginDesignerName] = useState("");
  const [loginOperatorName, setLoginOperatorName] = useState("");
  const [loginAdministrativeName, setLoginAdministrativeName] = useState("");

  // ── Modales de eliminación / declinación ──
  const [deleteModalOpen, setDeleteModalOpen] = useState<RequestType | null>(null);
  const [deleteAdminPass, setDeleteAdminPass] = useState("");
  const [deleteShowPass, setDeleteShowPass] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [declineModalOpen, setDeclineModalOpen] = useState<RequestType | null>(null);
  const [declineReason, setDeclineReason] = useState<string>(DECLINE_REASONS[0]);
  const [declineComment, setDeclineComment] = useState("");
  const [declineLoading, setDeclineLoading] = useState(false);
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // ── Tablero ──
  const [activeTab, setActiveTab] = useState(() => {
    try { return sessionStorage.getItem('gp_role') === 'designer' ? 'Equipo Diseño' : 'Tablero Kanban'; }
    catch { return 'Tablero Kanban'; }
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedReq, setSelectedReq] = useState<RequestType | null>(null);

  // ── Formulario de nueva solicitud ──
  const [titleStr, setTitleStr] = useState("");
  const [copyStr, setCopyStr] = useState("");
  const [format, setFormat] = useState("static");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [dimensions, setDimensions] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [referenceImg, setReferenceImg] = useState<string | undefined>(undefined);
  const [priority, setPriority] = useState<RequestPriority>("Medio");
  const [area, setArea] = useState(AREAS[0]);
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [objective, setObjective] = useState("");
  const [channels, setChannels] = useState<string[]>([]);

  // ── Archivos / chat ──
  const [loading, setLoading] = useState(false);
  const [aiBriefLoading, setAiBriefLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ reqId: string; x: number; y: number } | null>(null);

  // ── Chat por solicitud ──
  const [reqMessages, setReqMessages] = useState<RequestMessage[]>([]);
  const [reqMsgInput, setReqMsgInput] = useState("");
  const [reqMsgInternal, setReqMsgInternal] = useState(false);
  const [reqMsgImage, setReqMsgImage] = useState<string | null>(null);
  const reqChatRef = useRef<HTMLDivElement>(null);

  // ── Sub-vista del Centro de Diseño ──
  const [designerView, setDesignerView] = useState<'Disponibles' | 'Mías' | 'En proceso' | 'Entregadas'>('Disponibles');

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('andromeda_chat');
      if (saved) return JSON.parse(saved).slice(-20);
    } catch {}
    return [{ role: 'assistant' as const, content: 'Hola. Soy IA Andromeda, especialista en Meta Ads y diseño creativo de GanaPlay. Sube una pieza y te doy feedback con scoring por marca, legibilidad, jerarquía visual y formato.' }];
  });
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatImage, setChatImage] = useState<string | null>(null);
  const [chatLastSentImage, setChatLastSentImage] = useState(false);
  const [aiCaps, setAiCaps] = useState<{ aiConfigured: boolean; visionAvailable: boolean; textProvider?: { name: string; model: string } | null; visionProvider?: { name: string; model: string } | null } | null>(null);

  // ── Chat de equipo ──
  const [teamChatContent, setTeamChatContent] = useState<DesignerChatMsg[]>([]);
  const [teamInput, setTeamInput] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const teamChatRef = useRef<HTMLDivElement>(null);

  // ── Filtros ──
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "Todos">("Todos");

  // ── Drag & drop calendario ──
  const [draggedReqId, setDraggedReqId] = useState<string | null>(null);

  // ── Notificaciones ──
  const [firestoreNotifs, setFirestoreNotifs] = useState<NotificationItem[]>([]);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);

  // ── Calendario semanal ──
  const [weekDays, setWeekDays] = useState<{ dateStr: string; dayName: string; dayNum: number; monthName: string; isToday: boolean; isMonday: boolean }[]>([]);

  // ─── Carga persistente desde Firebase + copia de seguridad local ───
  useEffect(() => {
    try {
      const cached = localStorage.getItem('gp_requests_backup');
      if (cached) {
        const parsed = JSON.parse(cached) as RequestType[];
        if (parsed.length > 0) {
          setRequests(parsed);
          setLoadingData(false);
        }
      }
    } catch {}

    // Límite alto: 1000 solicitudes activas/recientes. Suficiente para 12-24 meses
    // de operación normal del equipo. Cuando se supere, migrar a paginación real.
    const qReq = query(collection(db, "requests"), orderBy("deliveryDate", "desc"), limit(1000));
    const unsubReq = onSnapshot(qReq, (snap) => {
      const data = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as RequestType));
      setRequests(data);
      setLoadingData(false);
      try { localStorage.setItem('gp_requests_backup', JSON.stringify(data)); } catch {}
    }, (err) => {
      console.error("Firebase error:", err);
      setLoadingData(false);
    });

    // Chat del equipo: solo los últimos 300 mensajes en orden ascendente.
    // limitToLast preserva el orden cronológico esperado por el render.
    const qChat = query(collection(db, "team_chat"), orderBy("createdAt", "asc"), limitToLast(300));
    const unsubChat = onSnapshot(qChat, (snap) => {
      const data = snap.docs.map(docSnap => docSnap.data() as DesignerChatMsg);
      setTeamChatContent(data);
    });

    return () => { unsubReq(); unsubChat(); };
  }, []);

  useEffect(() => {
    const curr = new Date();
    const todayDow = curr.getDay();
    const diffToMonday = todayDow === 0 ? -6 : 1 - todayDow;
    const monday = new Date(curr);
    monday.setDate(curr.getDate() + diffToMonday);
    const days = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push({
        dateStr: d.toISOString().split('T')[0],
        dayName: d.toLocaleDateString('es-ES', { weekday: 'long' }),
        dayNum: d.getDate(),
        monthName: d.toLocaleDateString('es-ES', { month: 'short' }),
        isToday: d.toISOString().split('T')[0] === curr.toISOString().split('T')[0],
        isMonday: d.getDay() === 1,
      });
    }
    setWeekDays(days);
    setDeliveryDate(curr.toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chatMessages]);

  useEffect(() => {
    if (teamChatRef.current) teamChatRef.current.scrollTop = teamChatRef.current.scrollHeight;
  }, [teamChatContent]);

  useEffect(() => {
    try { localStorage.setItem('andromeda_chat', JSON.stringify(chatMessages.slice(-20))); } catch {}
  }, [chatMessages]);

  // Capacidades del backend (visión / proveedor) — una sola llamada al abrir la app.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/chat', { method: 'GET' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setAiCaps(data);
      } catch { /* silencioso: la UI seguirá funcionando */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handler = () => setContextMenu(null);
    if (contextMenu) document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  useEffect(() => {
    if (!role) return;
    const targetRoleForNotifs = (role === 'admin' || role === 'cm' || role === 'operator' || role === 'administrative') ? 'admin' : 'designer';
    // Notificaciones: solo las 100 más recientes. Las viejas siguen en Firestore
    // (auditoría) pero no se cargan en el panel de la campanita.
    const qNotif = query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(100));
    const unsub = onSnapshot(qNotif, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as NotificationItem));
      setFirestoreNotifs(all.filter(n => n.targetRole === targetRoleForNotifs));
    });
    return () => unsub();
  }, [role]);

  // ─── Chat de la solicitud abierta (tiempo real) ───
  useEffect(() => {
    if (!modalOpen || !selectedReq) { setReqMessages([]); return; }
    const reqId = selectedReq.id;
    // Mensajes de la solicitud: últimos 200 en orden cronológico ascendente.
    const qMsg = query(collection(db, "requests", reqId, "messages"), orderBy("createdAt", "asc"), limitToLast(200));
    const unsub = onSnapshot(qMsg, (snap) => {
      setReqMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as RequestMessage)));
    }, () => setReqMessages([]));
    return () => unsub();
  }, [modalOpen, selectedReq]);

  useEffect(() => {
    if (reqChatRef.current) reqChatRef.current.scrollTop = reqChatRef.current.scrollHeight;
  }, [reqMessages]);

  // ─── Preselección de datos del solicitante según el perfil ───
  // Cada perfil precarga su área, nombre y correo para reducir clics.
  useEffect(() => {
    if (!role) return;
    const def = PROFILE_DEFAULTS[role];
    if (def?.area) setArea(def.area);
    setRequesterName(def?.requesterName || userName);
    setRequesterEmail(emailForUser(userName) || (role === 'admin' ? DEFAULT_TRAFFICKER_EMAIL : ''));
    // Community Manager: el formato de redes ya viene sugerido (menos clics).
    if (role === 'cm') setDimensions(prev => prev.length ? prev : [DEFAULT_SOCIAL_DIMENSION]);
  }, [role, userName]);

  const toggleSelection = (setter: React.Dispatch<React.SetStateAction<string[]>>, list: string[], val: string) => {
    if (list.includes(val)) setter(list.filter(item => item !== val));
    else setter([...list, val]);
  };

  const getNextId = () => {
    const gpNumbers = requests.map(r => parseInt(r.id.replace("GP", ""))).filter(n => !isNaN(n));
    const maxNum = gpNumbers.length > 0 ? Math.max(...gpNumbers) : 6611;
    return `GP${maxNum + 1}`;
  };

  // ─── Crear notificación interna en Firestore ───
  const createNotification = useCallback(async (
    type: NotificationItem['type'],
    title: string,
    message: string,
    targetRole: 'admin' | 'designer',
    requestId?: string
  ) => {
    try {
      await addDoc(collection(db, "notifications"), {
        type, title, message, targetRole, requestId: requestId || null,
        read: false, createdAt: serverTimestamp(), triggeredBy: userName
      });
    } catch {}
  }, [userName]);

  // ─── Alerta por correo (no bloquea el flujo si falla) ───
  const sendEmailAlert = useCallback(async (payload: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        addToast(data?.error ? `Correo no enviado: ${data.error}` : "Correo de alerta no enviado (revisa configuración de email).", 'info');
      }
    } catch {
      addToast("No se pudo enviar el correo de alerta.", 'info');
    }
  }, [addToast]);

  // ─── Crear solicitud ───
  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleStr || !copyStr || !deliveryDate || dimensions.length === 0 || countries.length === 0
      || !requesterName || !requesterEmail || !objective || !area) {
      addToast("Completa los campos obligatorios del brief (marcados con *).", 'error');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) {
      addToast("El correo del solicitante no es válido.", 'error');
      return;
    }

    const nextId = getNextId();
    const now = new Date().toISOString();
    const newReq: RequestType = {
      id: nextId,
      title: titleStr || "Nuevo Requerimiento",
      copy: copyStr,
      format,
      dimensions,
      countries,
      requestDate: now.split("T")[0],
      deliveryDate,
      status: "Pendiente",
      priority,
      area,
      requesterName,
      requesterEmail,
      objective,
      channels,
      creatives: [],
      comments: 0,
      history: [{ action: "Solicitud creada", by: requesterName, at: now }],
      ...(referenceImg ? { referenceImage: referenceImg } : {}),
    };

    try {
      await setDoc(doc(db, "requests", nextId), { ...newReq, updatedAt: serverTimestamp() });
      setTitleStr(""); setCopyStr(""); setDimensions([]); setCountries([]); setChannels([]);
      setReferenceImg(undefined); setPriority("Medio"); setFormat("static");
      setRequesterName(""); setRequesterEmail(""); setObjective(""); setArea(AREAS[0]);
      setCreateModalOpen(false);
      addToast(`Solicitud ${nextId} creada correctamente.`, 'success');
      await createNotification('new_request', '📋 Nueva solicitud', `${nextId}: "${newReq.title}" — Entrega ${newReq.deliveryDate}`, 'designer', nextId);

      // Regla de alertas: solo prioridad alta/urgente envía correo inmediato.
      if (priority === "Alto" || priority === "Urgente") {
        sendEmailAlert({
          type: "new_request",
          request: {
            id: nextId, title: newReq.title, priority, deliveryDate,
            area, objective, copy: copyStr, requesterName,
          },
        });
      }
    } catch (err: unknown) {
      addToast("Error al guardar: " + (err instanceof Error ? err.message : "desconocido"), 'error');
    }
  };

  // Imagen de referencia: se comprime y guarda como data URL (no usa Storage).
  const handleRefUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const err = validateImage(file);
    if (err) { addToast(err, 'error'); return; }
    setLoading(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setReferenceImg(dataUrl);
      addToast("Imagen de referencia lista.", 'success');
    } catch (e2: unknown) {
      addToast("Error procesando la imagen: " + (e2 instanceof Error ? e2.message : ""), 'error');
    } finally {
      setLoading(false);
    }
  };

  // Imagen del chat IA: se comprime a data URL (no usa Storage).
  const handleChatImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const err = validateImage(file);
    if (err) { addToast(err, 'error'); return; }
    setLoading(true);
    try {
      const dataUrl = await compressImageToDataUrl(file, { maxDimension: 1100, maxBytes: 380 * 1024 });
      setChatImage(dataUrl);
    } catch (e2: unknown) {
      addToast("Error procesando la imagen: " + (e2 instanceof Error ? e2.message : ""), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeStatus = async (e: ChangeEvent<HTMLSelectElement>) => {
    if (!selectedReq || role !== 'designer') return;
    const newStatus = e.target.value as RequestStatus;
    const entry: HistoryEntry = { action: `Estado cambiado a "${newStatus}"`, by: userName, at: new Date().toISOString() };
    const newHistory = [...(selectedReq.history || []), entry];
    try {
      await updateDoc(doc(db, "requests", selectedReq.id), { status: newStatus, history: newHistory, updatedAt: serverTimestamp() });
      setSelectedReq({ ...selectedReq, status: newStatus, history: newHistory });
      await createNotification('status_change', '🔄 Cambio de estado', `${selectedReq.id} "${selectedReq.title}" → ${newStatus} (por ${userName})`, 'admin', selectedReq.id);
    } catch (err: unknown) {
      console.error(err);
      addToast("No se pudo cambiar el estado.", 'error');
    }
  };

  const handleAssignToMe = async (req: RequestType) => {
    if (role !== 'designer') return;
    const entry: HistoryEntry = { action: `Asignada a ${userName}`, by: userName, at: new Date().toISOString() };
    const newHistory = [...(req.history || []), entry];
    try {
      await updateDoc(doc(db, "requests", req.id), { assignedTo: userName, history: newHistory, updatedAt: serverTimestamp() });
      if (selectedReq?.id === req.id) setSelectedReq({ ...selectedReq, assignedTo: userName, history: newHistory });
      addToast(`Te asignaste "${req.title}".`, 'success');
      await createNotification('assignment', '👤 Solicitud asignada', `${req.id} "${req.title}" asignado a ${userName}`, 'admin', req.id);
    } catch (err: unknown) {
      addToast("Error al asignar: " + (err instanceof Error ? err.message : ""), 'error');
    }
  };

  const sendTeamMessage = async () => {
    if (!teamInput.trim()) return;
    const newMsg = {
      sender: userName,
      text: teamInput,
      time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      createdAt: serverTimestamp(),
    };
    try {
      await addDoc(collection(db, "team_chat"), newMsg);
      setTeamInput("");
    } catch (err: unknown) {
      console.error(err);
      addToast("No se pudo enviar el mensaje.", 'error');
    }
  };

  // ─── Enviar comentario/mensaje en una solicitud (texto + imagen opcional) ───
  const sendRequestMessage = async () => {
    if ((!reqMsgInput.trim() && !reqMsgImage) || !selectedReq) return;
    const text = reqMsgInput.trim();
    const image = reqMsgImage;
    setReqMsgInput("");
    setReqMsgImage(null);
    try {
      await addDoc(collection(db, "requests", selectedReq.id, "messages"), {
        authorName: userName,
        authorRole: role,
        message: text,
        ...(image ? { image } : {}),
        isInternal: reqMsgInternal,
        createdAt: serverTimestamp(),
      });
    } catch {
      setReqMsgInput(text);
      setReqMsgImage(image);
      addToast("No se pudo enviar el comentario.", 'error');
    }
  };

  // Procesa una imagen (pegada o adjunta) para el comentario.
  const stageCommentImage = useCallback(async (file: Blob & { type: string; size: number; name?: string }) => {
    const err = validateImage(file);
    if (err) { addToast(err, 'error'); return; }
    try {
      const dataUrl = await compressImageToDataUrl(file, { maxDimension: 1300, maxBytes: 420 * 1024 });
      setReqMsgImage(dataUrl);
      addToast("Imagen lista para enviar.", 'success');
    } catch {
      addToast("No se pudo procesar la imagen.", 'error');
    }
  }, [addToast]);

  // Pegar imagen con Ctrl+V / Cmd+V en el campo de comentario.
  const handleCommentPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith("image/"));
    if (item) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) void stageCommentImage(file);
    }
  };

  const handleCommentAttach = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void stageCommentImage(file);
  };

  // Evaluación IA de una pieza, en segundo plano: NO bloquea la subida.
  const analyzeCreativeInBackground = useCallback(async (
    reqId: string,
    type: string,
    file: File,
    ctx: { copy: string; format: string; countries: string[] },
    creativesAfterUpload: Creative[],
  ) => {
    try {
      const reader = new FileReader();
      const base64data = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64data,
          copy: ctx.copy,
          format: ctx.format,
          country: ctx.countries.join(", "),
          dimensions: type,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const resData = await res.json();
      if (!res.ok || !resData.rating) return;
      const merged = creativesAfterUpload.map(c =>
        c.type === type ? { ...c, aiEvaluation: resData as AIEvaluation } : c);
      await updateDoc(doc(db, "requests", reqId), { creatives: merged });
      setSelectedReq(prev => (prev && prev.id === reqId) ? { ...prev, creatives: merged } : prev);
    } catch {
      /* La evaluación IA es opcional: si falla, la pieza ya quedó guardada. */
    }
  }, []);

  // Sube un archivo entregable. Devuelve la solicitud actualizada (o null si falla).
  // Estrategia anti-cuelgue:
  //   1. Timeout duro de 25 s (no 90).
  //   2. Toast de progreso visible para que el usuario sepa que algo pasa.
  //   3. Si la subida a Storage falla y es una IMAGEN, fallback automático a
  //      data URL comprimida en Firestore (igual que referencias/comentarios).
  //      Así el diseñador NUNCA queda bloqueado por una caída de Storage.
  //   4. ZIP/PDF/archivos grandes solo pueden ir a Storage: si falla, error.
  const uploadDeliverableFile = useCallback(async (
    file: File,
    reqSnapshot: RequestType,
  ): Promise<RequestType | null> => {
    const allowed = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'zip'];
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!allowed.includes(ext)) {
      addToast(`"${file.name}": formato no permitido (usa ${allowed.join(', ')}).`, 'error');
      return null;
    }
    if (file.size > 25 * 1024 * 1024) {
      addToast(`"${file.name}" supera el límite de 25 MB.`, 'error');
      return null;
    }
    const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const type = file.name;

    addToast(`Subiendo "${safeName}"…`, 'info');

    let downloadURL: string | null = null;
    let usedFallback = false;
    let storageErrorMsg: string | null = null;

    // ── Intento 1: Firebase Storage con timeout corto ────────────────
    try {
      const storageRef = ref(storage, `creatives/${reqSnapshot.id}/${Date.now()}_${safeName}`);
      const snapshot = await Promise.race([
        uploadBytes(storageRef, file),
        new Promise<never>((_, reject) => setTimeout(
          () => reject(new Error("storage/timeout: la subida tardó más de 25 s.")), 25000)),
      ]);
      downloadURL = await getDownloadURL(snapshot.ref);
    } catch (err: unknown) {
      const code = (err && typeof err === 'object' && 'code' in err) ? String((err as { code: string }).code) : '';
      const rawMsg = err instanceof Error ? err.message : 'error desconocido';
      console.warn(`[uploadDeliverable] Storage falló para ${safeName}:`, code || rawMsg, err);
      if (code === 'storage/unauthorized' || rawMsg.includes('storage/timeout') ||
          code === 'storage/unknown' || code === 'storage/retry-limit-exceeded' ||
          code === 'storage/quota-exceeded' || code === 'storage/canceled') {
        storageErrorMsg = code === 'storage/unauthorized'
          ? 'Storage rechazó la subida (reglas o bucket inactivo).'
          : (code === 'storage/timeout' || rawMsg.includes('storage/timeout'))
          ? 'Storage tardó más de 25 s. Probable bucket inactivo o sin red.'
          : `Storage no disponible (${code || rawMsg}).`;
      } else {
        storageErrorMsg = rawMsg;
      }
    }

    // ── Intento 2: fallback a data URL en Firestore (solo imágenes) ──
    if (!downloadURL && isImage) {
      try {
        addToast(`Storage no respondió. Guardando "${safeName}" en Firestore…`, 'info');
        const dataUrl = await compressImageToDataUrl(file, { maxDimension: 1800, maxBytes: 700 * 1024 });
        downloadURL = dataUrl;
        usedFallback = true;
      } catch (e2) {
        console.error('[uploadDeliverable] Fallback Firestore también falló:', e2);
      }
    }

    if (!downloadURL) {
      addToast(
        `No se pudo subir "${file.name}". ${storageErrorMsg || ''} ` +
        (isImage ? '' : 'Para PDF/ZIP es necesario activar Firebase Storage.'),
        'error'
      );
      return null;
    }

    // ── Persistir en Firestore ──────────────────────────────────────
    try {
      const newCreative: Creative = { url: downloadURL, type };
      const newCreativesList = [...reqSnapshot.creatives.filter(c => c.type !== type), newCreative];
      const entry: HistoryEntry = {
        action: usedFallback
          ? `Entregable subido a Firestore (Storage caído): ${safeName}`
          : `Entregable subido: ${safeName}`,
        by: userName,
        at: new Date().toISOString(),
      };
      const newHistory = [...(reqSnapshot.history || []), entry];

      await updateDoc(doc(db, "requests", reqSnapshot.id), {
        status: "En Proceso",
        creatives: newCreativesList,
        history: newHistory,
        updatedAt: serverTimestamp(),
      });
      const updatedReq: RequestType = { ...reqSnapshot, status: "En Proceso", creatives: newCreativesList, history: newHistory };
      setSelectedReq(prev => (prev && prev.id === reqSnapshot.id) ? updatedReq : prev);

      if (usedFallback) {
        addToast(`"${safeName}" guardado en Firestore (modo emergencia). Activá Storage en Firebase para uploads grandes.`, 'info');
      }

      // Acciones secundarias NO bloqueantes:
      createNotification('creative_uploaded', '🎨 Entregable subido', `${reqSnapshot.id}: "${safeName}" por ${userName}`, 'admin', reqSnapshot.id);
      if (reqSnapshot.requesterEmail) {
        sendEmailAlert({
          type: "delivery",
          to: reqSnapshot.requesterEmail,
          request: { id: reqSnapshot.id, title: reqSnapshot.title, status: "En Proceso" },
          designer: userName,
          pieceType: type,
          requesterName: reqSnapshot.requesterName || "",
          deliveryDate: reqSnapshot.deliveryDate || "",
        });
      }
      if (isImage) {
        void analyzeCreativeInBackground(reqSnapshot.id, type, file,
          { copy: reqSnapshot.copy, format: reqSnapshot.format, countries: reqSnapshot.countries }, newCreativesList);
      }
      return updatedReq;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'error guardando en Firestore';
      addToast(`Se subió "${safeName}" pero falló al actualizar la solicitud: ${msg}`, 'error');
      return null;
    }
  }, [userName, addToast, createNotification, sendEmailAlert, analyzeCreativeInBackground]);

  // Subida de uno o varios entregables a la vez.
  const handleDeliverablesUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0 || !selectedReq) return;
    let working: RequestType = selectedReq;
    let ok = 0;
    setLoading(true);
    try {
      for (const file of files) {
        const updated = await uploadDeliverableFile(file, working);
        if (updated) { working = updated; ok++; }
      }
      if (ok > 0) addToast(`${ok} entregable${ok > 1 ? 's' : ''} subido${ok > 1 ? 's' : ''} correctamente.`, 'success');
    } finally {
      setLoading(false);
    }
  };

  const sendChatMessage = async () => {
    if (chatLoading) return; // previene doble envío
    if (!chatInput.trim() && !chatImage) return;
    const hadImage = Boolean(chatImage);
    let userContent: ChatMessage['content'] = chatInput;
    if (chatImage) {
      userContent = [
        { type: "text", text: chatInput || "Analiza esta pieza para Meta Ads de GanaPlay y dame scoring + recomendaciones." },
        { type: "image_url", image_url: { url: chatImage } },
      ];
    }
    const userMsg: ChatMessage = { role: "user", content: userContent };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput("");
    setChatImage(null);
    setChatLastSentImage(hadImage);
    setChatLoading(true);

    // Timeout cliente: 60 s. Evita loaders eternos si la red se traba.
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 60000);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setChatMessages([...newMessages, { role: "assistant", content: data.content }]);
      if (data.meta) setAiCaps(prev => prev ? { ...prev, visionAvailable: Boolean(data.meta.visionAvailable) } : prev);
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const text = isAbort
        ? "⏱️ La IA tardó demasiado. Reintenta o reduce el tamaño de la imagen."
        : `❌ ${err instanceof Error ? err.message : "Error desconocido"}`;
      setChatMessages([...newMessages, { role: "assistant", content: text }]);
    } finally {
      clearTimeout(timeoutId);
      setChatLoading(false);
    }
  };

  const handleChangePriority = async (e: ChangeEvent<HTMLSelectElement>) => {
    if (!selectedReq) return;
    const newPriority = e.target.value as RequestPriority;
    const entry: HistoryEntry = { action: `Prioridad cambiada a "${newPriority}"`, by: userName, at: new Date().toISOString() };
    const newHistory = [...(selectedReq.history || []), entry];
    try {
      await updateDoc(doc(db, "requests", selectedReq.id), { priority: newPriority, history: newHistory, updatedAt: serverTimestamp() });
      setSelectedReq({ ...selectedReq, priority: newPriority, history: newHistory });
    } catch (err: unknown) {
      console.error(err);
      addToast("No se pudo cambiar la prioridad.", 'error');
    }
  };

  const handleDownload = async (creative: Creative, reqId: string, dim: string) => {
    // Preserva el formato ORIGINAL del archivo subido. Orden de prioridad para
    // detectar la extensión real:
    //   1. La extensión del nombre original guardado en creative.type
    //      (el campo `type` se usa para guardar el filename original al subir).
    //   2. La extensión del último segmento de la URL.
    //   3. El MIME type del blob descargado.
    //   4. Última opción: "bin" (NO asumir jpg — eso corrompía PDFs/ZIP/etc.).
    const MIME_TO_EXT: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/svg+xml': 'svg',
      'application/pdf': 'pdf',
      'application/zip': 'zip',
      'application/x-zip-compressed': 'zip',
      'application/postscript': 'ai',
      'application/illustrator': 'ai',
      'image/vnd.adobe.photoshop': 'psd',
      'application/octet-stream': '',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
    };
    const extractExt = (str: string): string => {
      const m = str.match(/\.([a-zA-Z0-9]+)(\?|$)/);
      return m ? m[1].toLowerCase() : '';
    };
    const extractMimeFromDataUrl = (url: string): string => {
      const m = url.match(/^data:([^;,]+)[;,]/);
      return m ? m[1].toLowerCase() : '';
    };

    // Calcular nombre base y extensión PRIMERO (sin tocar la URL todavía).
    let ext = extractExt(creative.type || '');
    if (!ext) ext = extractExt(creative.url.split('?')[0]);
    if (!ext && creative.url.startsWith('data:')) {
      ext = MIME_TO_EXT[extractMimeFromDataUrl(creative.url)] || '';
    }
    const originalName = (creative.type || '').replace(/\.[a-zA-Z0-9]+$/, '');
    const safeOriginal = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const baseName = safeOriginal || `${reqId}_${dim.replace(/\s/g, '_')}`;

    try {
      const isDataUrl = creative.url.startsWith('data:');
      const isFirebase =
        creative.url.startsWith('https://firebasestorage.googleapis.com/') ||
        creative.url.startsWith('https://storage.googleapis.com/') ||
        creative.url.includes('.firebasestorage.app/');

      if (isDataUrl) {
        // Data URLs (fallback Firestore): manejo local sin red.
        const response = await fetch(creative.url);
        const blob = await response.blob();
        if (!ext) ext = MIME_TO_EXT[(blob.type || '').toLowerCase()] || 'bin';
        const filename = `${baseName}.${ext}`;
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
        addToast(`Descarga iniciada (${ext.toUpperCase()}).`, 'success');
        return;
      }

      if (isFirebase) {
        // Firebase Storage: usar el proxy server-side para evitar CORS.
        // El proxy fuerza Content-Disposition: attachment y preserva filename.
        if (!ext) ext = 'bin';
        const filename = `${baseName}.${ext}`;
        const proxyUrl = `/api/download?url=${encodeURIComponent(creative.url)}&name=${encodeURIComponent(filename)}`;
        const link = document.createElement('a');
        link.href = proxyUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        addToast(`Descarga iniciada (${ext.toUpperCase()}).`, 'success');
        return;
      }

      // Otras URLs: intentar fetch+blob (puede fallar por CORS, pero igual probamos).
      const response = await fetch(creative.url);
      if (!response.ok) throw new Error(`Servidor respondió ${response.status}.`);
      const blob = await response.blob();
      if (!ext) ext = MIME_TO_EXT[(blob.type || '').toLowerCase()] || 'bin';
      const filename = `${baseName}.${ext}`;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      addToast(`Descarga iniciada (${ext.toUpperCase()}).`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'desconocido';
      addToast(`Error al descargar: ${msg}. Probá abrir la imagen y guardar con clic derecho.`, 'error');
    }
  };

  const handleDeleteCreative = async (reqId: string, dimType: string) => {
    if (!selectedReq) return;
    const newCreatives = selectedReq.creatives.filter(c => c.type !== dimType);
    try {
      await updateDoc(doc(db, "requests", reqId), { creatives: newCreatives, updatedAt: serverTimestamp() });
      setSelectedReq({ ...selectedReq, creatives: newCreatives });
      addToast("Pieza eliminada.", 'info');
    } catch (err: unknown) {
      console.error("Error eliminando creativo:", err);
      addToast("No se pudo eliminar la pieza.", 'error');
    }
  };

  // ═══════════════ ELIMINACIÓN PERMANENTE (solo Trafficker) ═══════════════
  // Flujo:
  //  1. Server valida AUTH_PASS_TRAFFICKER y escribe audit log.
  //  2. Cliente borra archivos en Storage (creatives/{reqId}/*).
  //  3. Cliente borra subcolecciones (messages) y el documento principal.
  // La solicitud NO queda en historial funcional: se elimina del todo.
  const performPermanentDelete = useCallback(async (req: RequestType, adminPass: string) => {
    // 1. Verificación server-side con la contraseña de admin
    const verifyRes = await fetch("/api/requests/admin-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: req.id, adminPass, by: userName }),
    });
    const verifyData = await verifyRes.json().catch(() => ({}));
    if (!verifyRes.ok || !verifyData.ok) {
      throw new Error(verifyData?.error || "No autorizado para eliminar.");
    }

    // 2. Borrar archivos de Storage (best-effort: si Storage falla, igual seguimos
    //    con la limpieza de Firestore para no dejar el doc colgado).
    try {
      const folderRef = ref(storage, `creatives/${req.id}`);
      const listing = await listAll(folderRef);
      await Promise.all(listing.items.map(item => deleteObject(item).catch(() => undefined)));
    } catch (err) {
      console.warn("[permanentDelete] Storage cleanup parcial:", err);
    }

    // 3. Borrar subcolección de mensajes
    try {
      const msgsSnap = await getDocs(collection(db, "requests", req.id, "messages"));
      await Promise.all(msgsSnap.docs.map(d => deleteDoc(d.ref).catch(() => undefined)));
    } catch (err) {
      console.warn("[permanentDelete] Limpieza de mensajes parcial:", err);
    }

    // 4. Borrar documento principal
    await deleteDoc(doc(db, "requests", req.id));

    // 5. Borrar notificaciones que referencien esta solicitud (best-effort)
    try {
      const notifs = firestoreNotifs.filter(n => n.requestId === req.id);
      await Promise.all(notifs.map(n => deleteDoc(doc(db, "notifications", n.id)).catch(() => undefined)));
    } catch { /* no bloquea */ }
  }, [userName, firestoreNotifs]);

  const handleConfirmPermanentDelete = async () => {
    if (!deleteModalOpen) return;
    if (role !== "admin") {
      addToast("Solo el Trafficker puede eliminar permanentemente.", 'error');
      return;
    }
    const req = deleteModalOpen;
    // .trim() limpia espacios/saltos invisibles que el navegador suele pegar
    // junto con la pass desde el autocompletar o copy/paste, lo que causaba 403.
    const cleanPass = deleteAdminPass.trim();
    if (!cleanPass) {
      addToast("Ingresa tu contraseña de Trafficker.", 'error');
      return;
    }
    setDeleteLoading(true);
    try {
      await performPermanentDelete(req, cleanPass);
      addToast(`Solicitud ${req.id} eliminada permanentemente.`, 'success');
      setDeleteModalOpen(null);
      setDeleteAdminPass("");
      setDeleteShowPass(false);
      if (selectedReq?.id === req.id) {
        setSelectedReq(null);
        setModalOpen(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error eliminando.";
      addToast(`No se pudo eliminar: ${msg}`, 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ═══════════════ DECLINAR SOLICITUD (equipo interno autorizado) ═══════════════
  const canDecline = role === "admin" || role === "cm" || role === "operator" || role === "administrative" || role === "designer";

  const handleConfirmDecline = async () => {
    if (!declineModalOpen) return;
    if (!canDecline) {
      addToast("No tienes permiso para declinar.", 'error');
      return;
    }
    const req = declineModalOpen;
    const reason = declineReason;
    const comment = declineComment.trim();
    if (reason === "Otro" && !comment) {
      addToast('Selecciona "Otro" requiere un comentario explicando el motivo.', 'error');
      return;
    }
    setDeclineLoading(true);
    try {
      const at = new Date().toISOString();
      const entry: HistoryEntry = {
        action: `Solicitud declinada: "${reason}"${comment ? ` — ${comment}` : ""}`,
        by: userName,
        at,
      };
      const newHistory = [...(req.history || []), entry];
      const update: Record<string, unknown> = {
        status: "Declinada",
        declineReason: reason,
        declinedBy: userName,
        declinedAt: at,
        history: newHistory,
        updatedAt: serverTimestamp(),
      };
      if (comment) update.declineComment = comment;

      await updateDoc(doc(db, "requests", req.id), update);

      const updatedReq: RequestType = {
        ...req,
        status: "Declinada",
        declineReason: reason,
        declineComment: comment || undefined,
        declinedBy: userName,
        declinedAt: at,
        history: newHistory,
      };
      if (selectedReq?.id === req.id) setSelectedReq(updatedReq);

      addToast(`Solicitud ${req.id} declinada.`, 'success');

      // Notificación interna a admin (trafficker se entera)
      await createNotification(
        'status_change',
        '🚫 Solicitud declinada',
        `${req.id} "${req.title}" declinada por ${userName} — Motivo: ${reason}`,
        'admin',
        req.id,
      );

      // Email al solicitante (si tiene email configurado y RESEND está activo)
      if (req.requesterEmail) {
        sendEmailAlert({
          type: "decline",
          to: req.requesterEmail,
          request: { id: req.id, title: req.title, status: "Declinada" },
          declinedBy: userName,
          reason,
          comment: comment || "",
        });
      }

      setDeclineModalOpen(null);
      setDeclineReason(DECLINE_REASONS[0]);
      setDeclineComment("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error declinando.";
      addToast(`No se pudo declinar: ${msg}`, 'error');
    } finally {
      setDeclineLoading(false);
    }
  };

  const handleDropOnDay = async (dateStr: string) => {
    if (!draggedReqId) return;
    try {
      await updateDoc(doc(db, "requests", draggedReqId), { deliveryDate: dateStr, updatedAt: serverTimestamp() });
    } catch (err: unknown) {
      console.error("Error moviendo solicitud:", err);
    }
    setDraggedReqId(null);
  };

  // ─── Análisis de brief con IA (feedback estructurado) ───
  const runBriefAnalysis = useCallback(async () => {
    if (!selectedReq) return;
    setAiBriefLoading(true);
    try {
      const res = await fetch("/api/brief-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selectedReq.title,
          copy: selectedReq.copy,
          objective: selectedReq.objective,
          area: selectedReq.area,
          channels: selectedReq.channels,
          countries: selectedReq.countries,
          dimensions: selectedReq.dimensions,
          format: selectedReq.format,
          deliveryDate: selectedReq.deliveryDate,
          priority: selectedReq.priority,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Error de IA");
      const feedback: AIFeedback = {
        resumen: data.resumen || "",
        faltantes: data.faltantes || [],
        preguntas_sugeridas: data.preguntas_sugeridas || [],
        checklist: data.checklist || [],
        riesgos: data.riesgos || [],
        recomendaciones: data.recomendaciones || [],
        generatedAt: new Date().toISOString(),
      };
      await updateDoc(doc(db, "requests", selectedReq.id), { aiFeedback: feedback, updatedAt: serverTimestamp() });
      setSelectedReq({ ...selectedReq, aiFeedback: feedback });
      addToast("Análisis de brief generado por la IA.", 'success');
    } catch (err: unknown) {
      addToast("La IA no pudo analizar el brief: " + (err instanceof Error ? err.message : ""), 'error');
    } finally {
      setAiBriefLoading(false);
    }
  }, [selectedReq, addToast]);

  // ─── Login unificado: la contraseña se valida en el servidor ───
  const handleLogin = useCallback(async () => {
    setLoginError("");
    if (!loginRole) return;
    if (loginRole === "designer" && !loginDesignerName) {
      setLoginError("Selecciona tu nombre.");
      return;
    }
    if (loginRole === "operator" && !loginOperatorName) {
      setLoginError("Selecciona tu nombre.");
      return;
    }
    if (loginRole === "administrative" && !loginAdministrativeName) {
      setLoginError("Selecciona tu nombre.");
      return;
    }
    if (!loginPass) {
      setLoginError("Ingresa la contraseña.");
      return;
    }
    setLoginLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: loginRole,
          password: loginPass,
          designerName: loginDesignerName,
          operatorName: loginOperatorName,
          administrativeName: loginAdministrativeName,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setLoginError("❌ " + (data.error || "No se pudo iniciar sesión."));
        return;
      }
      setRole(data.role);
      setUserName(data.userName);
      // Los diseñadores entran directo a su Centro de Diseño (menos clics).
      setActiveTab(data.role === "designer" ? "Equipo Diseño" : "Tablero Kanban");
      try {
        sessionStorage.setItem("gp_role", data.role);
        sessionStorage.setItem("gp_userName", data.userName);
      } catch {}
    } catch {
      setLoginError("❌ Error de red. Verifica tu conexión e intenta de nuevo.");
    } finally {
      setLoginLoading(false);
    }
  }, [loginRole, loginPass, loginDesignerName, loginOperatorName, loginAdministrativeName]);

  const handleLogout = () => {
    setRole(null); setUserName(""); setLoginPass("");
    setLoginDesignerName(""); setLoginOperatorName(""); setLoginAdministrativeName("");
    setLoginError(""); setLoginRole(null); setActiveTab('Tablero Kanban');
    setNotifPanelOpen(false);
    try {
      sessionStorage.removeItem('gp_role');
      sessionStorage.removeItem('gp_userName');
    } catch {}
  };

  // ─── Alertas de vencimiento (calculadas en cliente) ───
  const deadlineAlerts = useMemo<NotificationItem[]>(() => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const alerts: NotificationItem[] = [];
    requests.forEach(req => {
      if (req.status === 'Publicado' || req.status === 'Denegado' || !req.deliveryDate) return;
      const push = (suffix: string, type: NotificationItem['type'], title: string, message: string) => {
        (['admin', 'designer'] as const).forEach(tr => {
          alerts.push({ id: `${suffix}_${tr}_${req.id}`, type, title, message, requestId: req.id, targetRole: tr, read: false });
        });
      };
      if (req.deliveryDate < today) {
        push('ov', 'deadline_overdue', '⚠️ Vencida', `${req.id} "${req.title}" — venció el ${req.deliveryDate}`);
      } else if (req.deliveryDate === today) {
        push('td', 'deadline_today', '🔴 Vence hoy', `${req.id} "${req.title}" — entrega HOY`);
      } else if (req.deliveryDate === tomorrow) {
        push('tm', 'deadline_tomorrow', '🟡 Vence mañana', `${req.id} "${req.title}" — entrega mañana`);
      }
    });
    return alerts;
  }, [requests]);

  const allNotifications = useMemo<NotificationItem[]>(() => {
    const targetRoleForNotifs = (role === 'admin' || role === 'cm' || role === 'operator' || role === 'administrative') ? 'admin' : 'designer';
    const myAlerts = deadlineAlerts.filter(a => a.targetRole === targetRoleForNotifs);
    return [...myAlerts, ...firestoreNotifs];
  }, [deadlineAlerts, firestoreNotifs, role]);

  const unreadCount = useMemo(() => allNotifications.filter(n => !n.read).length, [allNotifications]);

  const markAllRead = useCallback(async () => {
    const unread = firestoreNotifs.filter(n => !n.read);
    await Promise.all(unread.map(n => updateDoc(doc(db, "notifications", n.id), { read: true }).catch(() => {})));
  }, [firestoreNotifs]);

  const navItemStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 15px', borderRadius: '10px', cursor: 'pointer',
    color: isActive ? 'var(--button-text)' : 'var(--text-secondary)', fontWeight: isActive ? 700 : 600,
    background: isActive ? 'var(--accent-color)' : 'transparent',
    fontSize: '13px', transition: 'all 0.18s ease', whiteSpace: 'nowrap',
  });

  // ════════════════════ PANTALLA DE LOGIN ════════════════════
  if (!role) {
    const ROLE_CARDS = [
      { key: 'admin',          icon: '⚡', label: 'Trafficker',         sub: 'Gestión total' },
      { key: 'cm',             icon: '🌐', label: 'Community Manager',  sub: 'Redes y contenido' },
      { key: 'operator',       icon: '👤', label: 'Operador',           sub: 'Quota · Juan' },
      { key: 'administrative', icon: '💼', label: 'DIRECTIVOS',         sub: 'Andres · Sebastian · Roberto' },
      { key: 'designer',       icon: '✦',  label: 'Diseñador',          sub: 'Equipo creativo' },
    ];
    const selectedCard = ROLE_CARDS.find(c => c.key === loginRole);
    return (
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', overflow: 'hidden', background: 'var(--bg-color)' }}>
        <div style={{ position: 'absolute', top: '-12%', left: '-8%', width: '480px', height: '480px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,120,62,0.10) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-15%', right: '-8%', width: '560px', height: '560px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,120,62,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '480px', padding: '24px' }}>
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '78px', height: '78px', borderRadius: '22px', background: 'var(--accent-soft)', border: '1px solid var(--border-color)', marginBottom: '18px', animation: 'float 4s ease-in-out infinite' }}>
              <img src="/logo.png" alt="GanaPlay" style={{ height: '46px', objectFit: 'contain' }} />
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, margin: '0 0 6px', color: 'var(--accent-dark)', letterSpacing: '-0.5px' }}>GanaPlay Diseño</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>Plataforma de solicitudes creativas</p>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1.5px', textAlign: 'center', marginBottom: '12px' }}>Selecciona tu rol</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {ROLE_CARDS.map(card => {
                const active = loginRole === card.key;
                return (
                  <div key={card.key}
                    onClick={() => { setLoginRole(card.key as "admin" | "cm" | "designer" | "operator" | "administrative"); setLoginPass(''); setLoginDesignerName(''); setLoginOperatorName(''); setLoginAdministrativeName(''); setLoginError(''); }}
                    style={{
                      background: active ? 'var(--accent-soft)' : 'var(--panel-bg)',
                      border: `1.5px solid ${active ? 'var(--accent-color)' : 'var(--border-color)'}`,
                      borderRadius: '14px', padding: '16px 8px 14px', cursor: 'pointer', textAlign: 'center',
                      transition: 'all 0.2s ease',
                      boxShadow: active ? '0 6px 18px var(--accent-glow)' : 'var(--shadow-sm)',
                    }}
                  >
                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>{card.icon}</div>
                    <div style={{ fontWeight: 700, fontSize: '12px', color: active ? 'var(--accent-dark)' : 'var(--text-primary)', lineHeight: 1.3, marginBottom: '3px' }}>{card.label}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{card.sub}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {loginRole && selectedCard && (
            <div className="card" style={{ padding: '26px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px' }}>{selectedCard.icon}</div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-dark)', lineHeight: 1.2 }}>Ingresar como {selectedCard.label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Acceso con contraseña</div>
                </div>
              </div>

              {loginRole === 'designer' && (
                <div style={{ marginBottom: '14px' }}>
                  <label className="label">Tu nombre</label>
                  <select value={loginDesignerName} onChange={e => setLoginDesignerName(e.target.value)}>
                    <option value="">— Selecciona tu nombre —</option>
                    {DESIGNER_USERS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              )}

              {loginRole === 'operator' && (
                <div style={{ marginBottom: '14px' }}>
                  <label className="label">Tu nombre</label>
                  <select value={loginOperatorName} onChange={e => setLoginOperatorName(e.target.value)}>
                    <option value="">— Selecciona tu nombre —</option>
                    {OPERATOR_USER_LIST.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              )}

              {loginRole === 'administrative' && (
                <div style={{ marginBottom: '14px' }}>
                  <label className="label">Tu nombre</label>
                  <select value={loginAdministrativeName} onChange={e => setLoginAdministrativeName(e.target.value)}>
                    <option value="">— Selecciona tu nombre —</option>
                    {ADMINISTRATIVE_USER_LIST.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label className="label">Contraseña</label>
                <input type="password" placeholder="••••••••••••"
                  value={loginPass} onChange={e => setLoginPass(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !loginLoading) handleLogin(); }}
                />
              </div>

              {loginError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--danger-soft)', border: '1px solid #f5c6c2', borderRadius: '10px', marginBottom: '14px' }}>
                  <span style={{ color: 'var(--danger)', fontSize: '12px', fontWeight: 600 }}>{loginError}</span>
                </div>
              )}

              <button className="btn" disabled={loginLoading} onClick={handleLogin}
                style={{ width: '100%', padding: '14px', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {loginLoading ? 'Verificando…' : 'Acceder al sistema →'}
              </button>

              <p style={{ textAlign: 'center', fontSize: '10px', color: 'var(--text-muted)', marginTop: '14px', marginBottom: 0 }}>
                🔒 Acceso seguro · GanaPlay {new Date().getFullYear()}
              </p>
            </div>
          )}

          {!loginRole && (
            <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', marginTop: '18px' }}>© {new Date().getFullYear()} GanaPlay · Todos los derechos reservados</p>
          )}
        </div>
      </div>
    );
  }

  // ════════════════════ APLICACIÓN PRINCIPAL ════════════════════
  return (
    <div style={{ maxWidth: '1500px', margin: '0 auto', padding: '20px 16px' }}>

      {/* HEADER */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '20px', paddingBottom: '14px', borderBottom: '1px solid var(--border-color)',
        position: 'sticky', top: 0, zIndex: 50, background: 'var(--bg-color)', paddingTop: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <img src="/logo.png" alt="GanaPlay" style={{ height: '42px', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: '17px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>GanaPlay Diseño</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {role === 'admin'
                ? '⚡ Trafficker'
                : role === 'cm'
                ? '🌐 Community Manager'
                : role === 'operator'
                ? `👤 ${userName}`
                : role === 'administrative'
                ? `💼 ${userName}`
                : `✦ ${userName}`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
          {role !== 'designer' && (
            <button title="Nueva solicitud" className="btn" style={{ padding: '9px 14px', fontSize: '13px' }}
              onClick={() => setCreateModalOpen(true)}>
              <Plus size={16} /> Nueva
            </button>
          )}
          <button title="Notificaciones" className="btn-ghost"
            style={{ padding: '9px 12px', fontSize: '13px', position: 'relative', borderRadius: '10px', cursor: 'pointer' }}
            onClick={() => { setNotifPanelOpen(p => !p); if (!notifPanelOpen) markAllRead(); }}>
            <Bell size={16} />
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: 'var(--danger)', color: '#fff', borderRadius: '50%', minWidth: '18px', height: '18px', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          <button title="Cerrar sesión" className="btn-danger"
            style={{ padding: '9px 12px', fontSize: '13px', borderRadius: '10px', cursor: 'pointer' }}
            onClick={handleLogout}>
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '22px', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
            <CalendarDays color="var(--accent-color)" size={24} /> Solicitudes de diseño
          </h2>
        </div>

        {/* NAV TABS */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '22px', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', flexWrap: 'wrap' }}>
          <div style={navItemStyle(activeTab === 'Tablero Kanban')} onClick={() => setActiveTab('Tablero Kanban')}><Calendar size={15} /> Planeación</div>
          <div style={navItemStyle(activeTab === 'Calendario Entrega')} onClick={() => setActiveTab('Calendario Entrega')}><Layout size={15} /> Por estado</div>
          {(role === 'admin' || role === 'cm' || role === 'operator' || role === 'administrative') && (
            <div style={{ ...navItemStyle(activeTab === 'Pendientes'), position: 'relative' }} onClick={() => setActiveTab('Pendientes')}>
              <AlertCircle size={15} /> Pendientes
              {requests.filter(r => r.status === 'Pendiente').length > 0 && (
                <span style={{ position: 'absolute', top: '-5px', right: '-5px', background: 'var(--warning)', color: '#fff', borderRadius: '50%', width: '16px', height: '16px', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                  {requests.filter(r => r.status === 'Pendiente').length}
                </span>
              )}
            </div>
          )}
          {role === 'designer' && (
            <div style={navItemStyle(activeTab === 'Equipo Diseño')} onClick={() => setActiveTab('Equipo Diseño')}><Sparkles size={15} /> Centro de Diseño</div>
          )}
          <div style={navItemStyle(activeTab === 'Historial')} onClick={() => setActiveTab('Historial')}><Clock size={15} /> Historial</div>
          <div style={navItemStyle(activeTab === 'Tabla Principal')} onClick={() => setActiveTab('Tabla Principal')}><List size={15} /> Tabla</div>
        </div>

        {/* ESTADO DE CARGA */}
        {loadingData && requests.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: '64px' }} />)}
          </div>
        )}

        {/* ─── VISTA: POR ESTADO ─── */}
        {activeTab === 'Calendario Entrega' && (
          <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '16px', minHeight: '60vh', alignItems: 'flex-start' }}>
            {[
              { id: 'Denegado', title: 'Denegado' },
              { id: 'Pendiente', title: 'Pendiente' },
              { id: 'Planeando', title: 'Planeando' },
              { id: 'En Proceso', title: 'En proceso' },
              { id: 'Publicado', title: 'Publicado' },
            ].map(col => {
              const colCards = requests.filter(req => req.status === col.id);
              const colColor = STATUS_TEXT_COLORS[col.id];
              return (
                <div key={col.id} style={{ minWidth: '300px', width: '300px', background: 'var(--surface-1)', borderRadius: '14px', padding: '14px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px', background: STATUS_COLORS[col.id], borderRadius: '20px', width: 'fit-content' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: colColor }} />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{col.title} <span style={{ color: colColor, marginLeft: '4px' }}>{colCards.length}</span></span>
                  </div>
                  {(role === 'admin' || role === 'cm' || role === 'operator' || role === 'administrative') && col.id === 'Pendiente' && (
                    <div style={{ cursor: 'pointer', padding: '11px 14px', borderRadius: '10px', border: '1px dashed var(--accent-color)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-color)', fontSize: '13px', fontWeight: 600, background: 'var(--accent-soft)' }}
                      onClick={() => setCreateModalOpen(true)}>
                      <Plus size={16} /> Nueva solicitud
                    </div>
                  )}
                  {colCards.map(c => (
                    <div key={c.id} className="request-card card"
                      style={{ padding: '14px', cursor: 'pointer', borderLeft: `4px solid ${priorityConfig[c.priority ?? 'Medio'].text}` }}
                      onClick={() => { setSelectedReq(c); setModalOpen(true); }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <FileText size={18} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                            <span style={{ color: 'var(--accent-color)', fontWeight: 800, fontSize: '12px' }}>{c.id}</span> {c.title}
                          </span>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>📅 {c.deliveryDate} · {c.area || 'Sin área'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {colCards.length === 0 && <div style={{ textAlign: 'center', padding: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>Sin solicitudes</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* ─── VISTA: PENDIENTES ─── */}
        {activeTab === 'Pendientes' && (() => {
          const pendingRequests = requests.filter(r => r.status === 'Pendiente');
          return (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                <AlertCircle size={20} color="var(--warning)" />
                <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>Solicitudes pendientes</span>
                <span className="badge badge-pending">{pendingRequests.length}</span>
              </div>
              {pendingRequests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
                  <CheckCircle2 size={48} style={{ opacity: 0.35, marginBottom: '12px' }} />
                  <p>No hay solicitudes pendientes.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {pendingRequests.map(req => (
                    <div key={req.id} className="card"
                      style={{ borderLeft: `4px solid ${priorityConfig[req.priority ?? 'Medio'].text}`, padding: '14px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}
                      onClick={() => { setSelectedReq(req); setModalOpen(true); }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                        <span style={{ fontSize: '12px', color: 'var(--accent-color)', fontWeight: 800 }}>{req.id}</span>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.title}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Entrega: {req.deliveryDate} · {req.countries.join(' / ')}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                        <span className="badge" style={{ background: priorityConfig[req.priority ?? 'Medio'].bg, color: priorityConfig[req.priority ?? 'Medio'].text }}>{req.priority ?? 'Medio'}</span>
                        <ChevronRight size={16} color="var(--accent-color)" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* ─── VISTA: PLANEACIÓN (KANBAN SEMANAL) ─── */}
        {activeTab === 'Tablero Kanban' && (() => {
          const week1 = weekDays.slice(0, 7);
          const week2 = weekDays.slice(7, 14);
          const renderWeek = (days: typeof weekDays) => (
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '14px', overflow: 'hidden', marginBottom: '20px', background: 'var(--panel-bg)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px repeat(7, 1fr)', background: 'var(--surface-1)', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center' }}>
                  {days[0]?.monthName?.toUpperCase()} {days[0] ? new Date(days[0].dateStr).getFullYear() : ''}
                </div>
                {days.map((d) => (
                  <div key={d.dateStr} style={{ padding: '10px 6px', textAlign: 'center', borderLeft: '1px solid var(--border-color)', background: d.isToday ? 'var(--accent-soft)' : 'transparent' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: d.isToday ? 'var(--accent-color)' : 'var(--text-secondary)', textTransform: 'uppercase' }}>{d.dayName.slice(0, 3)}</div>
                    <div style={{ fontSize: '17px', fontWeight: 800, color: d.isToday ? 'var(--accent-color)' : 'var(--text-primary)', lineHeight: 1.2 }}>{d.dayNum}</div>
                    {d.isToday && <div style={{ fontSize: '8px', color: 'var(--accent-color)', fontWeight: 900, letterSpacing: '1px' }}>HOY</div>}
                  </div>
                ))}
              </div>
              {(['Pendiente', 'Planeando', 'En Proceso', 'Publicado', 'Denegado'] as RequestStatus[]).map(status => {
                const rowCards = days.map((d) => ({ day: d, cards: requests.filter(r => r.deliveryDate === d.dateStr && r.status === status) }));
                const hasAny = rowCards.some(x => x.cards.length > 0);
                if (!hasAny) return null;
                return (
                  <div key={status} style={{ display: 'grid', gridTemplateColumns: '120px repeat(7, 1fr)', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ padding: '12px 12px', display: 'flex', alignItems: 'flex-start', borderRight: '1px solid var(--border-color)' }}>
                      <span className="badge" style={{ fontSize: '9px', padding: '3px 8px', background: STATUS_COLORS[status], color: STATUS_TEXT_COLORS[status], whiteSpace: 'nowrap' }}>{status}</span>
                    </div>
                    {rowCards.map(({ day, cards }) => (
                      <div key={day.dateStr}
                        style={{ borderLeft: '1px solid var(--border-color)', padding: '8px', minHeight: '60px', background: day.isToday ? 'var(--accent-soft)' : 'transparent', display: 'flex', flexDirection: 'column', gap: '6px' }}
                        onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                        onDragLeave={e => { (e.currentTarget as HTMLElement).style.background = day.isToday ? 'var(--accent-soft)' : 'transparent'; }}
                        onDrop={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.background = day.isToday ? 'var(--accent-soft)' : 'transparent'; handleDropOnDay(day.dateStr); }}>
                        {cards.map((c) => (
                          <div key={c.id} draggable
                            style={{ padding: '8px 10px', borderRadius: '8px', background: 'var(--surface-1)', border: '1px solid var(--border-color)', cursor: 'grab', borderLeft: `3px solid ${STATUS_TEXT_COLORS[c.status]}`, fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}
                            onClick={() => { setSelectedReq(c); setModalOpen(true); }}
                            onDragStart={e => { e.stopPropagation(); setDraggedReqId(c.id); (e.currentTarget as HTMLElement).style.opacity = '0.5'; }}
                            onDragEnd={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}>
                            <div style={{ color: 'var(--accent-color)', fontSize: '9px', fontWeight: 800, marginBottom: '2px' }}>{c.id}</div>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{c.title}</div>
                            {(c.priority === 'Alto' || c.priority === 'Urgente') && <div style={{ fontSize: '8px', color: 'var(--danger)', fontWeight: 700, marginTop: '2px' }}>⚡ {c.priority.toUpperCase()}</div>}
                          </div>
                        ))}
                        {(role === 'admin' || role === 'cm' || role === 'operator' || role === 'administrative') && cards.length === 0 && (
                          <div title="Agregar solicitud en este día" style={{ opacity: 0.4, cursor: 'pointer', textAlign: 'center', fontSize: '16px', color: 'var(--accent-color)' }}
                            onClick={() => { setDeliveryDate(day.dateStr); setCreateModalOpen(true); }}>+</div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
              {days.every((d) => requests.filter(r => r.deliveryDate === d.dateStr).length === 0) && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', borderTop: '1px solid var(--border-color)' }}>Sin solicitudes esta semana</div>
              )}
            </div>
          );
          return (
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.8px' }}>📅 Semana 1</div>
              {renderWeek(week1)}
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.8px' }}>📅 Semana 2</div>
              {renderWeek(week2)}
            </div>
          );
        })()}

        {/* ─── VISTA: WORKSPACE (DISEÑADOR) ─── */}
        {activeTab === 'Equipo Diseño' && role === 'designer' && (() => {
          const available = requests.filter(r => !r.assignedTo && r.status !== 'Publicado' && r.status !== 'Denegado' && r.status !== 'Declinada');
          const mine = requests.filter(r => r.assignedTo === userName);
          const inProgress = mine.filter(r => r.status === 'En Proceso' || r.status === 'Planeando' || r.status === 'Pendiente');
          const delivered = mine.filter(r => r.status === 'Publicado');
          const viewMap: Record<typeof designerView, RequestType[]> = {
            'Disponibles': available, 'Mías': mine, 'En proceso': inProgress, 'Entregadas': delivered,
          };
          const list = [...viewMap[designerView]].sort((a, b) => (a.deliveryDate || '').localeCompare(b.deliveryDate || ''));
          const activity = DESIGNER_USERS.map(d => ({
            name: d,
            working: requests.filter(r => r.assignedTo === d && r.status !== 'Publicado' && r.status !== 'Denegado' && r.status !== 'Declinada'),
          }));
          return (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Actividad del equipo en tiempo real */}
                <div className="card" style={{ padding: '16px' }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--accent-dark)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <User size={15} /> ¿Quién está trabajando en qué?
                  </h3>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {activity.map(a => (
                      <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: a.name === userName ? 'var(--accent-soft)' : 'var(--surface-1)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '8px 12px' }}>
                        <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--accent-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>
                          {a.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{a.name}</div>
                          <div style={{ fontSize: '10px', color: a.working.length ? 'var(--accent-color)' : 'var(--text-muted)' }}>
                            {a.working.length ? `${a.working.length} en proceso` : 'Disponible'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Solicitudes con sub-vistas y acciones de 1 clic */}
                <div className="card" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
                    {(['Disponibles', 'Mías', 'En proceso', 'Entregadas'] as const).map(v => (
                      <div key={v} onClick={() => setDesignerView(v)}
                        style={{ ...navItemStyle(designerView === v), fontSize: '12px', padding: '7px 12px' }}>
                        {v} ({viewMap[v].length})
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {list.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)', fontSize: '13px' }}>
                        No hay solicitudes en «{designerView}».
                      </div>
                    )}
                    {list.map(req => (
                      <div key={req.id} className="request-card card"
                        style={{ padding: '14px', borderLeft: `4px solid ${priorityConfig[req.priority ?? 'Medio'].text}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                        onClick={() => { setSelectedReq(req); setModalOpen(true); }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '3px' }}>{req.id} • Entrega {req.deliveryDate} • {req.area || 'Sin área'}</div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{req.title}</div>
                          <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span className="badge" style={{ background: STATUS_COLORS[req.status], color: STATUS_TEXT_COLORS[req.status], fontSize: '10px' }}>{req.status}</span>
                            <span className="badge" style={{ background: priorityConfig[req.priority ?? 'Medio'].bg, color: priorityConfig[req.priority ?? 'Medio'].text, fontSize: '10px' }}>{req.priority ?? 'Medio'}</span>
                            {req.assignedTo && <span style={{ fontSize: '11px', color: 'var(--accent-color)' }}><User size={10} style={{ display: 'inline', marginRight: '3px' }} />{req.assignedTo}</span>}
                            {req.creatives.length > 0 && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}><ImageIcon size={11} style={{ display: 'inline', marginRight: '2px' }} />{req.creatives.length}</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          {!req.assignedTo && (
                            <button className="btn-secondary" style={{ padding: '8px 14px', fontSize: '12px', borderRadius: '10px', cursor: 'pointer' }} onClick={() => handleAssignToMe(req)}>+ Asignarme</button>
                          )}
                          <button className="btn" style={{ padding: '8px 14px', fontSize: '12px' }} onClick={() => { setSelectedReq(req); setModalOpen(true); }}>Abrir</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Chat de equipo */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '620px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
                  <MessageSquare size={18} color="var(--accent-color)" /> Chat de equipo
                </div>
                <div ref={teamChatRef} style={{ flexGrow: 1, padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {teamChatContent.length === 0 && <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '20px' }}>No hay mensajes aún. ¡Saluda a tu equipo!</p>}
                  {teamChatContent.map((m, i) => (
                    <div key={i} style={{ alignSelf: m.sender === userName ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px', textAlign: m.sender === userName ? 'right' : 'left' }}>{m.sender} • {m.time}</div>
                      <div style={{ background: m.sender === userName ? 'var(--accent-soft)' : 'var(--surface-2)', padding: '9px 13px', borderRadius: '12px', border: '1px solid var(--border-color)', fontSize: '13px', color: 'var(--text-primary)' }}>{m.text}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '12px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
                  <input type="text" value={teamInput} onChange={(e) => setTeamInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendTeamMessage()} placeholder="Mensaje al equipo..." style={{ fontSize: '13px' }} />
                  <button className="btn" style={{ padding: '10px' }} onClick={sendTeamMessage}><Send size={16} /></button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ─── VISTA: HISTORIAL ─── */}
        {activeTab === 'Historial' && (() => {
          const filtered = requests.filter(r => {
            const matchSearch = searchQuery === '' || r.id.toLowerCase().includes(searchQuery.toLowerCase()) || r.title.toLowerCase().includes(searchQuery.toLowerCase());
            const matchStatus = statusFilter === 'Todos' || r.status === statusFilter;
            return matchSearch && matchStatus;
          });
          return (
            <div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '200px', background: 'var(--gp-white)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '8px 12px' }}>
                  <Search size={16} color="var(--text-muted)" />
                  <input type="text" placeholder="Buscar por ID o título..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, fontSize: '14px', padding: 0, boxShadow: 'none' }} />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as RequestStatus | "Todos")} style={{ width: 'auto', minWidth: '180px' }}>
                  <option value="Todos">Todos los estados</option>
                  {(["Publicado", "En Proceso", "Planeando", "Pendiente", "Denegado"] as RequestStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
              </div>
              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
                  <Search size={48} style={{ opacity: 0.35, marginBottom: '12px' }} />
                  <p>No se encontraron solicitudes.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {[...filtered].sort((a, b) => b.id.localeCompare(a.id)).map(req => (
                    <div key={req.id} className="card" style={{ overflow: 'hidden', borderLeft: `4px solid ${priorityConfig[req.priority ?? 'Medio'].text}` }}>
                      <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', gap: '12px', flexWrap: 'wrap' }}
                        onClick={() => { setSelectedReq(req); setModalOpen(true); }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--accent-color)' }}>{req.id}</span>
                          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{req.title}</span>
                          <span className="badge" style={{ background: STATUS_COLORS[req.status], color: STATUS_TEXT_COLORS[req.status], fontSize: '10px' }}>{req.status}</span>
                          <span className="badge" style={{ background: priorityConfig[req.priority ?? 'Medio'].bg, color: priorityConfig[req.priority ?? 'Medio'].text, fontSize: '10px' }}>{req.priority ?? 'Medio'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                          <span>{req.countries.join(' / ')}</span>
                          <span>Entrega: <strong style={{ color: 'var(--text-primary)' }}>{req.deliveryDate}</strong></span>
                          <ChevronRight size={18} color="var(--accent-color)" />
                        </div>
                      </div>
                      {req.creatives.length > 0 ? (
                        <div style={{ padding: '14px 18px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                          {req.creatives.map((creative, idx) => (
                            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center', background: 'var(--surface-1)', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                              <img src={creative.url} alt={`Creativo ${creative.type}`} style={{ width: '88px', height: '88px', objectFit: 'cover', borderRadius: '8px' }} />
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>{creative.type}</span>
                              {creative.aiEvaluation && (
                                <span className={`badge badge-${creative.aiEvaluation.color}`} style={{ fontSize: '10px' }}>{creative.aiEvaluation.rating}/10</span>
                              )}
                              {(role === 'admin' || role === 'cm' || role === 'operator' || role === 'administrative') && (
                                <button className="btn-secondary" style={{ padding: '5px 10px', fontSize: '11px', width: '100%', borderRadius: '8px', cursor: 'pointer' }}
                                  onClick={() => handleDownload(creative, req.id, creative.type)}>
                                  <Download size={12} /> Descargar
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ padding: '12px 18px', fontSize: '13px', color: 'var(--text-muted)' }}>Sin piezas subidas aún.</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* ─── VISTA: TABLA PRINCIPAL ─── */}
        {activeTab === 'Tabla Principal' && (() => {
          const tableGroups = [
            { name: 'En curso', color: '#7c3aed', statuses: ['Pendiente', 'En Proceso', 'Planeando'] as RequestStatus[] },
            { name: 'Cerradas', color: '#00783e', statuses: ['Publicado', 'Denegado'] as RequestStatus[] },
            { name: 'Declinadas', color: '#9c3838', statuses: ['Declinada'] as RequestStatus[] },
          ];
          const fmtDate = (ds: string) => {
            if (!ds) return '—';
            try { return new Date(ds + 'T12:00:00').toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }); } catch { return ds; }
          };
          const isOverdue = (ds: string) => !!ds && ds < new Date().toISOString().split('T')[0];
          const AVATAR_COLORS = ['#00783e', '#7c3aed', '#b54708', '#0b6bcb', '#d92d20'];
          const avatarColor = (name: string) => AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
          const getInitials = (name: string) => name ? name.slice(0, 2).toUpperCase() : '?';
          const cell = (extra?: React.CSSProperties): React.CSSProperties => ({
            padding: '11px 12px', borderRight: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', overflow: 'hidden', fontSize: '13px', ...extra,
          });
          const COLS = ['Tarea', 'Resp.', 'Estado', 'Vence', 'Prioridad', 'Área', 'Archivos', 'Actualizado'];
          const gridCols = '24px minmax(220px,2fr) 60px 110px 100px 90px 130px 80px 110px';
          return (
            <div>
              {tableGroups.map(group => {
                const groupRows = requests.filter(r => group.statuses.includes(r.status));
                return (
                  <div key={group.name} style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0 8px' }}>
                      <ChevronRight size={14} color={group.color} />
                      <span style={{ fontSize: '14px', fontWeight: 800, color: group.color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{group.name}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{groupRows.length}</span>
                    </div>
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', overflowX: 'auto', background: 'var(--panel-bg)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: gridCols, background: 'var(--surface-1)', borderBottom: '1px solid var(--border-color)', minWidth: '930px' }}>
                        <div style={cell({ justifyContent: 'center' })} />
                        {COLS.map(col => (
                          <div key={col} style={{ ...cell(), fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{col}</div>
                        ))}
                      </div>
                      {groupRows.length === 0 && (
                        <div style={{ padding: '18px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)', minWidth: '930px' }}>Sin solicitudes en este grupo.</div>
                      )}
                      {groupRows.map((req, idx) => {
                        const isDone = req.status === 'Publicado';
                        const over = isOverdue(req.deliveryDate) && !isDone;
                        const assignee = req.assignedTo || '';
                        return (
                          <div key={req.id}
                            style={{ display: 'grid', gridTemplateColumns: gridCols, minWidth: '930px', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', borderLeft: `3px solid ${group.color}` }}
                            onClick={() => { setSelectedReq(req); setModalOpen(true); }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-1)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                            <div style={cell({ justifyContent: 'center', fontSize: '11px', color: 'var(--text-muted)' })}>{idx + 1}</div>
                            <div style={cell()}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--text-primary)', textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.7 : 1 }}>
                                <span style={{ color: 'var(--accent-color)', marginRight: '6px', fontSize: '11px', fontWeight: 800 }}>{req.id}</span>{req.title}
                              </span>
                            </div>
                            <div style={cell({ justifyContent: 'center' })}>
                              {assignee ? (
                                <div title={assignee} style={{ width: '26px', height: '26px', borderRadius: '50%', background: avatarColor(assignee), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800, color: '#fff' }}>{getInitials(assignee)}</div>
                              ) : (
                                <div style={{ width: '26px', height: '26px', borderRadius: '50%', border: '1px dashed var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={12} color="var(--text-muted)" /></div>
                              )}
                            </div>
                            <div style={cell()}>
                              <span className="badge" style={{ background: STATUS_COLORS[req.status], color: STATUS_TEXT_COLORS[req.status], fontSize: '10px', whiteSpace: 'nowrap' }}>{req.status}</span>
                            </div>
                            <div style={cell({ gap: '6px' })}>
                              {req.deliveryDate ? (
                                <>
                                  {isDone && <CheckCircle2 size={13} color="var(--success)" />}
                                  {over && <AlertCircle size={13} color="var(--danger)" />}
                                  <span style={{ fontSize: '12px', color: isDone ? 'var(--success)' : over ? 'var(--danger)' : 'var(--text-secondary)' }}>{fmtDate(req.deliveryDate)}</span>
                                </>
                              ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                            </div>
                            <div style={cell()}>
                              <span className="badge" style={{ background: priorityConfig[req.priority ?? 'Medio'].bg, color: priorityConfig[req.priority ?? 'Medio'].text, fontSize: '10px' }}>{req.priority ?? 'Medio'}</span>
                            </div>
                            <div style={cell()}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', color: 'var(--text-secondary)' }}>{req.area || '—'}</span>
                            </div>
                            <div style={cell({ justifyContent: 'center', gap: '4px' })}>
                              {req.creatives.length > 0 ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-color)' }}><ImageIcon size={14} /><span style={{ fontSize: '11px', fontWeight: 700 }}>{req.creatives.length}</span></span>
                              ) : <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>}
                            </div>
                            <div style={cell({ fontSize: '11px', color: 'var(--text-secondary)' })}>{fmtDate(req.requestDate)}</div>
                          </div>
                        );
                      })}
                      {(role === 'admin' || role === 'cm' || role === 'operator' || role === 'administrative') && (
                        <div style={{ display: 'grid', gridTemplateColumns: gridCols, minWidth: '930px', cursor: 'pointer' }} onClick={() => setCreateModalOpen(true)}>
                          <div style={cell()} />
                          <div style={{ ...cell({ color: 'var(--accent-color)', gap: '6px', fontWeight: 600 }), gridColumn: 'span 8' }}>
                            <Plus size={14} /> <span style={{ fontSize: '13px' }}>Agregar solicitud</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* ─── CHAT IA ANDROMEDA (DISEÑADOR) ─── */}
      {role === 'designer' && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 90 }}>
          {!chatOpen ? (
            <button aria-label="Abrir chat IA Andromeda" onClick={() => setChatOpen(true)} className="btn"
              style={{ borderRadius: '50%', width: '58px', height: '58px', padding: 0, boxShadow: 'var(--shadow-lg)' }}>
              <Bot size={28} />
            </button>
          ) : (
            <div className="card" style={{ width: '380px', height: '560px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ padding: '14px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--accent-soft)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-dark)' }}>
                    <Bot size={22} /> <strong>IA Andromeda</strong>
                    {aiCaps && (
                      <span title={aiCaps.visionAvailable ? `Visión: ${aiCaps.visionProvider?.model}` : 'Sin visión configurada'}
                            style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '999px',
                                     background: aiCaps.visionAvailable ? 'var(--success, #00783e)' : 'var(--warning, #b54708)',
                                     color: '#fff' }}>
                        {aiCaps.visionAvailable ? '👁 visión activa' : '⚠ sin visión'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                    {aiCaps?.textProvider ? `${aiCaps.textProvider.name} · ${aiCaps.textProvider.model}` : 'Marca GanaPlay + Meta Ads'}
                  </div>
                </div>
                <button aria-label="Cerrar chat" onClick={() => setChatOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 0, width: 'auto' }}><X size={20} /></button>
              </div>
              <div ref={scrollRef} style={{ flexGrow: 1, padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {chatMessages.map((msg, i) => (
                  <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', padding: '10px 14px', borderRadius: '14px', fontSize: '13px', lineHeight: 1.55, background: msg.role === 'user' ? 'var(--accent-soft)' : 'var(--surface-1)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                    {Array.isArray(msg.content) ? (
                      <div>
                        {msg.content.map((c, idx) => c.type === 'text'
                          ? <p key={idx} style={{ margin: 0 }}>{c.text}</p>
                          : <img key={idx} src={c.image_url?.url} alt="Imagen adjunta" style={{ width: '100%', borderRadius: '8px', marginTop: '8px' }} />)}
                      </div>
                    ) : msg.content}
                  </div>
                ))}
                {chatLoading && (
                  <div style={{ alignSelf: 'flex-start', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-color)', animation: 'pulse 1s infinite' }} />
                    {chatLastSentImage ? 'Analizando imagen…' : 'Andromeda está escribiendo…'}
                  </div>
                )}
              </div>
              {chatImage && (
                <div style={{ padding: '8px 12px', background: 'var(--accent-soft)', borderTop: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img src={chatImage} alt="Vista previa" style={{ height: '36px', borderRadius: '4px' }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1 }}>Imagen lista para analizar</span>
                    <X size={16} onClick={() => setChatImage(null)} aria-label="Quitar imagen" style={{ cursor: 'pointer', color: 'var(--danger)' }} />
                  </div>
                  {aiCaps && !aiCaps.visionAvailable && (
                    <p style={{ fontSize: '10px', color: 'var(--warning)', margin: '6px 0 0', lineHeight: 1.4 }}>
                      ⚠️ El proveedor de IA actual no soporta visión. Configura <code>OPENAI_API_KEY</code> o <code>VISION_API_KEY</code> para análisis visual real. Mientras tanto, describe la pieza en tu mensaje.
                    </p>
                  )}
                </div>
              )}
              <div style={{ padding: '12px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <label aria-label="Adjuntar imagen" style={{ cursor: 'pointer', color: 'var(--accent-color)', width: 'auto', display: 'flex' }}>
                  <ImageIcon size={22} /><input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleChatImageUpload} />
                </label>
                <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()} placeholder="Pregunta o sube un diseño..." style={{ flexGrow: 1, fontSize: '13px' }} />
                <button onClick={sendChatMessage} className="btn" style={{ padding: '10px' }} disabled={chatLoading}><Send size={18} /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── PANEL DE NOTIFICACIONES ─── */}
      {notifPanelOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 149 }} onClick={() => setNotifPanelOpen(false)} />
          <div className="card" style={{ position: 'fixed', top: '70px', right: '16px', width: '370px', maxHeight: 'calc(100vh - 90px)', zIndex: 150, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--accent-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bell size={16} color="var(--accent-color)" />
                <span style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text-primary)' }}>Notificaciones</span>
                {unreadCount > 0 && <span className="badge badge-red" style={{ fontSize: '11px' }}>{unreadCount} nuevas</span>}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {firestoreNotifs.some(n => !n.read) && (
                  <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '11px', cursor: 'pointer', fontWeight: 700, width: 'auto' }}>Marcar leídas</button>
                )}
                <X size={16} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={() => setNotifPanelOpen(false)} />
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {allNotifications.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  <Bell size={32} style={{ opacity: 0.3, marginBottom: '12px' }} />
                  <p style={{ margin: 0 }}>Sin notificaciones por ahora.</p>
                </div>
              ) : (
                allNotifications.map((n) => {
                  const dotColors: Record<string, string> = {
                    deadline_overdue: 'var(--danger)', deadline_today: 'var(--danger)', deadline_tomorrow: 'var(--warning)',
                    new_request: 'var(--accent-color)', status_change: 'var(--info)', creative_uploaded: '#7c3aed', assignment: '#0b6bcb',
                  };
                  const dot = dotColors[n.type] || 'var(--accent-color)';
                  return (
                    <div key={n.id}
                      style={{ padding: '13px 18px', borderBottom: '1px solid var(--border-color)', background: n.read ? 'transparent' : 'var(--surface-1)', borderLeft: `3px solid ${n.read ? 'transparent' : dot}`, cursor: n.requestId ? 'pointer' : 'default' }}
                      onClick={() => {
                        if (n.requestId) {
                          const req = requests.find(r => r.id === n.requestId);
                          if (req) { setSelectedReq(req); setModalOpen(true); setNotifPanelOpen(false); }
                        }
                      }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: n.read ? 'var(--border-color)' : dot, flexShrink: 0, marginTop: '5px' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', marginBottom: '3px' }}>{n.title}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{n.message}</div>
                          {n.triggeredBy && <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>por {n.triggeredBy}</div>}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {/* ─── MODAL: CREAR SOLICITUD ─── */}
      {createModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(51,51,51,0.45)', backdropFilter: 'blur(3px)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '32px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '720px', maxHeight: '92vh', overflowY: 'auto', padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '24px', margin: 0, color: 'var(--text-primary)' }}>Nueva solicitud de diseño</h2>
              <X size={24} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={() => setCreateModalOpen(false)} />
            </div>
            <form onSubmit={handleCreateRequest}>
              <div className="form-group">
                <label className="label">Título del proyecto *</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: 'var(--accent-color)', fontWeight: 800, fontSize: '16px', whiteSpace: 'nowrap' }}>{getNextId()}</span>
                  <input type="text" placeholder="Nombre del requerimiento..." value={titleStr} onChange={(e) => setTitleStr(e.target.value)} required />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="label">Área solicitante *</label>
                  <select value={area} onChange={(e) => setArea(e.target.value)}>
                    {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Nombre del solicitante *</label>
                  <input type="text" placeholder="Tu nombre" value={requesterName} onChange={(e) => setRequesterName(e.target.value)} required />
                </div>
              </div>

              <div className="form-group">
                <label className="label">Correo del solicitante *</label>
                <input type="email" placeholder="nombre@ganaplay.com" value={requesterEmail} onChange={(e) => setRequesterEmail(e.target.value)} required />
              </div>

              <div className="form-group">
                <label className="label">Objetivo de la pieza *</label>
                <input type="text" placeholder="¿Qué se busca lograr con este diseño?" value={objective} onChange={(e) => setObjective(e.target.value)} required />
              </div>

              <div className="form-group">
                <label className="label">Copy / Instrucción principal *</label>
                <textarea rows={3} value={copyStr} onChange={(e) => setCopyStr(e.target.value)} required />
              </div>

              <div className="form-group">
                <label className="label">Países destino *</label>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {["El Salvador", "Guatemala"].map(country => (
                    <label key={country} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: countries.includes(country) ? 'var(--accent-soft)' : 'var(--surface-1)', padding: '9px 14px', borderRadius: '10px', border: `1px solid ${countries.includes(country) ? 'var(--accent-color)' : 'var(--border-color)'}`, fontSize: '13px', width: 'auto' }}>
                      <input type="checkbox" checked={countries.includes(country)} onChange={() => toggleSelection(setCountries, countries, country)} style={{ width: 'auto' }} />{country}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="label">Canales donde se usará</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {CHANNELS.map(ch => (
                    <label key={ch} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', background: channels.includes(ch) ? 'var(--accent-soft)' : 'var(--surface-1)', padding: '7px 12px', borderRadius: '8px', border: `1px solid ${channels.includes(ch) ? 'var(--accent-color)' : 'var(--border-color)'}`, fontSize: '12px', width: 'auto' }}>
                      <input type="checkbox" checked={channels.includes(ch)} onChange={() => toggleSelection(setChannels, channels, ch)} style={{ width: 'auto' }} />{ch}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="label">Dimensiones / formatos requeridos *</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {DIMENSION_OPTIONS.map(({ key, label, sub }) => (
                    <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: '2px', cursor: 'pointer', background: dimensions.includes(key) ? 'var(--accent-soft)' : 'var(--surface-1)', padding: '9px 12px', borderRadius: '10px', border: `1px solid ${dimensions.includes(key) ? 'var(--accent-color)' : 'var(--border-color)'}`, minWidth: '108px', width: 'auto' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input type="checkbox" checked={dimensions.includes(key)} onChange={() => toggleSelection(setDimensions, dimensions, key)} style={{ width: 'auto' }} />
                        <span style={{ fontWeight: 700, fontSize: '13px' }}>{label}</span>
                      </div>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', paddingLeft: '22px' }}>{sub}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="label">Prioridad *</label>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {(["Bajo", "Medio", "Alto", "Urgente"] as RequestPriority[]).map(p => (
                    <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: priority === p ? priorityConfig[p].bg : 'var(--surface-1)', padding: '9px 18px', borderRadius: '10px', border: `1px solid ${priority === p ? priorityConfig[p].text : 'var(--border-color)'}`, color: priority === p ? priorityConfig[p].text : 'var(--text-secondary)', fontWeight: priority === p ? 700 : 500, width: 'auto', fontSize: '13px' }}>
                      <input type="radio" name="priority" value={p} checked={priority === p} onChange={() => setPriority(p)} style={{ display: 'none' }} />
                      {p}
                    </label>
                  ))}
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '6px 0 0' }}>Las prioridades <strong>Alto</strong> y <strong>Urgente</strong> envían correo inmediato al equipo de diseño.</p>
              </div>

              <div className="form-group">
                <label className="label">Imagen de referencia (opcional)</label>
                <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '26px', background: 'var(--surface-1)', borderRadius: '14px', border: '2px dashed var(--accent-color)', cursor: 'pointer', position: 'relative', width: 'auto' }}>
                  {referenceImg ? (
                    <>
                      <img src={referenceImg} style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '8px' }} alt="Referencia" />
                      <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'var(--danger)', padding: '5px', borderRadius: '50%', cursor: 'pointer', display: 'flex' }} onClick={(e) => { e.preventDefault(); setReferenceImg(undefined); }}>
                        <X size={16} color="#fff" />
                      </div>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={36} color="var(--accent-color)" />
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Sube una imagen de referencia</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>JPG, PNG o GIF (máx. 8 MB)</div>
                      </div>
                    </>
                  )}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleRefUpload} />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="label">Tipo / Formato</label>
                  <select value={format} onChange={(e) => setFormat(e.target.value)}>
                    <option value="static">🖼️ Estático</option>
                    <option value="video">🎬 Video</option>
                    <option value="gif">✨ Animado (GIF)</option>
                    <option value="carousel">🔄 Carrusel</option>
                    <option value="banner">📐 Banner Web</option>
                    <option value="display">🖥️ Display / Rich Media</option>
                    <option value="email">📧 Email Marketing</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Fecha límite de entrega *</label>
                  <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} required />
                </div>
              </div>

              <button type="submit" className="btn" style={{ width: '100%', marginTop: '12px', padding: '15px' }}>
                <ClipboardList size={18} /> Crear y asignar solicitud
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: DETALLE DE SOLICITUD ─── */}
      {modalOpen && selectedReq && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(51,51,51,0.45)', backdropFilter: 'blur(3px)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '32px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '1080px', maxHeight: '94vh', overflowY: 'auto', position: 'relative' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--panel-bg)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 28px', borderRadius: '24px 24px 0 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <Maximize2 size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                  <span style={{ color: 'var(--accent-color)', marginRight: '8px', fontSize: '12px', fontWeight: 800 }}>{selectedReq.id}</span>
                  {selectedReq.title}
                </span>
                <span className="fmt-pill" style={{ flexShrink: 0 }}>
                  {selectedReq.format === 'video' ? '🎬 Video' : selectedReq.format === 'gif' ? '✨ GIF' : selectedReq.format === 'carousel' ? '🔄 Carrusel' : selectedReq.format === 'banner' ? '📐 Banner' : selectedReq.format === 'display' ? '🖥️ Display' : selectedReq.format === 'email' ? '📧 Email' : '🖼️ Estático'}
                </span>
              </div>
              <X size={22} onClick={() => setModalOpen(false)} style={{ cursor: 'pointer', color: 'var(--text-secondary)', flexShrink: 0 }} />
            </div>

            <div style={{ padding: '28px' }}>
              {/* Barra de acciones */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap' }}>
                {role === 'designer' ? (
                  <select value={selectedReq.status} onChange={handleChangeStatus}
                    style={{ width: 'auto', background: STATUS_COLORS[selectedReq.status], color: STATUS_TEXT_COLORS[selectedReq.status], fontWeight: 700, border: `1px solid ${STATUS_TEXT_COLORS[selectedReq.status]}` }}>
                    {["Publicado", "Denegado", "En Proceso", "Planeando", "Pendiente"].map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                ) : (
                  <span className="badge" style={{ padding: '9px 16px', background: STATUS_COLORS[selectedReq.status], color: STATUS_TEXT_COLORS[selectedReq.status], fontSize: '13px' }}>
                    Estado: {selectedReq.status}
                  </span>
                )}
                {(role === 'admin' || role === 'cm' || role === 'operator' || role === 'administrative') ? (
                  <select value={selectedReq.priority ?? 'Medio'} onChange={handleChangePriority}
                    style={{ width: 'auto', background: priorityConfig[selectedReq.priority ?? 'Medio'].bg, color: priorityConfig[selectedReq.priority ?? 'Medio'].text, fontWeight: 700, border: `1px solid ${priorityConfig[selectedReq.priority ?? 'Medio'].text}` }}>
                    {(["Bajo", "Medio", "Alto", "Urgente"] as RequestPriority[]).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                ) : (
                  <span className="badge" style={{ padding: '9px 14px', background: priorityConfig[selectedReq.priority ?? 'Medio'].bg, color: priorityConfig[selectedReq.priority ?? 'Medio'].text, fontSize: '13px' }}>
                    Prioridad: {selectedReq.priority ?? 'Medio'}
                  </span>
                )}
                {role === 'designer' && !selectedReq.assignedTo && (
                  <button className="btn" onClick={() => handleAssignToMe(selectedReq)} style={{ padding: '9px 18px' }}>Asignarme esta solicitud</button>
                )}
                {selectedReq.assignedTo && (
                  <span style={{ fontSize: '13px', color: 'var(--accent-color)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <User size={14} /> Encargado: {selectedReq.assignedTo}
                  </span>
                )}

                {/* Spacer flexible para empujar acciones destructivas a la derecha */}
                <div style={{ flex: 1 }} />

                {/* Declinar solicitud — equipo interno autorizado */}
                {canDecline && selectedReq.status !== "Declinada" && (
                  <button
                    onClick={() => { setDeclineModalOpen(selectedReq); setDeclineReason(DECLINE_REASONS[0]); setDeclineComment(""); }}
                    style={{
                      padding: '9px 16px', fontSize: '12.5px', fontWeight: 700,
                      background: 'var(--surface-1)', color: 'var(--warning, #b54708)',
                      border: '1px solid var(--warning, #b54708)', borderRadius: '10px',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', width: 'auto',
                    }}
                  >
                    <AlertCircle size={14} /> Declinar solicitud
                  </button>
                )}

                {/* Eliminar permanentemente — SOLO Trafficker */}
                {role === "admin" && (
                  <button
                    onClick={() => { setDeleteModalOpen(selectedReq); setDeleteAdminPass(""); setDeleteShowPass(false); }}
                    style={{
                      padding: '9px 16px', fontSize: '12.5px', fontWeight: 700,
                      background: 'var(--danger, #d92d20)', color: '#ffffff',
                      border: '1px solid var(--danger, #d92d20)', borderRadius: '10px',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', width: 'auto',
                    }}
                    title="Solo Trafficker. Elimina solicitud + artes + historial."
                  >
                    <Trash2 size={14} /> Eliminar permanentemente
                  </button>
                )}
              </div>

              {/* Aviso visible si la solicitud ya está declinada */}
              {selectedReq.status === "Declinada" && (
                <div style={{
                  background: 'var(--surface-1)', border: `1px solid ${STATUS_TEXT_COLORS["Declinada"]}`,
                  borderLeft: `4px solid ${STATUS_TEXT_COLORS["Declinada"]}`, borderRadius: '10px',
                  padding: '12px 16px', marginBottom: '20px',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: STATUS_TEXT_COLORS["Declinada"], marginBottom: '4px' }}>
                    🚫 Solicitud declinada
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <strong>Motivo:</strong> {selectedReq.declineReason || "—"}
                    {selectedReq.declineComment && <> · <strong>Comentario:</strong> {selectedReq.declineComment}</>}
                    <br />
                    <strong>Declinada por:</strong> {selectedReq.declinedBy || "—"}
                    {selectedReq.declinedAt && <> · <strong>Fecha:</strong> {new Date(selectedReq.declinedAt).toLocaleString('es-ES')}</>}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                {/* Columna izquierda: brief */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="card" style={{ padding: '18px' }}>
                    <h3 style={{ margin: '0 0 14px', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                      <FileText size={16} color="var(--accent-color)" /> Brief de la solicitud
                    </h3>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                      <span className="badge" style={{ background: 'var(--accent-soft)', color: 'var(--accent-dark)', fontSize: '11px' }}>📅 Entrega: {selectedReq.deliveryDate || '—'}</span>
                      <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', fontSize: '11px' }}>🌎 {selectedReq.countries.join(' · ')}</span>
                      {selectedReq.area && <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', fontSize: '11px' }}><Building2 size={11} style={{ display: 'inline', marginRight: '3px' }} />{selectedReq.area}</span>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {(selectedReq.requesterName || selectedReq.requesterEmail) && (
                        <div style={{ background: 'var(--surface-1)', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>Solicitante</div>
                          <div style={{ fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <User size={13} color="var(--text-muted)" /> {selectedReq.requesterName || '—'}
                            {selectedReq.requesterEmail && <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}><AtSign size={12} />{selectedReq.requesterEmail}</span>}
                          </div>
                        </div>
                      )}
                      {selectedReq.objective && (
                        <div style={{ background: 'var(--surface-1)', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}><Target size={11} style={{ display: 'inline', marginRight: '3px' }} />Objetivo</div>
                          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.55, color: 'var(--text-primary)' }}>{selectedReq.objective}</p>
                        </div>
                      )}
                      <div style={{ background: 'var(--surface-1)', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>Copy / Instrucción</div>
                        <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6, color: 'var(--text-primary)' }}>{selectedReq.copy}</p>
                      </div>
                      <div style={{ background: 'var(--surface-1)', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>Dimensiones</div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {selectedReq.dimensions.map(d => (
                            <span key={d} className="badge" style={{ background: 'var(--accent-soft)', color: 'var(--accent-dark)', fontSize: '11px' }}>{d}</span>
                          ))}
                        </div>
                      </div>
                      {selectedReq.channels && selectedReq.channels.length > 0 && (
                        <div style={{ background: 'var(--surface-1)', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>Canales</div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {selectedReq.channels.map(c => <span key={c} className="badge" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', fontSize: '11px' }}>{c}</span>)}
                          </div>
                        </div>
                      )}
                    </div>
                    {selectedReq.referenceImage && (
                      <div style={{ marginTop: '14px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>Imagen de referencia</div>
                        <img src={selectedReq.referenceImage} alt="Referencia" style={{ width: '100%', maxHeight: '320px', objectFit: 'contain', cursor: 'pointer', borderRadius: '10px', border: '1px solid var(--border-color)' }}
                          onClick={() => window.open(selectedReq.referenceImage, '_blank')} />
                      </div>
                    )}
                  </div>

                  {/* Panel feedback IA */}
                  <div className="card" style={{ padding: '18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                        <Sparkles size={16} color="var(--accent-color)" /> Feedback IA del brief
                      </h3>
                      <button className="btn-secondary" disabled={aiBriefLoading} onClick={runBriefAnalysis}
                        style={{ padding: '7px 12px', fontSize: '12px', borderRadius: '9px', cursor: aiBriefLoading ? 'not-allowed' : 'pointer' }}>
                        {aiBriefLoading ? 'Analizando…' : (selectedReq.aiFeedback ? 'Volver a analizar' : 'Analizar con IA')}
                      </button>
                    </div>
                    {selectedReq.aiFeedback ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-dark)', marginBottom: '4px' }}>Resumen</div>
                          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.55, color: 'var(--text-primary)' }}>{selectedReq.aiFeedback.resumen || 'Sin resumen.'}</p>
                        </div>
                        {([
                          { key: 'faltantes', label: 'Información faltante', color: 'var(--danger)' },
                          { key: 'preguntas_sugeridas', label: 'Preguntas al solicitante', color: 'var(--info)' },
                          { key: 'checklist', label: 'Checklist de producción', color: 'var(--accent-color)' },
                          { key: 'riesgos', label: 'Riesgos de plazo', color: 'var(--warning)' },
                          { key: 'recomendaciones', label: 'Recomendaciones', color: 'var(--accent-dark)' },
                        ] as const).map(section => {
                          const items = selectedReq.aiFeedback?.[section.key] || [];
                          if (items.length === 0) return null;
                          return (
                            <div key={section.key}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: section.color, marginBottom: '4px' }}>{section.label}</div>
                              <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                {items.map((it, i) => <li key={i} style={{ fontSize: '12.5px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>{it}</li>)}
                              </ul>
                            </div>
                          );
                        })}
                        {selectedReq.aiFeedback.generatedAt && (
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Generado: {new Date(selectedReq.aiFeedback.generatedAt).toLocaleString('es-ES')}</div>
                        )}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                        <Sparkles size={28} style={{ opacity: 0.35, marginBottom: '8px' }} />
                        <p style={{ margin: 0 }}>Aún sin análisis. La IA resume el brief, detecta faltantes y genera un checklist de producción.</p>
                      </div>
                    )}
                  </div>

                  {/* Historial de cambios */}
                  {selectedReq.history && selectedReq.history.length > 0 && (
                    <div className="card" style={{ padding: '18px' }}>
                      <h3 style={{ margin: '0 0 12px', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                        <Clock size={16} color="var(--accent-color)" /> Historial de cambios
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {[...selectedReq.history].slice(-12).reverse().map((h, i) => (
                          <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12px' }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-color)', marginTop: '5px', flexShrink: 0 }} />
                            <div>
                              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{h.action}</span>
                              <span style={{ color: 'var(--text-muted)' }}> · {h.by} · {(() => { try { return new Date(h.at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }); } catch { return h.at; } })()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Comentarios / Recomendaciones (texto + imágenes) */}
                  <div className="card" style={{ padding: '18px' }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                      <MessageSquare size={16} color="var(--accent-color)" /> Comentarios / Recomendaciones
                    </h3>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
                      Escribe o pega referencias (datos del partido, estadio, fecha…). Puedes pegar imágenes con Ctrl+V.
                    </p>
                    <div ref={reqChatRef} style={{ maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
                      {reqMessages.filter(m => role === 'designer' || !m.isInternal).length === 0 && (
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', margin: 0 }}>
                          Aún no hay comentarios. Escribe una recomendación o pega una imagen de referencia.
                        </p>
                      )}
                      {reqMessages.filter(m => role === 'designer' || !m.isInternal).map(m => {
                        const isMine = m.authorName === userName;
                        return (
                          <div key={m.id} style={{ alignSelf: isMine ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px', textAlign: isMine ? 'right' : 'left' }}>
                              {m.authorName} · {m.authorRole}
                              {m.isInternal && <span style={{ color: 'var(--warning)', fontWeight: 700 }}> · nota interna</span>}
                              {m.createdAt?.seconds ? ' · ' + new Date(m.createdAt.seconds * 1000).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                            </div>
                            <div style={{ padding: '9px 13px', borderRadius: '12px', fontSize: '13px', color: 'var(--text-primary)', border: '1px solid var(--border-color)', background: m.isInternal ? 'var(--warning-soft)' : isMine ? 'var(--accent-soft)' : 'var(--surface-2)' }}>
                              {m.message && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.message}</div>}
                              {m.image && (
                                <img src={m.image} alt="Imagen del comentario" loading="lazy"
                                  style={{ marginTop: m.message ? '8px' : 0, maxWidth: '100%', maxHeight: '260px', borderRadius: '8px', cursor: 'pointer', display: 'block' }}
                                  onClick={() => window.open(m.image, '_blank')} />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {role === 'designer' && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px', width: 'auto', cursor: 'pointer' }}>
                        <input type="checkbox" checked={reqMsgInternal} onChange={e => setReqMsgInternal(e.target.checked)} style={{ width: 'auto' }} />
                        Nota interna (no visible para el solicitante)
                      </label>
                    )}
                    {reqMsgImage && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', background: 'var(--surface-1)', border: '1px solid var(--border-color)', borderRadius: '10px', marginBottom: '8px' }}>
                        <img src={reqMsgImage} alt="Vista previa" style={{ height: '44px', borderRadius: '6px' }} />
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1 }}>Imagen lista para enviar</span>
                        <X size={16} style={{ cursor: 'pointer', color: 'var(--danger)' }} onClick={() => setReqMsgImage(null)} />
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <label aria-label="Adjuntar imagen" title="Adjuntar imagen" style={{ cursor: 'pointer', color: 'var(--accent-color)', width: 'auto', display: 'flex' }}>
                        <ImageIcon size={20} />
                        <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={handleCommentAttach} />
                      </label>
                      <input type="text" value={reqMsgInput} onChange={e => setReqMsgInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendRequestMessage()}
                        onPaste={handleCommentPaste}
                        placeholder="Comentario o recomendación… (pega imágenes con Ctrl+V)" style={{ fontSize: '13px', flex: 1 }} />
                      <button className="btn" style={{ padding: '10px' }} onClick={sendRequestMessage}><Send size={16} /></button>
                    </div>
                  </div>
                </div>

                {/* Columna derecha: entregables */}
                <div>
                  <h3 style={{ margin: '0 0 12px', fontSize: '15px', color: 'var(--text-primary)' }}>Entregables</h3>

                  {selectedReq.dimensions.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>Formatos solicitados:</span>
                      {selectedReq.dimensions.map(d => (
                        <span key={d} className="badge" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', fontSize: '10px' }}>{d}</span>
                      ))}
                    </div>
                  )}

                  {role === 'designer' && (
                    <>
                      <label className="btn" style={{ width: '100%', cursor: 'pointer', padding: '12px' }}>
                        <UploadCloud size={16} /> Subir entregables (uno o varios)
                        <input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.zip"
                          onChange={handleDeliverablesUpload} style={{ display: 'none' }} />
                      </label>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0 14px' }}>
                        Formatos: JPG, PNG, WEBP, PDF, ZIP. Puedes seleccionar varios archivos a la vez.
                      </p>
                    </>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {selectedReq.creatives.length === 0 && (
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '26px', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
                        {role === 'designer' ? 'Aún no hay entregables. Sube uno o varios archivos arriba.' : 'Aún no hay entregables subidos por el diseñador.'}
                      </div>
                    )}
                    {selectedReq.creatives.map((creative, idx) => {
                      const isFile = /\.(pdf|zip)$/i.test(creative.type);
                      return (
                        <div key={idx} className="card" style={{ padding: '14px' }}>
                          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                            {isFile ? (
                              <div style={{ width: '70px', height: '70px', borderRadius: '8px', flexShrink: 0, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FileText size={26} color="var(--text-secondary)" />
                              </div>
                            ) : (
                              <img src={creative.url} alt={creative.type} style={{ width: '70px', height: '70px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0, border: '1px solid var(--border-color)' }} />
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{creative.type}</div>
                              {creative.aiEvaluation && (
                                <span className={`badge badge-${creative.aiEvaluation.color}`} style={{ fontSize: '10px', marginTop: '4px' }}>IA: {creative.aiEvaluation.rating}/10</span>
                              )}
                              {creative.aiEvaluation?.explanation && (
                                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '6px 0 0', lineHeight: 1.5 }}>{creative.aiEvaluation.explanation}</p>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                            <button className="btn-secondary" style={{ flex: 1, padding: '7px 12px', fontSize: '12px', borderRadius: '9px', cursor: 'pointer' }}
                              onClick={() => handleDownload(creative, selectedReq.id, creative.type)}>
                              <Download size={14} /> Descargar
                            </button>
                            {role === 'designer' && (
                              <button className="btn-danger" style={{ padding: '7px 12px', fontSize: '12px', borderRadius: '9px', cursor: 'pointer' }}
                                onClick={() => handleDeleteCreative(selectedReq.id, creative.type)}>
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY DE CARGA / SUBIDA DE ARCHIVOS */}
      {loading && (
        <div className="loading-overlay">
          <div style={{ width: '260px', textAlign: 'center' }}>
            <UploadCloud size={32} color="var(--accent-color)" style={{ marginBottom: '12px' }} />
            <div className="loader" style={{ margin: '0 auto 12px' }} />
            <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>Procesando archivo…</p>
          </div>
        </div>
      )}

      {/* ─── MODAL: ELIMINACIÓN PERMANENTE (solo Trafficker) ─── */}
      {deleteModalOpen && role === "admin" && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', zIndex: 200, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="card" style={{ maxWidth: '520px', width: '100%', padding: '26px', borderTop: '4px solid var(--danger, #d92d20)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <Trash2 size={22} color="var(--danger, #d92d20)" />
              <h2 style={{ margin: 0, fontSize: '17px', color: 'var(--danger, #d92d20)' }}>Eliminar permanentemente</h2>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6, margin: '0 0 12px' }}>
              Esta acción eliminará permanentemente la solicitud <strong>{deleteModalOpen.id}</strong> &mdash; &ldquo;{deleteModalOpen.title}&rdquo; &mdash; <strong>y todos sus artes asociados</strong>.
            </p>
            <ul style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '20px', margin: '0 0 18px' }}>
              <li>No aparecerá en historial funcional, listados ni búsquedas.</li>
              <li>Los archivos en Storage se borrarán.</li>
              <li>No podrá recuperarse desde la plataforma.</li>
              <li>Queda registro de auditoría (sin contenido) con tu nombre y fecha.</li>
            </ul>

            <div style={{ marginBottom: '16px' }}>
              <label className="label">Contraseña de Trafficker</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={deleteShowPass ? "text" : "password"}
                  value={deleteAdminPass}
                  onChange={e => setDeleteAdminPass(e.target.value)}
                  placeholder="Tu contraseña de admin"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  style={{ paddingRight: '64px' }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !deleteLoading && deleteAdminPass.trim()) {
                      e.preventDefault();
                      handleConfirmPermanentDelete();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => setDeleteShowPass(v => !v)}
                  style={{
                    position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
                    background: 'transparent', border: 'none', color: 'var(--text-secondary)',
                    fontSize: '11px', fontWeight: 600, cursor: 'pointer', padding: '4px 8px', width: 'auto',
                  }}
                >{deleteShowPass ? 'Ocultar' : 'Mostrar'}</button>
              </div>
              <p style={{ fontSize: '10.5px', color: 'var(--text-muted)', margin: '6px 0 0' }}>
                Se valida en el servidor (no se guarda en el navegador). Los espacios al inicio/final se ignoran.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setDeleteModalOpen(null); setDeleteAdminPass(""); setDeleteShowPass(false); }}
                disabled={deleteLoading}
                style={{
                  padding: '10px 18px', fontSize: '13px', fontWeight: 600,
                  background: 'var(--surface-1)', color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)', borderRadius: '10px', cursor: 'pointer', width: 'auto',
                }}
              >Cancelar</button>
              <button
                onClick={handleConfirmPermanentDelete}
                disabled={deleteLoading || deleteAdminPass.trim().length === 0}
                style={{
                  padding: '10px 18px', fontSize: '13px', fontWeight: 700,
                  background: 'var(--danger, #d92d20)', color: '#ffffff',
                  border: '1px solid var(--danger, #d92d20)', borderRadius: '10px',
                  cursor: deleteLoading ? 'wait' : 'pointer', width: 'auto',
                  opacity: deleteAdminPass.trim().length === 0 ? 0.5 : 1,
                }}
              >{deleteLoading ? 'Eliminando…' : 'Eliminar permanentemente'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: DECLINAR SOLICITUD (equipo interno) ─── */}
      {declineModalOpen && canDecline && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', zIndex: 200, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="card" style={{ maxWidth: '500px', width: '100%', padding: '26px', borderTop: `4px solid ${STATUS_TEXT_COLORS["Declinada"]}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <AlertCircle size={22} color={STATUS_TEXT_COLORS["Declinada"]} />
              <h2 style={{ margin: 0, fontSize: '17px', color: STATUS_TEXT_COLORS["Declinada"] }}>Declinar solicitud</h2>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6, margin: '0 0 14px' }}>
              <strong>{declineModalOpen.id}</strong> &mdash; &ldquo;{declineModalOpen.title}&rdquo;
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 16px' }}>
              La solicitud cambiará a estado <strong>Declinada</strong> y saldrá de las vistas activas. Conserva trazabilidad (motivo, usuario y fecha) en historial. No se borra ningún archivo.
            </p>

            <div style={{ marginBottom: '14px' }}>
              <label className="label">Motivo</label>
              <select value={declineReason} onChange={e => setDeclineReason(e.target.value)}>
                {DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label className="label">
                Comentario {declineReason === "Otro" ? <span style={{ color: 'var(--danger)' }}>*</span> : <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span>}
              </label>
              <textarea
                value={declineComment}
                onChange={e => setDeclineComment(e.target.value)}
                placeholder={declineReason === "Otro" ? "Explica el motivo…" : "Detalle opcional…"}
                rows={3}
                style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setDeclineModalOpen(null); setDeclineReason(DECLINE_REASONS[0]); setDeclineComment(""); }}
                disabled={declineLoading}
                style={{
                  padding: '10px 18px', fontSize: '13px', fontWeight: 600,
                  background: 'var(--surface-1)', color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)', borderRadius: '10px', cursor: 'pointer', width: 'auto',
                }}
              >Cancelar</button>
              <button
                onClick={handleConfirmDecline}
                disabled={declineLoading || (declineReason === "Otro" && !declineComment.trim())}
                style={{
                  padding: '10px 18px', fontSize: '13px', fontWeight: 700,
                  background: STATUS_TEXT_COLORS["Declinada"], color: '#ffffff',
                  border: `1px solid ${STATUS_TEXT_COLORS["Declinada"]}`, borderRadius: '10px',
                  cursor: declineLoading ? 'wait' : 'pointer', width: 'auto',
                  opacity: (declineReason === "Otro" && !declineComment.trim()) ? 0.5 : 1,
                }}
              >{declineLoading ? 'Declinando…' : 'Confirmar declinación'}</button>
            </div>
          </div>
        </div>
      )}

      {/* TOASTS */}
      {toasts.length > 0 && (
        <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 300, display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', pointerEvents: 'none' }}>
          {toasts.map(t => (
            <div key={t.id} style={{
              padding: '11px 20px', borderRadius: '12px', fontSize: '13px', fontWeight: 600,
              background: 'var(--panel-bg)', color: 'var(--text-primary)',
              border: `1px solid ${t.type === 'success' ? '#bfe0ce' : t.type === 'error' ? '#f5c6c2' : 'var(--border-color)'}`,
              borderLeft: `4px solid ${t.type === 'success' ? 'var(--success)' : t.type === 'error' ? 'var(--danger)' : 'var(--info)'}`,
              boxShadow: 'var(--shadow-md)', whiteSpace: 'nowrap', animation: 'toast-in 0.2s ease',
            }}>
              {t.type === 'success' ? '✓ ' : t.type === 'error' ? '✕ ' : 'ℹ '}{t.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
