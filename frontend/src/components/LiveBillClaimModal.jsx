import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Utensils, Sparkles, Radio, Users } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const formatCOP = (amount) => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount || 0);
};

export default function LiveBillClaimModal({
  isOpen,
  onClose,
  liveBill,
  currentProfile,
  profiles = [],
  socket = null
}) {
  const { showToast } = useToast();

  // Map of itemId -> array of profileIds [pid1, pid2]
  const [claims, setClaims] = useState(() => liveBill?.initialClaims || {});
  const [prevSessionId, setPrevSessionId] = useState(liveBill?.sessionId);

  if (liveBill?.sessionId !== prevSessionId) {
    setPrevSessionId(liveBill?.sessionId);
    setClaims(liveBill?.initialClaims || {});
  }

  // Listen for peer claims in real-time via WebSocket
  useEffect(() => {
    if (!socket || !isOpen) return;

    const handlePeerClaim = (data) => {
      if (data?.itemId && data?.profileId) {
        setClaims(prev => {
          const current = prev[data.itemId] || [];
          const exists = current.includes(data.profileId);
          if (data.selected && !exists) {
            return { ...prev, [data.itemId]: [...current, data.profileId] };
          } else if (!data.selected && exists) {
            return { ...prev, [data.itemId]: current.filter(id => id !== data.profileId) };
          }
          return prev;
        });

        if (data.profileId !== currentProfile?.id) {
          showToast(`🍽️ ${data.profileName} marcó: ${data.itemName || 'un plato'}`, 'info');
        }
      }
    };

    socket.on('bill_item_claimed', handlePeerClaim);
    socket.on('bill_assignments_updated', handlePeerClaim);

    return () => {
      socket.off('bill_item_claimed', handlePeerClaim);
      socket.off('bill_assignments_updated', handlePeerClaim);
    };
  }, [socket, isOpen, currentProfile, showToast]);

  // Toggle my claim on a specific dish
  const handleToggleClaim = (item) => {
    if (!currentProfile?.id) return;

    const currentAssigned = claims[item.id] || [];
    const isCurrentlySelected = currentAssigned.includes(currentProfile.id);
    const nextSelected = !isCurrentlySelected;

    // Optimistic local state update
    setClaims(prev => {
      const cur = prev[item.id] || [];
      const updated = nextSelected 
        ? [...cur, currentProfile.id]
        : cur.filter(id => id !== currentProfile.id);
      return { ...prev, [item.id]: updated };
    });

    // Haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(40);
    }

    // Broadcast through socket to host and all room peers
    if (socket && liveBill?.groupId) {
      const claimPayload = {
        groupId: liveBill.groupId,
        group_id: liveBill.groupId,
        sessionId: liveBill.sessionId || liveBill.id,
        billId: liveBill.billId,
        itemId: item.id,
        itemName: item.name,
        profileId: currentProfile.id,
        profileName: currentProfile.name,
        selected: nextSelected
      };
      socket.emit('bill_item_claimed', claimPayload);
      socket.emit('toggle_bill_item', claimPayload);
    }
  };

  // Real-time calculation of what currentProfile owes
  const mySummary = useMemo(() => {
    if (!liveBill?.items || !currentProfile?.id) {
      return { count: 0, subtotal: 0, estTotal: 0 };
    }

    let mySubtotal = 0;
    let myCount = 0;

    liveBill.items.forEach(item => {
      const assigned = claims[item.id] || [];
      if (assigned.includes(currentProfile.id)) {
        myCount += 1;
        mySubtotal += (Number(item.subtotal) || 0) / assigned.length;
      }
    });

    const billItemsTotal = liveBill.items.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);
    const ratio = billItemsTotal > 0 ? (mySubtotal / billItemsTotal) : 0;
    const myTip = (Number(liveBill.tip) || 0) * ratio;
    const myTax = (Number(liveBill.tax) || 0) * ratio;
    const myDiscount = (Number(liveBill.discount) || 0) * ratio;
    const estTotal = Math.max(0, mySubtotal + myTip + myTax - myDiscount);

    return {
      count: myCount,
      subtotal: Math.round(mySubtotal),
      estTotal: Math.round(estTotal)
    };
  }, [liveBill, claims, currentProfile]);

  if (!isOpen || !liveBill) return null;

  const items = Array.isArray(liveBill.items) ? liveBill.items : [];

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div 
        className="modal-container modal-wide animate-toast-in" 
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '680px', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-title-wrap">
            <div className="modal-icon-badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4' }}>
              <Utensils size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                <span className="live-bill-badge-pulse" style={{ padding: '0.15rem 0.5rem', fontSize: '0.68rem' }}>
                  <span className="live-pulse-dot" />
                  <Radio size={12} /> EN VIVO
                </span>
                <h3 className="modal-title" style={{ margin: 0, fontSize: '1.25rem' }}>
                  {liveBill.storeName || 'Cuenta Abierta'}
                </h3>
              </div>
              <p className="modal-subtitle">
                Subida por <strong>{liveBill.hostName}</strong> • Marca los platos o bebidas que consumiste
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Cerrar modal">
            <X size={20} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="modal-body-scrollable" style={{ padding: '1.25rem 1.5rem' }}>
          
          {/* Instructions banner */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <Users size={16} color="var(--primary)" />
              <span className="text-secondary">
                Participando como: <strong style={{ color: 'var(--text-main)' }}>{currentProfile?.name}</strong>
              </span>
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--accent-mint)', fontWeight: '600' }}>
              ⚡ Sincronización en vivo activa
            </span>
          </div>

          {/* Dishes list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {items.map((item) => {
              const assigned = claims[item.id] || [];
              const isClaimedByMe = assigned.includes(currentProfile?.id);
              const shareEach = assigned.length > 0 ? (item.subtotal / assigned.length) : item.subtotal;

              return (
                <div 
                  key={item.id}
                  onClick={() => handleToggleClaim(item)}
                  className={`glass-card glass-card-interactive ${isClaimedByMe ? 'card-assigned' : ''}`}
                  style={{
                    padding: '1rem 1.2rem',
                    borderRadius: 'var(--radius-lg)',
                    border: isClaimedByMe 
                      ? '1.5px solid var(--accent-mint)' 
                      : '1px solid var(--border-subtle)',
                    background: isClaimedByMe 
                      ? 'linear-gradient(135deg, var(--bg-surface) 0%, rgba(16, 185, 129, 0.08) 100%)' 
                      : 'var(--bg-surface)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {/* Left: Checkbox + Dish Info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1 }}>
                    <div style={{
                      width: 26,
                      height: 26,
                      borderRadius: 'var(--radius-sm)',
                      border: isClaimedByMe ? 'none' : '2px solid var(--border-subtle)',
                      background: isClaimedByMe ? 'var(--accent-mint)' : 'transparent',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'all 0.15s ease'
                    }}>
                      {isClaimedByMe && <Check size={16} strokeWidth={3} />}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <span className="item-qty-badge">{item.quantity}x</span>
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: 'var(--text-main)' }}>
                          {item.name}
                        </h4>
                      </div>

                      {/* Who else claimed it */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                        {assigned.length > 0 ? (
                          assigned.map(pid => {
                            const pName = profiles.find(p => p.id === pid)?.name || (pid === currentProfile?.id ? currentProfile.name : 'Alguien');
                            const isMe = pid === currentProfile?.id;
                            return (
                              <span 
                                key={pid} 
                                style={{
                                  fontSize: '0.72rem',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: 'var(--radius-pill)',
                                  background: isMe ? 'rgba(16, 185, 129, 0.18)' : 'rgba(99, 102, 241, 0.15)',
                                  color: isMe ? 'var(--accent-mint)' : 'var(--brand-primary)',
                                  fontWeight: '600'
                                }}
                              >
                                {isMe ? 'Tú' : pName}
                              </span>
                            );
                          })
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Sin asignar aún • Toca para reclamar
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Price */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-primary)', display: 'block' }}>
                      {formatCOP(item.subtotal)}
                    </span>
                    {assigned.length > 1 && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--accent-mint)' }}>
                        ({formatCOP(shareEach)} c/u entre {assigned.length})
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Running total for current user */}
          <div style={{
            marginTop: '1.5rem',
            padding: '1.1rem 1.25rem',
            borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(99, 102, 241, 0.1) 100%)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div>
              <span className="card-label" style={{ marginBottom: '0.2rem' }}>MI CONSUMO SELECCIONADO</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sparkles size={16} color="var(--primary)" />
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  {mySummary.count === 0 
                    ? 'No has marcado platos todavía' 
                    : `${mySummary.count} plato(s) marcados`}
                </span>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--brand-primary)' }}>
                {formatCOP(mySummary.estTotal)}
              </span>
              <span className="text-subtle" style={{ display: 'block', fontSize: '0.72rem' }}>
                (Incluye propina/impuestos estimados)
              </span>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>

          <button 
            type="button" 
            className="btn-primary btn-success-glow" 
            onClick={() => {
              showToast('¡Consumos registrados! El pagador verá tus platos asignados en vivo.', 'success');
              onClose();
            }}
          >
            <Check size={16} /> Listo, consumos marcados
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
