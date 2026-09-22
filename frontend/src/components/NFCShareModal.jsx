import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Radio, Copy, Check, Smartphone, CheckCircle2, AlertCircle } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export default function NFCShareModal({ isOpen, onClose, group }) {
  const toast = useToast();
  const [writing, setWriting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen || !group) return null;

  const joinUrl = `${window.location.origin}/group/${group.id}?src=nfc`;

  const handleWriteNFC = async () => {
    if (!('NDEFReader' in window)) {
      setErrorMsg('Web NFC no está habilitado en este navegador. Puedes copiar el enlace directo.');
      return;
    }

    try {
      setWriting(true);
      setErrorMsg('');
      // eslint-disable-next-line no-undef
      const ndef = new NDEFReader();
      
      toast.info('Acerca la tarjeta o etiqueta NFC al reverso de tu celular...');
      
      await ndef.write({
        records: [
          { recordType: 'url', data: joinUrl },
          { recordType: 'text', data: group.id }
        ]
      });

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([80, 40, 120]);
      }

      setWriting(false);
      setSuccess(true);
      toast.success('¡Etiqueta NFC grabada con éxito!');
      setTimeout(() => setSuccess(false), 3500);
    } catch (err) {
      console.error('Error writing NFC tag', err);
      setWriting(false);
      setErrorMsg(err.message || 'No se pudo grabar la etiqueta NFC');
      toast.error('Error al grabar etiqueta NFC');
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopiedLink(true);
    toast.success('Enlace de sala copiado');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div 
        className="modal-container animate-toast-in nfc-modal-wrapper" 
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '440px', textAlign: 'center', padding: '2rem' }}
      >
        <div className="modal-header" style={{ marginBottom: '1rem', border: 'none' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary)', fontWeight: '700', fontSize: '0.85rem' }}>
            <Radio size={16} />
            <span>TRANSMISIÓN NFC / CONTACTLESS</span>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <h3 style={{ fontSize: '1.4rem', fontWeight: '800', marginBottom: '0.35rem' }}>
          Compartir por NFC
        </h3>
        <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Graba una etiqueta o acerca tu dispositivo para que otros se unan a <strong style={{ color: 'var(--text-main)' }}>{group.name}</strong> sin escribir códigos.
        </p>

        {/* Animated NFC Visual */}
        <div className="nfc-radar-box">
          <div className="nfc-pulse-ring ring-1"></div>
          <div className="nfc-pulse-ring ring-2"></div>
          
          <div className="nfc-center-icon">
            {success ? (
              <CheckCircle2 size={44} color="#10b981" />
            ) : (
              <Smartphone size={40} color="var(--primary)" />
            )}
          </div>
        </div>

        {/* Room Info Tag */}
        <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '1rem', margin: '1.5rem 0' }}>
          <span className="card-label" style={{ textAlign: 'center' }}>SALA ACTUAL</span>
          <h4 style={{ fontSize: '1.25rem', fontWeight: '800', margin: '0.2rem 0', color: 'var(--text-main)' }}>
            {group.name}
          </h4>
          <span className="navbar-code-tag" style={{ fontSize: '0.82rem', padding: '0.25rem 0.75rem' }}>
            CÓDIGO: {group.id}
          </span>
        </div>

        {/* Write Tag Action */}
        {'NDEFReader' in window ? (
          <button 
            className="btn-primary" 
            onClick={handleWriteNFC} 
            disabled={writing}
            style={{ width: '100%', padding: '0.85rem', marginBottom: '0.75rem' }}
          >
            {writing ? (
              <>Acerca la tarjeta al celular...</>
            ) : success ? (
              <>
                <Check size={18} /> ¡Etiqueta Grabada con Éxito!
              </>
            ) : (
              <>
                <Radio size={18} /> Grabar Etiqueta NFC
              </>
            )}
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f59e0b', fontSize: '0.82rem', background: 'rgba(245, 158, 11, 0.1)', padding: '0.6rem 0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', textAlign: 'left' }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>Escritura Web NFC disponible únicamente en Chrome para Android. Usa el enlace directo como alternativa.</span>
          </div>
        )}

        {errorMsg && (
          <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>
            {errorMsg}
          </p>
        )}

        {/* Copy Join Link Alternative */}
        <button 
          className="btn-secondary" 
          onClick={handleCopyUrl}
          style={{ width: '100%', padding: '0.8rem', fontSize: '0.9rem' }}
        >
          {copiedLink ? (
            <>
              <Check size={16} color="#10b981" /> Enlace Copiado
            </>
          ) : (
            <>
              <Copy size={16} /> Copiar Enlace Tap-to-Join
            </>
          )}
        </button>
      </div>
    </div>,
    document.body
  );
}
