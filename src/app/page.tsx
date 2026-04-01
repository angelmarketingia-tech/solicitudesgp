"use client";

import React, { useState, ChangeEvent, useEffect, useRef, useMemo, useCallback } from 'react';

// ─── Constantes fuera del componente para evitar recrearlas en cada render ───
const STATUS_COLORS: Record<string, string> = {
  "Publicado": "rgba(34, 197, 94, 0.2)",
  "Denegado": "rgba(239, 68, 68, 0.2)",
  "En Proceso": "rgba(59, 130, 246, 0.2)",
  "Planeando": "rgba(168, 85, 247, 0.2)",
  "Pendiente": "rgba(245, 158, 11, 0.2)",
};

const STATUS_TEXT_COLORS: Record<string, string> = {
  "Publicado": "#4ade80",
  "Denegado": "#f87171",
  "En Proceso": "#60a5fa",
  "Planeando": "#c084fc",
  "Pendiente": "#fbbf24",
};

const PRIORITY_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  "Bajo":  { bg: "rgba(34, 197, 94, 0.2)",  text: "#4ade80", label: "● Bajo" },
  "Medio": { bg: "rgba(245, 158, 11, 0.2)", text: "#fbbf24", label: "● Medio" },
  "Alto":  { bg: "rgba(239, 68, 68, 0.2)",  text: "#f87171", label: "● Alto" },
};
const priorityConfig = PRIORITY_CONFIG;
import {
  Calendar, Layout, List, Plus, Search, MoreHorizontal, User,
  FileText, Link as LinkIcon, Image as ImageIcon, MessageSquare,
  ChevronRight, ChevronLeft, CalendarDays, Maximize2, X, Hash,
  CheckCircle2, Globe, FileType, AlignLeft, Paperclip, Clock,
  LogOut, AlertCircle, UploadCloud, FileImage, Bot, Send, Trash2,
  Download
} from 'lucide-react';

type RequestStatus = "Publicado" | "Denegado" | "En Proceso" | "Planeando" | "Pendiente";
type RequestPriority = "Bajo" | "Medio" | "Alto";

type Creative = {
  url: string;
  type: string; 
  aiEvaluation?: {
    rating: number;
    color: "red" | "yellow" | "green";
    explanation: string;
    validation: string;
  };
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
  status: RequestStatus;
  priority: RequestPriority;
  referenceImage?: string;
  creatives: Creative[];
  comments?: number;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string | any[];
};

