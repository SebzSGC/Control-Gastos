import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  Receipt, Plus, Loader2, ImagePlus, Wallet, Send,
  PieChart as PieChartIcon, Trash2, ArrowUpRight,
  ArrowDownLeft, Sparkles, Search, CheckCircle2, X,
  Smartphone, ArrowRight, Layers, Activity, Users
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts';

import Navbar from '../components/Navbar';
import DigitalCard from '../components/DigitalCard';
import BillSplitterModal from '../components/BillSplitterModal';
import LiveBillClaimModal from '../components/LiveBillClaimModal';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import { API_URL, SOCKET_URL } from '../config/api';

const formatCOP = (amount) => {
  const safeAmount = Number(amount) || 0;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(safeAmount);
};

const CHART_COLORS = ['#6366f1', '#10b981', '#06b6d4', '#f59e0b', '#ec4899', '#8b5cf6'];

const QUICK_CATEGORIES = [
  { label: '🍽️ Comida', value: 'comida' },
  { label: '🏠 Arriendo', value: 'arriendo' },
  { label: '🛒 Mercado', value: 'mercado' },
  { label: '💡 Servicios', value: 'servicios' },
  { label: '🚗 Transporte', value: 'transporte' },
  { label: '🍿 Ocio', value: 'ocio' },
];

