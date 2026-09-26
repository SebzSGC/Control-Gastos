import { ArrowRight } from 'lucide-react';

/**
 * ActiveSessionsBanner
 * Displays real-time collaborative bill splitting session banner when active in group.
 * 
 * @param {Object} props
 * @param {Object|null} props.activeLiveBill - Active live session data (hostName, storeName, etc.)
 * @param {Function} props.onOpenClaimModal - Handler to open live claiming modal
 */
export default function ActiveSessionsBanner({ activeLiveBill, onOpenClaimModal }) {
  if (!activeLiveBill) return null;

  return (
    <div
      className="live-bill-alert-banner animate-fade-in"
      onClick={onOpenClaimModal}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onOpenClaimModal();
        }
      }}
      title="Toca para marcar tus consumos en vivo"
    >
      <div className="live-bill-badge-pulse">
        <span className="live-pulse-dot" />
        <span>EN VIVO</span>
      </div>

      <div className="live-bill-text-wrap">
        <div className="live-bill-title">
          🧾 Cuenta Abierta en Vivo: <strong>{activeLiveBill.hostName}</strong> subió la factura de <strong>&quot;{activeLiveBill.storeName}&quot;</strong>. Toca aquí para marcar tus consumos.
        </div>
        <div className="live-bill-subtitle">
          Los demás integrantes están seleccionando sus platos en tiempo real.
        </div>
      </div>

      <div className="live-bill-action">
        <button
          type="button"
          className="btn-primary btn-sm btn-nfc-join"
          onClick={(e) => {
            e.stopPropagation();
            onOpenClaimModal();
          }}
        >
          Marcar lo Mío <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
