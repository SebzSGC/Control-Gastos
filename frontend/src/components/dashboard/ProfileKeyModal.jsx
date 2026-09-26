import { useState, useRef, useMemo } from 'react';
import { X, QrCode, UploadCloud, Building2, Trash2, Info, CheckCircle2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useToast } from '../../context/ToastContext';
import { API_URL, getUploadUrl } from '../../config/api';
import { buildEmvCoPayload, validateEmvCoPayload } from '../../utils/emvcoQr';

const KEY_TYPES = [
  { id: 'celular', label: 'Celular (10 dígitos)', placeholder: 'Ej. 3001234567' },
  { id: 'cedula', label: 'Cédula / Documento', placeholder: 'Ej. 1020304050' },
  { id: 'correo', label: 'Correo Electrónico', placeholder: 'Ej. usuario@correo.com' },
  { id: 'alfanumerica', label: 'Llave Alfanumérica', placeholder: 'Ej. LLAVEBREB123' },
];

const BANK_ENTITIES = [
  { id: 'bre-b', name: 'Bre-B Interoperable' },
  { id: 'bancolombia', name: 'Bancolombia' },
  { id: 'nequi', name: 'Nequi' },
  { id: 'daviplata', name: 'Daviplata' },
  { id: 'dale', name: 'Dale' },
  { id: 'nu', name: 'Nu Colombia' },
];

/**
 * ProfileKeyDialog
 * Inner dialog rendered only when modal is open.
 */