export default function Dashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { isDark } = useTheme();

  // Lazy-initialize me from localStorage
  const [me, setMe] = useState(() => {
    try {
      const saved = localStorage.getItem(`paysync_${id}_profile`);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Core Data
  const [group, setGroup] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [bills, setBills] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [slowLoad, setSlowLoad] = useState(false);

  // Live Bill Session states
  const [socket, setSocket] = useState(null);
  const [activeLiveBill, setActiveLiveBill] = useState(null);
  const [showLiveClaimModal, setShowLiveClaimModal] = useState(false);

  // Bill Splitting Modals
  const [showBillModal, setShowBillModal] = useState(false);
  const [viewingBill, setViewingBill] = useState(null);

  // Tabs: 'balances' | 'analytics' | 'history'
  const [activeTab, setActiveTab] = useState('balances');

  // Search & Filter in History
  const [searchQuery, setSearchQuery] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all'); // 'all' | 'expense' | 'transfer'

  // Add Transaction Modal
  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [txType, setTxType] = useState('expense'); // 'expense' | 'transfer'
  const [toProfileId, setToProfileId] = useState('');
  const [isSubmittingTx, setIsSubmittingTx] = useState(false);

  // OCR Upload States
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);
  const [ocrFileName, setOcrFileName] = useState('');
  const fileInputRef = useRef(null);

  // Profile Settings Modal
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileName, setProfileName] = useState(() => me?.name || '');
  const [paymentKey, setPaymentKey] = useState(() => me?.payment_key || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Payment Info (Digital Card) Modal
  const [selectedPayProfile, setSelectedPayProfile] = useState(null);

  // Delete Confirmation Modal
  const [expenseToDelete, setExpenseToDelete] = useState(null);

  const fetchSettlements = useCallback(() => {
    fetch(`${API_URL}/groups/${id}/settlement`)
      .then(res => res.json())
      .then(data => {
        setSettlements(data.settlements || []);
      })
      .catch(console.error);
  }, [id]);

  // Initial Data & WebSocket Connection
  useEffect(() => {
    if (!me) {
      toast.warning('Por favor selecciona tu participante primero');
      navigate(`/group/${id}`);
      return;
    }

    const slowTimer = setTimeout(() => setSlowLoad(true), 3000);

    // Fetch group details
    fetch(`${API_URL}/groups/${id}`)
      .then(res => {
        if (!res.ok) throw new Error('Grupo no encontrado');
        return res.json();
      })
      .then(data => {
        clearTimeout(slowTimer);
        setSlowLoad(false);
        setGroup(data.group);
        setProfiles(data.profiles || []);
        setExpenses(data.expenses || []);
        setBills(data.bills || []);
        if (data.activeBillSession && data.activeBillSession.host_profile_id !== me.id) {
          setActiveLiveBill(data.activeBillSession);
        }

        const currentMe = (data.profiles || []).find(p => p.id === me.id);
        if (currentMe) {
          setPaymentKey(currentMe.payment_key || '');
          setProfileName(currentMe.name);
        } else {
          localStorage.removeItem(`paysync_${id}_profile`);
          toast.warning('El perfil seleccionado ya no existe en la sala');
          navigate(`/group/${id}`);
        }
        setLoading(false);
      })
      .catch(err => {
        clearTimeout(slowTimer);
        setSlowLoad(false);
        console.error(err);
        toast.error('Error al cargar la información del grupo');
        navigate('/');
      });

    // Fetch settlements
    fetchSettlements();

    // WebSocket connection
    const newSocket = io(SOCKET_URL, {
      reconnectionAttempts: 5,
      timeout: 10000,
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      setSocket(newSocket);
      newSocket.emit('join_group', id);

      // Notify group peers if joined via NFC Tap-to-Join
      if (typeof window !== 'undefined' && window.location.search.includes('src=nfc')) {
        newSocket.emit('nfc_joined', { groupId: id, profileName: me.name });
      }
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    newSocket.on('peer_joined_nfc', (data) => {
      toast.success(data?.message || '¡Un compañero se unió mediante NFC! 📡');
    });

    // Real-time Live Bill Split events
    newSocket.on('bill_session_started', (data) => {
      if (data && data.hostProfileId !== me?.id) {
        setActiveLiveBill(data);
        toast.info(`🧾 Cuenta Abierta en Vivo: ${data.hostName} subió la factura de "${data.storeName}". Toca aquí para marcar tus consumos.`);
      }
    });

    const handleLiveClaimUpdate = (data) => {
      setActiveLiveBill(prev => {
        if (!prev) return prev;
        const currentClaims = prev.initialClaims || prev.assignments || {};
        const curList = currentClaims[data.itemId] || [];
        const updatedList = data.selected
          ? (curList.includes(data.profileId) ? curList : [...curList, data.profileId])
          : curList.filter(id => id !== data.profileId);
        return {
          ...prev,
          initialClaims: {
            ...currentClaims,
            [data.itemId]: updatedList
          },
          assignments: {
            ...currentClaims,
            [data.itemId]: updatedList
          }
        };
      });
    };

    newSocket.on('bill_item_claimed', handleLiveClaimUpdate);
    newSocket.on('bill_assignments_updated', handleLiveClaimUpdate);

    newSocket.on('bill_session_closed', () => {
      setActiveLiveBill(null);
      setShowLiveClaimModal(false);
    });

    newSocket.on('expense_added', (newExpense) => {
      setExpenses(prev => [newExpense, ...prev]);
      fetchSettlements();
      toast.info(`Nuevo movimiento: ${newExpense.description} (${formatCOP(newExpense.amount)})`);
    });

    newSocket.on('bill_added', (newBill) => {
      setBills(prev => [newBill, ...prev]);
      fetchSettlements();
      setActiveLiveBill(null);
      setShowLiveClaimModal(false);
      toast.success(`Nueva factura registrada: ${newBill.description} (${formatCOP(newBill.total_amount)})`);
    });

    newSocket.on('expense_deleted', ({ id: deletedId }) => {
      setExpenses(prev => prev.filter(e => e.id !== deletedId));
      fetchSettlements();
      toast.info('Movimiento eliminado');
    });

    newSocket.on('profile_added', (newProfile) => {
      setProfiles(prev => [...prev, newProfile]);
      fetchSettlements();
    });

    newSocket.on('profile_updated', (updatedProfile) => {
      setProfiles(prev => prev.map(p => (p.id === updatedProfile.id ? { ...p, ...updatedProfile } : p)));
      if (me.id === updatedProfile.id) {
        setMe(prev => ({ ...prev, ...updatedProfile }));
        localStorage.setItem(`paysync_${id}_profile`, JSON.stringify({ ...me, ...updatedProfile }));
      }
      fetchSettlements();
    });

    return () => {
      newSocket.disconnect();
      setSocket(null);
    };
  }, [id, me, navigate, toast, fetchSettlements]);

  // Calculations
  const { balances, totalSpent, fairShare, myBalance, timelineData, paymentsPieData, transfersPieData } = useMemo(() => {
    if (!profiles.length) {
      return {
        balances: [],
        totalSpent: 0,
        fairShare: 0,
        myBalance: 0,
        timelineData: [],
        paymentsPieData: [],
        transfersPieData: [],
      };
    }

    let totalSpentCalc = 0;
    let generalSpentCalc = 0;
    const totals = {};
    profiles.forEach(p => {
      totals[p.id] = { ...p, paid: 0, transferred: 0, received: 0, billDebt: 0 };
    });

    // Accumulate individual bill split debts
    (bills || []).forEach(bill => {
      (bill.splits || []).forEach(split => {
        if (totals[split.profile_id]) {
          totals[split.profile_id].billDebt += Number(split.amount) || 0;
        }
      });
    });

    const monthlyMap = {};

    expenses.forEach(ex => {
      const amt = Number(ex.amount) || 0;
      const dateObj = ex.date ? new Date(ex.date) : new Date();
      const monthLabel = dateObj.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' });

      if (ex.type === 'expense') {
        if (totals[ex.profile_id]) {
          totals[ex.profile_id].paid += amt;
        }
        generalSpentCalc += amt;
        totalSpentCalc += amt;
        monthlyMap[monthLabel] = (monthlyMap[monthLabel] || 0) + amt;
      } else if (ex.type === 'bill') {
        if (totals[ex.profile_id]) {
          totals[ex.profile_id].paid += amt;
        }
        totalSpentCalc += amt;
        monthlyMap[monthLabel] = (monthlyMap[monthLabel] || 0) + amt;
      } else if (ex.type === 'transfer') {
        if (totals[ex.profile_id]) {
          totals[ex.profile_id].transferred += amt;
        }
        if (ex.to_profile_id && totals[ex.to_profile_id]) {
          totals[ex.to_profile_id].received += amt;
        }
      }
    });

    const fairShareCalc = profiles.length > 0 ? (generalSpentCalc / profiles.length) : 0;

    const balancesCalc = profiles.map(p => {
      const t = totals[p.id] || { paid: 0, transferred: 0, received: 0, billDebt: 0 };
      const consumed = fairShareCalc + (t.billDebt || 0);
      const balance = (t.paid + t.transferred - t.received) - consumed;
      return {
        ...t,
        consumed,
        balance: Math.round(balance * 100) / 100,
      };
    }).sort((a, b) => b.balance - a.balance);

    const meObj = balancesCalc.find(b => b.id === me?.id);
    const myBalanceCalc = meObj ? meObj.balance : 0;

    // Timeline for charts
    const timelineDataCalc = Object.keys(monthlyMap).slice(-7).map(k => ({
      name: k,
      Gasto: monthlyMap[k],
    }));

    const paymentsPieDataCalc = profiles.map(p => ({
      name: p.name,
      value: totals[p.id]?.paid || 0,
    })).filter(d => d.value > 0);

    const transfersPieDataCalc = profiles.map(p => ({
      name: p.name,
      value: totals[p.id]?.transferred || 0,
    })).filter(d => d.value > 0);

    return {
      balances: balancesCalc,
      totalSpent: totalSpentCalc,
      fairShare: fairShareCalc,
      myBalance: myBalanceCalc,
      timelineData: timelineDataCalc,
      paymentsPieData: paymentsPieDataCalc,
      transfersPieData: transfersPieDataCalc,
    };
  }, [profiles, expenses, bills, me]);

  // Form Handlers
  const handleAmountChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (!digits) {
      setAmount('');
      return;
    }
    const num = parseInt(digits, 10);
    setAmount(formatCOP(num));
  };

  const handleAddExpense = async (e) => {
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
          group_id: id,
          profile_id: me.id,
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

      toast.success(txType === 'expense' ? '¡Gasto grupal guardado!' : '¡Abono registrado con éxito!');
      setShowModal(false);
      setAmount('');
      setDescription('');
      setCategory('general');
      setTxType('expense');
      setToProfileId('');
      setOcrFileName('');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Error al procesar la solicitud');
    } finally {
      setIsSubmittingTx(false);
    }
  };

  const handleDeleteExpense = async (expenseId) => {
    try {
      const res = await fetch(`${API_URL}/expenses/${expenseId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('No se pudo eliminar el movimiento');
      }
      setExpenseToDelete(null);
      toast.success('Movimiento eliminado correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al eliminar movimiento');
    }
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

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!profileName.trim()) {
      toast.warning('El nombre es obligatorio');
      return;
    }

    setIsUpdatingProfile(true);
    try {
      const res = await fetch(`${API_URL}/profiles/${me.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileName.trim(),
          payment_key: paymentKey.trim() || null,
          group_id: id,
        }),
      });

      if (!res.ok) throw new Error('Error al actualizar perfil');

      const updated = { ...me, name: profileName.trim(), payment_key: paymentKey.trim() || null };
      setMe(updated);
      localStorage.setItem(`paysync_${id}_profile`, JSON.stringify(updated));
      setShowProfileModal(false);
      toast.success('¡Tus datos de pago fueron actualizados!');
    } catch (err) {
      console.error(err);
      toast.error('No se pudo actualizar el perfil');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // Filtered History
  const filteredExpenses = useMemo(() => {
    return expenses.filter(ex => {
      const matchesSearch =
        ex.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ex.profile_name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter =
        historyFilter === 'all' || ex.type === historyFilter;
      return matchesSearch && matchesFilter;
    });
  }, [expenses, searchQuery, historyFilter]);

  if (loading || !group || !me) {
    return (
      <>
        <Navbar />
        <div className="flex-center" style={{ minHeight: '80vh', flexDirection: 'column', gap: '1rem', padding: '1.5rem', textAlign: 'center' }}>
          <div className="status-dot" style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--primary)', animation: 'ripplePulse 1.5s infinite' }} />
          <p className="text-muted" style={{ fontWeight: '600' }}>Conectando con la sala...</p>
          {slowLoad && (
            <p className="animate-fade-in" style={{ fontSize: '0.85rem', color: 'var(--accent, #06b6d4)', maxWidth: '380px', lineHeight: '1.4' }}>
              ☁️ Despertando servidor en la nube (Render Free Tier)... Esto puede tomar unos segundos la primera vez.
            </p>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar
        group={group}
        currentProfile={me}
        isConnected={isConnected}
        onSwitchProfile={() => navigate(`/group/${id}`)}
      />

      <main className="container dashboard-main-container animate-fade-in">
        
        {/* Real-time Live Bill Alert Banner */}
        {activeLiveBill && (
          <div 
            className="live-bill-alert-banner animate-fade-in"
            onClick={() => setShowLiveClaimModal(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowLiveClaimModal(true); }}
            title="Toca para marcar tus consumos en vivo"
          >
            <div className="live-bill-badge-pulse">
              <span className="live-pulse-dot"></span>
              <span>EN VIVO</span>
            </div>
            <div className="live-bill-text-wrap">
              <div className="live-bill-title">
                🧾 Cuenta Abierta en Vivo: <strong>{activeLiveBill.hostName}</strong> subió la factura de <strong>"{activeLiveBill.storeName}"</strong>. Toca aquí para marcar tus consumos.
              </div>
              <div className="live-bill-subtitle">
                Los demás integrantes están seleccionando sus platos en tiempo real.
              </div>
            </div>
            <div className="live-bill-action">
              <button 
                type="button" 
                className="btn-primary btn-sm btn-nfc-join"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowLiveClaimModal(true);
                }}
              >
                Marcar lo Mío <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Top Greeting & Action Banner */}
        <div className="dashboard-header-row">
          <div className="dashboard-greeting-block">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h1 className="dashboard-group-title">
                {group.name}
              </h1>
              <span className="navbar-code-tag" onClick={() => {
                navigator.clipboard.writeText(group.id);
                toast.success(`Código ${group.id} copiado`);
              }}>
                #{group.id}
              </span>
            </div>
            <p className="text-muted dashboard-welcome-sub" style={{ margin: '0.35rem 0 0', fontSize: '0.92rem' }}>
              Hola, <strong style={{ color: 'var(--text-main)' }}>{me.name}</strong> • Tablero de finanzas compartidas
            </p>
          </div>

          <div className="dashboard-action-buttons">
            <button
              className="btn-secondary dashboard-action-btn"
              onClick={() => setShowProfileModal(true)}
              title="Mi Llave Bre-B / Nequi"
            >
              <Smartphone size={16} /> <span>Mi Llave de Pago</span>
            </button>
            <button
              className="btn-primary btn-success-glow dashboard-action-btn"
              onClick={() => setShowBillModal(true)}
              title="Subir foto de factura y desglosar productos entre participantes"
            >
              <Receipt size={16} /> <span>Pagar con Factura</span>
            </button>
            <button
              className="btn-primary dashboard-action-btn dashboard-action-main"
              onClick={() => {
                setTxType('expense');
                setShowModal(true);
              }}
            >
              <Plus size={18} /> <span>Registrar Movimiento</span>
            </button>
          </div>
        </div>

        {/* Bento Metrics Grid */}
        <section className="bento-metrics-grid">
          {/* Card 1: Gasto Total */}
          <div className="glass-panel bento-card">
            <div className="bento-card-header">
              <span className="bento-card-title">Gasto Total del Grupo</span>
              <div className="bento-card-icon" style={{ background: 'var(--primary-glow)', color: 'var(--primary)' }}>
                <Receipt size={18} />
              </div>
            </div>
            <div className="bento-card-value num-tabular">
              {formatCOP(totalSpent)}
            </div>
            <div className="bento-card-footer">
              <span>{expenses.filter(e => e.type === 'expense').length} gastos registrados</span>
            </div>
          </div>

          {/* Card 2: Tu Balance Personal */}
          <div className={`glass-panel bento-card ${myBalance > 0 ? 'bento-balance-positive' : myBalance < 0 ? 'bento-balance-negative' : 'bento-balance-even'}`}>
            <div className="bento-card-header">
              <span className="bento-card-title">Tu Estado Personal</span>
              <div
                className="bento-card-icon"
                style={{
                  background: myBalance > 0 ? 'var(--success-bg)' : myBalance < 0 ? 'var(--danger-bg)' : 'var(--primary-glow)',
                  color: myBalance > 0 ? 'var(--success)' : myBalance < 0 ? 'var(--danger)' : 'var(--primary)',
                }}
              >
                {myBalance > 0 ? <ArrowDownLeft size={18} /> : myBalance < 0 ? <ArrowUpRight size={18} /> : <CheckCircle2 size={18} />}
              </div>
            </div>
            <div className="bento-card-value num-tabular" style={{ color: myBalance > 0 ? 'var(--success)' : myBalance < 0 ? 'var(--danger)' : 'var(--text-main)' }}>
              {myBalance === 0 ? '$ 0' : formatCOP(Math.abs(myBalance))}
            </div>
            <div className="bento-card-footer">
              <strong style={{ color: myBalance > 0 ? 'var(--success)' : myBalance < 0 ? 'var(--danger)' : 'var(--primary)' }}>
                {myBalance > 0 ? 'Te deben a favor' : myBalance < 0 ? 'Debes abonar al grupo' : '¡Estás al día, cuota saldada!'}
              </strong>
            </div>
          </div>

          {/* Card 3: Cuota Equitativa */}
          <div className="glass-panel bento-card">
            <div className="bento-card-header">
              <span className="bento-card-title">Cuota por Persona</span>
              <div className="bento-card-icon" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                <Users size={18} />
              </div>
            </div>
            <div className="bento-card-value num-tabular">
              {formatCOP(fairShare)}
            </div>
            <div className="bento-card-footer">
              <span>División entre {profiles.length} participantes</span>
            </div>
          </div>
        </section>

        {/* Navigation Tabs */}
        <div className="nav-tabs-wrapper">
          <button
            className={`nav-tab-btn ${activeTab === 'balances' ? 'active' : ''}`}
            onClick={() => setActiveTab('balances')}
          >
            <Wallet size={18} /> Saldos & Liquidación Inteligente
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <Activity size={18} /> Analíticas Visuales
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <Layers size={18} /> Historial ({expenses.length})
          </button>
        </div>

        {/* Tab 1: Balances & Smart Settlement */}
        {activeTab === 'balances' && (
          <div className="dashboard-tab-grid">
            
            {/* Left: Balances by Member */}
            <div className="glass-panel" style={{ padding: '1.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '700', margin: 0 }}>Balance de Cada Miembro</h3>
                <span className="text-subtle" style={{ fontSize: '0.8rem' }}>Base justa: {formatCOP(fairShare)}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {balances.map(b => (
                  <div key={b.id} className="expense-item balance-member-item" style={{ marginBottom: 0 }}>
                    <div className="balance-member-left">
                      <div
                        className="navbar-user-avatar"
                        style={{ width: 38, height: 38, fontSize: '1rem', flexShrink: 0 }}
                      >
                        {b.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="balance-member-text">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: '700', fontSize: '0.98rem' }}>{b.name}</span>
                          {b.id === me.id && (
                            <span style={{ fontSize: '0.7rem', background: 'var(--primary-glow)', color: 'var(--primary)', padding: '0.1rem 0.45rem', borderRadius: 'var(--radius-full)', fontWeight: '700' }}>
                              Tú
                            </span>
                          )}
                        </div>
                        <span className="text-subtle balance-member-breakdown" style={{ display: 'block', marginTop: '0.15rem' }}>
                          Aportó: {formatCOP(b.paid + b.transferred)} • Recibió: {formatCOP(b.received)}
                        </span>
                      </div>
                    </div>

                    <div className="balance-member-right">
                      <span
                        className="num-tabular balance-member-amount"
                        style={{
                          fontWeight: '800',
                          fontSize: '1.05rem',
                          color: b.balance >= 0 ? 'var(--success)' : 'var(--danger)',
                        }}
                      >
                        {b.balance >= 0 ? '+' : ''}{formatCOP(b.balance)}
                      </span>

                      {/* Payment info button */}
                      {b.id !== me.id && (
                        <button
                          className="balance-pay-key-btn"
                          onClick={() => setSelectedPayProfile(b)}
                        >
                          <Smartphone size={13} /> {b.payment_key ? 'Ver llave' : 'Sin llave'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Smart Min-Cash-Flow Settlements */}
            <div className="glass-panel" style={{ padding: '1.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Sparkles size={20} color="var(--accent)" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: '700', margin: 0 }}>Liquidación Óptima</h3>
              </div>
              <p className="text-muted" style={{ fontSize: '0.88rem', marginBottom: '1.5rem', lineHeight: '1.4' }}>
                Algoritmo inteligente para saldar todas las deudas con el menor número posible de transferencias.
              </p>

              {settlements.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
                  <CheckCircle2 size={42} color="var(--success)" style={{ margin: '0 auto 0.75rem' }} />
                  <h4 style={{ color: 'var(--text-main)', marginBottom: '0.25rem' }}>¡Cuentas al Día!</h4>
                  <p className="text-subtle">No hay deudas pendientes entre los miembros del grupo.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {settlements.map((st, index) => {
                    const toProfile = profiles.find(p => p.id === st.to);
                    const isFromMe = st.from === me.id;
                    const isToMe = st.to === me.id;

                    return (
                      <div
                        key={index}
                        className="settlement-card animate-fade-in"
                        style={{
                          borderLeft: isFromMe
                            ? '4px solid var(--danger)'
                            : isToMe
                            ? '4px solid var(--success)'
                            : '1px solid var(--border-subtle)',
                        }}
                      >
                        <div className="settlement-card-info">
                          <div className="settlement-flow">
                            <span className="settlement-person">
                              {st.from_name} {isFromMe ? '(Tú)' : ''}
                            </span>
                            <ArrowRight size={16} color="var(--text-muted)" />
                            <span className="settlement-person" style={{ color: 'var(--primary)' }}>
                              {st.to_name} {isToMe ? '(Tú)' : ''}
                            </span>
                          </div>

                          <div className="settlement-card-amount-row">
                            <span className="num-tabular settlement-amount" style={{ fontWeight: '800', fontSize: '1.15rem', color: 'var(--text-main)' }}>
                              {formatCOP(st.amount)}
                            </span>
                            {isFromMe && (
                              <span className="settlement-badge-debt">
                                Tu deuda pendiente
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Pay Creditor Button */}
                        {toProfile && (
                          <button
                            className="btn-secondary settlement-pay-btn"
                            onClick={() => setSelectedPayProfile(toProfile)}
                            title={`Ver datos de pago de ${st.to_name}`}
                          >
                            <Wallet size={14} /> Pagar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* Tab 2: Visual Analytics */}
        {activeTab === 'analytics' && (
          <div className="dashboard-tab-grid">
            
            {/* BarChart: Gastos por Fecha */}
            <div className="glass-panel" style={{ padding: '1.75rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1.25rem', color: 'var(--text-main)' }}>
                Progresión de Gastos
              </h3>
              <div style={{ width: '100%', height: 240 }}>
                {timelineData.length > 0 ? (
                  <ResponsiveContainer>
                    <BarChart data={timelineData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} vertical={false} />
                      <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
                      <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={(v) => `$${v / 1000}k`} />
                      <Tooltip
                        cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                        formatter={(val) => [formatCOP(val), 'Gasto']}
                        contentStyle={{
                          backgroundColor: isDark ? '#1e293b' : '#ffffff',
                          borderRadius: '12px',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-main)',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                        }}
                      />
                      <Bar dataKey="Gasto" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex-center" style={{ height: '100%', flexDirection: 'column', color: 'var(--text-muted)' }}>
                    <PieChartIcon size={38} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
                    <p>No hay gastos registrados todavía</p>
                  </div>
                )}
              </div>
            </div>

            {/* PieChart: Repartición de Pagos */}
            <div className="glass-panel" style={{ padding: '1.75rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1.25rem', color: 'var(--text-main)' }}>
                Repartición de Pagos Realizados
              </h3>
              <div style={{ width: '100%', height: 240 }}>
                {paymentsPieData.length > 0 ? (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={paymentsPieData}
                        innerRadius={65}
                        outerRadius={90}
                        paddingAngle={4}
                        dataKey="value"
                        stroke="none"
                      >
                        {paymentsPieData.map((_, index) => (
                          <Cell key={`pay-cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val) => [formatCOP(val), 'Pagado']}
                        contentStyle={{
                          backgroundColor: isDark ? '#1e293b' : '#ffffff',
                          borderRadius: '12px',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-main)',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex-center" style={{ height: '100%', flexDirection: 'column', color: 'var(--text-muted)' }}>
                    <PieChartIcon size={38} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
                    <p>No hay gastos base para graficar</p>
                  </div>
                )}
              </div>
            </div>

            {/* PieChart: Distribución de Abonos */}
            <div className="glass-panel" style={{ padding: '1.75rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1.25rem', color: 'var(--text-main)' }}>
                Abonos / Transferencias Efectuadas
              </h3>
              <div style={{ width: '100%', height: 240 }}>
                {transfersPieData.length > 0 ? (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={transfersPieData}
                        innerRadius={65}
                        outerRadius={90}
                        paddingAngle={4}
                        dataKey="value"
                        stroke="none"
                      >
                        {transfersPieData.map((_, index) => (
                          <Cell key={`tx-cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val) => [formatCOP(val), 'Abonado']}
                        contentStyle={{
                          backgroundColor: isDark ? '#1e293b' : '#ffffff',
                          borderRadius: '12px',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-main)',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex-center" style={{ height: '100%', flexDirection: 'column', color: 'var(--text-muted)' }}>
                    <PieChartIcon size={38} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
                    <p>No se han registrado abonos todavía</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* Tab 3: Transaction History */}
        {activeTab === 'history' && (
          <div className="glass-panel" style={{ padding: '1.75rem' }}>
            
            {/* Search & Filter Bar */}
            <div className="history-search-filter-row">
              <div className="history-search-input-wrap" style={{ position: 'relative' }}>
                <Search size={17} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  className="glass-input"
                  placeholder="Buscar por concepto o participante..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: '2.5rem', width: '100%' }}
                />
              </div>

              <div className="segmented-control history-segmented-control">
                <button
                  className={`segmented-btn ${historyFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setHistoryFilter('all')}
                >
                  Todos
                </button>
                <button
                  className={`segmented-btn ${historyFilter === 'expense' ? 'active' : ''}`}
                  onClick={() => setHistoryFilter('expense')}
                >
                  Gastos
                </button>
                <button
                  className={`segmented-btn ${historyFilter === 'transfer' ? 'active' : ''}`}
                  onClick={() => setHistoryFilter('transfer')}
                >
                  Abonos
                </button>
              </div>
            </div>

            {/* List */}
            {filteredExpenses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                <Receipt size={40} style={{ opacity: 0.35, margin: '0 auto 0.75rem' }} />
                <p>No se encontraron movimientos registrados</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {filteredExpenses.map(ex => {
                  const isTransfer = ex.type === 'transfer';
                  const isBill = ex.type === 'bill';
                  const receiver = isTransfer ? profiles.find(p => p.id === ex.to_profile_id) : null;
                  const dateObj = ex.date ? new Date(ex.date) : new Date();
                  const formattedDate = dateObj.toLocaleDateString('es-CO', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={ex.id}
                      className="expense-item history-expense-item animate-fade-in"
                      style={{
                        borderLeft: isBill 
                          ? '3.5px solid var(--accent-mint)' 
                          : isTransfer 
                          ? '3.5px solid var(--primary)' 
                          : '3.5px solid var(--accent)',
                      }}
                    >
                      <div className="history-item-main">
                        <div className={`expense-item-icon-box ${isBill ? 'bill' : isTransfer ? 'transfer' : 'expense'}`}>
                          {isBill ? <Receipt size={18} /> : isTransfer ? <Send size={18} /> : <Receipt size={18} />}
                        </div>

                        <div className="history-item-details">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                            <h4 className="history-item-title" style={{ fontWeight: '700', margin: 0, color: 'var(--text-main)' }}>
                              {ex.description}
                            </h4>
                            {isBill && (
                              <span style={{ 
                                background: 'rgba(16, 185, 129, 0.15)', 
                                color: 'var(--accent-mint)', 
                                fontSize: '0.7rem', 
                                padding: '0.1rem 0.45rem', 
                                borderRadius: '4px', 
                                fontWeight: '700' 
                              }}>
                                Factura Desglosada
                              </span>
                            )}
                          </div>
                          <span className="text-subtle history-item-meta" style={{ display: 'block', marginTop: '0.2rem' }}>
                            {isTransfer ? (
                              <>
                                <strong>{ex.profile_name}</strong> transfirió a <strong>{receiver?.name || 'Compañero'}</strong>
                              </>
                            ) : isBill ? (
                              <>
                                Cuenta pagada por <strong>{ex.profile_name}</strong>
                              </>
                            ) : (
                              <>
                                Pagado por <strong>{ex.profile_name}</strong>
                              </>
                            )}
                            {' • '}
                            <span>{formattedDate}</span>
                          </span>
                        </div>
                      </div>

                      <div className="history-item-trailing">
                        {isBill && (
                          <button
                            className="btn-secondary btn-sm history-breakdown-btn"
                            onClick={() => {
                              const found = bills.find(b => b.id === ex.bill_id || b.date === ex.date || b.payer_profile_id === ex.profile_id);
                              setViewingBill(found || {
                                description: ex.description,
                                payer_name: ex.profile_name,
                                date: ex.date,
                                total_amount: ex.amount,
                                items: [],
                                splits: []
                              });
                            }}
                            title="Ver productos y reparto de la factura"
                          >
                            Ver desglose
                          </button>
                        )}

                        <span className="num-tabular history-item-amount" style={{ fontWeight: '800', color: 'var(--text-main)' }}>
                          {formatCOP(ex.amount)}
                        </span>

                        <button
                          className="btn-danger-ghost history-delete-btn"
                          onClick={() => setExpenseToDelete(ex)}
                          title="Eliminar movimiento"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Modal: Add Transaction (Expense / Transfer) */}
        {showModal && (
          <div className="modal-backdrop" onClick={() => setShowModal(false)}>
            <div className="modal-container animate-toast-in" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 style={{ fontSize: '1.35rem', fontWeight: '700' }}>Registrar Movimiento</h3>
                <button className="modal-close-btn" onClick={() => setShowModal(false)}>
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

              {/* OCR Scanner Zone (specifically for transfers or bills) */}
              <div
                className="upload-zone"
                onClick={() => fileInputRef.current?.click()}
                style={{ marginBottom: '1.5rem' }}
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
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--primary-glow)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ImagePlus size={22} />
                    </div>
                    <span style={{ fontWeight: '600', fontSize: '0.92rem', color: 'var(--text-main)' }}>
                      {ocrFileName ? `Comprobante: ${ocrFileName}` : 'Escanear comprobante de pago'}
                    </span>
                    <span className="text-subtle">Sube captura de Nequi/Bre-B para detectar el monto</span>
                  </div>
                )}
              </div>

              <form onSubmit={handleAddExpense} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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
                      onChange={e => setToProfileId(e.target.value)}
                      required
                    >
                      <option value="">Selecciona destinatario...</option>
                      {profiles.filter(p => p.id !== me.id).map(p => (
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
                    onChange={e => setDescription(e.target.value)}
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
                      {QUICK_CATEGORIES.map(cat => (
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
                    onClick={() => setShowModal(false)}
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
        )}

        {/* Modal: Configure My Payment Key */}
        {showProfileModal && (
          <div className="modal-backdrop" onClick={() => setShowProfileModal(false)}>
            <div className="modal-container animate-toast-in" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 style={{ fontSize: '1.35rem', fontWeight: '700' }}>Mi Perfil & Llave de Pago</h3>
                <button className="modal-close-btn" onClick={() => setShowProfileModal(false)}>
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
                    onChange={e => setProfileName(e.target.value)}
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
                    onChange={e => setPaymentKey(e.target.value)}
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
                    onClick={() => setShowProfileModal(false)}
                    style={{ flex: 1 }}
                  >
                    Cerrar
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    style={{ flex: 1 }}
                    disabled={isUpdatingProfile}
                  >
                    {isUpdatingProfile ? 'Actualizando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: View Digital Payment Card */}
        {selectedPayProfile && (
          <div className="modal-backdrop" onClick={() => setSelectedPayProfile(null)}>
            <div className="modal-container animate-toast-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px', padding: '2rem 1.5rem' }}>
              <div className="modal-header" style={{ marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '700' }}>Datos para Transferir</h3>
                <button className="modal-close-btn" onClick={() => setSelectedPayProfile(null)}>
                  <X size={20} />
                </button>
              </div>

              <DigitalCard
                profile={selectedPayProfile}
                onClose={() => setSelectedPayProfile(null)}
              />
            </div>
          </div>
        )}

        {/* Modal: Confirm Delete */}
        {expenseToDelete && (
          <div className="modal-backdrop" onClick={() => setExpenseToDelete(null)}>
            <div className="modal-container animate-toast-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
              <div className="modal-header">
                <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--danger)' }}>¿Eliminar Movimiento?</h3>
                <button className="modal-close-btn" onClick={() => setExpenseToDelete(null)}>
                  <X size={20} />
                </button>
              </div>

              <p className="text-muted" style={{ marginBottom: '1.5rem', lineHeight: '1.5' }}>
                ¿Estás seguro de que deseas eliminar <strong>"{expenseToDelete.description}"</strong> por valor de <strong>{formatCOP(expenseToDelete.amount)}</strong>? Los balances se recalcularán automáticamente.
              </p>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setExpenseToDelete(null)}
                  style={{ flex: 1 }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ flex: 1, background: 'var(--danger)', boxShadow: '0 4px 15px var(--danger-glow)' }}
                  onClick={() => handleDeleteExpense(expenseToDelete.id)}
                >
                  Sí, Eliminar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Bill Splitter (Pago total mediante factura) */}
        {showBillModal && (
          <BillSplitterModal
            groupId={id}
            profiles={profiles}
            currentProfile={me}
            socket={socket}
            onClose={() => setShowBillModal(false)}
            onSuccess={(newBill) => {
              setBills(prev => [newBill, ...prev]);
              fetchSettlements();
            }}
          />
        )}

        {/* Modal: Live Bill Real-time Dish Claiming */}
        <LiveBillClaimModal
          key={activeLiveBill?.sessionId || 'live-claim-modal'}
          isOpen={showLiveClaimModal}
          onClose={() => setShowLiveClaimModal(false)}
          liveBill={activeLiveBill}
          currentProfile={me}
          profiles={profiles}
          socket={socket}
        />

        {/* Modal: View Itemized Bill Details */}
        {viewingBill && (
          <div className="modal-backdrop" onClick={() => setViewingBill(null)}>
            <div className="modal-container modal-wide animate-scale-up" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-header-title-wrap">
                  <div className="modal-icon-badge">
                    <Receipt size={22} />
                  </div>
                  <div>
                    <h3 className="modal-title">{viewingBill.description || 'Factura Desglosada'}</h3>
                    <p className="modal-subtitle">
                      Pagada por <strong>{viewingBill.payer_name || viewingBill.profile_name || 'Alguien'}</strong>
                      {viewingBill.date && ` • ${new Date(viewingBill.date).toLocaleDateString('es-CO', { dateStyle: 'medium' })}`}
                    </p>
                  </div>
                </div>
                <button className="btn-icon-subtle" onClick={() => setViewingBill(null)} aria-label="Cerrar">
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body-scrollable">
                {/* Items List */}
                <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '700' }}>Productos en la Factura</h4>
                {Array.isArray(viewingBill.items) && viewingBill.items.length > 0 ? (
                  <div className="bill-items-table-wrap">
                    <table className="bill-items-table">
                      <thead>
                        <tr>
                          <th>Producto / Concepto</th>
                          <th style={{ textAlign: 'center' }}>Cant.</th>
                          <th style={{ textAlign: 'right' }}>Vr. Unitario</th>
                          <th style={{ textAlign: 'right' }}>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewingBill.items.map((it, idx) => (
                          <tr key={it.id || idx}>
                            <td style={{ fontWeight: 600 }}>{it.name}</td>
                            <td style={{ textAlign: 'center' }}>{it.quantity}x</td>
                            <td style={{ textAlign: 'right' }}>{formatCOP(it.unit_price || it.unitPrice)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCOP(it.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-secondary" style={{ fontStyle: 'italic', marginBottom: '1.5rem' }}>
                    Esta factura fue registrada con un desglose consolidado.
                  </p>
                )}

                {/* Charges summary */}
                <div className="bill-total-summary-card" style={{ marginBottom: '1.5rem' }}>
                  <div className="summary-item">
                    <span className="summary-label">Subtotal Productos:</span>
                    <span className="summary-val">{formatCOP(viewingBill.subtotal || viewingBill.total_amount)}</span>
                  </div>
                  {((viewingBill.tip || 0) > 0 || (viewingBill.tax || 0) > 0) && (
                    <div className="summary-item">
                      <span className="summary-label">Propina / Impuestos:</span>
                      <span className="summary-val">+{formatCOP((viewingBill.tip || 0) + (viewingBill.tax || 0))}</span>
                    </div>
                  )}
                  <div className="summary-item total-highlight">
                    <span className="summary-label">Total de la Factura:</span>
                    <span className="summary-val">{formatCOP(viewingBill.total_amount || viewingBill.amount)}</span>
                  </div>
                </div>

                {/* Participant Splits */}
                <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '700' }}>Reparto por Participante</h4>
                {Array.isArray(viewingBill.splits) && viewingBill.splits.length > 0 ? (
                  <div className="participants-summary-grid">
                    {viewingBill.splits.map((sp, idx) => (
                      <div key={sp.id || idx} className="participant-summary-card active-share">
                        <div className="participant-card-head">
                          <div className="avatar-chip">
                            {(sp.profile_name || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div style={{ flex: 1 }}>
                            <h4 className="participant-card-name" style={{ fontSize: '0.95rem' }}>
                              {sp.profile_name}
                            </h4>
                            {sp.items_summary && (
                              <p className="text-xs text-secondary" style={{ margin: '0.2rem 0 0 0' }}>
                                {sp.items_summary}
                              </p>
                            )}
                          </div>
                          <div className="participant-total-amount" style={{ fontSize: '1.1rem' }}>
                            {formatCOP(sp.amount)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-secondary" style={{ fontStyle: 'italic' }}>
                    Dividido equitativamente entre los participantes de la sala.
                  </p>
                )}
              </div>

              <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
                <button className="btn-primary" onClick={() => setViewingBill(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </>
  );
}
