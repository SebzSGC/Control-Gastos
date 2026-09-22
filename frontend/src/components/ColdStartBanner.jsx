import { useState, useEffect, useRef } from 'react';
import { CloudLightning, CheckCircle2, Loader2, X } from 'lucide-react';
import { API_URL } from '../config/api';

export default function ColdStartBanner() {
  const [status, setStatus] = useState('idle'); // 'idle' | 'waking' | 'ready' | 'hidden'
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);
  const statusRef = useRef(status);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    let isMounted = true;
    let slowTimer = null;
    const startTime = Date.now();

    // If request takes longer than 2.5 seconds, flag as waking up (cold-start)
    slowTimer = setTimeout(() => {
      if (isMounted && statusRef.current === 'idle') {
        setStatus('waking');
        timerRef.current = setInterval(() => {
          setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
        }, 1000);
      }
    }, 2500);

    // Lightweight ping to awake the free-tier backend (Render, Fly.io, etc.)
    const checkServer = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        try {
          await fetch(`${API_URL}/health`, { signal: controller.signal });
        } catch {
          await fetch(`${API_URL}/vision-status`, { credentials: 'omit' });
        }
        clearTimeout(timeoutId);

        if (isMounted) {
          clearTimeout(slowTimer);
          if (timerRef.current) clearInterval(timerRef.current);

          setStatus((prev) => {
            if (prev === 'waking') {
              setTimeout(() => {
                if (isMounted) setStatus('hidden');
              }, 3000);
              return 'ready';
            }
            return 'hidden';
          });
        }
      } catch (err) {
        if (isMounted && statusRef.current === 'waking') {
          console.warn('Cold-start ping delayed:', err.message);
        }
      }
    };

    checkServer();

    return () => {
      isMounted = false;
      if (slowTimer) clearTimeout(slowTimer);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (status === 'idle' || status === 'hidden') return null;

  return (
    <div 
      className="cold-start-banner animate-toast-in"
      style={{
        position: 'fixed',
        bottom: '1.25rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1400,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.65rem 1.15rem',
        borderRadius: 'var(--radius-pill)',
        background: status === 'ready' ? 'var(--bg-surface-elevated)' : 'rgba(30, 27, 75, 0.92)',
        border: status === 'ready' 
          ? '1px solid var(--accent-mint)' 
          : '1px solid rgba(99, 102, 241, 0.4)',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        color: '#ffffff',
        fontSize: '0.85rem',
        maxWidth: '92vw',
        pointerEvents: 'auto',
        transition: 'all 0.3s ease'
      }}
    >
      {status === 'waking' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#818cf8' }}>
            <Loader2 size={16} className="animate-spin-gentle" style={{ animation: 'spin 1.5s linear infinite' }} />
            <CloudLightning size={16} color="#38bdf8" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', textAlign: 'left' }}>
            <span style={{ fontWeight: '700', fontSize: '0.82rem', color: '#f8fafc' }}>
              Iniciando servidor en la nube (Render Free Tier)
            </span>
            <span style={{ fontSize: '0.75rem', opacity: 0.85, color: '#cbd5e1' }}>
              El contenedor gratuito está despertando ({elapsedSeconds}s). Tu conexión iniciará en breve...
            </span>
          </div>
        </>
      ) : (
        <>
          <CheckCircle2 size={16} color="#10b981" />
          <span style={{ fontWeight: '600', color: 'var(--text-primary, #ffffff)', fontSize: '0.82rem' }}>
            ¡Servidor en la nube conectado y listo!
          </span>
        </>
      )}

      <button
        type="button"
        onClick={() => setStatus('hidden')}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255, 255, 255, 0.6)',
          cursor: 'pointer',
          padding: '0.2rem',
          marginLeft: '0.25rem',
          display: 'flex',
          alignItems: 'center'
        }}
        title="Descartar"
        aria-label="Cerrar notificación"
      >
        <X size={14} />
      </button>
    </div>
  );
}
