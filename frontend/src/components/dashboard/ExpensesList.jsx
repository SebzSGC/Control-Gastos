import { useState, useMemo } from 'react';
import { Search, Receipt, Send, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCOP } from '../../utils/formatters';

/**
 * ExpensesList
 * Filterable and paginated list of registered expenses, bills, and transfers.
 * 
 * @param {Object} props
 * @param {Array} props.expenses - Raw list of expenses
 * @param {Array} props.profiles - Group profiles to resolve recipients
 * @param {Array} props.bills - Group bills for itemized breakdown view
 * @param {Function} props.onViewBill - Callback when clicking "Ver desglose"
 * @param {Function} props.onDeleteExpense - Callback when clicking delete icon
 * @param {number} [props.pageSize=12] - Number of items per page
 */
export default function ExpensesList({
  expenses = [],
  profiles = [],
  bills = [],
  onViewBill,
  onDeleteExpense,
  pageSize = 12,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all'); // 'all' | 'expense' | 'transfer'
  const [currentPage, setCurrentPage] = useState(1);

  // Filtered dataset
  const filteredExpenses = useMemo(() => {
    return expenses.filter((ex) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        (ex.description || '').toLowerCase().includes(q) ||
        (ex.profile_name || '').toLowerCase().includes(q);
      const matchesFilter =
        historyFilter === 'all' || ex.type === historyFilter;
      return matchesSearch && matchesFilter;
    });
  }, [expenses, searchQuery, historyFilter]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredExpenses.length / pageSize) || 1;
  const safePage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedExpenses = useMemo(() => {
    const startIndex = (safePage - 1) * pageSize;
    return filteredExpenses.slice(startIndex, startIndex + pageSize);
  }, [filteredExpenses, safePage, pageSize]);

  const handleFilterChange = (filter) => {
    setHistoryFilter(filter);
    setCurrentPage(1);
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className="glass-panel" style={{ padding: '1.75rem' }} aria-label="Historial de Movimientos">
      {/* Search & Filter Bar */}
      <div className="history-search-filter-row">
        <div className="history-search-input-wrap" style={{ position: 'relative' }}>
          <Search
            size={17}
            color="var(--text-muted)"
            style={{
              position: 'absolute',
              left: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          />
          <input
            type="text"
            className="glass-input"
            placeholder="Buscar por concepto o participante..."
            value={searchQuery}
            onChange={handleSearchChange}
            style={{ paddingLeft: '2.5rem', width: '100%' }}
          />
        </div>

        <div className="segmented-control history-segmented-control">
          <button
            type="button"
            className={`segmented-btn ${historyFilter === 'all' ? 'active' : ''}`}
            onClick={() => handleFilterChange('all')}
          >
            Todos
          </button>
          <button
            type="button"
            className={`segmented-btn ${historyFilter === 'expense' ? 'active' : ''}`}
            onClick={() => handleFilterChange('expense')}
          >
            Gastos
          </button>
          <button
            type="button"
            className={`segmented-btn ${historyFilter === 'transfer' ? 'active' : ''}`}
            onClick={() => handleFilterChange('transfer')}
          >
            Abonos
          </button>
        </div>
      </div>

      {/* List */}
      {filteredExpenses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
          <Receipt size={40} style={{ opacity: 0.35, margin: '0 auto 0.75rem' }} />
          <p>No se encontraron movimientos registrados</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {paginatedExpenses.map((ex) => {
            const isTransfer = ex.type === 'transfer';
            const isBill = ex.type === 'bill';
            const receiver = isTransfer
              ? profiles.find((p) => p.id === ex.to_profile_id)
              : null;
            const dateObj = ex.date ? new Date(ex.date) : new Date();
            const formattedDate = dateObj.toLocaleDateString('es-CO', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={ex.id}
                className="expense-item history-expense-item animate-fade-in"
                style={{
                  borderLeft: isBill
                    ? '3.5px solid var(--accent-mint)'
                    : isTransfer
                    ? '3.5px solid var(--primary)'
                    : '3.5px solid var(--accent)',
                }}
              >
                <div className="history-item-main">
                  <div
                    className={`expense-item-icon-box ${
                      isBill ? 'bill' : isTransfer ? 'transfer' : 'expense'
                    }`}
                  >
                    {isBill ? (
                      <Receipt size={18} />
                    ) : isTransfer ? (
                      <Send size={18} />
                    ) : (
                      <Receipt size={18} />
                    )}
                  </div>

                  <div className="history-item-details">
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <h4
                        className="history-item-title"
                        style={{
                          fontWeight: '700',
                          margin: 0,
                          color: 'var(--text-main)',
                        }}
                      >
                        {ex.description}
                      </h4>
                      {isBill && (
                        <span
                          style={{
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: 'var(--accent-mint)',
                            fontSize: '0.7rem',
                            padding: '0.1rem 0.45rem',
                            borderRadius: '4px',
                            fontWeight: '700',
                          }}
                        >
                          Factura Desglosada
                        </span>
                      )}
                    </div>
                    <span
                      className="text-subtle history-item-meta"
                      style={{ display: 'block', marginTop: '0.2rem' }}
                    >
                      {isTransfer ? (
                        <>
                          <strong>{ex.profile_name}</strong> transfirió a{' '}
                          <strong>{receiver?.name || 'Compañero'}</strong>
                        </>
                      ) : isBill ? (
                        <>
                          Cuenta pagada por <strong>{ex.profile_name}</strong>
                        </>
                      ) : (
                        <>
                          Pagado por <strong>{ex.profile_name}</strong>
                        </>
                      )}
                      {' • '}
                      <span>{formattedDate}</span>
                    </span>
                  </div>
                </div>

                <div className="history-item-trailing">
                  {isBill && (
                    <button
                      type="button"
                      className="btn-secondary btn-sm history-breakdown-btn"
                      onClick={() => {
                        const found = bills.find(
                          (b) =>
                            b.id === ex.bill_id ||
                            b.date === ex.date ||
                            b.payer_profile_id === ex.profile_id
                        );
                        onViewBill(
                          found || {
                            description: ex.description,
                            payer_name: ex.profile_name,
                            date: ex.date,
                            total_amount: ex.amount,
                            items: [],
                            splits: [],
                          }
                        );
                      }}
                      title="Ver productos y reparto de la factura"
                    >
                      Ver desglose
                    </button>
                  )}

                  <span
                    className="num-tabular history-item-amount"
                    style={{ fontWeight: '800', color: 'var(--text-main)' }}
                  >
                    {formatCOP(ex.amount)}
                  </span>

                  <button
                    type="button"
                    className="btn-danger-ghost history-delete-btn"
                    onClick={() => onDeleteExpense(ex)}
                    title="Eliminar movimiento"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <span className="text-subtle" style={{ fontSize: '0.85rem' }}>
            Página <strong>{safePage}</strong> de <strong>{totalPages}</strong> ({filteredExpenses.length} movimientos)
          </span>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <ChevronLeft size={15} /> Anterior
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
            >
              Siguiente <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
