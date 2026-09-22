import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, Radio, CheckCircle2, AlertCircle, Smartphone, Sparkles } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { API_URL } from '../config/api';

export default function NFCScannerModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const toast = useToast();
  const supported = typeof window !== 'undefined' && 'NDEFReader' in window;
  const [statusText, setStatusText] = useState(() => 
    typeof window !== 'undefined' && 'NDEFReader' in window
      ? 'Acerca la parte trasera de tu teléfono a la etiqueta o al otro celular...'
      : 'Web NFC no detectado. Puedes utilizar el simulador interactivo para probar el flujo.'
  );
  const [resolvedRoom, setResolvedRoom] = useState(null);
  const [simCode, setSimCode] = useState('');
  const abortControllerRef = useRef(null);

  const handleClose = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setResolvedRoom(null);
    onClose();
  }, [onClose]);

  const resolveNFCPayload = useCallback(async (payload) => {
    try {
      setStatusText('Resolviendo sala...');
      const res = await fetch(`${API_URL}/nfc/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      });

      const data = await res.json();
      if (!res.ok || !data.valid) {
        throw new Error(data.error || 'Etiqueta NFC no asociada a ninguna sala activa');
      }

      // Haptic vibration feedback (80ms on, 40ms pause, 120ms on)
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([80, 40, 120]);
      }

      setResolvedRoom(data);
      setStatusText(`¡Sala encontrada: ${data.groupName}!`);
      toast.success(`Conexión NFC exitosa: ${data.groupName}`);

      // Save to recent groups
      try {
        const raw = localStorage.getItem('paysync_recent_groups');
        const recents = raw ? JSON.parse(raw) : [];
        const updated = [
          { id: data.groupId, name: data.groupName, date: new Date().toISOString(), viaNfc: true },
          ...recents.filter(g => g.id !== data.groupId)
        ].slice(0, 5);
        localStorage.setItem('paysync_recent_groups', JSON.stringify(updated));
      } catch (e) {
        console.error('Error saving recent group', e);
      }

      // Automatically navigate after short visual feedback
      setTimeout(() => {
        handleClose();
        navigate(`/group/${data.groupId}?src=nfc`);
      }, 1200);
    } catch (err) {
      console.error(err);
      setStatusText(err.message || 'Error al validar etiqueta');
      toast.error(err.message || 'Error en conexión NFC');
    }
  }, [handleClose, navigate, toast]);

  useEffect(() => {
    if (!isOpen || !('NDEFReader' in window)) {
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    async function initNFCScan() {
      try {
        // eslint-disable-next-line no-undef
        const ndef = new NDEFReader();
        await ndef.scan({ signal: abortController.signal });

        ndef.onreading = (event) => {
          const message = event.message;
          let payload = '';

          for (const record of message.records) {
            const textDecoder = new TextDecoder(record.encoding || 'utf-8');
            if (record.recordType === 'text' || record.recordType === 'url') {
              payload = textDecoder.decode(record.data);
              break;
            }
          }

          if (!payload && event.serialNumber) {
            payload = event.serialNumber;
          }

          if (payload) {
            resolveNFCPayload(payload);
          }
        };

        ndef.onreadingerror = () => {
          setStatusText('No se pudo leer la etiqueta. Intenta acercarla de nuevo.');
        };
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error starting NFC scan', error);
          setStatusText(`Error al iniciar NFC: ${error.message || 'Permiso denegado'}`);
        }
      }
    }

    initNFCScan();

    return () => {
      abortController.abort();
      abortControllerRef.current = null;
    };
  }, [isOpen, resolveNFCPayload]);

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={handleClose}>
      <div 
        className="modal-container animate-toast-in nfc-modal-wrapper" 
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '440px', textAlign: 'center', padding: '2rem' }}
      >
        <div className="modal-header" style={{ marginBottom: '1rem', border: 'none' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary)', fontWeight: '700', fontSize: '0.85rem' }}>
            <Radio size={16} className="animate-pulse" />
            <span>TECNOLOGÍA TAP-TO-JOIN</span>
          </div>
          <button className="modal-close-btn" onClick={handleClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <h3 style={{ fontSize: '1.4rem', fontWeight: '800', marginBottom: '0.5rem' }}>
          Unirse mediante NFC
        </h3>
        <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.75rem' }}>
          Acerca tu teléfono a una tarjeta programada o al teléfono del anfitrión para unirte al instante.
        </p>

        {/* Contactless Radar Animation */}
        <div className="nfc-radar-box">
          <div className="nfc-pulse-ring ring-1"></div>
          <div className="nfc-pulse-ring ring-2"></div>
          <div className="nfc-pulse-ring ring-3"></div>
          
          <div className="nfc-center-icon">
            {resolvedRoom ? (
              <CheckCircle2 size={44} color="#10b981" />
            ) : (
              <Smartphone size={40} color="var(--primary)" />
            )}
          </div>
        </div>

        {/* Dynamic Status Display */}
        <div className="nfc-status-banner" style={{ margin: '1.5rem 0 1rem' }}>
          {resolvedRoom ? (
            <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
              <span style={{ color: 'var(--success)', fontWeight: '700', fontSize: '1rem', display: 'block' }}>
                ✓ ¡Sala {resolvedRoom.groupName} detectada!
              </span>
              <span className="text-subtle">Redirigiendo automáticamente...</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              <span className="status-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: supported ? 'var(--primary)' : '#f59e0b', animation: 'ripplePulse 1.8s infinite' }}></span>
              <span>{statusText}</span>
            </div>
          )}
        </div>

        {/* Hardware Support Notice & Simulation Helper */}
        {!supported && !resolvedRoom && (
          <div className="nfc-sim-box" style={{ background: 'var(--bg-input)', border: '1px dashed var(--border-strong)', padding: '1rem', borderRadius: 'var(--radius-md)', marginTop: '1rem', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f59e0b', fontSize: '0.82rem', fontWeight: '700', marginBottom: '0.5rem' }}>
              <AlertCircle size={15} />
              <span>Simulador NFC (Entornos sin hardware Web NFC)</span>
            </div>
            <p className="text-subtle" style={{ marginBottom: '0.75rem', lineHeight: '1.4' }}>
              Los navegadores de escritorio no cuentan con chip NFC activo. Puedes probar la respuesta del endpoint <code>/api/nfc/resolve</code> ingresando un código o URL de sala:
            </p>
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text" 
                className="glass-input" 
                placeholder="Código de prueba (ej. X4F2)" 
                value={simCode}
                onChange={e => setSimCode(e.target.value)}
                style={{ fontSize: '0.88rem', textTransform: 'uppercase' }}
              />
              <button 
                type="button" 
                className="btn-primary" 
                onClick={() => {
                  if (simCode.trim()) resolveNFCPayload(simCode.trim());
                }}
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              >
                <Sparkles size={15} /> Probar
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn-secondary" onClick={handleClose} style={{ width: '100%' }}>
            Cancelar y volver al código manual
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
