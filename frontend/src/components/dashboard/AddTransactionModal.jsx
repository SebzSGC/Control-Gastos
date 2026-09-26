import { useState, useRef } from 'react';
import { X, Receipt, Send, ImagePlus, Loader2, Plus } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { API_URL } from '../../config/api';
import { formatCOP, QUICK_CATEGORIES } from '../../utils/formatters';

/**
 * AddTransactionModal
 * Modal to register a group expense or direct member transfer with OCR receipt scan.
 */
export default function AddTransactionModal({
  isOpen,
  onClose,
  groupId,
  currentProfile,
  profiles = [],
  onSuccess,
}) {
  const toast = useToast();

  const [txType, setTxType] = useState('expense'); // 'expense' | 'transfer'
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [toProfileId, setToProfileId] = useState('');
  const [isSubmittingTx, setIsSubmittingTx] = useState(false);

  // OCR Upload States
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);
  const [ocrFileName, setOcrFileName] = useState('');
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleAmountChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (!digits) {
      setAmount('');
      return;
    }
    const num = parseInt(digits, 10);
    setAmount(formatCOP(num));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsProcessingOcr(true);
    setOcrFileName(file.name);
    toast.info('Escaneando comprobante con OCR...');

    const formData = new FormData();
    formData.append('receipt', file);

    const savedKey = localStorage.getItem('paysync_gemini_key');
    const headers = {};
    if (savedKey) headers['x-gemini-key'] = savedKey;

    try {
      const res = await fetch(`${API_URL}/upload-receipt`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = await res.json();
      if (data.success && data.estimatedTotal) {
        setAmount(formatCOP(data.estimatedTotal));
        setDescription('Abono escaneado de comprobante');
        setTxType('transfer');
        toast.success(`¡Monto detectado automáticamente: ${formatCOP(data.estimatedTotal)}!`);
      } else {
        toast.warning('No se pudo extraer el monto exacto. Puedes ingresarlo manualmente.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al procesar la imagen del recibo');
    } finally {
      setIsProcessingOcr(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numericAmount = parseFloat(amount.replace(/\D/g, ''));
    if (!numericAmount || numericAmount <= 0) {
      toast.warning('Ingresa un monto válido mayor a cero');
      return;
    }

    if (!description.trim()) {
      toast.warning('Ingresa una breve descripción');
      return;
    }

    if (txType === 'transfer' && !toProfileId) {
      toast.warning('Selecciona a qué compañero le realizaste el abono');
      return;
    }

    setIsSubmittingTx(true);
    try {
      const res = await fetch(`${API_URL}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: groupId,
          profile_id: currentProfile?.id,
          amount: numericAmount,
          description: description.trim(),
          category,
          type: txType,
          to_profile_id: txType === 'transfer' ? toProfileId : null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error al registrar el movimiento');
      }

      const created = await res.json();
      toast.success(txType === 'expense' ? '¡Gasto grupal guardado!' : '¡Abono registrado con éxito!');
      if (onSuccess) onSuccess(created);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Error al procesar la solicitud');
    } finally {
      setIsSubmittingTx(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container animate-toast-in" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ fontSize: '1.35rem', fontWeight: '700' }}>Registrar Movimiento</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Segmented Switcher */}
        <div className="segmented-control" style={{ marginBottom: '1.5rem' }}>
          <button
            type="button"
            className={`segmented-btn ${txType === 'expense' ? 'active' : ''}`}
            onClick={() => setTxType('expense')}
          >
            <Receipt size={16} /> Gasto Grupal
          </button>
          <button
            type="button"
            className={`segmented-btn ${txType === 'transfer' ? 'active' : ''}`}
            onClick={() => setTxType('transfer')}
          >
            <Send size={16} /> Abono / Transferencia
          </button>
        </div>

        {/* OCR Scanner Zone */}
        <div
          className="upload-zone"
          onClick={() => fileInputRef.current?.click()}
          style={{ marginBottom: '1.5rem', cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
          }}
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileUpload}
            disabled={isProcessingOcr}
          />

          {isProcessingOcr ? (
            <div className="scanner-box">
              <div className="scanner-beam" />
              <div className="flex-center" style={{ gap: '0.6rem', color: 'var(--accent)', fontWeight: '600' }}>
                <Loader2 className="animate-spin" size={22} />
                <span>Analizando comprobante con OCR...</span>
              </div>
            </div>
          ) : (
            <div className="flex-center" style={{ flexDirection: 'column', gap: '0.4rem' }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'var(--primary-glow)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ImagePlus size={22} />
              </div>
              <span style={{ fontWeight: '600', fontSize: '0.92rem', color: 'var(--text-main)' }}>
                {ocrFileName ? `Comprobante: ${ocrFileName}` : 'Escanear comprobante de pago'}
              </span>
              <span className="text-subtle">Sube captura de Nequi/Bre-B para detectar el monto</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Amount */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              Monto en COP *
            </label>
            <input
              type="text"
              className="glass-input num-tabular"
              value={amount}
              onChange={handleAmountChange}
              placeholder="$ 0"
              style={{ fontSize: '1.3rem', fontWeight: '700' }}
              required
              autoFocus
            />
          </div>

          {/* Recipient if transfer */}
          {txType === 'transfer' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                ¿A quién le transferiste? *
              </label>
              <select
                className="glass-input"
                value={toProfileId}
                onChange={(e) => setToProfileId(e.target.value)}
                required
              >
                <option value="">Selecciona destinatario...</option>
                {profiles
                  .filter((p) => p.id !== currentProfile?.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (#{p.id.substring(0, 4).toUpperCase()})
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              Concepto o Descripción *
            </label>
            <input
              type="text"
              className="glass-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Cena del viernes, Pago arriendo, Uber..."
              maxLength={120}
              required
            />
          </div>

          {/* Quick categories */}
          {txType === 'expense' && (
            <div>
              <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                Categoría sugerida:
              </span>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {QUICK_CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => {
                      setCategory(cat.value);
                      if (!description) setDescription(cat.label.replace(/^[^\s]+\s/, ''));
                    }}
                    style={{
                      background: category === cat.value ? 'var(--primary-glow)' : 'var(--bg-input)',
                      border: `1px solid ${category === cat.value ? 'var(--primary)' : 'var(--border-subtle)'}`,
                      color: category === cat.value ? 'var(--primary)' : 'var(--text-secondary)',
                      fontSize: '0.78rem',
                      padding: '0.25rem 0.6rem',
                      borderRadius: 'var(--radius-full)',
                      cursor: 'pointer',
                    }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              style={{ flex: 1 }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ flex: 1 }}
              disabled={isSubmittingTx}
            >
              <Plus size={18} /> {isSubmittingTx ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
