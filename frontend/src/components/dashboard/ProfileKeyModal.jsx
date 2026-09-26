import { useState } from 'react';
import { X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { API_URL } from '../../config/api';

/**
 * ProfileKeyModal
 * Modal to update participant's display name and Bre-B / Nequi payment key.
 */
export default function ProfileKeyModal({
  isOpen,
  onClose,
  groupId,
  currentProfile,
  onProfileUpdated,
}) {
  const toast = useToast();
  const [profileName, setProfileName] = useState(currentProfile?.name || '');
  const [paymentKey, setPaymentKey] = useState(currentProfile?.payment_key || '');
  const [isUpdating, setIsUpdating] = useState(false);

  if (!isOpen) return null;

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!profileName.trim()) {
      toast.warning('El nombre es obligatorio');
      return;
    }

    setIsUpdating(true);
    try {
      const res = await fetch(`${API_URL}/profiles/${currentProfile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileName.trim(),
          payment_key: paymentKey.trim() || null,
          group_id: groupId,
        }),
      });

      if (!res.ok) throw new Error('Error al actualizar perfil');

      const updated = {
        ...currentProfile,
        name: profileName.trim(),
        payment_key: paymentKey.trim() || null,
      };

      toast.success('¡Tus datos de pago fueron actualizados!');
      if (onProfileUpdated) onProfileUpdated(updated);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo actualizar el perfil');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container animate-toast-in" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ fontSize: '1.35rem', fontWeight: '700' }}>Mi Perfil & Llave de Pago</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              Tu Nombre
            </label>
            <input
              type="text"
              className="glass-input"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              Llave Bre-B o Nequi (Celular / Documento)
            </label>
            <input
              type="text"
              className="glass-input"
              value={paymentKey}
              onChange={(e) => setPaymentKey(e.target.value)}
              placeholder="Ej. 3001234567"
            />
            <span className="text-subtle" style={{ display: 'block', marginTop: '0.4rem' }}>
              Esta llave se mostrará en una tarjeta digital para que tus compañeros te transfieran con 1 clic.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              style={{ flex: 1 }}
            >
              Cerrar
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ flex: 1 }}
              disabled={isUpdating}
            >
              {isUpdating ? 'Actualizando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
