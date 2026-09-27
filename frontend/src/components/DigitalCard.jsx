import { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Smartphone,
  ShieldCheck,
  CreditCard,
  QrCode,
  Download,
  Maximize2,
  X,
  Receipt,
  AlertCircle,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useToast } from '../context/ToastContext';
import { getUploadUrl } from '../config/api';
import { decodeQrFromImage, isVectorQrPayload } from '../utils/qrDecoder';

/**
 * DigitalCard
 * Interactive payment display component:
 * 1. Virtual Card Mode: Contactless card aesthetic with chip and copyable key.
 * 2. Bre-B QR Code Mode: High-definition vector QR (SVG) with live auto-vectorization,
 *    or compact raster fallback image (max 180px) with download and zoom utilities.
 * 3. Modal 3-Layer Structure: Internal scrollable body and fixed footer with primary actions.
 */
export default function DigitalCard({ profile, onClose, onOpenVoucherModal }) {
  const toast = useToast();

  const hasQr = Boolean(profile?.payment_qr);
  const initialIsVector = hasQr && isVectorQrPayload(profile.payment_qr);
  const hasKey = Boolean(profile?.payment_key);

  const [activeTab, setActiveTab] = useState(hasQr || !hasKey ? 'qr' : 'card');
  const [copied, setCopied] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [focusQr, setFocusQr] = useState(false);
  const [liveVectorPayload, setLiveVectorPayload] = useState(null);

  // Live decoding: if profile.payment_qr is a raster image, decode on the fly to render crisp SVG
  useEffect(() => {
    if (!profile?.payment_qr || isVectorQrPayload(profile.payment_qr)) {
      return;
    }

    let isMounted = true;
    const qrUrl = getUploadUrl(profile.payment_qr);
    decodeQrFromImage(qrUrl)
      .then((res) => {
        if (isMounted && res.success && res.payload) {
          setLiveVectorPayload(res.payload);
        }
      })
      .catch((err) => {
        console.warn('Error al decodificar QR en vivo:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [profile?.payment_qr]);

  if (!profile) return null;

  const effectiveVectorPayload = initialIsVector ? profile.payment_qr : liveVectorPayload;
  const isVector = Boolean(effectiveVectorPayload);

  const handleCopyKey = () => {
    if (!profile.payment_key) {
      toast.info('Este participante aún no ha configurado su llave');
      return;
    }
    navigator.clipboard.writeText(profile.payment_key);
    setCopied(true);
    toast.success(`Llave copiada: ${profile.payment_key}`);
    setTimeout(() => setCopied(false), 2000);
  };

  const isNequi =
    profile.payment_key &&
    profile.payment_key.startsWith('3') &&
    profile.payment_key.length === 10;

  const handleDownloadQr = () => {
    if (!hasQr) {
      toast.warning('No hay código QR disponible para descargar');
      return;
    }

    if (isVector) {
      try {
        const svgElement =
          document.querySelector('.qr-code-plate svg') ||
          document.querySelector('.qr-vector-box svg');
        if (svgElement) {
          const svgData = new XMLSerializer().serializeToString(svgElement);
          const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(svgBlob);
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 600;
            canvas.height = 600;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 600, 600);
            ctx.drawImage(img, 30, 30, 540, 540);
            URL.revokeObjectURL(url);

            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = `QR_Oficial_${profile.name.replace(/\s+/g, '_')}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success('Descargando código QR en alta definición');
          };
          img.src = url;
          return;
        }
      } catch (e) {
        console.error('Error al generar PNG desde SVG:', e);
      }
    }

    const link = document.createElement('a');
    link.href = getUploadUrl(profile.payment_qr);
    link.target = '_blank';
    link.download = `QR_Oficial_${profile.name.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Descargando imagen de QR');
  };

  const handleGoToVoucher = () => {
    if (onOpenVoucherModal) {
      onOpenVoucherModal(profile);
      if (onClose) onClose();
    } else if (onClose) {
      onClose();
    }
  };

  return (
    <>
      {/* Modal Body con Scroll Interno */}
      <div className="modal-payment-body">
        {/* Selector de Pestañas (Tarjeta / QR) */}
        <div
          className="digital-card-tabs"
          style={{
            display: 'flex',
            gap: '0.4rem',
            padding: '0.25rem',
            background: 'var(--bg-input)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            className={`tab-pill-btn ${activeTab === 'card' ? 'active' : ''}`}
            onClick={() => setActiveTab('card')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.65rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.82rem',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'card' ? 'var(--brand-primary)' : 'transparent',
              color: activeTab === 'card' ? '#ffffff' : 'var(--text-secondary)',
              transition: 'all var(--transition-fast)',
            }}
          >
            <CreditCard size={15} /> Tarjeta Digital
          </button>
          <button
            type="button"
            className={`tab-pill-btn ${activeTab === 'qr' ? 'active' : ''}`}
            onClick={() => setActiveTab('qr')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.65rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.82rem',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'qr' ? 'var(--brand-primary)' : 'transparent',
              color: activeTab === 'qr' ? '#ffffff' : 'var(--text-secondary)',
              transition: 'all var(--transition-fast)',
            }}
          >
            <QrCode size={15} /> Código QR Bre-B
          </button>
        </div>

        {/* MODO 1: TARJETA VIRTUAL */}
        {activeTab === 'card' && (
          <div className="digital-card-surface animate-fade-in">
            <div className="digital-card-pattern" />

            {/* Header de la Tarjeta */}
            <div className="digital-card-header">
              <div className="card-brand-badge">
                <span className="card-brand-dot" />
                <span>{isNequi ? 'Nequi / Bre-B' : 'Llave Bre-B'}</span>
              </div>
              <div className="card-contactless-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8.5 16.5a5 5 0 0 1 0-9" />
                  <path d="M12 19a8.5 8.5 0 0 0 0-14" />
                  <path d="M15.5 21.5a12 12 0 0 0 0-19" />
                </svg>
              </div>
            </div>

            {/* Chip */}
            <div className="digital-card-chip">
              <div className="chip-line" />
              <div className="chip-line" />
            </div>

            {/* Llave / Número */}
            <div className="digital-card-body">
              <span className="card-label">NÚMERO / LLAVE DE PAGO</span>
              <div className="card-number-wrapper" onClick={handleCopyKey} role="button" tabIndex={0}>
                <span className="card-number num-tabular">
                  {profile.payment_key || (hasQr ? 'Pago por Código QR Bre-B' : 'No configurada')}
                </span>
                {profile.payment_key && (
                  <button
                    type="button"
                    className="card-quick-copy-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyKey();
                    }}
                    title="Copiar llave"
                  >
                    {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
                  </button>
                )}
              </div>
            </div>

            {/* Footer de la Tarjeta */}
            <div className="digital-card-footer">
              <div>
                <span className="card-label">TITULAR</span>
                <p className="card-holder-name">{profile.name}</p>
              </div>
              <div className="card-tag">
                <ShieldCheck size={14} />
                <span>Verificado</span>
              </div>
            </div>
          </div>
        )}

        {/* MODO 2: CÓDIGO QR BRE-B */}
        {activeTab === 'qr' && (
          <div className="qr-card-surface animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {hasQr ? (
              <div
                className="qr-display-container"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '1rem 0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.65rem',
                }}
              >
                {/* Badge de tipo de QR */}
                <div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: 'rgba(16, 185, 129, 0.12)',
                      color: 'var(--accent-mint, #10b981)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      borderRadius: 'var(--radius-full)',
                      padding: '0.2rem 0.65rem',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                    }}
                  >
                    <ShieldCheck size={13} />
                    <span>
                      {isVector
                        ? 'Código QR Bre-B Oficial (Vectorial)'
                        : 'Código QR Bre-B Oficial'}
                    </span>
                  </div>
                </div>

                {/* Placa de contraste blanco para lectura óptica instantánea */}
                <div
                  className="qr-code-plate"
                  style={{
                    background: '#ffffff',
                    padding: isVector ? '14px' : '10px',
                    borderRadius: '16px',
                    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    maxWidth: '100%',
                    width: 'fit-content',
                  }}
                >
                  {isVector ? (
                    <QRCodeSVG
                      value={effectiveVectorPayload}
                      size={160}
                      level="M"
                      style={{ display: 'block', maxWidth: '100%' }}
                    />
                  ) : (
                    <img
                      src={getUploadUrl(profile.payment_qr)}
                      alt={`Código QR Oficial de ${profile.name}`}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '180px',
                        width: 'auto',
                        height: 'auto',
                        objectFit: 'contain',
                        borderRadius: '8px',
                        display: 'block',
                      }}
                    />
                  )}
                </div>

                {/* Detalles del Titular y Llave */}
                <div style={{ textAlign: 'center', width: '100%' }}>
                  <span className="card-label" style={{ marginBottom: '0.1rem' }}>
                    TITULAR DE LA CUENTA
                  </span>
                  <p style={{ fontWeight: '700', fontSize: '0.94rem', color: 'var(--text-main)', margin: '0 0 0.3rem 0' }}>
                    {profile.name}
                  </p>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      background: 'var(--bg-input)',
                      padding: '0.25rem 0.7rem',
                      borderRadius: 'var(--radius-full)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <span className="num-tabular" style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                      {profile.payment_key || 'Pago directo por QR'}
                    </span>
                    {profile.payment_key && (
                      <button
                        type="button"
                        onClick={handleCopyKey}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: copied ? 'var(--accent-mint)' : 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title="Copiar llave"
                      >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Herramientas Secundarias: Ampliar y Descargar */}
                <div
                  className="qr-tools-row"
                  style={{
                    display: 'flex',
                    gap: '0.45rem',
                    width: '100%',
                  }}
                >
                  <button
                    type="button"
                    className="btn-secondary active:scale-[0.98]"
                    onClick={() => setIsZoomed(true)}
                    style={{
                      flex: 1,
                      fontSize: '0.8rem',
                      padding: '0.45rem 0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <Maximize2 size={13} />
                    <span>Ampliar QR para Escanear</span>
                  </button>
                  <button
                    type="button"
                    className="btn-secondary active:scale-[0.98]"
                    onClick={handleDownloadQr}
                    style={{
                      flex: '0 0 auto',
                      fontSize: '0.8rem',
                      padding: '0.45rem 0.7rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                    }}
                    title="Descargar QR"
                  >
                    <Download size={13} />
                    <span>Descargar</span>
                  </button>
                </div>

                {/* Consejo compacto */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.5rem 0.75rem',
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  <Smartphone size={15} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', lineHeight: '1.35' }}>
                    Abre tu app bancaria (Bancolombia, Nequi, Daviplata o Bre-B), selecciona transferir con QR y apunta la cámara a este código.
                  </span>
                </div>
              </div>
            ) : (
              <div
                className="card-empty-tip"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: '0.75rem',
                  padding: '2rem 1.5rem',
                  background: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-subtle)',
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
                  <AlertCircle size={22} />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: '700', margin: '0 0 0.35rem 0', color: 'var(--text-main)' }}>
                    Sin código QR oficial
                  </h4>
                  <p className="text-subtle" style={{ margin: 0, fontSize: '0.82rem', lineHeight: '1.4' }}>
                    {profile.name} aún no ha subido su imagen de código QR oficial de Bre-B o de su banco.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Consejo cuando se visualiza tarjeta y no hay llave configurada */}
        {activeTab === 'card' && !profile.payment_key && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '0.5rem 0.75rem',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <Smartphone size={15} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', lineHeight: '1.35' }}>
              {profile.payment_qr
                ? 'Código QR Bre-B oficial disponible en la pestaña de QR.'
                : `Pídele a ${profile.name} que agregue su llave en su perfil para transferirle con 1 clic.`}
            </span>
          </div>
        )}
      </div>

      {/* Modal Footer Fijo al Pie */}
      <div className="modal-payment-footer">
        <button
          type="button"
          className="btn-primary payment-footer-btn active:scale-[0.98]"
          onClick={handleGoToVoucher}
        >
          <Receipt size={17} />
          <span>Ya pagué: Subir Comprobante</span>
        </button>

        {profile.payment_key && (
          <button
            type="button"
            className="btn-secondary payment-footer-btn active:scale-[0.98]"
            onClick={handleCopyKey}
          >
            {copied ? (
              <>
                <Check size={16} color="var(--accent-mint)" />
                <span>Llave Copiada al Portapapeles</span>
              </>
            ) : (
              <>
                <Copy size={16} />
                <span>Copiar Llave ({profile.payment_key})</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Lightbox / Zoom Overlay */}
      {isZoomed && hasQr && (
        <div
          className="qr-zoom-overlay animate-fade-in"
          onClick={() => {
            setIsZoomed(false);
            setFocusQr(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.92)',
            backdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '24px',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.9rem',
              maxWidth: '440px',
              width: '94vw',
              maxHeight: '94vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    color: 'var(--accent-mint)',
                    background: 'rgba(16, 185, 129, 0.12)',
                    padding: '0.2rem 0.6rem',
                    borderRadius: 'var(--radius-full)',
                  }}
                >
                  {isVector
                    ? 'Código QR Bre-B Oficial (Vectorial)'
                    : 'Código QR Bre-B Oficial'}
                </span>
              </div>
              <button
                type="button"
                className="modal-close-btn active:scale-[0.98]"
                onClick={() => {
                  setIsZoomed(false);
                  setFocusQr(false);
                }}
                aria-label="Cerrar vista ampliada"
              >
                <X size={20} />
              </button>
            </div>

            {/* Conmutador de enfoque si es imagen rasterizada */}
            {!isVector && (
              <div
                className="qr-lightbox-pill-toggle"
                style={{
                  display: 'inline-flex',
                  background: 'var(--bg-input)',
                  padding: '0.25rem',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--border-subtle)',
                  gap: '0.25rem',
                }}
              >
                <button
                  type="button"
                  onClick={() => setFocusQr(false)}
                  style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.78rem',
                    fontWeight: '600',
                    border: 'none',
                    cursor: 'pointer',
                    background: !focusQr ? 'var(--brand-primary)' : 'transparent',
                    color: !focusQr ? '#ffffff' : 'var(--text-secondary)',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  Vista Completa
                </button>
                <button
                  type="button"
                  onClick={() => setFocusQr(true)}
                  style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.78rem',
                    fontWeight: '600',
                    border: 'none',
                    cursor: 'pointer',
                    background: focusQr ? 'var(--brand-primary)' : 'transparent',
                    color: focusQr ? '#ffffff' : 'var(--text-secondary)',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  Enfocar Código QR
                </button>
              </div>
            )}

            {/* Placa de contraste blanco en lightbox */}
            <div
              style={{
                background: '#ffffff',
                padding: isVector ? '20px' : '12px',
                borderRadius: '18px',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                maxHeight: '60vh',
                maxWidth: '100%',
                width: 'auto',
                overflow: 'hidden',
              }}
            >
              {isVector ? (
                <QRCodeSVG
                  value={effectiveVectorPayload}
                  size={260}
                  level="M"
                  style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
                />
              ) : (
                <img
                  src={getUploadUrl(profile.payment_qr)}
                  alt={`Código QR oficial de ${profile.name}`}
                  style={{
                    maxHeight: '52vh',
                    maxWidth: '100%',
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain',
                    borderRadius: '10px',
                    display: 'block',
                    transform: focusQr ? 'scale(1.42)' : 'scale(1)',
                    transformOrigin: 'center 42%',
                    transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                />
              )}
            </div>

            <div style={{ textAlign: 'center', width: '100%' }}>
              <p style={{ margin: 0, fontSize: '1.02rem', fontWeight: '700', color: 'var(--text-main)' }}>
                {profile.name}
              </p>
              {profile.payment_key && (
                <span className="num-tabular" style={{ display: 'block', fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  {profile.payment_key}
                </span>
              )}
              <p className="text-subtle" style={{ margin: '0.35rem 0 0 0', fontSize: '0.76rem', lineHeight: '1.4' }}>
                Abre tu app bancaria (Bancolombia, Nequi, Daviplata o Bre-B), selecciona transferir con QR y apunta la cámara a este código.
              </p>
            </div>

            <button
              type="button"
              className="btn-primary active:scale-[0.98]"
              onClick={() => {
                setIsZoomed(false);
                setFocusQr(false);
              }}
              style={{ width: '100%', padding: '0.65rem' }}
            >
              Cerrar Vista Ampliada
            </button>
          </div>
        </div>
      )}
    </>
  );
}
