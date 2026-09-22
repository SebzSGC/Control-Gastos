import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, User, Smartphone, ArrowRight, X, RotateCw, AlertTriangle } from 'lucide-react';
import Navbar from '../components/Navbar';
import { useToast } from '../context/ToastContext';
import { API_URL } from '../config/api';

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #6366f1, #a855f7)',
  'linear-gradient(135deg, #06b6d4, #3b82f6)',
  'linear-gradient(135deg, #10b981, #14b8a6)',
  'linear-gradient(135deg, #f59e0b, #ef4444)',
  'linear-gradient(135deg, #ec4899, #8b5cf6)',
  'linear-gradient(135deg, #3b82f6, #6366f1)',
];

export default function Profiles() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [group, setGroup] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  // New profile modal/state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newPaymentKey, setNewPaymentKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    const slowTimer = setTimeout(() => {
      if (isCurrent) setSlowLoad(true);
    }, 3000);

    fetch(`${API_URL}/groups/${id}`)
      .then(res => {
        if (!res.ok) {
          throw new Error('La sala no fue encontrada o no está disponible.');
        }
        return res.json();
      })
      .then(data => {
        if (!isCurrent) return;
        clearTimeout(slowTimer);
        setGroup(data.group);
        setProfiles(data.profiles || []);
        setLoading(false);
        setSlowLoad(false);
      })
      .catch(err => {
        if (!isCurrent) return;
        clearTimeout(slowTimer);
        console.error(err);
        setLoadError(err.message || 'Error de conexión con el servidor.');
        setLoading(false);
        setSlowLoad(false);
      });

    return () => {
      isCurrent = false;
      clearTimeout(slowTimer);
    };
  }, [id, retryTrigger]);

  const handleRetry = () => {
    setLoading(true);
    setLoadError(null);
    setRetryTrigger(c => c + 1);
  };

  const handleAddProfile = async (e) => {
    e.preventDefault();
    const trimmed = newProfileName.trim();
    if (!trimmed) {
      toast.warning('Por favor ingresa tu nombre');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: id,
          name: trimmed,
          payment_key: newPaymentKey.trim() || null
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al crear el participante');
      }

      const created = await res.json();
      setProfiles(prev => [...prev, created]);
      setNewProfileName('');
      setNewPaymentKey('');
      setShowAddModal(false);
      toast.success(`¡Bienvenido, ${created.name}!`);

      // Auto-select the newly created profile
      selectProfile(created);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Error al registrar participante');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectProfile = (profile) => {
    localStorage.setItem(`paysync_${id}_profile`, JSON.stringify(profile));
    toast.info(`Ingresando como ${profile.name}`);
    navigate(`/group/${id}/dashboard`);
  };

  const getGradient = (index) => {
    return AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length];
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="flex-center" style={{ minHeight: '75vh', flexDirection: 'column', gap: '1rem', padding: '1.5rem', textAlign: 'center' }}>
          <div className="status-dot" style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--primary)', animation: 'ripplePulse 1.5s infinite' }} />
          <p className="text-muted" style={{ fontWeight: '600' }}>Cargando sala y participantes...</p>
          {slowLoad && (
            <p className="animate-fade-in" style={{ fontSize: '0.85rem', color: 'var(--accent, #06b6d4)', maxWidth: '380px', lineHeight: '1.4' }}>
              ☁️ Despertando servidor en la nube (Render Free Tier)... Esto puede tomar unos segundos la primera vez.
            </p>
          )}
        </div>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <Navbar />
        <div className="flex-center" style={{ minHeight: '75vh', padding: '1.5rem' }}>
          <div className="glass-panel animate-toast-in" style={{ maxWidth: '420px', width: '100%', padding: '2rem', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(244, 63, 94, 0.12)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <AlertTriangle size={24} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '0.5rem' }}>
              No pudimos conectar con la sala
            </h3>
            <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.4' }}>
              {loadError}. Si el servidor cloud estaba inactivo, reintentar ahora debería conectar inmediatamente.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => navigate('/')} 
                style={{ flex: 1 }}
              >
                Inicio
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                onClick={handleRetry} 
                style={{ flex: 1 }}
              >
                <RotateCw size={15} /> Reintentar
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar group={group} />

      <main className="container" style={{ padding: '2.5rem 1.5rem', maxWidth: '960px' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }} className="animate-fade-in">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'var(--primary-glow)', color: 'var(--primary)', padding: '0.35rem 0.85rem', borderRadius: 'var(--radius-full)', fontSize: '0.8rem', fontWeight: '700', marginBottom: '1rem', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
            <User size={13} /> SELECCIÓN DE PARTICIPANTE
          </div>

          <h1 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: '800', letterSpacing: '-0.02em', marginBottom: '0.75rem' }}>
            ¿Quién eres en <span className="text-gradient">{group.name}</span>?
          </h1>

          <p className="text-muted" style={{ fontSize: '1.05rem', maxWidth: '520px', margin: '0 auto' }}>
            Selecciona tu tarjeta para entrar al tablero de gastos y registrar pagos a tu nombre.
          </p>
        </div>

        {/* Profiles Grid */}
        <div className="profiles-grid animate-fade-in">
          {profiles.map((p, index) => (
            <div
              key={p.id}
              className="glass-panel profile-card"
              onClick={() => selectProfile(p)}
              tabIndex={0}
              role="button"
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectProfile(p); }}
            >
              <div 
                className="profile-avatar-circle"
                style={{ background: getGradient(index) }}
              >
                {p.name.charAt(0).toUpperCase()}
              </div>

              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                  {p.name}
                </h3>
                <span className="text-subtle">#{p.id.substring(0, 4).toUpperCase()}</span>
              </div>

              {p.payment_key ? (
                <span className="profile-badge-ready" title={`Llave: ${p.payment_key}`}>
                  <Smartphone size={12} /> Llave lista
                </span>
              ) : (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Sin llave configurada
                </span>
              )}

              <div style={{ marginTop: 'auto', paddingTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--primary)', fontSize: '0.88rem', fontWeight: '600' }}>
                <span>Entrar</span> <ArrowRight size={14} />
              </div>
            </div>
          ))}

          {/* Add New Participant Card */}
          <div
            className="profile-card-add"
            onClick={() => setShowAddModal(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowAddModal(true); }}
          >
            <div style={{ width: 64, height: 64, borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', marginBottom: '1rem', transition: 'all 0.2s' }}>
              <Plus size={32} />
            </div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '0.25rem' }}>
              Nuevo Amigo
            </h4>
            <p className="text-subtle" style={{ textAlign: 'center' }}>
              Agregar otro participante a la sala
            </p>
          </div>
        </div>

        {/* Modal: Add Participant */}
        {showAddModal && (
          <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
            <div 
              className="modal-container animate-toast-in" 
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3 style={{ fontSize: '1.35rem', fontWeight: '700' }}>Agregar Participante</h3>
                <button className="modal-close-btn" onClick={() => setShowAddModal(false)}>
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleAddProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    Nombre del participante *
                  </label>
                  <input 
                    type="text" 
                    className="glass-input" 
                    placeholder="Ej. Valentina, Carlos, David..." 
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    Llave Bre-B o Nequi (Opcional)
                  </label>
                  <input 
                    type="text" 
                    className="glass-input" 
                    placeholder="Ej. 3001234567" 
                    value={newPaymentKey}
                    onChange={(e) => setNewPaymentKey(e.target.value)}
                  />
                  <span className="text-subtle" style={{ display: 'block', marginTop: '0.4rem' }}>
                    Permite que los demás miembros te transfieran su parte con 1 clic.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    onClick={() => setShowAddModal(false)}
                    style={{ flex: 1 }}
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    className="btn-primary" 
                    style={{ flex: 1 }}
                    disabled={isSubmitting}
                  >
                    <Plus size={18} /> {isSubmitting ? 'Guardando...' : 'Crear y Entrar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>
    </>
  );
}