export default function GanaPlayMainApp() {
  const [role, setRole] = useState<"admin" | "designer" | null>(null);
  const [requests, setRequests] = useState<RequestType[]>([]);
  
  // Board State
  const [activeTab, setActiveTab] = useState('Tablero Kanban');
  const [modalOpen, setModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedReq, setSelectedReq] = useState<RequestType | null>(null);

  // Form State
  const [titleStr, setTitleStr] = useState("");
  const [copyStr, setCopyStr] = useState("");
  const [format, setFormat] = useState("static");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [dimensions, setDimensions] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [referenceImg, setReferenceImg] = useState<string | undefined>(undefined);
  const [priority, setPriority] = useState<RequestPriority>("Medio");

  // Designer File & Chat State
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{role: 'assistant', content: 'Hola. Soy la IA Andromeda de Meta Ads. Puedo analizar tus piezas si las subes. ¿En qué recomendación creativa te puedo ayudar?'}]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatImage, setChatImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);

  // History/filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "Todos">("Todos");

  // Weekly Calendar Generation
  const [weekDays, setWeekDays] = useState<{dateStr: string, dayName: string, dayNum: number}[]>([]);

  // Load persisted requests from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ganaplay_requests');
      if (saved) setRequests(JSON.parse(saved));
    } catch (_) {}
  }, []);

  // Save requests to localStorage whenever they change (skip initial render)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    localStorage.setItem('ganaplay_requests', JSON.stringify(requests));
  }, [requests]);

  useEffect(() => {
    const curr = new Date();
    const day = curr.getDay() || 7; 
    const monday = new Date(curr);
    monday.setDate(curr.getDate() - (day - 1));
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        days.push({
            dateStr: d.toISOString().split('T')[0],
            dayName: d.toLocaleDateString('es-ES', { weekday: 'short' }),
            dayNum: d.getDate()
        });
    }
    setWeekDays(days);
    setDeliveryDate(curr.toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const toggleSelection = (setter: React.Dispatch<React.SetStateAction<string[]>>, list: string[], val: string) => {
    if (list.includes(val)) setter(list.filter(item => item !== val));
    else setter([...list, val]);
  };

  const getNextId = () => {
    const gpNumbers = requests
      .map(r => parseInt(r.id.replace("GP", "")))
      .filter(n => !isNaN(n));
    const maxNum = gpNumbers.length > 0 ? Math.max(...gpNumbers) : 6611; 
    return `GP${maxNum + 1}`;
  };

  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!copyStr || !deliveryDate || dimensions.length === 0 || countries.length === 0) {
      alert("Por favor completa todos los campos requeridos (Países, Dimensiones, Copy, Fecha).");
      return;
    }

    const nextId = getNextId();
    const newReq: RequestType = {
      id: nextId,
      title: titleStr || "Nuevo Requerimiento",
      copy: copyStr,
      format: format,
      dimensions: dimensions,
      countries: countries,
      requestDate: new Date().toISOString().split("T")[0],
      deliveryDate: deliveryDate,
      status: "Pendiente",
      priority: priority,
      referenceImage: referenceImg,
      creatives: [],
      comments: 0
    };
    
    setRequests([...requests, newReq]);
    setTitleStr(""); setCopyStr(""); setDimensions([]); setCountries([]); setReferenceImg(undefined); setPriority("Medio");
    setCreateModalOpen(false);
  };

  const handleRefUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => setReferenceImg(reader.result as string);
  };

  const handleChatImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => setChatImage(reader.result as string);
  };

  const handleChangeStatus = (e: ChangeEvent<HTMLSelectElement>) => {
    if(!selectedReq) return;
    const updated = { ...selectedReq, status: e.target.value as RequestStatus };
    setRequests(requests.map(r => r.id === updated.id ? updated : r));
    setSelectedReq(updated);
  };

  const handleDesignerUpload = async (e: ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (!file || !selectedReq) return;

    setLoading(true);
    setErrorMsg(null);
    
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = async () => {
      const base64data = reader.result as string;
      
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: base64data,
            copy: selectedReq.copy,
            format: selectedReq.format,
            country: selectedReq.countries.join(", "),
            dimensions: type
          })
        });
        
        const resData = await res.json();
        if (!res.ok) throw new Error(resData.error || "Error de la IA evaluadora.");
        
        const newCreative: Creative = {
          url: base64data,
          type: type,
          aiEvaluation: resData
        };

        const updatedReq = {
          ...selectedReq,
          status: "En Proceso" as RequestStatus,
          creatives: [...selectedReq.creatives.filter(c => c.type !== type), newCreative]
        };

        setRequests(requests.map(r => r.id === updatedReq.id ? updatedReq : r));
        setSelectedReq(updatedReq);
        
      } catch (err: any) {
        setErrorMsg(err.message);
      } finally {
        setLoading(false);
      }
    };
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() && !chatImage) return;
    
    let userContent: any = chatInput;
    if (chatImage) {
      userContent = [
        { type: "text", text: chatInput || "¿Qué opinas de este diseño para el algoritmo Andromeda?" },
        { type: "image_url", image_url: { url: chatImage } }
      ];
    }

    const userMsg = { role: "user" as const, content: userContent };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages); 
    setChatInput(""); 
    setChatImage(null);
    setChatLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setChatMessages([...newMessages, { role: "assistant", content: data.content }]);
    } catch (e: any) {
      setChatMessages([...newMessages, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleChangePriority = (e: ChangeEvent<HTMLSelectElement>) => {
    if (!selectedReq) return;
    const updated = { ...selectedReq, priority: e.target.value as RequestPriority };
    setRequests(requests.map(r => r.id === updated.id ? updated : r));
    setSelectedReq(updated);
  };

  const handleDownload = (creative: Creative, reqId: string, dim: string) => {
    const link = document.createElement('a');
    link.href = creative.url;
    const ext = creative.url.startsWith('data:image/png') ? 'png' : creative.url.startsWith('data:image/gif') ? 'gif' : 'jpg';
    link.download = `${reqId}_${dim.replace(/\s/g, '_')}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const navItemStyle = (isActive: boolean) => ({
    display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '12px', cursor: 'pointer',
    color: isActive ? 'var(--button-text)' : 'var(--text-secondary)', fontWeight: isActive ? 700 : 500,
    background: isActive ? 'linear-gradient(135deg, #22c55e, #10b981)' : 'transparent',
    textTransform: 'uppercase' as 'uppercase', letterSpacing: '1px', fontSize: '13px'
  });

  if (!role) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div className="glass-panel" style={{ padding: "60px", textAlign: "center", maxWidth: "500px", width: "100%" }}>
          <img src="/logo.png" alt="GanaPlay Logo" style={{ height: "80px", marginBottom: "20px", display: "inline-block" }} />
          <h1 style={{ marginBottom: "10px", color: "var(--text-primary)", fontSize: "32px", letterSpacing: "1px" }}>GanaPlay Diseño</h1>
          <p style={{ color: "var(--text-secondary)", marginBottom: "40px", fontSize: "16px" }}>Plataforma Kanban v4.0</p>
          <button className="btn" style={{ width: "100%", marginBottom: "16px", padding: "16px", fontSize: "16px" }} onClick={() => setRole("admin")}>
            <User size={22} /> Entrar como Trafficker
          </button>
          <button className="btn btn-secondary" style={{ width: "100%", padding: "16px", fontSize: "16px" }} onClick={() => setRole("designer")}>
            <FileImage size={22} /> Entrar como Diseñador
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ gridTemplateColumns: "1fr", position: 'relative' }}>
      
      <div className="header">
        <div className="header-brand">
          <img src="/logo.png" alt="GanaPlay Logo" style={{ height: "60px" }} />
          <h1 style={{ display: "flex", alignItems: "center", gap: "10px", margin: 0, fontSize: "28px", letterSpacing: "0.5px" }}>
             GanaPlay Diseño <span style={{ fontSize: "14px", color: "var(--text-secondary)", fontWeight: 400, transform: "translateY(2px)" }}>| {role === 'admin' ? 'Trafficker' : 'Diseñador'}</span>
          </h1>
        </div>
        <button className="btn btn-secondary" style={{ padding: "10px 20px" }} onClick={() => { setRole(null); setActiveTab('Tablero Kanban'); }}>
          <LogOut size={16} /> Salir
        </button>
      </div>

      <div className="glass-panel" style={{ padding: "40px" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
          <h2 style={{ fontSize: '32px', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
              <CalendarDays color="var(--accent-color)" size={32} /> Central de Pautas
          </h2>
          {role === 'admin' && (
            <button className="btn" onClick={() => setCreateModalOpen(true)}>
              <Plus size={18} /> Nuevo Requerimiento
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '30px', borderBottom: '1px solid var(--border-color)', paddingBottom: '20px' }}>
          <div style={navItemStyle(activeTab === 'Tablero Kanban')} onClick={() => setActiveTab('Tablero Kanban')}><Calendar size={16} /> Kanban Semanal</div>
          {role === 'admin' && (
            <div style={{ ...navItemStyle(activeTab === 'Pendientes'), position: 'relative' }} onClick={() => setActiveTab('Pendientes')}>
              <AlertCircle size={16} /> Pendientes
              {requests.filter(r => r.status === 'Pendiente').length > 0 && (
                <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#f87171', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                  {requests.filter(r => r.status === 'Pendiente').length}
                </span>
              )}
            </div>
          )}
          <div style={navItemStyle(activeTab === 'Historial')} onClick={() => setActiveTab('Historial')}><Clock size={16} /> Historial</div>
        </div>

        {/* KANBAN VIEW */}
        {activeTab === 'Tablero Kanban' && (
          <div style={{ border: '1px solid var(--border-color)', borderRadius: '16px', overflow: 'hidden', background: 'rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border-color)', background: 'rgba(34, 197, 94, 0.05)' }}>
              {weekDays.map(d => (
                <div key={d.dateStr} style={{ padding: '16px 12px', textAlign: 'center', fontSize: '14px', color: 'var(--accent-color)', fontWeight: 800, textTransform: 'uppercase' }}>
                  {d.dayName}
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', minHeight: '600px' }}>
              {weekDays.map((d, i) => {
                const dayCards = requests.filter(req => req.deliveryDate === d.dateStr);
                return (
                  <div key={d.dateStr} style={{ borderRight: i === 6 ? 'none' : '1px solid var(--border-color)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ textAlign: 'right', fontSize: '16px', color: 'var(--text-secondary)', fontWeight: 700, paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      {role === 'admin' && <span onClick={() => { setDeliveryDate(d.dateStr); setCreateModalOpen(true); }} style={{float:'left', color: 'var(--accent-color)', cursor:'pointer'}}><Plus size={16}/></span>}
                      {d.dayNum}
                    </div>
                    {dayCards.map(c => (
                      <div key={c.id} className="request-card" style={{ padding: '16px', borderRadius: '12px', background: 'rgba(0,0,0,0.5)', cursor: 'pointer', borderLeft: `3px solid ${priorityConfig[c.priority ?? 'Medio'].text}` }} onClick={() => { setSelectedReq(c); setModalOpen(true); }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-color)' }}>{c.id}</div>
                          <span style={{ fontSize: '9px', fontWeight: 700, color: priorityConfig[c.priority ?? 'Medio'].text, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{c.priority ?? 'Medio'}</span>
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>{c.title}</div>
                        <span style={{ padding: '4px 8px', fontSize: '10px', background: STATUS_COLORS[c.status], color: STATUS_TEXT_COLORS[c.status], borderRadius: '6px', fontWeight: 'bold', textTransform: 'uppercase', border: `1px solid ${STATUS_TEXT_COLORS[c.status]}` }}>
                          {c.status}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PENDIENTES VIEW (admin only) */}
        {activeTab === 'Pendientes' && role === 'admin' && (() => {
          const pending = requests.filter(r => r.status === 'Pendiente');
          return (
            <div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
                {pending.length} solicitud{pending.length !== 1 ? 'es' : ''} esperando atención.
              </p>
              {pending.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
                  <CheckCircle2 size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                  <p>Sin solicitudes pendientes.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {pending.map(req => (
                    <div key={req.id} className="request-card" style={{ padding: '20px 24px', borderRadius: '14px', background: 'rgba(0,0,0,0.5)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(245,158,11,0.3)', borderLeft: `4px solid ${priorityConfig[req.priority ?? 'Medio'].text}` }}
                      onClick={() => { setSelectedReq(req); setModalOpen(true); }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-color)' }}>{req.id}</span>
                          <span style={{ padding: '3px 8px', fontSize: '10px', background: STATUS_COLORS['Pendiente'], color: STATUS_TEXT_COLORS['Pendiente'], borderRadius: '6px', fontWeight: 'bold', textTransform: 'uppercase', border: `1px solid ${STATUS_TEXT_COLORS['Pendiente']}` }}>Pendiente</span>
                          <span style={{ padding: '3px 8px', fontSize: '10px', background: priorityConfig[req.priority ?? 'Medio'].bg, color: priorityConfig[req.priority ?? 'Medio'].text, borderRadius: '6px', fontWeight: 'bold', textTransform: 'uppercase', border: `1px solid ${priorityConfig[req.priority ?? 'Medio'].text}` }}>{req.priority ?? 'Medio'}</span>
                        </div>
                        <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>{req.title}</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{req.copy}</div>
                        <div style={{ marginTop: '8px', display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          <span><Globe size={12} style={{ display:'inline', marginRight:'4px' }} />{req.countries.join(', ')}</span>
                          <span><FileType size={12} style={{ display:'inline', marginRight:'4px' }} />{req.dimensions.join(' · ')}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '13px', color: 'var(--text-secondary)', marginLeft: '20px', flexShrink: 0 }}>
                        <div style={{ fontWeight: 600, color: '#fbbf24' }}>Entrega</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{req.deliveryDate}</div>
                        <ChevronRight size={20} style={{ marginTop: '10px', color: 'var(--accent-color)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* HISTORIAL VIEW */}
        {activeTab === 'Historial' && (() => {
          const filtered = requests.filter(r => {
            const matchSearch = searchQuery === '' || r.id.toLowerCase().includes(searchQuery.toLowerCase()) || r.title.toLowerCase().includes(searchQuery.toLowerCase());
            const matchStatus = statusFilter === 'Todos' || r.status === statusFilter;
            return matchSearch && matchStatus;
          });
          return (
            <div>
              {/* Filters */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '200px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px 14px' }}>
                  <Search size={16} color="var(--text-secondary)" />
                  <input type="text" placeholder="Buscar por ID o título..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, fontSize: '14px', color: 'var(--text-primary)', padding: 0 }} />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '14px' }}>
                  <option value="Todos">Todos los estados</option>
                  {(["Publicado","En Proceso","Planeando","Pendiente","Denegado"] as RequestStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
              </div>

              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
                  <Search size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                  <p>No se encontraron solicitudes.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {filtered.sort((a, b) => b.id.localeCompare(a.id)).map(req => (
                    <div key={req.id} style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', borderRadius: '16px', overflow: 'hidden', borderLeft: `4px solid ${priorityConfig[req.priority ?? 'Medio'].text}` }}>
                      {/* Header */}
                      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                        onClick={() => { setSelectedReq(req); setModalOpen(true); }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-color)' }}>{req.id}</span>
                          <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{req.title}</span>
                          <span style={{ padding: '3px 8px', fontSize: '10px', background: STATUS_COLORS[req.status], color: STATUS_TEXT_COLORS[req.status], borderRadius: '6px', fontWeight: 'bold', textTransform: 'uppercase', border: `1px solid ${STATUS_TEXT_COLORS[req.status]}` }}>{req.status}</span>
                          <span style={{ padding: '3px 8px', fontSize: '10px', background: priorityConfig[req.priority ?? 'Medio'].bg, color: priorityConfig[req.priority ?? 'Medio'].text, borderRadius: '6px', fontWeight: 'bold', textTransform: 'uppercase', border: `1px solid ${priorityConfig[req.priority ?? 'Medio'].text}` }}>{req.priority ?? 'Medio'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                          <span>{req.countries.join(' / ')}</span>
                          <span>Entrega: <strong style={{ color: 'var(--text-primary)' }}>{req.deliveryDate}</strong></span>
                          <ChevronRight size={18} color="var(--accent-color)" />
                        </div>
                      </div>

                      {/* Creatives row */}
                      {req.creatives.length > 0 && (
                        <div style={{ padding: '16px 20px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                          {req.creatives.map((creative, idx) => (
                            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                              <img src={creative.url} style={{ width: '90px', height: '90px', objectFit: 'cover', borderRadius: '8px' }} />
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>{creative.type}</span>
                              {creative.aiEvaluation && (
                                <span className={`badge badge-${creative.aiEvaluation.color}`} style={{ fontSize: '10px' }}>{creative.aiEvaluation.rating}/10</span>
                              )}
                              {role === 'admin' && (
                                <button className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '11px', width: '100%' }}
                                  onClick={() => handleDownload(creative, req.id, creative.type)}>
                                  <Download size={12} /> Descargar
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {req.creatives.length === 0 && (
                        <div style={{ padding: '12px 20px', fontSize: '13px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)' }}>
                          Sin piezas subidas aún.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* AI ASSISTANT CHAT */}
      {role === 'designer' && (
        <div style={{ position: 'fixed', bottom: '30px', right: '30px', zIndex: 90 }}>
          {!chatOpen ? (
            <button onClick={() => setChatOpen(true)} className="btn" style={{ borderRadius: '50%', width: '65px', height: '65px', padding: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Bot size={35} />
            </button>
          ) : (
            <div className="glass-panel" style={{ width: '400px', height: '600px', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--accent-color)', boxShadow: '0 0 40px rgba(0,0,0,0.8)' }}>
              <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(16, 185, 129, 0.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Bot color="var(--accent-color)" size={24} /> <strong>IA Andromeda</strong></div>
                <X size={20} style={{ cursor: 'pointer' }} onClick={() => setChatOpen(false)} />
              </div>
              <div ref={scrollRef} style={{ flexGrow: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {chatMessages.map((msg, i) => (
                  <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: '12px 16px', borderRadius: '16px', background: msg.role === 'user' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(0,0,0,0.5)', border: `1px solid ${msg.role === 'user' ? 'var(--accent-color)' : 'var(--border-color)'}` }}>
                    {Array.isArray(msg.content) ? (
                      <div>
                        {msg.content.map((c:any, idx:number) => c.type === 'text' ? <p key={idx}>{c.text}</p> : <img key={idx} src={c.image_url.url} style={{ width: '100%', borderRadius: '8px', marginTop: '10px' }} /> )}
                      </div>
                    ) : msg.content}
                  </div>
                ))}
              </div>
              {chatImage && <div style={{ padding: '10px', background: 'rgba(34, 197, 94, 0.1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img src={chatImage} style={{ height: '40px', borderRadius: '4px' }} /> <span style={{ fontSize: '12px' }}>Imagen cargada...</span> <X size={16} onClick={()=>setChatImage(null)} style={{cursor:'pointer'}} />
              </div>}
              <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '10px' }}>
                <label style={{ cursor: 'pointer', color: 'var(--accent-color)' }}><ImageIcon size={24} /><input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleChatImageUpload} /></label>
                <input type="text" value={chatInput} onChange={(e)=>setChatInput(e.target.value)} onKeyDown={(e)=>e.key==='Enter'&&sendChatMessage()} placeholder="Pregunta o sube diseño..." style={{ flexGrow: 1 }} />
                <button onClick={sendChatMessage} className="btn" style={{ padding: '10px' }}><Send size={18} /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CREATE MODAL */}
      {createModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(10px)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px' }}>
           <div className="glass-panel" style={{ width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto', padding: '40px', border: '1px solid var(--accent-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                <h2 style={{ fontSize: '28px', margin: 0 }}>Generar Solicitud</h2>
                <X size={24} style={{ cursor: 'pointer', color: 'var(--danger)' }} onClick={() => setCreateModalOpen(false)} />
              </div>
              <form onSubmit={handleCreateRequest}>
                <div className="form-group">
                  <label className="label">Título del Creativo</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ color: 'var(--accent-color)', fontWeight: 'bold', fontSize: '18px' }}>{getNextId()}</span>
                    <input type="text" placeholder="Escribe un nombre para este proyecto..." value={titleStr} onChange={(e) => setTitleStr(e.target.value)} required />
                  </div>
                </div>
                <div className="form-group"><label className="label">Copy / Instrucción Principal</label><textarea rows={3} value={copyStr} onChange={(e) => setCopyStr(e.target.value)} required /></div>
                <div className="form-group"><label className="label">Países Destino</label><div style={{ display: 'flex', gap: '15px' }}>{["El Salvador", "Guatemala"].map(country => (<label key={country} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'rgba(0,0,0,0.4)', padding: '10px 16px', borderRadius: '10px', border: countries.includes(country) ? '1px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.1)' }}><input type="checkbox" checked={countries.includes(country)} onChange={() => toggleSelection(setCountries, countries, country)} style={{ width: 'auto', padding: 0 }} />{country}</label>))}</div></div>
                <div className="form-group"><label className="label">Dimensiones (Se activarán en la subida)</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>{["1080x1080", "Historia", "General"].map(dim => (<label key={dim} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'rgba(0,0,0,0.4)', padding: '10px 16px', borderRadius: '10px', border: dimensions.includes(dim) ? '1px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.1)' }}><input type="checkbox" checked={dimensions.includes(dim)} onChange={() => toggleSelection(setDimensions, dimensions, dim)} style={{ width: 'auto', padding: 0 }} />{dim}</label>))}</div></div>
                <div className="form-group">
                  <label className="label">Prioridad</label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {(["Bajo", "Medio", "Alto"] as RequestPriority[]).map(p => (
                      <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: priority === p ? priorityConfig[p].bg : 'rgba(0,0,0,0.4)', padding: '10px 20px', borderRadius: '10px', border: `1px solid ${priority === p ? priorityConfig[p].text : 'rgba(255,255,255,0.1)'}`, color: priority === p ? priorityConfig[p].text : 'var(--text-secondary)', fontWeight: priority === p ? 700 : 500, transition: 'all 0.2s' }}>
                        <input type="radio" name="priority" value={p} checked={priority === p} onChange={() => setPriority(p)} style={{ display: 'none' }} />
                        {p}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="label">Imagen de Referencia (Opcional)</label>
                  <label style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '12px', 
                    padding: '30px', 
                    background: 'rgba(0,0,0,0.4)', 
                    borderRadius: '16px', 
                    border: '2px dashed var(--accent-color)', 
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    {referenceImg ? (
                      <>
                        <img src={referenceImg} style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '8px' }} alt="Referencia" />
                        <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(239, 68, 68, 0.8)', padding: '5px', borderRadius: '50%', cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); setReferenceImg(undefined); }}>
                          <X size={16} color="white" />
                        </div>
                      </>
                    ) : (
                      <>
                        <UploadCloud size={40} color="var(--accent-color)" style={{ opacity: 0.7 }} />
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Sube una imagen de referencia</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>JPG, PNG o GIF (Máx 5MB)</div>
                        </div>
                      </>
                    )}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleRefUpload} />
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}><div className="form-group"><label className="label">Tipo de Archivo</label><select value={format} onChange={(e) => setFormat(e.target.value)}><option value="static">Estático</option><option value="video">Video</option><option value="gif">Animado (GIF)</option></select></div><div className="form-group"><label className="label">Fecha de Entrega</label><input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} required /></div></div>
                <button type="submit" className="btn" style={{ width: "100%", marginTop: "20px", padding: "18px" }}>Crear y Asignar Tarjeta</button>
              </form>
           </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {modalOpen && selectedReq && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(10px)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '1100px', maxHeight: '95vh', overflowY: 'auto', position: 'relative', border: '1px solid var(--accent-color)' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--panel-bg)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 30px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Maximize2 size={18} /> <span>{selectedReq.id} - {selectedReq.title}</span></div>
              <X size={24} onClick={() => setModalOpen(false)} style={{ cursor: 'pointer' }} />
            </div>

            <div style={{ padding: '40px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '30px', flexWrap: 'wrap' }}>
                <select value={selectedReq.status} onChange={handleChangeStatus} style={{ background: STATUS_COLORS[selectedReq.status], color: STATUS_TEXT_COLORS[selectedReq.status], fontWeight: 'bold', padding: '10px', borderRadius: '8px' }}>
                  {["Publicado", "Denegado", "En Proceso", "Planeando", "Pendiente"].map(st => <option key={st} value={st}>{st}</option>)}
                </select>
                {role === 'admin' ? (
                  <select value={selectedReq.priority ?? 'Medio'} onChange={handleChangePriority} style={{ background: priorityConfig[selectedReq.priority ?? 'Medio'].bg, color: priorityConfig[selectedReq.priority ?? 'Medio'].text, fontWeight: 'bold', padding: '10px', borderRadius: '8px', border: `1px solid ${priorityConfig[selectedReq.priority ?? 'Medio'].text}` }}>
                    {(["Bajo", "Medio", "Alto"] as RequestPriority[]).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                ) : (
                  <span style={{ padding: '8px 14px', borderRadius: '8px', background: priorityConfig[selectedReq.priority ?? 'Medio'].bg, color: priorityConfig[selectedReq.priority ?? 'Medio'].text, fontWeight: 700, border: `1px solid ${priorityConfig[selectedReq.priority ?? 'Medio'].text}`, fontSize: '14px' }}>
                    Prioridad: {selectedReq.priority ?? 'Medio'}
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '16px' }}>
                  <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '20px' }}>Instrucciones del Trafficker</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <p style={{ margin: 0 }}><strong>Copy:</strong> {selectedReq.copy}</p>
                    <p style={{ margin: 0 }}><strong>Países:</strong> {selectedReq.countries.join(", ")}</p>
                    <p style={{ margin: 0 }}><strong>Dimensiones Solicitadas:</strong> {selectedReq.dimensions.join(", ")}</p>
                    
                    {selectedReq.referenceImage && (
                      <div style={{ marginTop: '10px' }}>
                        <p style={{ marginBottom: '10px' }}><strong>Imagen de Referencia:</strong></p>
                        <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.5)', padding: '10px' }}>
                          <img 
                            src={selectedReq.referenceImage} 
                            style={{ width: '100%', maxHeight: '400px', objectFit: 'contain', cursor: 'pointer', borderRadius: '8px' }} 
                            alt="Referencia Visual"
                            onClick={() => window.open(selectedReq.referenceImage, '_blank')}
                          />
                          <div style={{ position: 'absolute', top: '15px', right: '15px', background: 'rgba(0,0,0,0.6)', padding: '6px', borderRadius: '8px', backdropFilter: 'blur(4px)', color: 'var(--accent-color)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <ImageIcon size={14} /> CLICK PARA AMPLIAR
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                   <h3 style={{ marginBottom: '20px' }}>Piezas Finales (Máx 3)</h3>
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                     {["1080x1080", "Historia", "General"].filter(d => selectedReq.dimensions.includes(d)).map(dim => {
                       const creative = selectedReq.creatives.find(c => c.type === dim);
                       return (
                         <div key={dim} style={{ border: '1px dashed var(--border-color)', padding: '20px', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                              <strong>Formato: {dim}</strong>
                              {creative && creative.aiEvaluation && <span className={`badge badge-${creative.aiEvaluation.color}`}>PUNTAJE: {creative.aiEvaluation.rating}/10</span>}
                            </div>
                            {creative ? (
                              <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                                <img src={creative.url} style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
                                <div style={{ flex: 1, fontSize: '13px', color: 'var(--text-secondary)' }}>{creative.aiEvaluation?.explanation}</div>
                                {role === 'admin' && (
                                  <button
                                    className="btn btn-secondary"
                                    style={{ padding: '8px 14px', fontSize: '12px', flexShrink: 0 }}
                                    onClick={() => handleDownload(creative, selectedReq.id, dim)}
                                  >
                                    <Download size={14} /> Descargar
                                  </button>
                                )}
                              </div>
                            ) : (
                              role === 'designer' && (
                                <label className="btn btn-secondary" style={{ width: '100%', cursor: 'pointer', textAlign: 'center' }}>
                                  Subir {dim}
                                  <input type="file" accept="image/*" onChange={(e)=>handleDesignerUpload(e, dim)} style={{ display: 'none' }} />
                                </label>
                              )
                            )}
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
      {loading && <div className="loading-overlay"><div className="loader"></div><p>Evaluando con Inteligencia Artificial...</p></div>}
    </div>
  );
}
