import { useState, useRef } from 'react';

import {
  X,
  UploadCloud,
  CheckCircle2,
  ArrowRight,
  Loader2,
  Receipt,
  Trash2,
} from 'lucide-react';

import { useToast } from '../../context/ToastContext';
import { API_URL } from '../../config/api';
import { formatCOP } from '../../utils/formatters';

/**
 * PaymentVoucherModal
 * Responsive modal (Bottom sheet on mobile <= 640px, centered on desktop)
 * - Drag & drop voucher image (Nequi, Bancolombia, Bre-B, Daviplata)
 * - Automatic OCR pre-scanning for amount and reference
 * - Editable verification fields
 * - Real-time debt settlement via POST /api/expenses/voucher-settlement
 */
export default function PaymentVoucherModal({
  isOpen,
  onClose,
  groupId,
  currentProfile,
  targetCreditor,
  initialAmount = 0,
  onSuccess,
}) {
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [voucherFile, setVoucherFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [amount, setAmount] = useState(initialAmount > 0 ? String(initialAmount) : '');
  const [voucherRef, setVoucherRef] = useState('');
  const [description, setDescription] = useState('Pago de deuda liquidada');
  const [detectedBank, setDetectedBank] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  if (!isOpen) return null;


  const handleFileSelected = async (file) => {
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.warning('Formato no admitido. Usa capturas JPEG, PNG o WebP.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.warning('El archivo supera el límite de 10MB.');
      return;
    }

    setVoucherFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // Automatic OCR scanning
    setIsScanning(true);
    setDetectedBank(null);

    try {
      const formData = new FormData();
      formData.append('voucher', file);

      const res = await fetch(`${API_URL}/expenses/scan-voucher`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('No se pudo procesar el OCR');
      }

      const data = await res.json();
      if (data.success) {
        if (data.amount && data.amount > 0) {
          setAmount(String(data.amount));
        }
        if (data.reference) {
          setVoucherRef(data.reference);
        }
        if (data.bank && data.bank !== 'other') {
          setDetectedBank(data.bank);
        }
        toast.success('Comprobante analizado con éxito');
      }
    } catch (err) {
      console.warn('OCR scan fallback:', err);
      toast.info('No se detectaron datos automáticos. Puedes ingresarlos manualmente.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleRemoveFile = () => {
    setVoucherFile(null);
    setPreviewUrl(null);
    setDetectedBank(null);
    setVoucherRef('');
    setAmount(initialAmount > 0 ? String(initialAmount) : '');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!targetCreditor || !currentProfile) {
      toast.error('Datos de participantes incompletos');
      return;
    }

    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      toast.warning('Ingresa un monto válido mayor a 0');
      return;
    }

    if (!voucherFile) {
      toast.warning('Debes adjuntar la imagen del comprobante de pago');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('voucher', voucherFile);
      formData.append('group_id', groupId);
      formData.append('debtor_id', currentProfile.id);
      formData.append('creditor_id', targetCreditor.id);
      formData.append('amount', String(numericAmount));
      if (voucherRef.trim()) {
        formData.append('voucher_ref', voucherRef.trim());
      }
      formData.append('description', description.trim() || 'Pago de deuda liquidada');

      const res = await fetch(`${API_URL}/expenses/voucher-settlement`, {
        method: 'POST',
        body: formData,
      });

      const resData = await res.json();

      if (!res.ok) {
        throw new Error(resData.error || 'Error al registrar la liquidación');
      }

      toast.success('Deuda liquidada y comprobante guardado');
      if (onSuccess) onSuccess(resData);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'No se pudo registrar la liquidación');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop voucher-modal-backdrop" onClick={onClose}>
      <div
        className="modal-container voucher-modal-container animate-toast-in"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '540px' }}
      >
        <div className="sheet-drag-handle" />

        {/* Modal Header */}
        <div className="modal-header" style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--primary-glow)',
                color: 'var(--brand-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Receipt size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0 }}>
                Subir Comprobante de Pago
              </h3>
              <p className="text-subtle" style={{ margin: '0.15rem 0 0 0', fontSize: '0.82rem' }}>
                Liquidación automática e instantánea en el balance grupal.
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn active:scale-[0.98]" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Debt Flow Summary Card */}
        <div
          className="voucher-debt-flow-card"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '1rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>
                {currentProfile?.name} (Tú)
              </span>
              <ArrowRight size={14} color="var(--text-muted)" />
              <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--accent-mint)' }}>
                {targetCreditor?.name}
              </span>
            </div>

            {targetCreditor?.payment_key && (
              <span
                className="num-tabular"
                style={{
                  fontSize: '0.78rem',
                  background: 'var(--bg-input)',
                  padding: '0.2rem 0.55rem',
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                Llave: {targetCreditor.payment_key}
              </span>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              borderTop: '1px solid var(--border-subtle)',
              paddingTop: '0.65rem',
            }}
          >
            <span className="text-subtle" style={{ fontSize: '0.8rem' }}>
              Deuda pendiente sugerida:
            </span>
            <span
              className="num-tabular"
              style={{ fontWeight: '800', fontSize: '1.15rem', color: 'var(--text-main)' }}
            >
              {formatCOP(initialAmount)}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* File Picker / Dropzone */}
          <div>
            <label className="input-label" style={{ marginBottom: '0.45rem' }}>
              Captura del Comprobante Bancario
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => handleFileSelected(e.target.files?.[0])}
            />

            {previewUrl ? (
              <div
                className="voucher-preview-card"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                }}
              >
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      border: '1px solid var(--border-subtle)',
                      background: '#000000',
                      flexShrink: 0,
                      position: 'relative',
                    }}
                  >
                    <img
                      src={previewUrl}
                      alt="Comprobante"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontWeight: '600',
                          fontSize: '0.9rem',
                          color: 'var(--text-main)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '180px',
                        }}
                      >
                        {voucherFile?.name}
                      </span>
                      {detectedBank && (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            textTransform: 'uppercase',
                            background: 'var(--primary-glow)',
                            color: 'var(--brand-primary)',
                            padding: '0.15rem 0.5rem',
                            borderRadius: 'var(--radius-pill)',
                          }}
                        >
                          {detectedBank}
                        </span>
                      )}
                    </div>

                    <span className="text-subtle num-tabular" style={{ display: 'block', fontSize: '0.78rem', marginTop: '0.2rem' }}>
                      {(voucherFile?.size / 1024).toFixed(0)} KB
                    </span>

                    {isScanning && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          marginTop: '0.35rem',
                          color: 'var(--brand-primary)',
                          fontSize: '0.8rem',
                          fontWeight: '500',
                        }}
                      >
                        <Loader2 size={13} className="animate-spin" />
                        <span>Analizando datos por OCR...</span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn-secondary active:scale-[0.98]"
                      onClick={() => fileInputRef.current?.click()}
                      style={{ fontSize: '0.8rem', padding: '0.45rem 0.65rem' }}
                      disabled={isScanning || isSubmitting}
                    >
                      Cambiar
                    </button>
                    <button
                      type="button"
                      className="btn-danger active:scale-[0.98]"
                      onClick={handleRemoveFile}
                      style={{
                        padding: '0.45rem 0.65rem',
                        fontSize: '0.8rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--danger-glow)',
                        background: 'var(--danger-bg)',
                        color: 'var(--danger)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      disabled={isScanning || isSubmitting}
                      title="Quitar comprobante"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>

            ) : (
              <div
                className={`voucher-dropzone ${isDragging ? 'dragging' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files?.[0]) {
                    handleFileSelected(e.dataTransfer.files[0]);
                  }
                }}
                style={{
                  border: `2px dashed ${isDragging ? 'var(--brand-primary)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: '2rem 1.25rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: isDragging ? 'var(--accent-bg)' : 'var(--bg-surface)',
                  transition: 'all var(--transition-fast)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.65rem',
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: '50%',
                    background: 'var(--primary-glow)',
                    color: 'var(--brand-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <UploadCloud size={24} />
                </div>
                <div>
                  <span style={{ fontWeight: '600', fontSize: '0.92rem', color: 'var(--text-main)', display: 'block' }}>
                    Arrastra o selecciona el comprobante de pago
                  </span>
                  <span className="text-subtle" style={{ fontSize: '0.8rem', display: 'block', marginTop: '0.25rem' }}>
                    Capturas de Nequi, Bancolombia, Bre-B, Daviplata (JPEG, PNG o WebP)
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Editable Confirmation Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {/* Monto */}
            <div>
              <label className="input-label" htmlFor="voucher-amount-input">
                Monto a Saldar (COP)
              </label>
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: '1rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                    fontWeight: '700',
                  }}
                >
                  $
                </span>
                <input
                  id="voucher-amount-input"
                  type="number"
                  step="any"
                  className="glass-input num-tabular"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  style={{ paddingLeft: '2.2rem', fontWeight: '700', fontSize: '1.05rem' }}
                  required
                />
              </div>
            </div>

            {/* Referencia */}
            <div>
              <label className="input-label" htmlFor="voucher-ref-input">
                Número de Comprobante / Referencia
              </label>
              <input
                id="voucher-ref-input"
                type="text"
                className="glass-input num-tabular"
                value={voucherRef}
                onChange={(e) => setVoucherRef(e.target.value)}
                placeholder="Ej. M1234567 o 987654321"
              />
              <span className="text-subtle" style={{ display: 'block', marginTop: '0.3rem', fontSize: '0.78rem' }}>
                Número único provisto por tu banco para validar la transacción.
              </span>
            </div>

            {/* Descripción */}
            <div>
              <label className="input-label" htmlFor="voucher-desc-input">
                Descripción / Nota
              </label>
              <input
                id="voucher-desc-input"
                type="text"
                className="glass-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Nota informativa de la liquidación"
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn-secondary active:scale-[0.98]"
              onClick={onClose}
              style={{ flex: 1 }}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary active:scale-[0.98]"
              style={{ flex: 1.4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              disabled={isSubmitting || isScanning}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Procesando comprobante...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>Confirmar y Liquidar Deuda</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
