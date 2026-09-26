import { X } from 'lucide-react';
import { formatCOP } from '../../utils/formatters';

/**
 * DeleteExpenseModal
 * Confirmation modal before deleting a registered movement.
 */
export default function DeleteExpenseModal({
  expense,
  onClose,
  onConfirm,
  isDeleting = false,
}) {
  if (!expense) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container animate-toast-in"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '400px' }}
      >
        <div className="modal-header">
          <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--danger)' }}>
            ¿Eliminar Movimiento?
          </h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <p className="text-muted" style={{ marginBottom: '1.5rem', lineHeight: '1.5' }}>
          ¿Estás seguro de que deseas eliminar <strong>&quot;{expense.description}&quot;</strong> por valor de{' '}
          <strong>{formatCOP(expense.amount)}</strong>? Los balances se recalcularán automáticamente.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            style={{ flex: 1 }}
            disabled={isDeleting}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            style={{
              flex: 1,
              background: 'var(--danger)',
              boxShadow: '0 4px 15px var(--danger-glow)',
            }}
            onClick={() => onConfirm(expense.id)}
            disabled={isDeleting}
          >
            {isDeleting ? 'Eliminando...' : 'Sí, Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}