function ProfileKeyDialog({
  onClose,
  groupId,
  currentProfile,
  onProfileUpdated,
}) {
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [profileName, setProfileName] = useState(currentProfile?.name || '');
  const [paymentKey, setPaymentKey] = useState(currentProfile?.payment_key || '');
  const [keyType, setKeyType] = useState('celular');
  const [bankEntity, setBankEntity] = useState('bre-b');

  // Detect whether current profile already has an uploaded image QR
  const isImageQr = useMemo(() => {
    const qr = currentProfile?.payment_qr || '';
    return qr.startsWith('/uploads/') || qr.startsWith('data:image/') || qr.startsWith('http');
  }, [currentProfile?.payment_qr]);

  // Check if existing QR is a valid EMVCo payload
  const hasValidGeneratedQr = useMemo(() => {
    const qr = currentProfile?.payment_qr || '';
    return !isImageQr && validateEmvCoPayload(qr);
  }, [currentProfile?.payment_qr, isImageQr]);

  // Default to 'upload' as the primary recommended tab
  const [activeTab, setActiveTab] = useState(hasValidGeneratedQr ? 'generate' : 'upload');
  const [qrFile, setQrFile] = useState(null);
  const [uploadedPreview, setUploadedPreview] = useState(
    isImageQr ? getUploadUrl(currentProfile?.payment_qr) : null
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Live standard EMVCo payload
  const currentKeyTypeObj = KEY_TYPES.find((t) => t.id === keyType) || KEY_TYPES[0];
  const generatedQrPayload = useMemo(() => {
    if (!paymentKey.trim()) return '';
    return buildEmvCoPayload({
      name: profileName || currentProfile?.name || 'USUARIO',
      key: paymentKey.trim(),
      keyType,
      bank: bankEntity,
    });
  }, [profileName, currentProfile?.name, paymentKey, keyType, bankEntity]);

  const handleFileChange = (file) => {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.warning('Formato no compatible. Usa JPEG, PNG o WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.warning('La imagen supera el límite máximo de 5MB.');
      return;
    }
    setQrFile(file);
    setUploadedPreview(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    setQrFile(null);
    setUploadedPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!profileName.trim()) {
      toast.warning('El nombre del participante es obligatorio');
      return;
    }

    setIsUpdating(true);
    try {
      let finalQr = currentProfile?.payment_qr || null;

      if (activeTab === 'upload') {
        if (qrFile) {
          // Upload new image file
          const formData = new FormData();
          formData.append('qr', qrFile);

          const uploadRes = await fetch(`${API_URL}/profiles/${currentProfile.id}/upload-qr`, {
            method: 'POST',
            body: formData,
          });

          if (!uploadRes.ok) {
            const errData = await uploadRes.json().catch(() => ({}));
            throw new Error(errData.error || 'Error al subir la imagen del QR');
          }

          const uploadData = await uploadRes.json();
          finalQr = uploadData.payment_qr;
        } else if (!uploadedPreview) {
          // Removed QR
          finalQr = null;
        }
      } else {
        // Tab Generate: store standard EMVCo payload
        finalQr = paymentKey.trim()
          ? buildEmvCoPayload({
              name: profileName.trim(),
              key: paymentKey.trim(),
              keyType,
              bank: bankEntity,
            })
          : null;
      }

      // Persist profile data via PUT
      const res = await fetch(`${API_URL}/profiles/${currentProfile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileName.trim(),
          payment_key: paymentKey.trim() || null,
          payment_qr: finalQr,
          group_id: groupId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al actualizar el perfil');
      }

      const updated = {
        ...currentProfile,
        name: profileName.trim(),
        payment_key: paymentKey.trim() || null,
        payment_qr: finalQr,
      };

      toast.success('Perfil y datos de pago actualizados');
      if (onProfileUpdated) onProfileUpdated(updated);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'No se pudo guardar la información');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container animate-toast-in modal-profile-key"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '520px' }}
      >
        <div className="sheet-drag-handle" />
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0 }}>
              Mi Perfil y Llave Bre-B
            </h3>
            <p className="text-subtle" style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem' }}>
              Configura tu identificación y código QR interoperable para recibir pagos.
            </p>
          </div>
          <button type="button" className="modal-close-btn active:scale-[0.98]" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Nombre */}
          <div>
            <label className="input-label" htmlFor="profile-name-input">
              Tu Nombre
            </label>
            <input
              id="profile-name-input"
              type="text"
              className="glass-input"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Nombre visible en el grupo"
              required
            />
          </div>

          {/* Selector de modo QR */}
          <div>
            <label className="input-label" style={{ marginBottom: '0.5rem' }}>
              Modalidad de Código QR
            </label>
            <div
              className="tab-pill-container"
              style={{
                display: 'flex',
                gap: '0.4rem',
                padding: '0.25rem',
                background: 'var(--bg-input)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <button
                type="button"
                className={`tab-pill-btn ${activeTab === 'upload' ? 'active' : ''}`}
                onClick={() => setActiveTab('upload')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.45rem',
                  padding: '0.55rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  border: 'none',
                  cursor: 'pointer',
                  background: activeTab === 'upload' ? 'var(--brand-primary)' : 'transparent',
                  color: activeTab === 'upload' ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'background var(--transition-fast), color var(--transition-fast)',
                }}
              >
                <UploadCloud size={15} /> Subir QR Oficial (Recomendado)
              </button>
              <button
                type="button"
                className={`tab-pill-btn ${activeTab === 'generate' ? 'active' : ''}`}
                onClick={() => setActiveTab('generate')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.45rem',
                  padding: '0.55rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  border: 'none',
                  cursor: 'pointer',
                  background: activeTab === 'generate' ? 'var(--brand-primary)' : 'transparent',
                  color: activeTab === 'generate' ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'background var(--transition-fast), color var(--transition-fast)',
                }}
              >
                <QrCode size={15} /> Generar QR EMVCo
              </button>
            </div>
          </div>

          {/* PESTAÑA 1: SUBIR QR OFICIAL DE TU BANCO */}
          {activeTab === 'upload' && (
            <div className="qr-uploader-panel animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem 1rem',
                  alignItems: 'flex-start',
                }}
              >
                <Info size={18} style={{ color: 'var(--brand-primary)', flexShrink: 0, marginTop: '2px' }} />
                <p style={{ margin: 0, fontSize: '0.8rem', lineHeight: '1.45', color: 'var(--text-secondary)' }}>
                  Para que Bancolombia, Nequi o cualquier banco lean tu QR al instante sin errores de compatibilidad, descarga la imagen de tu código QR desde tu app bancaria (&apos;Mi código QR&apos;) y súbela aquí.
                </p>
              </div>

              <div>
                <label className="input-label" htmlFor="upload-key-input">
                  Llave de Pago de Respaldo (Opcional)
                </label>
                <input
                  id="upload-key-input"
                  type="text"
                  className="glass-input num-tabular"
                  value={paymentKey}
                  onChange={(e) => setPaymentKey(e.target.value)}
                  placeholder="Ej. Celular 3001234567 o Cédula"
                />
                <span className="text-subtle" style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.78rem' }}>
                  Permite que tus compañeros copien el dato en texto si prefieren digitarlo.
                </span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => handleFileChange(e.target.files?.[0])}
              />

              {uploadedPreview ? (
                <div
                  className="uploaded-qr-preview-box"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '1rem',
                  }}
                >
                  <div
                    style={{
                      background: '#ffffff',
                      padding: '12px',
                      borderRadius: '16px',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
                      maxHeight: '190px',
                      maxWidth: '190px',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <img
                      src={uploadedPreview}
                      alt="Vista previa QR oficial"
                      style={{ maxHeight: '166px', maxWidth: '166px', objectFit: 'contain', borderRadius: '8px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--accent-mint)' }}>
                    <CheckCircle2 size={15} />
                    <span style={{ fontWeight: '600' }}>Imagen de QR lista para guardar</span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.6rem', width: '100%' }}>
                    <button
                      type="button"
                      className="btn-secondary active:scale-[0.98]"
                      onClick={() => fileInputRef.current?.click()}
                      style={{ flex: 1, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                    >
                      <UploadCloud size={15} /> Cambiar Imagen
                    </button>
                    <button
                      type="button"
                      className="btn-danger active:scale-[0.98]"
                      onClick={handleRemoveImage}
                      style={{
                        padding: '0.6rem 0.85rem',
                        fontSize: '0.85rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--danger-glow)',
                        background: 'var(--danger-bg)',
                        color: 'var(--danger)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Eliminar QR"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`qr-dropzone ${isDragging ? 'dragging' : ''}`}
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
                      handleFileChange(e.dataTransfer.files[0]);
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
                    gap: '0.6rem',
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: 'var(--primary-glow)',
                      color: 'var(--brand-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <UploadCloud size={22} />
                  </div>
                  <div>
                    <span style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-main)', display: 'block' }}>
                      Selecciona o arrastra la imagen de tu QR
                    </span>
                    <span className="text-subtle" style={{ fontSize: '0.78rem', display: 'block', marginTop: '0.2rem' }}>
                      Capturas oficiales de Bancolombia, Nequi, Daviplata o Bre-B (JPEG, PNG, WebP hasta 5MB)
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PESTAÑA 2: GENERAR QR EMVCO */}
          {activeTab === 'generate' && (
            <div className="qr-generator-panel animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem 1rem',
                  alignItems: 'flex-start',
                }}
              >
                <Info size={18} style={{ color: 'var(--brand-primary)', flexShrink: 0, marginTop: '2px' }} />
                <p style={{ margin: 0, fontSize: '0.8rem', lineHeight: '1.45', color: 'var(--text-secondary)' }}>
                  Genera un payload bajo el estándar EMVCo de Bre-B. Si tu banco requiere su código firmado de red, te recomendamos usar la pestaña de subir QR oficial.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className="input-label" htmlFor="key-type-select">
                    Tipo de Llave
                  </label>
                  <div className="input-with-icon-wrapper" style={{ position: 'relative' }}>
                    <select
                      id="key-type-select"
                      className="glass-input"
                      value={keyType}
                      onChange={(e) => setKeyType(e.target.value)}
                      style={{ width: '100%', cursor: 'pointer' }}
                    >
                      {KEY_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="input-label" htmlFor="bank-entity-select">
                    Entidad Bancaria
                  </label>
                  <div className="input-with-icon-wrapper" style={{ position: 'relative' }}>
                    <select
                      id="bank-entity-select"
                      className="glass-input"
                      value={bankEntity}
                      onChange={(e) => setBankEntity(e.target.value)}
                      style={{ width: '100%', cursor: 'pointer' }}
                    >
                      {BANK_ENTITIES.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="input-label" htmlFor="payment-key-input">
                  Valor de la Llave
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="payment-key-input"
                    type="text"
                    className="glass-input num-tabular"
                    value={paymentKey}
                    onChange={(e) => setPaymentKey(e.target.value)}
                    placeholder={currentKeyTypeObj.placeholder}
                  />
                </div>
                <span className="text-subtle" style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.78rem' }}>
                  Número de cuenta, teléfono o identificador interoperable registrado.
                </span>
              </div>

              {/* Vista previa en vivo del QR EMVCo */}
              <div
                className="qr-live-preview-box"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.85rem',
                }}
              >
                <div className="qr-preview-tag" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  <Building2 size={14} color="var(--brand-primary)" />
                  <span>{BANK_ENTITIES.find((b) => b.id === bankEntity)?.name}</span>
                  <span>•</span>
                  <span>{currentKeyTypeObj.label}</span>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    padding: '14px',
                    borderRadius: '16px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {generatedQrPayload ? (
                    <QRCodeSVG
                      value={generatedQrPayload}
                      size={150}
                      level="M"
                      fgColor="#0f172a"
                      bgColor="#ffffff"
                    />
                  ) : (
                    <div
                      style={{
                        width: 150,
                        height: 150,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-muted)',
                        fontSize: '0.8rem',
                        textAlign: 'center',
                        padding: '1rem',
                      }}
                    >
                      Ingresa tu llave para generar el QR
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'center' }}>
                  <span className="num-tabular" style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-main)', letterSpacing: '0.04em' }}>
                    {paymentKey.trim() || 'Ingresa tu llave arriba'}
                  </span>
                  <p className="text-subtle" style={{ margin: '0.15rem 0 0 0', fontSize: '0.75rem' }}>
                    Vista previa vectorial estándar EMVCo compatible con lectores Bre-B y aplicaciones bancarias.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Botones de acción */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
            <button
              type="button"
              className="btn-secondary active:scale-[0.98]"
              onClick={onClose}
              style={{ flex: 1 }}
              disabled={isUpdating}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary active:scale-[0.98]"
              style={{ flex: 1 }}
              disabled={isUpdating}
            >
              {isUpdating ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * ProfileKeyModal
 * Wrapper that renders dialog only when opened, ensuring fresh state without useEffect synchronization.
 */
export default function ProfileKeyModal({ isOpen, ...props }) {
  if (!isOpen) return null;
  return (
    <ProfileKeyDialog
      key={props.currentProfile?.id || 'profile-key-modal'}
      {...props}
    />
  );
}
