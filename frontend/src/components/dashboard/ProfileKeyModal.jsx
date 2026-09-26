import { useState, useRef } from 'react';
import { X, UploadCloud, Trash2, CheckCircle2 } from 'lucide-react';
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
      >
        <div className="sheet-drag-handle" />

        {/* Modal Header */}
        <div className="modal-profile-header">
          <div>
            <h3 className="modal-profile-title">
              Mi Perfil y Llave Bre-B
            </h3>
            <p className="modal-profile-subtitle">
              Configura tu identificación y código QR para recibir pagos.
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn active:scale-[0.98]"
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Formulario envolvente con Body scrolleable y Footer fijo */}
        <form onSubmit={handleSubmit} className="modal-profile-form">
          {/* Modal Body */}
          <div className="modal-profile-body">
            {/* Grid 2 columnas: Tu Nombre y Llave Bre-B */}
            <div className="profile-key-grid">
              <div className="profile-key-field">
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

              <div className="profile-key-field">
                <label className="input-label" htmlFor="payment-key-input">
                  Llave Bre-B (Celular o Cédula)
                </label>
                <input
                  id="payment-key-input"
                  type="text"
                  className="glass-input num-tabular"
                  value={paymentKey}
                  onChange={(e) => setPaymentKey(e.target.value)}
                  placeholder="Ej. 3001234567"
                />
              </div>
            </div>

            {/* Sección Código QR Bre-B Oficial */}
            <div className="profile-qr-section">
              <div className="profile-qr-header">
                <label className="input-label" style={{ margin: 0 }}>
                  Código QR Bre-B Oficial
                </label>
                <p className="profile-qr-desc">
                  Sube la captura oficial de tu app bancaria para recibir transferencias sin errores.
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
                <div className="qr-preview-compact-card">
                  {/* Tarjeta blanca de contraste con miniatura */}
                  <div className="qr-thumbnail-box">
                    <img
                      src={uploadedPreview}
                      alt="Vista previa QR oficial"
                      className="qr-thumbnail-img"
                    />
                  </div>

                  {/* Estado y botones de acción en fila */}
                  <div className="qr-preview-info">
                    <div className="qr-badge-pill">
                      <CheckCircle2 size={13} />
                      <span>QR Oficial cargado</span>
                    </div>
                    <div className="qr-preview-actions">
                      <button
                        type="button"
                        className="btn-secondary qr-action-btn active:scale-[0.98]"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <UploadCloud size={14} />
                        <span>Cambiar imagen</span>
                      </button>
                      <button
                        type="button"
                        className="btn-danger qr-action-btn qr-remove-btn active:scale-[0.98]"
                        onClick={handleRemoveImage}
                        title="Quitar imagen"
                      >
                        <Trash2 size={14} />
                        <span>Quitar</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className={`qr-dropzone-compact ${isDragging ? 'dragging' : ''}`}
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
                >
                  <div className="qr-dropzone-icon">
                    <UploadCloud size={20} />
                  </div>
                  <div className="qr-dropzone-text">
                    <span className="qr-dropzone-title">
                      Selecciona o arrastra la imagen de tu QR
                    </span>
                    <span className="qr-dropzone-sub">
                      Capturas de Bancolombia, Nequi, Daviplata o Bre-B (hasta 5MB)
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer fijo al pie */}
          <div className="modal-profile-footer">
            <button
              type="button"
              className="btn-secondary active:scale-[0.98]"
              onClick={onClose}
              disabled={isUpdating}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary active:scale-[0.98]"
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
