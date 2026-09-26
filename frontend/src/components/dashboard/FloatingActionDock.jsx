import { Plus, Receipt, Smartphone } from 'lucide-react';

/**
 * FloatingActionDock
 * Mobile-only floating quick action dock positioned at bottom thumb reach.
 * Features subtle glassmorphism, responsive safe-area insets, and tactile spring feedback.
 *
 * @param {Object} props
 * @param {Function} props.onOpenAddExpenseModal - Open register expense/transfer modal
 * @param {Function} props.onOpenBillModal - Open AI bill splitter modal
 * @param {Function} props.onOpenProfileModal - Open payment key / QR modal
 */
export default function FloatingActionDock({
  onOpenAddExpenseModal,
  onOpenBillModal,
  onOpenProfileModal,
}) {
  return (
    <nav
      className="floating-action-dock fixed bottom-4 left-4 right-4 z-40 md:hidden backdrop-blur-md"
      aria-label="Acciones rápidas móviles"
    >
      <div className="dock-container">
        {/* Mi Llave Bre-B / QR */}
        <button
          type="button"
          className="dock-action-btn dock-btn-subtle active:scale-[0.98]"
          onClick={onOpenProfileModal}
          title="Mi Llave / QR de Pago"
        >
          <Smartphone size={20} className="dock-icon" />
          <span className="dock-label">Mi Llave / QR</span>
        </button>

        {/* Central Prominent Quick Action: + Gasto */}
        <button
          type="button"
          className="dock-action-btn dock-btn-primary active:scale-[0.98]"
          onClick={onOpenAddExpenseModal}
          title="Registrar nuevo gasto"
        >
          <div className="dock-primary-icon-wrap">
            <Plus size={22} strokeWidth={2.4} />
          </div>
          <span className="dock-label dock-primary-label">+ Gasto</span>
        </button>

        {/* Dividir Factura */}
        <button
          type="button"
          className="dock-action-btn dock-btn-subtle active:scale-[0.98]"
          onClick={onOpenBillModal}
          title="Dividir factura con OCR o en vivo"
        >
          <Receipt size={20} className="dock-icon" />
          <span className="dock-label">Dividir Factura</span>
        </button>
      </div>
    </nav>
  );
}
