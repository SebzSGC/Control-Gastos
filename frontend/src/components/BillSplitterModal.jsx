import { useState, useRef, useEffect } from 'react';
import { 
  Upload, ImagePlus, Check, Plus, Trash2, ArrowRight, ArrowLeft, 
  Sparkles, AlertTriangle, Receipt, Loader2, X,
  RotateCw, Key, Cpu, ExternalLink, Eye, EyeOff, Radio
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { API_URL } from '../config/api';

const formatCOP = (amount) => {
  return new Intl.NumberFormat('es-CO', { 
    style: 'currency', 
    currency: 'COP', 
    maximumFractionDigits: 0 
  }).format(amount || 0);
};

export default function BillSplitterModal({ 
  groupId, 
  profiles = [], 
  currentProfile = null, 
  onClose, 
  onSuccess,
  socket = null
}) {
  const { showToast } = useToast();
  const fileInputRef = useRef(null);

  // Step 1: Upload & Scan, Step 2: Edit Items, Step 3: Assign, Step 4: Summary
  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [rawFile, setRawFile] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [isLiveSessionActive, setIsLiveSessionActive] = useState(false);

  // AI & Vision Agent Configuration
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('paysync_gemini_key') || '');
  const [hasServerKey, setHasServerKey] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tempKey, setTempKey] = useState('');
  const [showKeyText, setShowKeyText] = useState(false);
  const [engineInfo, setEngineInfo] = useState(null);
  const [detectedStore, setDetectedStore] = useState('');

  // Bill metadata
  const [description, setDescription] = useState('Factura de consumo');
  const [payerId, setPayerId] = useState(currentProfile?.id || (profiles[0]?.id || ''));
  const [taxDistribution, setTaxDistribution] = useState('proportional'); // 'proportional' | 'equal'

  // Items and charges
  const [items, setItems] = useState([]);
  const [tip, setTip] = useState(0);
  const [tax, setTax] = useState(0);
  const [discount, setDiscount] = useState(0);

  // Assignment state: map of itemId -> array of profileIds [profileId1, profileId2]
  const [assignments, setAssignments] = useState({});

  // Sync real-time claims from peers when session is live or modal is open
  useEffect(() => {
    if (!socket) return;

    const handlePeerClaim = (data) => {
      if (data?.itemId && data?.profileId) {
        setAssignments(prev => {
          const current = prev[data.itemId] || [];
          const exists = current.includes(data.profileId);
          if (data.selected && !exists) {
            return { ...prev, [data.itemId]: [...current, data.profileId] };
          } else if (!data.selected && exists) {
            return { ...prev, [data.itemId]: current.filter(id => id !== data.profileId) };
          }
          return prev;
        });

        if (data.profileId !== currentProfile?.id) {
          showToast(`🍽️ ${data.profileName || 'Un integrante'} marcó: ${data.itemName || 'un plato'}`, 'info');
        }
      }
    };

    socket.on('bill_item_claimed', handlePeerClaim);
    return () => {
      socket.off('bill_item_claimed', handlePeerClaim);
    };
  }, [socket, currentProfile, showToast]);

  // Check if server already has an environment API Key configured
  useEffect(() => {
    fetch(`${API_URL}/vision-status`)
      .then(res => res.json())
      .then(data => {
        if (data?.hasServerKey) {
          setHasServerKey(true);
        }
      })
      .catch(console.error);
  }, []);

  // Save / Clear Gemini Key
  const handleSaveKey = (e) => {
    e.preventDefault();
    const clean = tempKey.trim();
    setGeminiKey(clean);
    if (clean) {
      localStorage.setItem('paysync_gemini_key', clean);
      showToast('Clave de Google Gemini guardada. ¡IA Multimodal activada!', 'success');
    } else {
      localStorage.removeItem('paysync_gemini_key');
      showToast('Clave de IA eliminada. Se usará el motor OCR local.', 'info');
    }
    setShowKeyModal(false);
  };

  // Process image with backend Vision Agent
  const processUploadedFile = async (file, rotAngle = rotation) => {
    if (!file) return;

    setIsProcessing(true);
    const formData = new FormData();
    formData.append('bill', file);
    formData.append('rotation', rotAngle);

    const headers = {};
    if (geminiKey) {
      headers['x-gemini-key'] = geminiKey;
    }

    try {
      const res = await fetch(`${API_URL}/upload-bill`, {
        method: 'POST',
        headers,
        body: formData
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al procesar la factura');
      }

      if (data.success && Array.isArray(data.items) && data.items.length > 0) {
        setItems(data.items);
        setTip(data.tip || 0);
        setTax(data.tax || 0);
        setDiscount(data.discount || 0);
        setEngineInfo({
          engineUsed: data.engineUsed,
          confidence: data.confidence,
          mathVerified: data.mathVerified
        });

        if (data.store_name) {
          setDetectedStore(data.store_name);
          setDescription(`Consumo en ${data.store_name}`);
        } else {
          setDescription('Consumo desglosado');
        }

        const isVision = data.engineUsed?.includes('vision');
        showToast(
          isVision
            ? `⚡ ¡Factura analizada con IA Multimodal! ${data.items.length} productos extraídos.`
            : `Factura analizada con escáner local. ${data.items.length} productos detectados.`,
          'success'
        );
        setStep(2); // Move to review step
      } else {
        showToast('No se pudieron detectar productos con suficiente claridad. Puedes ingresarlos manualmente.', 'warning');
        setItems([
          { id: Math.random().toString(36).substring(2, 9), name: 'Producto 1', quantity: 1, unitPrice: data.total || 10000, subtotal: data.total || 10000 }
        ]);
        setStep(2);
      }
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error de conexión al procesar imagen', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // STEP 1: Handle File Selection
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRawFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRotation(0);
    processUploadedFile(file, 0);
  };

  // Rotate and re-run analysis
  const handleRotateAndProcess = (e) => {
    e.stopPropagation();
    if (!rawFile) return;
    const nextRot = (rotation + 90) % 360;
    setRotation(nextRot);
    showToast(`Rotando imagen a ${nextRot}° y reanalizando...`, 'info');
    processUploadedFile(rawFile, nextRot);
  };

  const handleSkipUpload = () => {
    setItems([
      { id: Math.random().toString(36).substring(2, 9), name: 'Plato principal', quantity: 1, unitPrice: 25000, subtotal: 25000 },
      { id: Math.random().toString(36).substring(2, 9), name: 'Bebidas', quantity: 2, unitPrice: 5000, subtotal: 10000 }
    ]);
    setEngineInfo({ engineUsed: 'manual-input', confidence: 'high' });
    setStep(2);
  };

  // STEP 2: Item Editing
  const handleItemChange = (id, field, value) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        const qty = field === 'quantity' ? Math.max(1, parseInt(value, 10) || 1) : item.quantity;
        const price = field === 'unitPrice' ? Math.max(0, parseFloat(value) || 0) : item.unitPrice;
        updated.quantity = qty;
        updated.unitPrice = price;
        updated.subtotal = qty * price;
      }
      return updated;
    }));
  };

  const handleAddItem = () => {
    const newItem = {
      id: Math.random().toString(36).substring(2, 9),
      name: `Nuevo producto ${items.length + 1}`,
      quantity: 1,
      unitPrice: 10000,
      subtotal: 10000
    };
    setItems(prev => [...prev, newItem]);
  };

  const handleDeleteItem = (id) => {
    if (items.length <= 1) {
      showToast('La factura debe tener al menos un producto', 'warning');
      return;
    }
    setItems(prev => prev.filter(it => it.id !== id));
    setAssignments(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  // Financial calculations
  const itemsSubtotal = items.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);
  const calculatedGrandTotal = Math.max(0, itemsSubtotal + (Number(tax) || 0) + (Number(tip) || 0) - (Number(discount) || 0));
  const invoiceTotal = calculatedGrandTotal;

  // STEP 3: Assign items to participants
  const toggleAssignment = (itemId, profileId) => {
    setAssignments(prev => {
      const current = prev[itemId] || [];
      const exists = current.includes(profileId);
      const updated = exists ? current.filter(id => id !== profileId) : [...current, profileId];
      return { ...prev, [itemId]: updated };
    });
  };

  // Calculate consumption summary per participant
  const calculateParticipantShares = () => {
    const shares = {};
    profiles.forEach(p => {
      shares[p.id] = {
        profile: p,
        itemsSubtotal: 0,
        itemsConsumed: [],
        taxShare: 0,
        tipShare: 0,
        discountShare: 0,
        totalOwed: 0
      };
    });

    let totalAssignedSubtotal = 0;

    items.forEach(item => {
      const assignedProfiles = assignments[item.id] || [];
      if (assignedProfiles.length > 0) {
        totalAssignedSubtotal += item.subtotal;
        const portionPerPerson = item.subtotal / assignedProfiles.length;
        assignedProfiles.forEach(pid => {
          if (shares[pid]) {
            shares[pid].itemsSubtotal += portionPerPerson;
            shares[pid].itemsConsumed.push({
              name: item.name,
              quantity: item.quantity,
              totalItemPrice: item.subtotal,
              portionAmount: portionPerPerson,
              isShared: assignedProfiles.length > 1,
              sharedWithCount: assignedProfiles.length
            });
          }
        });
      }
    });

    // Distribute extra charges (Taxes, Tips, Discounts)
    profiles.forEach(p => {
      const userShare = shares[p.id];
      if (taxDistribution === 'proportional') {
        const ratio = totalAssignedSubtotal > 0 ? (userShare.itemsSubtotal / totalAssignedSubtotal) : 0;
        userShare.taxShare = Math.round((Number(tax) || 0) * ratio);
        userShare.tipShare = Math.round((Number(tip) || 0) * ratio);
        userShare.discountShare = Math.round((Number(discount) || 0) * ratio);
      } else {
        const activeCount = Object.values(shares).filter(s => s.itemsSubtotal > 0).length || profiles.length;
        if (userShare.itemsSubtotal > 0) {
          userShare.taxShare = Math.round((Number(tax) || 0) / activeCount);
          userShare.tipShare = Math.round((Number(tip) || 0) / activeCount);
          userShare.discountShare = Math.round((Number(discount) || 0) / activeCount);
        }
      }
      userShare.totalOwed = Math.round(userShare.itemsSubtotal + userShare.taxShare + userShare.tipShare - userShare.discountShare);
    });

    const totalAssignedWithExtras = Object.values(shares).reduce((sum, s) => sum + s.totalOwed, 0);
    const pendingAmount = Math.max(0, invoiceTotal - totalAssignedWithExtras);

    return { shares, totalAssignedSubtotal, totalAssignedWithExtras, pendingAmount };
  };

  const { shares, totalAssignedSubtotal, totalAssignedWithExtras, pendingAmount } = calculateParticipantShares();

  // Start real-time live session with room participants
  const handleStartLiveSession = () => {
    if (items.length === 0) {
      showToast('Debes tener al menos un producto en la lista', 'warning');
      return;
    }

    const hostProfile = profiles.find(p => p.id === payerId) || currentProfile;
    const hostName = hostProfile?.name || 'Un integrante';
    const storeName = detectedStore || (description ? description.replace(/^Consumo en\s*/i, '') : 'Factura compartida');

    const liveData = {
      sessionId: `live-bill-${Date.now()}`,
      groupId,
      hostProfileId: payerId || currentProfile?.id,
      hostName,
      storeName,
      description: description || `Factura de ${storeName}`,
      items: items.map(it => ({
        id: it.id,
        name: it.name,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        subtotal: it.subtotal
      })),
      tax: Number(tax) || 0,
      tip: Number(tip) || 0,
      discount: Number(discount) || 0,
      totalAmount: invoiceTotal,
      taxDistribution,
      initialClaims: assignments
    };

    if (socket) {
      socket.emit('start_bill_session', liveData);
      socket.emit('bill_session_started', liveData);
    }
    setIsLiveSessionActive(true);
    showToast('📡 ¡Reparto en vivo activado! Notificación enviada al grupo.', 'success');
    setStep(3); // Advance directly to assignment step
  };

  const handleCloseModal = () => {
    if (isLiveSessionActive && socket && groupId) {
      socket.emit('bill_session_closed', { groupId });
    }
    onClose();
  };

  // STEP 4: Finalize and commit bill
  const handleFinalizeBill = async () => {
    if (!payerId) {
      showToast('Selecciona quién pagó la factura completa', 'warning');
      return;
    }

    if (totalAssignedSubtotal === 0) {
      showToast('Debes asignar al menos un producto a algún participante', 'warning');
      return;
    }

    // Build splits payload
    const splitsPayload = Object.values(shares)
      .filter(s => s.totalOwed > 0)
      .map(s => ({
        profile_id: s.profile.id,
        amount: s.totalOwed,
        items_summary: s.itemsConsumed.map(it => `${it.name}${it.isShared ? ` (compartido 1/${it.sharedWithCount})` : ''}`).join(', ')
      }));

    setIsProcessing(true);
    try {
      const res = await fetch(`${API_URL}/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: groupId,
          payer_profile_id: payerId,
          description: description || 'Factura desglosada',
          items: items.map(it => ({
            name: it.name,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            subtotal: it.subtotal
          })),
          splits: splitsPayload,
          subtotal: itemsSubtotal,
          tax: Number(tax) || 0,
          tip: Number(tip) || 0,
          discount: Number(discount) || 0,
          total_amount: invoiceTotal
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al registrar la factura');
      }

      showToast('¡Factura desglosada y repartida con éxito!', 'success');
      if (socket && groupId) {
        socket.emit('bill_session_closed', { groupId });
      }
      if (onSuccess) onSuccess(data.bill);
      onClose();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error al guardar la factura', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const isAiActive = !!(geminiKey || hasServerKey);

  return (
    <div className="modal-backdrop" onClick={handleCloseModal}>
      <div className="modal-container modal-wide animate-scale-up" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-title-wrap">
            <div className="modal-icon-badge">
              <Receipt size={22} />
            </div>
            <div>
              <h2 className="modal-title">Pago Total Mediante Factura</h2>
              <p className="modal-subtitle">Escaneo inteligente con IA Multimodal, ajuste de platos y reparto equitativo</p>
            </div>
          </div>
          <button className="btn-icon-subtle" onClick={handleCloseModal} aria-label="Cerrar modal">
            <X size={20} />
          </button>
        </div>

        {/* Multi-step progress bar */}
        <div className="step-wizard-bar">
          <div className={`step-wizard-item ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
            <span className="step-num">{step > 1 ? <Check size={14} /> : '1'}</span>
            <span className="step-text">Subir Factura</span>
          </div>
          <div className="step-wizard-connector"></div>
          <div className={`step-wizard-item ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
            <span className="step-num">{step > 2 ? <Check size={14} /> : '2'}</span>
            <span className="step-text">Editar Productos</span>
          </div>
          <div className="step-wizard-connector"></div>
          <div className={`step-wizard-item ${step >= 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}`}>
            <span className="step-num">{step > 3 ? <Check size={14} /> : '3'}</span>
            <span className="step-text">Asignar Consumos</span>
          </div>
          <div className="step-wizard-connector"></div>
          <div className={`step-wizard-item ${step >= 4 ? 'active' : ''}`}>
            <span className="step-num">4</span>
            <span className="step-text">Resumen & Liquidación</span>
          </div>
        </div>

        {/* Content Body based on Step */}
        <div className="modal-body-scrollable">

          {/* ================= STEP 1: Upload / OCR ================= */}
          {step === 1 && (
            <div className="step-content animate-fade-in">
              
              {/* AI Engine Status Bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
                marginBottom: '1.25rem',
                padding: '0.6rem 1rem',
                borderRadius: 'var(--radius-lg)',
                background: isAiActive ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-input)',
                border: `1px solid ${isAiActive ? 'rgba(16, 185, 129, 0.25)' : 'var(--border-subtle)'}`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
                  {isAiActive ? (
                    <>
                      <Sparkles size={17} className="text-success" />
                      <span style={{ fontWeight: 700, color: 'var(--accent-mint)' }}>IA Multimodal Activa</span>
                      <span className="text-secondary" style={{ fontSize: '0.78rem' }}>
                        (Gemini 2.0 Flash • Precisión 99% en tickets de restaurante)
                      </span>
                    </>
                  ) : (
                    <>
                      <Cpu size={17} color="var(--text-muted)" />
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Escáner Local Activo</span>
                      <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                        (Tesseract OCR)
                      </span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}
                  onClick={() => {
                    setTempKey(geminiKey);
                    setShowKeyModal(true);
                  }}
                >
                  <Key size={14} /> {isAiActive ? 'Configurar Motor IA' : 'Activar IA Gemini Gratis ⚡'}
                </button>
              </div>

              {/* Dropzone */}
              <div 
                className={`bill-dropzone ${isProcessing ? 'scanning-active' : ''}`}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  accept="image/*" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }} 
                  onChange={handleFileUpload} 
                />

                {isProcessing ? (
                  <div className="scanning-indicator-box">
                    <div className="scanner-laser-beam"></div>
                    <Loader2 className="animate-spin text-primary" size={48} />
                    <h3 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>
                      {isAiActive ? 'Analizando factura con IA Multimodal...' : 'Analizando factura con OCR local...'}
                    </h3>
                    <p className="text-secondary text-sm">
                      Identificando platos, bebidas, cantidades, precios unitarios, propina e impuestos...
                    </p>
                  </div>
                ) : imagePreview ? (
                  <div className="preview-container" onClick={e => e.stopPropagation()}>
                    <img 
                      src={imagePreview} 
                      alt="Factura escaneada" 
                      className="preview-receipt-img" 
                      style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.3s ease' }}
                    />
                    <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'center', marginTop: '1rem' }}>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={handleRotateAndProcess}
                        title="Girar 90 grados y reanalizar"
                      >
                        <RotateCw size={14} /> Girar 90° ({rotation}°)
                      </button>
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload size={14} /> Cambiar Foto
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="dropzone-empty-state">
                    <div className="dropzone-icon-circle">
                      <ImagePlus size={36} />
                    </div>
                    <h3 style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>Sube o toma una foto de la factura</h3>
                    <p className="text-secondary text-sm" style={{ maxWidth: '440px', margin: '0 auto 1.5rem auto' }}>
                      {isAiActive 
                        ? 'El Agente Multimodal extraerá con precisión humana cada producto, valor unitario y cargo de servicio.' 
                        : 'Sube la imagen para digitalizar automáticamente los consumos de la mesa.'}
                    </p>
                    <button type="button" className="btn-primary" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                      <Upload size={16} /> Seleccionar Foto de la Factura
                    </button>
                  </div>
                )}
              </div>

              <div className="step-alt-action" style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                <button type="button" className="btn-text-subtle" onClick={handleSkipUpload}>
                  O ingresar productos manualmente sin foto <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ================= STEP 2: Edit Items & Charges ================= */}
          {step === 2 && (
            <div className="step-content animate-fade-in">
              <div className="step-section-header">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                    <h3 className="section-title" style={{ margin: 0 }}>Ítems Identificados</h3>
                    {engineInfo && (
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '0.15rem 0.55rem',
                        borderRadius: 'var(--radius-pill)',
                        background: engineInfo.engineUsed?.includes('vision') ? 'rgba(16, 185, 129, 0.14)' : 'rgba(99, 102, 241, 0.12)',
                        color: engineInfo.engineUsed?.includes('vision') ? 'var(--accent-mint)' : 'var(--brand-primary)',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}>
                        <Sparkles size={12} /> {engineInfo.engineUsed?.includes('vision') ? 'IA Multimodal Activa' : 'Escáner Local'}
                      </span>
                    )}
                  </div>
                  <p className="text-secondary text-sm">
                    {detectedStore ? <strong>{detectedStore} • </strong> : ''}
                    Verifica que los productos, cantidades y precios coincidan con la cuenta. Puedes editar cualquier fila.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button 
                    type="button" 
                    className="btn-primary btn-sm btn-nfc-join" 
                    onClick={handleStartLiveSession}
                    title="Transmitir la cuenta a todos los teléfonos del grupo en tiempo real"
                  >
                    <Radio size={14} className="pulse-icon" /> 📡 Repartir en Vivo con el Grupo
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={handleAddItem}>
                    <Plus size={14} /> Agregar Producto
                  </button>
                </div>
              </div>

              {/* Items Table */}
              <div className="bill-items-table-wrap">
                <table className="bill-items-table">
                  <thead>
                    <tr>
                      <th style={{ width: '45%' }}>Producto / Concepto</th>
                      <th style={{ width: '15%', textAlign: 'center' }}>Cant.</th>
                      <th style={{ width: '20%', textAlign: 'right' }}>Vr. Unitario</th>
                      <th style={{ width: '20%', textAlign: 'right' }}>Subtotal</th>
                      <th style={{ width: '40px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td>
                          <input 
                            type="text" 
                            className="table-input" 
                            value={item.name} 
                            onChange={(e) => handleItemChange(item.id, 'name', e.target.value)}
                            placeholder="Nombre del producto"
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input 
                            type="number" 
                            min="1"
                            className="table-input text-center" 
                            value={item.quantity} 
                            onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                          />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <input 
                            type="number" 
                            min="0"
                            className="table-input text-right" 
                            value={item.unitPrice} 
                            onChange={(e) => handleItemChange(item.id, 'unitPrice', e.target.value)}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: '600', color: 'var(--text-primary)' }}>
                          {formatCOP(item.subtotal)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button 
                            type="button" 
                            className="btn-icon-danger" 
                            onClick={() => handleDeleteItem(item.id)}
                            title="Eliminar producto"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Extra charges grid */}
              <div className="extra-charges-grid">
                <div className="charge-field">
                  <label className="input-label">Propina / Servicio</label>
                  <div className="input-with-addons">
                    <input 
                      type="number" 
                      min="0"
                      className="form-input" 
                      value={tip} 
                      onChange={(e) => setTip(Math.max(0, parseFloat(e.target.value) || 0))}
                    />
                    <button 
                      type="button" 
                      className="input-addon-btn" 
                      onClick={() => setTip(Math.round(itemsSubtotal * 0.1))}
                      title="Calcular 10% voluntario sugerido"
                    >
                      10%
                    </button>
                  </div>
                </div>

                <div className="charge-field">
                  <label className="input-label">Impuestos (IVA / Impoconsumo)</label>
                  <input 
                    type="number" 
                    min="0"
                    className="form-input" 
                    value={tax} 
                    onChange={(e) => setTax(Math.max(0, parseFloat(e.target.value) || 0))}
                  />
                </div>

                <div className="charge-field">
                  <label className="input-label">Descuentos</label>
                  <input 
                    type="number" 
                    min="0"
                    className="form-input" 
                    value={discount} 
                    onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                  />
                </div>
              </div>

              {/* Step 2 summary bar */}
              <div className="bill-total-summary-card">
                <div className="summary-item">
                  <span className="summary-label">Subtotal ítems ({items.length}):</span>
                  <span className="summary-val">{formatCOP(itemsSubtotal)}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Cargos extras (+ Propina/IVA - Dcto):</span>
                  <span className="summary-val">+{formatCOP((Number(tip)||0) + (Number(tax)||0) - (Number(discount)||0))}</span>
                </div>
                <div className="summary-item total-highlight">
                  <span className="summary-label">Total de la Factura:</span>
                  <span className="summary-val">{formatCOP(invoiceTotal)}</span>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 3: Assign Items ================= */}
          {step === 3 && (
            <div className="step-content animate-fade-in">
              <div className="step-section-header">
                <div>
                  <h3 className="section-title">¿Quién consumió cada producto?</h3>
                  <p className="text-secondary text-sm">
                    Haz clic en los participantes que consumieron cada ítem. Si seleccionas a varios, el valor se <strong>divide en partes iguales</strong>.
                  </p>
                </div>
                
                {/* Distribution mode switch */}
                <div className="mode-toggle-wrap">
                  <span className="text-xs text-secondary">Reparto de Propina/IVA:</span>
                  <div className="segmented-control segmented-sm">
                    <button 
                      type="button" 
                      className={`segmented-btn ${taxDistribution === 'proportional' ? 'active' : ''}`}
                      onClick={() => setTaxDistribution('proportional')}
                    >
                      Proporcional
                    </button>
                    <button 
                      type="button" 
                      className={`segmented-btn ${taxDistribution === 'equal' ? 'active' : ''}`}
                      onClick={() => setTaxDistribution('equal')}
                    >
                      Igualitario
                    </button>
                  </div>
                </div>
              </div>

              {/* Live Session Active Alert */}
              {isLiveSessionActive && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1.1rem',
                  borderRadius: 'var(--radius-lg)',
                  background: 'rgba(99, 102, 241, 0.12)',
                  border: '1.5px solid rgba(99, 102, 241, 0.35)',
                  marginBottom: '1.25rem',
                  boxShadow: '0 4px 15px rgba(99, 102, 241, 0.15)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <span className="live-pulse-dot" style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#06b6d4', boxShadow: '0 0 10px #06b6d4' }}></span>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      📡 Sesión en Vivo Activa: Los participantes marcan sus platos desde sus teléfonos en tiempo real.
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-mint)', background: 'rgba(16, 185, 129, 0.15)', padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-pill)' }}>
                    Sincronizando
                  </span>
                </div>
              )}

              {/* Items assignment list */}
              <div className="items-assignment-list">
                {items.map((item) => {
                  const assigned = assignments[item.id] || [];
                  const isAssigned = assigned.length > 0;
                  const shareEach = isAssigned ? item.subtotal / assigned.length : item.subtotal;

                  return (
                    <div key={item.id} className={`item-assign-card ${isAssigned ? 'card-assigned' : 'card-unassigned'}`}>
                      <div className="item-assign-header">
                        <div className="item-assign-title-block">
                          <span className="item-qty-badge">{item.quantity}x</span>
                          <span className="item-assign-name">{item.name}</span>
                        </div>
                        <div className="item-assign-price-block">
                          <span className="item-total-price">{formatCOP(item.subtotal)}</span>
                          {isAssigned && assigned.length > 1 && (
                            <span className="item-split-hint">
                              ({formatCOP(shareEach)} c/u entre {assigned.length})
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Participant Chips */}
                      <div className="participants-chips-selector">
                        {profiles.map(p => {
                          const isSelected = assigned.includes(p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              className={`participant-chip-btn ${isSelected ? 'selected' : ''}`}
                              onClick={() => toggleAssignment(item.id, p.id)}
                            >
                              <span className="chip-avatar">{p.name.charAt(0).toUpperCase()}</span>
                              <span className="chip-name">{p.name}</span>
                              {isSelected && <Check size={12} className="chip-check" />}
                            </button>
                          );
                        })}
                      </div>

                      {/* Status indicator */}
                      <div className="item-assign-status-footer">
                        {isAssigned ? (
                          <span className="badge-assigned">
                            <Check size={12} /> Asignado a {assigned.map(id => profiles.find(p => p.id === id)?.name).join(', ')}
                          </span>
                        ) : (
                          <span className="badge-unassigned">
                            <AlertTriangle size={12} /> Sin asignar todavía
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Progress counter */}
              <div className="assignment-progress-banner">
                <div>
                  <span className="text-secondary text-sm">Asignado de la factura:</span>
                  <h4 style={{ margin: 0, fontSize: '1.2rem' }}>
                    {formatCOP(totalAssignedWithExtras)} <small className="text-secondary">/ {formatCOP(invoiceTotal)}</small>
                  </h4>
                </div>
                {pendingAmount > 0 ? (
                  <span className="badge-warning">
                    Faltan {formatCOP(pendingAmount)} por asignar
                  </span>
                ) : (
                  <span className="badge-success">
                    <Check size={14} /> ¡Factura 100% asignada!
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ================= STEP 4: Pre-Finalization Summary ================= */}
          {step === 4 && (
            <div className="step-content animate-fade-in">
              <div className="step-section-header">
                <div>
                  <h3 className="section-title">Resumen de Reparto y Liquidación</h3>
                  <p className="text-secondary text-sm">Revisa el valor exacto que asumirá cada persona antes de asentar en la sala.</p>
                </div>
              </div>

              {/* Payer and description settings */}
              <div className="final-settings-row">
                <div style={{ flex: 1 }}>
                  <label className="input-label">Descripción de la Factura</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    placeholder="Ej. Almuerzo de trabajo" 
                    required 
                  />
                </div>
                <div style={{ width: '280px' }}>
                  <label className="input-label">¿Quién pagó la cuenta completa?</label>
                  <select 
                    className="form-input form-select" 
                    value={payerId} 
                    onChange={e => setPayerId(e.target.value)}
                  >
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.id === currentProfile?.id ? '(Tú)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Unassigned Warning if applicable */}
              {pendingAmount > 0 && (
                <div className="alert-box alert-warning animate-shake">
                  <AlertTriangle size={20} />
                  <div>
                    <strong>Hay {formatCOP(pendingAmount)} sin asignar.</strong>
                    <p className="text-xs" style={{ margin: 0 }}>
                      Los ítems o valores pendientes no serán cobrados a ningún participante a menos que vuelvas al paso 3 y los asignes.
                    </p>
                  </div>
                </div>
              )}

              {/* Participant breakdown cards */}
              <div className="participants-summary-grid">
                {Object.values(shares).map(userShare => {
                  const p = userShare.profile;
                  const isPayer = p.id === payerId;

                  return (
                    <div key={p.id} className={`participant-summary-card ${userShare.totalOwed > 0 ? 'active-share' : 'zero-share'}`}>
                      <div className="participant-card-head">
                        <div className="avatar-chip-large">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1 }}>
                          <h4 className="participant-card-name">
                            {p.name} {isPayer && <span className="badge-payer">Pagador</span>}
                          </h4>
                          <span className="text-xs text-secondary">
                            {userShare.itemsConsumed.length} producto(s) asignado(s)
                          </span>
                        </div>
                        <div className="participant-total-amount">
                          {formatCOP(userShare.totalOwed)}
                        </div>
                      </div>

                      {/* Items list */}
                      {userShare.itemsConsumed.length > 0 ? (
                        <div className="consumed-items-list">
                          {userShare.itemsConsumed.map((c, i) => (
                            <div key={i} className="consumed-item-row">
                              <span className="consumed-name">
                                • {c.name} {c.isShared && <small className="text-secondary">(1/{c.sharedWithCount})</small>}
                              </span>
                              <span className="consumed-price">{formatCOP(c.portionAmount)}</span>
                            </div>
                          ))}
                          {(userShare.tipShare > 0 || userShare.taxShare > 0) && (
                            <div className="consumed-item-row text-xs text-secondary" style={{ borderTop: '1px dashed var(--border-subtle)', paddingTop: '4px', marginTop: '4px' }}>
                              <span>+ Propina & Impuestos ({taxDistribution === 'proportional' ? 'proporcional' : 'fijo'}):</span>
                              <span>+{formatCOP(userShare.tipShare + userShare.taxShare - userShare.discountShare)}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-secondary" style={{ fontStyle: 'italic', margin: '0.5rem 0 0 0' }}>
                          Sin consumos registrados en esta factura.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Total Balance Card */}
              <div className="bill-total-summary-card" style={{ marginTop: '1.5rem' }}>
                <div className="summary-item">
                  <span className="summary-label">Total Factura:</span>
                  <span className="summary-val">{formatCOP(invoiceTotal)}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Total Asignado:</span>
                  <span className="summary-val text-success">{formatCOP(totalAssignedWithExtras)}</span>
                </div>
                <div className="summary-item total-highlight">
                  <span className="summary-label">Pagado por {profiles.find(p => p.id === payerId)?.name || 'Pagador'}:</span>
                  <span className="summary-val">{formatCOP(invoiceTotal)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="modal-footer">
          {step > 1 ? (
            <button 
              type="button" 
              className="btn-secondary" 
              onClick={() => setStep(prev => prev - 1)}
              disabled={isProcessing}
            >
              <ArrowLeft size={16} /> Volver
            </button>
          ) : (
            <button type="button" className="btn-secondary" onClick={handleCloseModal} disabled={isProcessing}>
              Cancelar
            </button>
          )}

          {step === 2 && (
            <button 
              type="button" 
              className="btn-primary btn-nfc-join" 
              onClick={handleStartLiveSession}
              style={{ marginRight: 'auto' }}
            >
              <Radio size={16} /> 📡 Repartir en Vivo con el Grupo
            </button>
          )}

          {step < 4 ? (
            <button 
              type="button" 
              className="btn-primary" 
              onClick={() => {
                if (step === 2 && items.length === 0) {
                  showToast('Debes tener al menos un producto en la lista', 'warning');
                  return;
                }
                setStep(prev => prev + 1);
              }}
              disabled={isProcessing}
            >
              Siguiente <ArrowRight size={16} />
            </button>
          ) : (
            <button 
              type="button" 
              className="btn-primary btn-success-glow" 
              onClick={handleFinalizeBill}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="animate-spin" size={16} /> Registrando...
                </>
              ) : (
                <>
                  <Check size={16} /> Confirmar y Asentar en la Sala
                </>
              )}
            </button>
          )}
        </div>

        {/* Modal: Gemini API Key Setup */}
        {showKeyModal && (
          <div className="modal-backdrop" onClick={() => setShowKeyModal(false)} style={{ zIndex: 1200 }}>
            <div className="modal-container animate-toast-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div className="modal-icon-badge">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Motor de IA Multimodal</h3>
                    <p className="text-xs text-secondary">Google Gemini 2.0 / 1.5 Flash</p>
                  </div>
                </div>
                <button className="modal-close-btn" onClick={() => setShowKeyModal(false)}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveKey} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                <p className="text-sm text-secondary" style={{ lineHeight: '1.5' }}>
                  Al activar Google Gemini, un Agente de Visión leerá tus facturas directamente como si fuera una persona, identificando nombres exactos de platos, cantidades y evitando errores de cálculo.
                </p>

                {hasServerKey && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    fontSize: '0.82rem',
                    color: 'var(--accent-mint)'
                  }}>
                    <Check size={16} />
                    <span>
                      <strong>¡Clave de Servidor Activa!</strong> Ya tienes configurada la clave en Render. Todas las facturas se procesan con IA de forma automática. Solo ingresa una clave aquí si deseas sobreescribirla con una cuenta personal distinta.
                    </span>
                  </div>
                )}

                <div>
                  <label className="input-label">Clave de API de Gemini (Google AI Studio)</label>
                  <div className="input-with-addons">
                    <input
                      type={showKeyText ? 'text' : 'password'}
                      className="form-input"
                      value={tempKey}
                      onChange={e => setTempKey(e.target.value)}
                      placeholder="AIzaSy..."
                      style={{ paddingRight: '2.5rem', fontFamily: 'monospace', fontSize: '0.88rem' }}
                    />
                    <button
                      type="button"
                      className="btn-icon-subtle"
                      onClick={() => setShowKeyText(!showKeyText)}
                      style={{ position: 'absolute', right: '6px', width: '30px', height: '30px', border: 'none' }}
                      title={showKeyText ? 'Ocultar' : 'Mostrar'}
                    >
                      {showKeyText ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <span className="text-subtle" style={{ fontSize: '0.75rem', marginTop: '0.4rem', display: 'block' }}>
                    Se almacena de forma segura en tu navegador y se usa únicamente para procesar facturas.
                  </span>
                </div>

                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.82rem',
                    color: 'var(--brand-primary)',
                    textDecoration: 'none',
                    fontWeight: 600
                  }}
                >
                  <ExternalLink size={13} /> Obtener API Key gratuita en Google AI Studio (30 segundos)
                </a>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowKeyModal(false)}
                    style={{ flex: 1 }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    style={{ flex: 1 }}
                  >
                    Guardar y Activar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
