import { PieChart as PieChartIcon } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { formatCOP, CHART_COLORS } from '../../utils/formatters';

/**
 * SpendingAnalytics
 * Visual analytics dashboard using Recharts for timeline progressions and payment/transfer distributions.
 * 
 * @param {Object} props
 * @param {Array} props.timelineData - Array of { name, Gasto }
 * @param {Array} props.paymentsPieData - Array of { name, value }
 * @param {Array} props.transfersPieData - Array of { name, value }
 * @param {boolean} props.isDark - Theme mode indicator for chart styling
 */
export default function SpendingAnalytics({
  timelineData = [],
  paymentsPieData = [],
  transfersPieData = [],
  isDark = true,
}) {
  const tooltipContentStyle = {
    backgroundColor: isDark ? '#1e293b' : '#ffffff',
    borderRadius: '12px',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-main)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
  };

  return (
    <div className="dashboard-tab-grid" aria-label="Analíticas Visuales">
      {/* BarChart: Gastos por Fecha */}
      <div className="glass-panel" style={{ padding: '1.75rem' }}>
        <h3
          style={{
            fontSize: '1.1rem',
            fontWeight: '700',
            marginBottom: '1.25rem',
            color: 'var(--text-main)',
          }}
        >
          Progresión de Gastos
        </h3>
        <div style={{ width: '100%', height: 240 }}>
          {timelineData.length > 0 ? (
            <ResponsiveContainer>
              <BarChart data={timelineData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
                  vertical={false}
                />
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
                <YAxis
                  stroke="var(--text-muted)"
                  fontSize={12}
                  tickFormatter={(v) => `$${v / 1000}k`}
                />
                <Tooltip
                  cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                  formatter={(val) => [formatCOP(val), 'Gasto']}
                  contentStyle={tooltipContentStyle}
                />
                <Bar dataKey="Gasto" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div
              className="flex-center"
              style={{ height: '100%', flexDirection: 'column', color: 'var(--text-muted)' }}
            >
              <PieChartIcon size={38} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
              <p>No hay gastos registrados todavía</p>
            </div>
          )}
        </div>
      </div>

      {/* PieChart: Repartición de Pagos */}
      <div className="glass-panel" style={{ padding: '1.75rem' }}>
        <h3
          style={{
            fontSize: '1.1rem',
            fontWeight: '700',
            marginBottom: '1.25rem',
            color: 'var(--text-main)',
          }}
        >
          Repartición de Pagos Realizados
        </h3>
        <div style={{ width: '100%', height: 240 }}>
          {paymentsPieData.length > 0 ? (
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={paymentsPieData}
                  innerRadius={65}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                >
                  {paymentsPieData.map((_, index) => (
                    <Cell
                      key={`pay-cell-${index}`}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val) => [formatCOP(val), 'Pagado']}
                  contentStyle={tooltipContentStyle}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div
              className="flex-center"
              style={{ height: '100%', flexDirection: 'column', color: 'var(--text-muted)' }}
            >
              <PieChartIcon size={38} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
              <p>No hay gastos base para graficar</p>
            </div>
          )}
        </div>
      </div>

      {/* PieChart: Distribución de Abonos */}
      <div className="glass-panel" style={{ padding: '1.75rem' }}>
        <h3
          style={{
            fontSize: '1.1rem',
            fontWeight: '700',
            marginBottom: '1.25rem',
            color: 'var(--text-main)',
          }}
        >
          Abonos / Transferencias Efectuadas
        </h3>
        <div style={{ width: '100%', height: 240 }}>
          {transfersPieData.length > 0 ? (
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={transfersPieData}
                  innerRadius={65}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                >
                  {transfersPieData.map((_, index) => (
                    <Cell
                      key={`tx-cell-${index}`}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val) => [formatCOP(val), 'Abonado']}
                  contentStyle={tooltipContentStyle}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div
              className="flex-center"
              style={{ height: '100%', flexDirection: 'column', color: 'var(--text-muted)' }}
            >
              <PieChartIcon size={38} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
              <p>No se han registrado abonos todavía</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
