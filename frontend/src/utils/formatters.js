export const formatCOP = (amount) => {
  const safeAmount = Number(amount) || 0;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(safeAmount);
};

export const CHART_COLORS = ['#6366f1', '#10b981', '#06b6d4', '#f59e0b', '#ec4899', '#8b5cf6'];

export const QUICK_CATEGORIES = [
  { label: '🍽️ Comida', value: 'comida' },
  { label: '🏠 Arriendo', value: 'arriendo' },
  { label: '🛒 Mercado', value: 'mercado' },
  { label: '💡 Servicios', value: 'servicios' },
  { label: '🚗 Transporte', value: 'transporte' },
  { label: '🍿 Ocio', value: 'ocio' },
];
