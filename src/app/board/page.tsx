"use client";

import React, { useState } from 'react';
import { 
  Calendar, Layout, List, Plus, Search, MoreHorizontal, User, 
  FileText, Link as LinkIcon, Image as ImageIcon, MessageSquare, 
  ChevronRight, ChevronLeft, CalendarDays, Maximize2, X, Hash, 
  CheckCircle2, Globe, FileType, AlignLeft, Paperclip, Clock,
  LogOut, AlertCircle
} from 'lucide-react';
import Link from 'next/link';

// Mock data setup
const days = [
  { day: 'dom', date: '1',  cards: [] },
  { day: 'lun', date: '2',  cards: [
    { id: 'GP-6601', title: 'GP - 6601 E-CARDS 5/3/2026', date: '2 de marzo de 2026', status: 'completed', format: 'static' },
    { id: 'GP-6600', title: 'GP - 6600 E-CARDS 4/3/2026', date: '2 de marzo de 2026', status: 'completed', format: 'video' }
  ]},
  { day: 'mar', date: '3',  cards: [
    { id: 'GP-6604', title: 'GP - 6604 E-CARDS 7/3/2026', date: '3 de marzo de 2026', status: 'completed', format: 'gif' },
    { id: 'GP-6603', title: 'GP - 6603 E-CARDS 6/3/2026', date: '3 de marzo de 2026', status: 'completed', format: 'static' }
  ]},
  { day: 'mié', date: '4',  cards: [
    { id: 'GP6574', title: 'GP6574 CREATIVO DEPÓSITO LALIGA ATLÉTICO MADRID VS REAL...', date: '4 de marzo de 2026', status: 'completed', comments: 1, format: 'static' },
    { id: 'GP6559', title: 'GP6559 ESTELAR FAS J11', date: '4 de marzo de 2026', status: 'completed', comments: 1, format: 'video' },
    { id: 'GP6549', title: 'GP6549 PARRILLA REGISTRO PRIMERA DIVISIÓN J11', date: '4 de marzo de 2026', status: 'completed', comments: 1, format: 'gif' },
    { id: 'GP6462', title: 'GP6462 CREATIVO REGISTRO LALIGA ATLÉTICO MADRID VS REAL...', date: '4 de marzo de 2026', status: 'pending', comments: 1, format: 'static' },
  ]},
  { day: 'jue', date: '5',  cards: [
    { id: 'GP6614', title: 'GP6614 CREATIVO DEPÓSITO FA CUP NEWCASTLE VS MANCHESTER CITY', date: '5 de marzo de 2026', status: 'completed', comments: 1, format: 'gif' },
    { id: 'GP6610', title: 'GP6610 PARRILLA DEPÓSITO JORNADA 12 LIGA NAL', date: '5 de marzo de 2026', status: 'completed', comments: 1, format: 'static' },
    { id: 'GP6609', title: 'GP6609 PARRILLA REGISTRO JORNADA 12 LIGA NAL', date: '5 de marzo de 2026', status: 'completed', comments: 2, isTarget: true, format: 'video' },
    { id: 'GP6581', title: 'GP6581 PARRILLA DEPÓSITO NBA 08-10 MAR', date: '5 de marzo de 2026', status: 'completed', comments: 1, format: 'static' },
    { id: 'GP6569', title: 'GP6569 PARRILLA DEPÓSITO LIGA NAL J12', date: '5 de marzo de 2026', status: 'pending', comments: 1, format: 'gif' },
  ]},
  { day: 'vie', date: '6',  cards: [
    { id: 'GP6643', title: 'GP - 6643 BIENVENIDA TOGO CUADERNO', date: '6 de marzo de 2026', status: 'completed', format: 'static' },
    { id: 'GP6624', title: 'GP6624 CREATIVO DEPÓSITO ATLÉTICO MADRID VS TOTTENHAM...', date: '6 de marzo de 2026', status: 'completed', comments: 1, format: 'video' },
    { id: 'GP6623', title: 'GP6623 CREATIVO DEPÓSITO PSG VS CHELSEA CHAMPIONS LEAGUE...', date: '6 de marzo de 2026', status: 'completed', comments: 1, format: 'gif' },
    { id: 'GP6620', title: 'GP6620 CREATIVO DEPÓSITO NEWCASTLE VS BARCELONA...', date: '6 de marzo de 2026', status: 'completed', comments: 1, format: 'static' },
  ]},
  { day: 'sáb', date: '7',  cards: [] }
];

