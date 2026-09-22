import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowRight, Sparkles, Receipt, Smartphone, Users, Clock, Trash2, Zap, Radio } from 'lucide-react';
import Navbar from '../components/Navbar';
import NFCScannerModal from '../components/NFCScannerModal';
import { useToast } from '../context/ToastContext';
import { API_URL } from '../config/api';

export default function Home() {
  const [mode, setMode] = useState('create'); // 'create' | 'join'
  const [groupId, setGroupId] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slowSubmit, setSlowSubmit] = useState(false);
  const [showNFCScanner, setShowNFCScanner] = useState(false);
  const [recentGroups, setRecentGroups] = useState(() => {
    try {
      const saved = localStorage.getItem('paysync_recent_groups');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Error reading recent groups', e);
      return [];
    }
  });

  const navigate = useNavigate();
  const toast = useToast();

  const saveRecentGroup = (group) => {
    try {
      const updated = [
        group,
        ...recentGroups.filter(g => g.id !== group.id)
      ].slice(0, 5); // keep max 5 recent groups
      setRecentGroups(updated);
      localStorage.setItem('paysync_recent_groups', JSON.stringify(updated));
    } catch (e) {
      console.error('Error saving recent group', e);
    }
  };

  const removeRecentGroup = (idToRemove, e) => {
    e.stopPropagation();
    const updated = recentGroups.filter(g => g.id !== idToRemove);
    setRecentGroups(updated);
    localStorage.setItem('paysync_recent_groups', JSON.stringify(updated));
    toast.info('Grupo eliminado del historial reciente');
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    const trimmed = newGroupName.trim();
    if (!trimmed) {
      toast.warning('Por favor ingresa el nombre de tu grupo');
      return;
    }

    setIsSubmitting(true);
    setSlowSubmit(false);
    const slowTimer = setTimeout(() => setSlowSubmit(true), 2500);

    // Generate an intuitive 4-char uppercase alphanumeric ID
    const id = Math.random().toString(36).substring(2, 6).toUpperCase();

    try {
      const res = await fetch(`${API_URL}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: trimmed }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al crear la sala');
      }

      const created = await res.json();
      saveRecentGroup({ id: created.id, name: created.name, date: new Date().toISOString() });
      toast.success(`¡Sala "${created.name}" creada exitosamente!`);
      navigate(`/group/${created.id}`);
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'No se pudo conectar con el servidor');
    } finally {
      clearTimeout(slowTimer);
      setIsSubmitting(false);
      setSlowSubmit(false);
    }
  };

  const handleJoinGroup = async (e) => {
    e.preventDefault();
    const cleanId = groupId.trim().toUpperCase();
    if (!cleanId) {
      toast.warning('Ingresa el código de 4 caracteres');
      return;
    }

    setIsSubmitting(true);
    setSlowSubmit(false);
    const slowTimer = setTimeout(() => setSlowSubmit(true), 2500);

    try {
      const res = await fetch(`${API_URL}/groups/${cleanId}`);
      if (!res.ok) {
        toast.error('Sala no encontrada. Verifica el código ingresado');
        setIsSubmitting(false);
        setSlowSubmit(false);
        return;
      }

      const data = await res.json();
      saveRecentGroup({ id: data.group.id, name: data.group.name, date: new Date().toISOString() });
      toast.success(`Accediendo a "${data.group.name}"`);
      navigate(`/group/${cleanId}`);
    } catch (error) {
      console.error(error);
      toast.error('Error al conectar con la sala');
    } finally {
      clearTimeout(slowTimer);
      setIsSubmitting(false);
      setSlowSubmit(false);
    }
  };

  const setSuggestedName = (name) => {
    setNewGroupName(name);
  };

  return (
    <>
      <Navbar />

      <main className="container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 120px)', padding: '2rem 1rem' }}>
        
        {/* Hero Section */}
        <div style={{ textAlign: 'center', maxWidth: '640px', marginBottom: '2.5rem' }} className="animate-fade-in">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'var(--accent-bg)', color: 'var(--accent)', padding: '0.35rem 0.9rem', borderRadius: 'var(--radius-full)', fontSize: '0.82rem', fontWeight: '700', marginBottom: '1.25rem', border: '1px solid rgba(6, 182, 212, 0.25)' }}>
            <Zap size={14} /> NUEVA GENERACIÓN FINTECH DE CUENTAS CLARAS
          </div>

          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.4rem)', fontWeight: '800', lineHeight: '1.15', letterSpacing: '-0.03em', marginBottom: '1rem' }}>
            Finanzas compartidas, <br />
            <span className="text-gradient">cero discusiones.</span>
          </h1>

          <p className="text-muted" style={{ fontSize: '1.1rem', lineHeight: '1.6', marginBottom: '1.75rem' }}>
            Divide gastos de viajes, casas compartidas y suscripciones en tiempo real. 
            Liquida con llave Bre-B o Nequi y escanea recibos automáticamente.
          </p>

          {/* Benefit Pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
            <span style={{ fontSize: '0.82rem', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-full)', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Zap size={13} color="var(--primary)" /> En tiempo real
            </span>
            <span style={{ fontSize: '0.82rem', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-full)', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Receipt size={13} color="var(--accent)" /> Escáner OCR de facturas
            </span>
            <span style={{ fontSize: '0.82rem', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-full)', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Smartphone size={13} color="var(--success)" /> Llave Bre-B / Nequi
            </span>
            <span style={{ fontSize: '0.82rem', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-full)', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Radio size={13} color="#06b6d4" /> NFC Tap-to-Join
            </span>
          </div>
        </div>

        {/* Action Card with Tabs */}
        <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '460px', padding: '2rem', marginBottom: '2.5rem' }}>
          
          {/* Segmented Mode Switcher */}
          <div className="segmented-control" style={{ marginBottom: '1.75rem' }}>
            <button 
              className={`segmented-btn ${mode === 'create' ? 'active' : ''}`}
              onClick={() => setMode('create')}
            >
              <Plus size={16} /> Crear Sala
            </button>
            <button 
              className={`segmented-btn ${mode === 'join' ? 'active' : ''}`}
              onClick={() => setMode('join')}
            >
              <Users size={16} /> Unirse a Sala
            </button>
          </div>

          {mode === 'create' ? (
            <form onSubmit={handleCreateGroup} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                  Nombre del grupo o evento
                </label>
                <input 
                  type="text" 
                  className="glass-input" 
                  placeholder="Ej. Viaje a Cartagena, Arriendo 402..." 
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>

              {/* Quick suggestion pills */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {['✈️ Viaje', '🏠 Arriendo', '🍕 Cenas', '🎬 Netflix & Spotify'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSuggestedName(tag)}
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                      fontSize: '0.78rem',
                      padding: '0.25rem 0.6rem',
                      borderRadius: 'var(--radius-full)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <button 
                type="submit" 
                className="btn-primary" 
                style={{ width: '100%', marginTop: '0.5rem', padding: '0.95rem' }}
                disabled={isSubmitting}
              >
                <Sparkles size={18} /> {slowSubmit ? 'Despertando servidor cloud...' : isSubmitting ? 'Creando sala...' : 'Crear Sala Instantánea'}
              </button>
              {slowSubmit && (
                <p className="animate-fade-in text-subtle" style={{ textAlign: 'center', marginTop: '0.5rem', color: 'var(--accent, #06b6d4)', fontSize: '0.8rem' }}>
                  ☁️ El servidor en la nube está despertando (Render Free Tier). Solo tarda unos segundos...
                </p>
              )}
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* NFC Tap to Join Quick Action */}
              <button
                type="button"
                className="btn-primary btn-nfc-join"
                onClick={() => setShowNFCScanner(true)}
                style={{ width: '100%', padding: '0.95rem' }}
              >
                <Radio size={18} /> Tocar para Unirse con NFC
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.1rem 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                <span>o ingresa el código manual</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
              </div>

              <form onSubmit={handleJoinGroup} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    Código de la sala (4 caracteres)
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      type="text" 
                      className="glass-input" 
                      placeholder="Ej. X4F2" 
                      maxLength={6}
                      value={groupId}
                      onChange={(e) => setGroupId(e.target.value.toUpperCase())}
                      style={{ textTransform: 'uppercase', letterSpacing: '3px', fontWeight: '700', fontSize: '1.1rem', textAlign: 'center' }}
                      disabled={isSubmitting}
                      autoFocus
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="btn-primary" 
                  style={{ width: '100%', padding: '0.95rem' }}
                  disabled={isSubmitting}
                >
                  <ArrowRight size={18} /> {slowSubmit ? 'Despertando servidor cloud...' : isSubmitting ? 'Conectando...' : 'Entrar a la Sala'}
                </button>
                {slowSubmit && (
                  <p className="animate-fade-in text-subtle" style={{ textAlign: 'center', marginTop: '0.5rem', color: 'var(--accent, #06b6d4)', fontSize: '0.8rem' }}>
                    ☁️ El servidor en la nube está despertando (Render Free Tier). Solo tarda unos segundos...
                  </p>
                )}
              </form>
            </div>
          )}
        </div>

        {/* Recent Groups History */}
        {recentGroups.length > 0 && (
          <div style={{ width: '100%', maxWidth: '460px' }} className="animate-fade-in">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', padding: '0 0.25rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Clock size={14} /> Salas Recientes
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recentGroups.map((grp) => (
                <div 
                  key={grp.id}
                  className="expense-item" 
                  onClick={() => navigate(`/group/${grp.id}`)}
                  style={{ cursor: 'pointer', marginBottom: 0, padding: '0.85rem 1rem' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--primary-glow)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.85rem' }}>
                      {grp.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-main)', margin: 0 }}>
                        {grp.name}
                      </h4>
                      <span className="text-subtle" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        Código: <strong style={{ color: 'var(--primary)' }}>{grp.id}</strong>
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button 
                      type="button"
                      className="btn-danger-ghost"
                      onClick={(e) => removeRecentGroup(grp.id, e)}
                      title="Eliminar de recientes"
                    >
                      <Trash2 size={15} />
                    </button>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                      <ArrowRight size={14} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>

      <NFCScannerModal 
        isOpen={showNFCScanner} 
        onClose={() => setShowNFCScanner(false)} 
      />
    </>
  );
}
