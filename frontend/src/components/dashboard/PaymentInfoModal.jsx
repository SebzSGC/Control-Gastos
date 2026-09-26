import { X } from 'lucide-react';
import DigitalCard from '../DigitalCard';

/**
 * PaymentInfoModal
 * Modal wrapper displaying a member's virtual digital payment card (Bre-B/Nequi).
 */
export default function PaymentInfoModal({ profile, onClose }) {
  if (!profile) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container animate-toast-in"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '420px' }}
      >
        <div className="sheet-drag-handle" />
        <div className="modal-header" style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '700' }}>Datos para Transferir</h3>
          <button type="button" className="modal-close-btn active:scale-[0.98]" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <DigitalCard profile={profile} onClose={onClose} />
      </div>
    </div>
  );
}
