import { useState } from 'react';
import { Copy, Check, Smartphone, ShieldCheck } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export default function DigitalCard({ profile, onClose }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  if (!profile) return null;

  const handleCopyKey = () => {
    if (!profile.payment_key) {
      toast.info('Este participante aún no ha configurado su llave');
      return;
    }
    navigator.clipboard.writeText(profile.payment_key);
    setCopied(true);
    toast.success(`Llave copiada: ${profile.payment_key}`);
    setTimeout(() => setCopied(false), 2000);
  };

  const isNequi = profile.payment_key && profile.payment_key.startsWith('3') && profile.payment_key.length === 10;

  return (
    <div className="digital-card-container">
      {/* Sleek Virtual Card */}
      <div className="digital-card-surface">
        <div className="digital-card-pattern" />

        {/* Card Header */}
        <div className="digital-card-header">
          <div className="card-brand-badge">
            <span className="card-brand-dot" />
            <span>{isNequi ? 'Nequi / Bre-B' : 'Llave Bre-B'}</span>
          </div>
          <div className="card-contactless-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8.5 16.5a5 5 0 0 1 0-9" />
              <path d="M12 19a8.5 8.5 0 0 0 0-14" />
              <path d="M15.5 21.5a12 12 0 0 0 0-19" />
            </svg>
          </div>
        </div>

        {/* Chip */}
        <div className="digital-card-chip">
          <div className="chip-line" />
          <div className="chip-line" />
        </div>

        {/* Payment Key / Number */}
        <div className="digital-card-body">
          <span className="card-label">NÚMERO / LLAVE DE PAGO</span>
          <div className="card-number-wrapper" onClick={handleCopyKey} role="button" tabIndex={0}>
            <span className="card-number">
              {profile.payment_key || 'No configurada'}
            </span>
            {profile.payment_key && (
              <button
                className="card-quick-copy-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyKey();
                }}
                title="Copiar llave"
              >
                {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
              </button>
            )}
          </div>
        </div>

        {/* Card Footer */}
        <div className="digital-card-footer">
          <div>
            <span className="card-label">TITULAR</span>
            <p className="card-holder-name">{profile.name}</p>
          </div>
          <div className="card-tag">
            <ShieldCheck size={14} />
            <span>Verificado</span>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="digital-card-actions">
        {profile.payment_key ? (
          <button className="btn-primary copy-action-btn" onClick={handleCopyKey}>
            {copied ? (
              <>
                <Check size={18} /> ¡Copiado con Éxito!
              </>
            ) : (
              <>
                <Copy size={18} /> Copiar Llave Bre-B / Nequi
              </>
            )}
          </button>
        ) : (
          <div className="card-empty-tip">
            <Smartphone size={16} />
            <span>Pídele a {profile.name} que agregue su llave en su perfil para transferirle con 1 clic.</span>
          </div>
        )}

        {onClose && (
          <button className="btn-secondary" onClick={onClose} style={{ width: '100%', marginTop: '0.75rem' }}>
            Listo, ya pagué
          </button>
        )}
      </div>
    </div>
  );
}
