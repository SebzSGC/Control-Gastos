import { Smartphone, Receipt, Plus, Wallet, Activity, Layers } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

/**
 * DashboardHeader
 * Top section of Dashboard containing:
 * - Group title and shareable code badge
 * - Welcome greeting with current user
 * - Action buttons (Payment Key, Bill Split, Add Transaction)
 * - Navigation Tabs (Balances, Analytics, History)
 */
export default function DashboardHeader({
  group,
  currentProfile,
  activeTab,
  onTabChange,
  expensesCount = 0,
  onOpenProfileModal,
  onOpenBillModal,
  onOpenAddExpenseModal,
}) {
  const toast = useToast();

  const handleCopyCode = () => {
    if (!group?.id) return;
    navigator.clipboard.writeText(group.id);
    toast.success(`Código ${group.id} copiado al portapapeles`);
  };

  return (
    <>
      {/* Top Greeting & Action Banner */}
      <div className="dashboard-header-row">
        <div className="dashboard-greeting-block">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h1 className="dashboard-group-title">
              {group?.name || 'Sala'}
            </h1>
            <span
              className="navbar-code-tag"
              onClick={handleCopyCode}
              title="Toca para copiar código de sala"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleCopyCode();
              }}
            >
              #{group?.id}
            </span>
          </div>
          <p className="text-muted dashboard-welcome-sub" style={{ margin: '0.35rem 0 0', fontSize: '0.92rem' }}>
            Hola, <strong style={{ color: 'var(--text-main)' }}>{currentProfile?.name}</strong> • Tablero de finanzas compartidas
          </p>
        </div>

        <div className="dashboard-action-buttons">
          <button
            type="button"
            className="btn-secondary dashboard-action-btn"
            onClick={onOpenProfileModal}
            title="Mi Llave Bre-B / Nequi"
          >
            <Smartphone size={16} /> <span>Mi Llave de Pago</span>
          </button>
          <button
            type="button"
            className="btn-primary btn-success-glow dashboard-action-btn"
            onClick={onOpenBillModal}
            title="Subir foto de factura y desglosar productos entre participantes"
          >
            <Receipt size={16} /> <span>Pagar con Factura</span>
          </button>
          <button
            type="button"
            className="btn-primary dashboard-action-btn dashboard-action-main"
            onClick={onOpenAddExpenseModal}
          >
            <Plus size={18} /> <span>Registrar Movimiento</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="nav-tabs-wrapper" role="tablist" aria-label="Secciones del Tablero">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'balances'}
          className={`nav-tab-btn ${activeTab === 'balances' ? 'active' : ''}`}
          onClick={() => onTabChange('balances')}
        >
          <Wallet size={18} /> Saldos & Liquidación Inteligente
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'analytics'}
          className={`nav-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => onTabChange('analytics')}
        >
          <Activity size={18} /> Analíticas Visuales
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'history'}
          className={`nav-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => onTabChange('history')}
        >
          <Layers size={18} /> Historial ({expensesCount})
        </button>
      </div>
    </>
  );
}
