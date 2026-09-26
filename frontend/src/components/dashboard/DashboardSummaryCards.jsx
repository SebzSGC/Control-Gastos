import { Receipt, Users, ArrowDownLeft, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { formatCOP } from '../../utils/formatters';

/**
 * DashboardSummaryCards
 * Displays bento metrics grid with key financial indicators:
 * - Total Group Spent
 * - User's Personal Net Balance & Settlement status
 * - Fair share quota per member
 * 
 * @param {Object} props
 * @param {number} props.totalSpent - Total amount spent in group
 * @param {number} props.myBalance - Current user's net balance
 * @param {number} props.fairShare - Equal quota per participant
 * @param {number} props.registeredExpensesCount - Total expenses count
 * @param {number} props.profilesCount - Total group members count
 */
export default function DashboardSummaryCards({
  totalSpent = 0,
  myBalance = 0,
  fairShare = 0,
  registeredExpensesCount = 0,
  profilesCount = 0,
}) {
  const isPositive = myBalance > 0;
  const isNegative = myBalance < 0;

  const balanceModifierClass = isPositive
    ? 'bento-balance-positive'
    : isNegative
    ? 'bento-balance-negative'
    : 'bento-balance-even';

  const balanceIconBg = isPositive
    ? 'var(--success-bg)'
    : isNegative
    ? 'var(--danger-bg)'
    : 'var(--primary-glow)';

  const balanceIconColor = isPositive
    ? 'var(--success)'
    : isNegative
    ? 'var(--danger)'
    : 'var(--primary)';

  const balanceValueColor = isPositive
    ? 'var(--success)'
    : isNegative
    ? 'var(--danger)'
    : 'var(--text-main)';

  const balanceStatusLabel = isPositive
    ? 'Te deben a favor'
    : isNegative
    ? 'Debes abonar al grupo'
    : '¡Estás al día, cuota saldada!';

  return (
    <section className="bento-metrics-grid" aria-label="Métricas Principales">
      {/* Card 1: Gasto Total */}
      <div className="glass-panel bento-card">
        <div className="bento-card-header">
          <span className="bento-card-title">Gasto Total del Grupo</span>
          <div className="bento-card-icon" style={{ background: 'var(--primary-glow)', color: 'var(--primary)' }}>
            <Receipt size={18} />
          </div>
        </div>
        <div className="bento-card-value num-tabular">
          {formatCOP(totalSpent)}
        </div>
        <div className="bento-card-footer">
          <span>{registeredExpensesCount} gastos registrados</span>
        </div>
      </div>

      {/* Card 2: Tu Balance Personal */}
      <div className={`glass-panel bento-card ${balanceModifierClass}`}>
        <div className="bento-card-header">
          <span className="bento-card-title">Tu Estado Personal</span>
          <div
            className="bento-card-icon"
            style={{
              background: balanceIconBg,
              color: balanceIconColor,
            }}
          >
            {isPositive ? (
              <ArrowDownLeft size={18} />
            ) : isNegative ? (
              <ArrowUpRight size={18} />
            ) : (
              <CheckCircle2 size={18} />
            )}
          </div>
        </div>
        <div className="bento-card-value num-tabular" style={{ color: balanceValueColor }}>
          {myBalance === 0 ? '$ 0' : formatCOP(Math.abs(myBalance))}
        </div>
        <div className="bento-card-footer">
          <strong style={{ color: balanceIconColor }}>
            {balanceStatusLabel}
          </strong>
        </div>
      </div>

      {/* Card 3: Cuota Equitativa */}
      <div className="glass-panel bento-card">
        <div className="bento-card-header">
          <span className="bento-card-title">Cuota por Persona</span>
          <div className="bento-card-icon" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
            <Users size={18} />
          </div>
        </div>
        <div className="bento-card-value num-tabular">
          {formatCOP(fairShare)}
        </div>
        <div className="bento-card-footer">
          <span>División entre {profilesCount} participantes</span>
        </div>
      </div>
    </section>
  );
}