export default function GanaPlayBoard() {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('Calendario Solicitud');

  const navItemStyle = (isActive: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    borderRadius: '12px',
    cursor: 'pointer',
    color: isActive ? 'var(--button-text)' : 'var(--text-secondary)',
    fontWeight: isActive ? 700 : 500,
    background: isActive ? 'linear-gradient(135deg, #22c55e, #10b981)' : 'transparent',
    transition: 'all 0.3s ease',
    textTransform: 'uppercase' as 'uppercase',
    letterSpacing: '1px',
    fontSize: '13px',
    boxShadow: isActive ? '0 0 20px rgba(34, 197, 94, 0.4)' : 'none'
  });

  const propertyRow = {
    display: 'grid',
    gridTemplateColumns: '200px 1fr',
    gap: '20px',
    padding: '16px 0',
    alignItems: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.05)'
  };

  const propertyLabel = {
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '14px',
    fontWeight: 600,
    textTransform: 'uppercase' as 'uppercase',
    letterSpacing: '1px'
  };

  const propertyValue = {
    color: 'var(--text-primary)',
    fontSize: '15px',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap' as 'wrap',
    gap: '10px'
  };

  const handleCardClick = (card: any) => {
    if (card.isTarget) {
      setModalOpen(true);
    }
  };

  return (
    <div className="app-container" style={{ gridTemplateColumns: "1fr" }}>
      
      {/* Header General */}
      <div className="header">
        <div className="header-brand">
          <img src="/logo.png" alt="GanaPlay Logo" style={{ height: "60px" }} />
          <h1 style={{ display: "flex", alignItems: "center", gap: "10px", margin: 0, fontSize: "28px", letterSpacing: "0.5px" }}>
             GanaPlay Diseño <span style={{ fontSize: "14px", color: "var(--text-secondary)", fontWeight: 400, transform: "translateY(2px)" }}>| Tablero de Solicitudes (Kanban)</span>
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <Link href="/" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
            <Layout size={16} /> Vista Clásica
          </Link>
          <button className="btn btn-secondary" style={{ padding: "10px 20px" }}>
            <LogOut size={16} /> Salir
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: "40px" }}>
        
        {/* Board Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
          <div>
            <h2 style={{ fontSize: '32px', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <CalendarDays color="var(--accent-color)" size={32} />
              Solicitudes de Artes (Marzo 2026)
            </h2>
            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '15px' }}>Planificador interactivo para todas las publicaciones en redes sociales.</p>
          </div>
          <button className="btn">
            <Plus size={18} /> Nueva Solicitud
          </button>
        </div>

        {/* View Tabs */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '30px', borderBottom: '1px solid var(--border-color)', paddingBottom: '20px', overflowX: 'auto' }}>
          <div style={navItemStyle(activeTab === 'All posts')} onClick={() => setActiveTab('All posts')}>
            <List size={16} /> All posts
          </div>
          <div style={navItemStyle(activeTab === 'Calendario Solicitud')} onClick={() => setActiveTab('Calendario Solicitud')}>
            <Calendar size={16} /> Columnas (Kanban)
          </div>
          <div style={navItemStyle(activeTab === 'Tarjetas')} onClick={() => setActiveTab('Tarjetas')}>
            <Layout size={16} /> Tarjetas
          </div>
        </div>

        {/* Kanban / Calendar Grid */}
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '16px', overflow: 'hidden', background: 'rgba(0,0,0,0.3)', boxShadow: 'inset 0 0 30px rgba(0,0,0,0.5)' }}>
          
          {/* Days Header */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border-color)', background: 'rgba(34, 197, 94, 0.05)' }}>
            {days.map(d => (
              <div key={d.day} style={{ padding: '16px 12px', textAlign: 'center', fontSize: '14px', color: 'var(--accent-color)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px' }}>
                {d.day}
              </div>
            ))}
          </div>
          
          {/* Dates Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', minHeight: '600px' }}>
            {days.map((d, i) => (
              <div key={d.day} style={{ borderRight: i === 6 ? 'none' : '1px solid var(--border-color)', padding: '12px', position: 'relative', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ textAlign: 'right', fontSize: '16px', color: 'var(--text-secondary)', fontWeight: 700, paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  {i === 2 && <span style={{float:'left', color: 'var(--accent-color)', cursor:'pointer', background: 'rgba(34,197,94,0.1)', padding: '2px', borderRadius: '4px'}}><Plus size={16}/></span>}
                  {d.date}
                </div>
                
                {/* Cards */}
                {d.cards.map(c => (
                  <div 
                    key={c.id} 
                    className="request-card"
                    style={{ padding: '16px', margin: 0, cursor: 'pointer', borderRadius: '12px', background: 'rgba(0,0,0,0.5)' }}
                    onClick={() => handleCardClick(c)}
                  >
                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', lineHeight: '1.4', color: 'var(--text-primary)' }}>{c.title}</div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <span className={`badge ${c.status === 'pending' ? 'badge-pending' : 'badge-completed'}`} style={{ alignSelf: 'flex-start', padding: '4px 8px', fontSize: '10px' }}>
                        {c.status === 'pending' ? 'EN PROCESO' : 'LISTO PARA ADS'}
                      </span>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FileType size={12}/> {c.format.toUpperCase()}
                        </span>
                        {c.comments && (
                          <div style={{ fontSize: '12px', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(245, 158, 11, 0.1)', padding: '2px 8px', borderRadius: '10px' }}>
                            <MessageSquare size={12} /> {c.comments}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Modal / Side Peek (GanaPlay Premium Dark Design) */}
      {modalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(10px)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px' }}>
          
          <div className="glass-panel" style={{ width: '100%', maxWidth: '1000px', maxHeight: '90vh', overflowY: 'auto', position: 'relative', display: 'flex', flexDirection: 'column', border: '1px solid var(--accent-color)', boxShadow: '0 0 50px rgba(34,197,94,0.1)' }}>
            
            {/* Modal actions */}
            <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--panel-bg)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 30px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-secondary)' }}>
                <Maximize2 size={18} style={{ cursor: 'pointer' }} />
                <span style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Detalle de Arte</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', color: 'var(--text-secondary)' }}>
                <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '12px' }}>
                  Compartir <ChevronRight size={14} />
                </button>
                <div style={{ cursor: 'pointer', padding: '8px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderRadius: '50%', display: 'flex' }} onClick={() => setModalOpen(false)}>
                  <X size={20} />
                </div>
              </div>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '40px 60px' }}>
              
              <h1 style={{ fontSize: '36px', fontWeight: 700, margin: '0 0 40px 0', lineHeight: '1.2', color: 'var(--text-primary)' }}>
                <span style={{ color: 'var(--accent-color)' }}>GP6609</span> PARRILLA REGISTRO JORNADA 12 LIGA NAL
              </h1>

              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '20px', border: '1px solid var(--border-color)', padding: '30px', marginBottom: '40px' }}>
                
                <div style={propertyRow}>
                  <div style={propertyLabel}><User size={18} /> Solicitante</div>
                  <div style={propertyValue}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(34, 197, 94, 0.1)', padding: '6px 12px', borderRadius: '12px', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#000', fontWeight: 'bold' }}>P</div>
                      <span>Agente Pauta</span>
                    </div>
                  </div>
                </div>

                <div style={propertyRow}>
                  <div style={propertyLabel}><Hash size={18} /> ID Proyecto</div>
                  <div style={propertyValue}><span style={{ fontFamily: 'monospace', fontSize: '18px', color: 'var(--accent-color)' }}>#6609</span></div>
                </div>

                <div style={propertyRow}>
                  <div style={propertyLabel}><CheckCircle2 size={18} /> Estado Actual</div>
                  <div style={propertyValue}>
                    <span className="badge badge-completed" style={{ fontSize: '13px' }}>LISTO PARA ADS</span>
                  </div>
                </div>

                <div style={propertyRow}>
                  <div style={propertyLabel}><Calendar size={18} /> Fecha Solicitada</div>
                  <div style={propertyValue}>5 de marzo de 2026</div>
                </div>

                <div style={propertyRow}>
                  <div style={propertyLabel}><Clock size={18} color="var(--danger)" /> Fecha Entrega</div>
                  <div style={propertyValue}><strong style={{ color: 'var(--danger)' }}>5 de marzo de 2026</strong></div>
                </div>

                <div style={propertyRow}>
                  <div style={propertyLabel}><Globe size={18} /> País Destino</div>
                  <div style={propertyValue}>
                    <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '4px 12px', borderRadius: '6px', fontWeight: 700, textTransform: 'uppercase', fontSize: '12px', letterSpacing: '1px' }}>
                      Guatemala
                    </span>
                  </div>
                </div>

                <div style={propertyRow}>
                  <div style={propertyLabel}><FileType size={18} /> Dimensiones</div>
                  <div style={propertyValue}>
                    {['Story (1080x1920)', 'Post (1080x1080)', 'PAUTA'].map(d => (
                      <span key={d} style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>
                        {d}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ ...propertyRow, borderBottom: 'none', paddingBottom: 0 }}>
                  <div style={propertyLabel}><AlignLeft size={18} /> Contexto / Descripción</div>
                  <div style={propertyValue}>
                    <p style={{ margin: 0, padding: '16px', background: 'rgba(0,0,0,0.5)', borderRadius: '12px', borderLeft: '4px solid var(--warning)', fontStyle: 'italic', width: '100%' }}>
                      MISMA LÍNEA GRÁFICA, SOLO CAMBIAR EL COPY.
                    </p>
                  </div>
                </div>

                <div style={{ ...propertyRow, borderBottom: 'none' }}>
                  <div style={propertyLabel}><AlignLeft size={18} /> Texto Principal (Copy)</div>
                  <div style={propertyValue}>
                    <div style={{ margin: 0, padding: '20px', background: 'rgba(34, 197, 94, 0.05)', borderRadius: '12px', border: '1px solid rgba(34, 197, 94, 0.2)', width: '100%', lineHeight: '1.6', fontSize: '16px' }}>
                      La emoción arranca aquí<br/>
                      Activa tu cuenta y juega con Q50<br/>
                      <strong>CTA: Únete ahora</strong>
                    </div>
                  </div>
                </div>

                <div style={{ ...propertyRow, borderBottom: 'none' }}>
                  <div style={propertyLabel}><Paperclip size={18} /> Archivos y Referencias</div>
                  <div style={propertyValue}>
                    <div style={{ padding: '20px', background: 'rgba(0,0,0,0.4)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.2)', width: '100%', display: 'flex', gap: '15px', alignItems: 'center' }}>
                      <div style={{ background: 'rgba(34, 197, 94, 0.2)', padding: '12px', borderRadius: '10px' }}>
                        <ImageIcon size={24} color="var(--accent-color)" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>Referencia_visual.jpg</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Subido el 5 de marzo - 2.4 MB</div>
                      </div>
                      <button className="btn btn-secondary" style={{ marginLeft: 'auto', padding: '8px 16px' }}>Ver Archivo</button>
                    </div>
                  </div>
                </div>

              </div>              

              {/* Comments Section */}
              <div style={{ marginTop: '40px' }}>
                <h3 style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '25px', borderBottom: '1px solid var(--border-color)', paddingBottom: '15px' }}>
                  <MessageSquare color="var(--warning)" /> Historial y Comentarios
                </h3>
                  
                <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', flexShrink: 0, alignItems: 'center', justifyContent: 'center', fontSize: '16px', color: '#fff', fontWeight: 'bold' }}>P</div>
                  <div style={{ flexGrow: 1 }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--warning)' }}>Agente Pauta (Trafficker)</span>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>5 mar 2026, 14:30</span>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '20px', display: 'inline-block', boxShadow: '0 5px 15px rgba(0,0,0,0.3)' }}>
                      <p style={{ margin: '0 0 15px 0' }}>Aquí adjunto el fixture exacto de los partidos que necesitamos incluir en el arte. Ojo con la combinación de colores.</p>
                      {/* Fake Image preview */}
                      <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '15px', display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'monospace', fontSize: '13px', color: '#aaa', minWidth: '300px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #333', paddingBottom: '5px' }}><span>⭐ 08.03. 12:00</span> <span style={{color: '#fff'}}>Aurora F.C. vs Xelajú</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #333', paddingBottom: '5px' }}><span>⭐ 08.03. 16:00</span> <span style={{color: '#fff'}}>Mictlán vs Municipal</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #333', paddingBottom: '5px' }}><span>⭐ 08.03. 19:00</span> <span style={{color: '#fff'}}>Antigua vs Cobán</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>⭐ 08.03. 21:00</span> <span style={{color: '#fff'}}>Comunicaciones vs Achuapa</span></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '20px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--panel-bg)', border: '1px dashed var(--accent-color)', display: 'flex', flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
                    <User size={20} color="var(--accent-color)" />
                  </div>
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', position: 'relative' }}>
                      <input type="text" placeholder="Escribe un comentario al diseñador..." style={{ paddingRight: '120px', background: 'rgba(0,0,0,0.5)', borderRadius: '14px' }} />
                      <button className="btn" style={{ position: 'absolute', right: '5px', top: '5px', bottom: '5px', padding: '0 20px', fontSize: '12px' }}>Enviar</button>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
