import { X } from 'lucide-react';
import DigitalCard from '../DigitalCard';

/**
 * PaymentInfoModal
 * Modal wrapper displaying a member's virtual digital payment card (Bre-B/Nequi).
 */
export default function PaymentInfoModal({ profile, onClose, onOpenVoucherModal }) {
  if (!profile) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container animate-toast-in modal-payment-info"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-drag-handle" />
        <div className="modal-payment-header">
          <h3 className="modal-payment-title">Datos para Transferir</h3>
          <button
            type="button"
            className="modal-close-btn active:scale-[0.98]"
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            <X size={20} />
          </button>
        </div>

        <DigitalCard
          key={profile.id || 'payment-info-card'}
          profile={profile}
          onClose={onClose}
          onOpenVoucherModal={onOpenVoucherModal}
        />
      </div>
    </div>
  );
}
