import { useState, useRef } from 'react';
import { X, UploadCloud, Trash2, Info, CheckCircle2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { API_URL, getUploadUrl } from '../../config/api';

/**
 * ProfileKeyDialog
 * Direct, single-view modal to configure user profile name, Bre-B payment key,
 * and official bank QR code image.
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
  const [qrFile, setQrFile] = useState(null);
  const [uploadedPreview, setUploadedPreview] = useState(
    currentProfile?.payment_qr ? getUploadUrl(currentProfile.payment_qr) : null
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

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

    // Instant Base64 preview without broken image or network delay
    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadedPreview(e.target.result);
    };
    reader.readAsDataURL(file);
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
    const trimmedName = profileName.trim();
    if (!trimmedName) {
      toast.warning('El nombre del participante es obligatorio');
      return;
    }

    setIsUpdating(true);
    try {
      let finalQr = currentProfile?.payment_qr || null;

      // 1. If a new file was chosen, upload it to the server
      if (qrFile) {
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
        // Image was removed by user
        finalQr = null;
      }

      // 2. Persist profile info via PUT
      const res = await fetch(`${API_URL}/profiles/${currentProfile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          payment_key: paymentKey.trim() || null,
          payment_qr: finalQr,
          group_id: groupId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al actualizar el perfil');
      }

      const resData = await res.json();
      const updatedProfile = resData?.profile || {
        ...currentProfile,
        name: trimmedName,
        payment_key: paymentKey.trim() || null,
        payment_qr: finalQr,
      };

      toast.success('Perfil y datos de pago actualizados');
      if (onProfileUpdated) onProfileUpdated(updatedProfile);
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
              Configura tu nombre, llave de pago y código QR oficial para recibir transferencias.
            </p>
          </div>
          <button type="button" className="modal-close-btn active:scale-[0.98]" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Input: Tu Nombre */}
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

          {/* Input: Llave Bre-B (Celular o Cédula) */}
          <div>
            <label className="input-label" htmlFor="payment-key-input">
              Llave Bre-B (Celular o Cédula)
            </label>
            <input
              id="payment-key-input"
              type="text"
              className="glass-input num-tabular"
              value={paymentKey}
              onChange={(e) => setPaymentKey(e.target.value)}
              placeholder="Ej. Celular 3001234567 o Cédula"
            />
            <span className="text-subtle" style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.78rem' }}>
              Opcional si subes QR, para quienes prefieran transferir por número.
            </span>
          </div>

          {/* Sección: Código QR Bre-B Oficial */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label className="input-label" style={{ margin: 0 }}>
              Código QR Bre-B Oficial
            </label>

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
                Descarga la imagen oficial de tu código QR desde tu app bancaria (Bancolombia, Nequi, Daviplata o Bre-B) y súbela aquí para que la lean al instante sin errores.
              </p>
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
                    padding: '10px',
                    borderRadius: '16px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
                    maxHeight: '260px',
                    maxWidth: '100%',
                    width: 'fit-content',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <img
                    src={uploadedPreview}
                    alt="Vista previa QR oficial"
                    style={{
                      maxHeight: '240px',
                      maxWidth: '100%',
                      width: 'auto',
                      height: 'auto',
                      objectFit: 'contain',
                      borderRadius: '8px',
                      display: 'block',
                    }}
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

          {/* Botones de acción */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
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
