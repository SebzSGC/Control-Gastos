import { useNavigate } from 'react-router-dom';
import { Smartphone, Receipt, Plus, Wallet, Activity, Layers, ArrowLeft, Users } from 'lucide-react';
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
  const navigate = useNavigate();
  const toast = useToast();

  const handleCopyCode = () => {
    if (!group?.id) return;
    navigator.clipboard.writeText(group.id);
    toast.success(`Código ${group.id} copiado al portapapeles`);
  };

  return (
    <>
      {/* Quick Navigation Actions */}
      <div className="dashboard-nav-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="btn-nav-action active:scale-[0.98]"
          title="Salir de esta sala y volver a la pantalla de inicio"
        >
          <ArrowLeft size={15} /> <span>Volver al Menú Principal</span>
        </button>
        <button
          type="button"
          onClick={() => navigate(`/group/${group?.id}`)}
          className="btn-nav-action active:scale-[0.98]"
          title="Seleccionar o cambiar el participante activo en esta sala"
        >
          <Users size={15} /> <span>Cambiar de Participante ({currentProfile?.name})</span>
        </button>
      </div>

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

        {/* Desktop Action Buttons (hidden on mobile to give room to the Floating Action Dock) */}
        <div
          className="dashboard-action-buttons hidden md:flex"
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}
        >
          <button
            type="button"
            className="btn-secondary dashboard-action-btn active:scale-[0.98]"
            onClick={onOpenProfileModal}
            title="Mi Llave Bre-B / Nequi"
          >
            <Smartphone size={16} /> <span>Mi Llave de Pago</span>
          </button>
          <button
            type="button"
            className="btn-secondary dashboard-action-btn dashboard-action-bill active:scale-[0.98]"
            onClick={onOpenBillModal}
            title="Subir foto de factura y desglosar productos entre participantes"
          >
            <Receipt size={16} style={{ color: 'var(--accent-mint)' }} /> <span>Pagar con Factura</span>
          </button>
          <button
            type="button"
            className="btn-primary dashboard-action-btn dashboard-action-main active:scale-[0.98]"
            onClick={onOpenAddExpenseModal}
          >
            <Plus size={18} /> <span>Registrar Movimiento</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs with smooth horizontal scroll and no wrapping */}
      <div
        className="nav-tabs-wrapper overflow-x-auto scrollbar-none flex-nowrap"
        role="tablist"
        aria-label="Secciones del Tablero"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'balances'}
          className={`nav-tab-btn active:scale-[0.98] ${activeTab === 'balances' ? 'active' : ''}`}
          onClick={() => onTabChange('balances')}
        >
          <Wallet size={18} /> <span>Saldos & Liquidación</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'analytics'}
          className={`nav-tab-btn active:scale-[0.98] ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => onTabChange('analytics')}
        >
          <Activity size={18} /> <span>Analíticas Visuales</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'history'}
          className={`nav-tab-btn active:scale-[0.98] ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => onTabChange('history')}
        >
          <Layers size={18} /> <span>Historial ({expensesCount})</span>
        </button>
      </div>
    </>
  );
}
