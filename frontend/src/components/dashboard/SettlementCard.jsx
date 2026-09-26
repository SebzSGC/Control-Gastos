import { Sparkles, CheckCircle2, ArrowRight, Wallet, Smartphone } from 'lucide-react';
import { formatCOP } from '../../utils/formatters';

/**
 * SettlementItem
 * Atomic card representing a single optimized debt payment from Member A to Member B.
 */
export function SettlementItem({ settlement, profiles, me, onSelectPayProfile }) {
  const toProfile = profiles.find((p) => p.id === settlement.to);
  const isFromMe = settlement.from === me?.id;
  const isToMe = settlement.to === me?.id;

  return (
    <div
      className="settlement-card animate-fade-in"
      style={{
        borderLeft: isFromMe
          ? '4px solid var(--danger)'
          : isToMe
          ? '4px solid var(--success)'
          : '1px solid var(--border-subtle)',
      }}
    >
      <div className="settlement-card-info">
        <div className="settlement-flow">
          <span className="settlement-person">
            {settlement.from_name} {isFromMe ? '(Tú)' : ''}
          </span>
          <ArrowRight size={16} color="var(--text-muted)" />
          <span className="settlement-person" style={{ color: 'var(--primary)' }}>
            {settlement.to_name} {isToMe ? '(Tú)' : ''}
          </span>
        </div>

        <div className="settlement-card-amount-row">
          <span
            className="num-tabular settlement-amount"
            style={{ fontWeight: '800', fontSize: '1.15rem', color: 'var(--text-main)' }}
          >
            {formatCOP(settlement.amount)}
          </span>
          {isFromMe && (
            <span className="settlement-badge-debt">
              Tu deuda pendiente
            </span>
          )}
        </div>
      </div>

      {toProfile && (
        <button
          type="button"
          className="btn-secondary settlement-pay-btn"
          onClick={() => onSelectPayProfile(toProfile)}
          title={`Ver datos de pago de ${settlement.to_name}`}
        >
          <Wallet size={14} /> Pagar
        </button>
      )}
    </div>
  );
}

/**
 * MemberBalanceItem
 * Atomic row displaying a member's contributed vs received amounts and net balance.
 */
export function MemberBalanceItem({ member, isMe, onSelectPayProfile }) {
  const isPositive = member.balance >= 0;

  return (
    <div className="expense-item balance-member-item" style={{ marginBottom: 0 }}>
      <div className="balance-member-left">
        <div
          className="navbar-user-avatar"
          style={{ width: 38, height: 38, fontSize: '1rem', flexShrink: 0 }}
        >
          {member.name.charAt(0).toUpperCase()}
        </div>
        <div className="balance-member-text">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: '700', fontSize: '0.98rem' }}>{member.name}</span>
            {isMe && (
              <span
                style={{
                  fontSize: '0.7rem',
                  background: 'var(--primary-glow)',
                  color: 'var(--primary)',
                  padding: '0.1rem 0.45rem',
                  borderRadius: 'var(--radius-full)',
                  fontWeight: '700',
                }}
              >
                Tú
              </span>
            )}
          </div>
          <span className="text-subtle balance-member-breakdown" style={{ display: 'block', marginTop: '0.15rem' }}>
            Aportó: {formatCOP(member.paid + member.transferred)} • Recibió: {formatCOP(member.received)}
          </span>
        </div>
      </div>

      <div className="balance-member-right">
        <span
          className="num-tabular balance-member-amount"
          style={{
            fontWeight: '800',
            fontSize: '1.05rem',
            color: isPositive ? 'var(--success)' : 'var(--danger)',
          }}
        >
          {isPositive ? '+' : ''}{formatCOP(member.balance)}
        </span>

        {!isMe && (
          <button
            type="button"
            className="balance-pay-key-btn"
            onClick={() => onSelectPayProfile(member)}
            title={member.payment_key ? `Ver llave de ${member.name}` : 'Sin llave configurada'}
          >
            <Smartphone size={13} /> {member.payment_key ? 'Ver llave' : 'Sin llave'}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * SettlementCard
 * Complete view of balances & smart min-cash-flow settlements:
 * 1. Balance de cada miembro (individual breakdown)
 * 2. Liquidación Óptima (optimized debt compensation cards & action buttons)
 * 
 * @param {Object} props
 * @param {Array} props.balances - List of member balances
 * @param {Array} props.settlements - List of settlement operations
 * @param {Array} props.profiles - List of group profiles
 * @param {Object} props.me - Current logged-in user profile
 * @param {number} props.fairShare - Equal base share amount
 * @param {Function} props.onSelectPayProfile - Callback when clicking to view a member's payment card
 */
export default function SettlementCard({
  balances = [],
  settlements = [],
  profiles = [],
  me,
  fairShare = 0,
  onSelectPayProfile,
}) {
  return (
    <div className="dashboard-tab-grid">
      {/* Left Column: Balances by Member */}
      <div className="glass-panel" style={{ padding: '1.75rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
            flexWrap: 'wrap',
            gap: '0.4rem',
          }}
        >
          <h3 style={{ fontSize: '1.15rem', fontWeight: '700', margin: 0 }}>
            Balance de Cada Miembro
          </h3>
          <span className="text-subtle" style={{ fontSize: '0.8rem' }}>
            Base justa: {formatCOP(fairShare)}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {balances.map((b) => (
            <MemberBalanceItem
              key={b.id}
              member={b}
              isMe={b.id === me?.id}
              onSelectPayProfile={onSelectPayProfile}
            />
          ))}
        </div>
      </div>

      {/* Right Column: Smart Min-Cash-Flow Settlements */}
      <div className="glass-panel" style={{ padding: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Sparkles size={20} color="var(--accent)" />
          <h3 style={{ fontSize: '1.15rem', fontWeight: '700', margin: 0 }}>
            Liquidación Óptima
          </h3>
        </div>
        <p className="text-muted" style={{ fontSize: '0.88rem', marginBottom: '1.5rem', lineHeight: '1.4' }}>
          Algoritmo inteligente para saldar todas las deudas con el menor número posible de transferencias.
        </p>

        {settlements.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
            <CheckCircle2 size={42} color="var(--success)" style={{ margin: '0 auto 0.75rem' }} />
            <h4 style={{ color: 'var(--text-main)', marginBottom: '0.25rem' }}>¡Cuentas al Día!</h4>
            <p className="text-subtle">No hay deudas pendientes entre los miembros del grupo.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {settlements.map((st, index) => (
              <SettlementItem
                key={`${st.from}-${st.to}-${index}`}
                settlement={st}
                profiles={profiles}
                me={me}
                onSelectPayProfile={onSelectPayProfile}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
