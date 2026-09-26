import { Receipt, X } from 'lucide-react';
import { formatCOP } from '../../utils/formatters';

/**
 * BillDetailsModal
 * Modal displaying itemized breakdown of a registered bill:
 * products table, additional charges (tip/tax), and participant shares.
 */
export default function BillDetailsModal({ bill, onClose }) {
  if (!bill) return null;

  const items = Array.isArray(bill.items) ? bill.items : [];
  const splits = Array.isArray(bill.splits) ? bill.splits : [];
  const payerName = bill.payer_name || bill.profile_name || 'Alguien';
  const hasTipOrTax = ((bill.tip || 0) > 0 || (bill.tax || 0) > 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container modal-wide animate-scale-up" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-title-wrap">
            <div className="modal-icon-badge">
              <Receipt size={22} />
            </div>
            <div>
              <h3 className="modal-title">{bill.description || 'Factura Desglosada'}</h3>
              <p className="modal-subtitle">
                Pagada por <strong>{payerName}</strong>
                {bill.date && ` • ${new Date(bill.date).toLocaleDateString('es-CO', { dateStyle: 'medium' })}`}
              </p>
            </div>
          </div>
          <button type="button" className="btn-icon-subtle" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body-scrollable">
          {/* Items List */}
          <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '700' }}>
            Productos en la Factura
          </h4>

          {items.length > 0 ? (
            <div className="bill-items-table-wrap">
              <table className="bill-items-table">
                <thead>
                  <tr>
                    <th>Producto / Concepto</th>
                    <th style={{ textAlign: 'center' }}>Cant.</th>
                    <th style={{ textAlign: 'right' }}>Vr. Unitario</th>
                    <th style={{ textAlign: 'right' }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={it.id || idx}>
                      <td style={{ fontWeight: 600 }}>{it.name}</td>
                      <td style={{ textAlign: 'center' }}>{it.quantity}x</td>
                      <td style={{ textAlign: 'right' }}>{formatCOP(it.unit_price || it.unitPrice)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCOP(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-secondary" style={{ fontStyle: 'italic', marginBottom: '1.5rem' }}>
              Esta factura fue registrada con un desglose consolidado.
            </p>
          )}

          {/* Charges summary */}
          <div className="bill-total-summary-card" style={{ marginBottom: '1.5rem' }}>
            <div className="summary-item">
              <span className="summary-label">Subtotal Productos:</span>
              <span className="summary-val">{formatCOP(bill.subtotal || bill.total_amount)}</span>
            </div>
            {hasTipOrTax && (
              <div className="summary-item">
                <span className="summary-label">Propina / Impuestos:</span>
                <span className="summary-val">+{formatCOP((bill.tip || 0) + (bill.tax || 0))}</span>
              </div>
            )}
            <div className="summary-item total-highlight">
              <span className="summary-label">Total de la Factura:</span>
              <span className="summary-val">{formatCOP(bill.total_amount || bill.amount)}</span>
            </div>
          </div>

          {/* Participant Splits */}
          <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '700' }}>
            Reparto por Participante
          </h4>

          {splits.length > 0 ? (
            <div className="participants-summary-grid">
              {splits.map((sp, idx) => (
                <div key={sp.id || idx} className="participant-summary-card active-share">
                  <div className="participant-card-head">
                    <div className="avatar-chip">
                      {(sp.profile_name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <h4 className="participant-card-name" style={{ fontSize: '0.95rem' }}>
                        {sp.profile_name}
                      </h4>
                      {sp.items_summary && (
                        <p className="text-xs text-secondary" style={{ margin: '0.2rem 0 0 0' }}>
                          {sp.items_summary}
                        </p>
                      )}
                    </div>
                    <div className="participant-total-amount" style={{ fontSize: '1.1rem' }}>
                      {formatCOP(sp.amount)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-secondary" style={{ fontStyle: 'italic' }}>
              Dividido equitativamente entre los participantes de la sala.
            </p>
          )}
        </div>

        <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn-primary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
