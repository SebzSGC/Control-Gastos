import { useState, useRef } from 'react';
import { X, UploadCloud, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useToast } from '../../context/ToastContext';
import { API_URL, getUploadUrl } from '../../config/api';
import { decodeQrFromImage, extractKeyFromPayload, isVectorQrPayload } from '../../utils/qrDecoder';

/**
 * ProfileKeyDialog
 * Direct, single-view modal to configure user profile name, Bre-B payment key,
 * and official bank QR code image with automatic SVG vectorization.
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

  const initialIsVector = isVectorQrPayload(currentProfile?.payment_qr);
  const [vectorQrPayload, setVectorQrPayload] = useState(
    initialIsVector ? currentProfile.payment_qr : null
  );
  const [uploadedPreview, setUploadedPreview] = useState(
    currentProfile?.payment_qr && !initialIsVector
      ? getUploadUrl(currentProfile.payment_qr)
      : null
  );
  const [isDecoding, setIsDecoding] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = async (file) => {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.warning('Formato no compatible. Sube una foto en formato JPG o PNG.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.warning('La foto supera el límite de 5MB.');
      return;
    }
    setQrFile(file);

    // Instant Base64 preview without broken image or network delay
    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadedPreview(e.target.result);
    };
    reader.readAsDataURL(file);

    // Automatic QR decoding and vectorization
    setIsDecoding(true);
    try {
      const res = await decodeQrFromImage(file);
      if (res.success && res.payload) {
        setVectorQrPayload(res.payload);
        toast.success('Código QR detectado correctamente');

        // If payment key is empty, attempt to extract and auto-fill
        if (!paymentKey.trim()) {
          const extractedKey = extractKeyFromPayload(res.payload);
          if (extractedKey) {
            setPaymentKey(extractedKey);
            toast.info(`Número detectado: ${extractedKey}`);
          }
        }
      } else {
        setVectorQrPayload(null);
        toast.info('Foto cargada correctamente');
      }
    } catch (err) {
      console.error('Error al decodificar QR:', err);
      setVectorQrPayload(null);
    } finally {
      setIsDecoding(false);
    }
  };

  const handleRemoveImage = () => {
    setQrFile(null);
    setUploadedPreview(null);
    setVectorQrPayload(null);
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
      let finalQr = vectorQrPayload || currentProfile?.payment_qr || null;

      // 1. If a new file was chosen, upload it to the server as physical backup
      if (qrFile) {
        try {
          const formData = new FormData();
          formData.append('qr', qrFile);

          const uploadRes = await fetch(`${API_URL}/profiles/${currentProfile.id}/upload-qr`, {
            method: 'POST',
            body: formData,
          });

          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            // If vectorization wasn't possible, use physical server path
            if (!vectorQrPayload) {
              finalQr = uploadData.payment_qr;
            }
          }
        } catch (uploadErr) {
          console.warn('Error al respaldar imagen en disco:', uploadErr);
          if (!vectorQrPayload) {
            throw new Error('Error al subir la imagen del QR', { cause: uploadErr });
          }
        }
      } else if (!uploadedPreview && !vectorQrPayload) {
        // Image was removed by user
        finalQr = null;
      }

      // 2. Persist profile info via PUT (stores vector payload for pure SVG rendering)
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
              Mi Llave de Pago
            </h3>
            <p className="modal-profile-subtitle">
              Tu nombre y forma de pago para que te transfieran fácilmente.
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
            {/* Grid 2 columnas: Tu Nombre y Celular o Cédula */}
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
                  Número de Celular o Cédula
                </label>
                <input
                  id="payment-key-input"
                  type="text"
                  className="glass-input num-tabular"
                  value={paymentKey}
                  onChange={(e) => setPaymentKey(e.target.value)}
                  placeholder="Ej. 3001234567"
                />
                <span className="text-subtle" style={{ fontSize: '0.78rem', marginTop: '0.3rem', display: 'block' }}>
                  Opcional. Quien te vaya a pagar podrá copiar este número.
                </span>
              </div>
            </div>

            {/* Sección Foto de tu Código QR */}
            <div className="profile-qr-section">
              <div className="profile-qr-header">
                <label className="input-label" style={{ margin: 0 }}>
                  Foto de tu Código QR
                </label>
                <p className="profile-qr-desc">
                  Sube una captura de tu código QR de Bancolombia, Nequi o Daviplata.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => handleFileChange(e.target.files?.[0])}
              />

              {uploadedPreview || vectorQrPayload ? (
                <div className="qr-preview-compact-card">
                  {/* Tarjeta blanca de contraste con miniatura */}
                  <div className="qr-thumbnail-box">
                    {isDecoding ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem', color: 'var(--brand-primary)' }}>
                        <Loader2 size={24} className="animate-spin" />
                        <span style={{ fontSize: '0.68rem', fontWeight: '600' }}>Leyendo código...</span>
                      </div>
                    ) : vectorQrPayload ? (
                      <QRCodeSVG
                        value={vectorQrPayload}
                        size={100}
                        level="M"
                        style={{ display: 'block', maxWidth: '100%', maxHeight: '100%' }}
                      />
                    ) : (
                      <img
                        src={uploadedPreview}
                        alt="Foto del código QR"
                        className="qr-thumbnail-img"
                      />
                    )}
                  </div>

                  {/* Estado y botones de acción en fila */}
                  <div className="qr-preview-info">
                    <div
                      className="qr-badge-pill"
                      style={{
                        background: 'rgba(16, 185, 129, 0.14)',
                        color: 'var(--accent-mint, #10b981)',
                        borderColor: 'rgba(16, 185, 129, 0.3)',
                      }}
                    >
                      <CheckCircle2 size={13} />
                      <span>Código QR listo</span>
                    </div>
                    <div className="qr-preview-actions">
                      <button
                        type="button"
                        className="btn-secondary qr-action-btn active:scale-[0.98]"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <UploadCloud size={14} />
                        <span>Cambiar foto</span>
                      </button>
                      <button
                        type="button"
                        className="btn-danger qr-action-btn qr-remove-btn active:scale-[0.98]"
                        onClick={handleRemoveImage}
                        title="Quitar foto"
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
                      Toca o arrastra la foto de tu código QR
                    </span>
                    <span className="qr-dropzone-sub">
                      Bancolombia, Nequi, Daviplata o cualquier banco
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
