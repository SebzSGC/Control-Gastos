import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

import Navbar from '../components/Navbar';
import BillSplitterModal from '../components/BillSplitterModal';
import LiveBillClaimModal from '../components/LiveBillClaimModal';
import {
  ActiveSessionsBanner,
  DashboardHeader,
  DashboardSummaryCards,
  SettlementCard,
  SpendingAnalytics,
  ExpensesList,
  AddTransactionModal,
  ProfileKeyModal,
  BillDetailsModal,
  DeleteExpenseModal,
  PaymentInfoModal,
} from '../components/dashboard';

import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import { API_URL, SOCKET_URL } from '../config/api';
import { formatCOP } from '../utils/formatters';

/**
 * Dashboard
 * Main orchestrator page for shared group finances:
 * - Real-time Socket.io synchronization (expenses, bills, live claim sessions)
 * - Bento metrics overview & smart min-cash-flow settlements
 * - Visual spending analytics with Recharts
 * - Paginated & filterable transactions history
 */
export default function Dashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { isDark } = useTheme();

  // Lazy-initialize current user profile from localStorage
  const [me, setMe] = useState(() => {
    try {
      const saved = localStorage.getItem(`paysync_${id}_profile`);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Core Group Data
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

  // Navigation Tabs: 'balances' | 'analytics' | 'history'
  const [activeTab, setActiveTab] = useState('balances');

  // Modals visibility & selection state
  const [showModal, setShowModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedPayProfile, setSelectedPayProfile] = useState(null);
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [isDeletingExpense, setIsDeletingExpense] = useState(false);

  const fetchSettlements = useCallback(() => {
    fetch(`${API_URL}/groups/${id}/settlement`)
      .then((res) => res.json())
      .then((data) => {
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
      .then((res) => {
        if (!res.ok) throw new Error('Grupo no encontrado');
        return res.json();
      })
      .then((data) => {
        clearTimeout(slowTimer);
        setSlowLoad(false);
        setGroup(data.group);
        setProfiles(data.profiles || []);
        setExpenses(data.expenses || []);
        setBills(data.bills || []);
        if (data.activeBillSession && data.activeBillSession.host_profile_id !== me.id) {
          setActiveLiveBill(data.activeBillSession);
        }

        const currentMe = (data.profiles || []).find((p) => p.id === me.id);
        if (!currentMe) {
          localStorage.removeItem(`paysync_${id}_profile`);
          toast.warning('El perfil seleccionado ya no existe en la sala');
          navigate(`/group/${id}`);
        }
        setLoading(false);
      })
      .catch((err) => {
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
        toast.info(
          `🧾 Cuenta Abierta en Vivo: ${data.hostName} subió la factura de "${data.storeName}". Toca aquí para marcar tus consumos.`
        );
      }
    });

    const handleLiveClaimUpdate = (data) => {
      setActiveLiveBill((prev) => {
        if (!prev) return prev;
        const currentClaims = prev.initialClaims || prev.assignments || {};
        const curList = currentClaims[data.itemId] || [];
        const updatedList = data.selected
          ? curList.includes(data.profileId)
            ? curList
            : [...curList, data.profileId]
          : curList.filter((profileId) => profileId !== data.profileId);
        return {
          ...prev,
          initialClaims: {
            ...currentClaims,
            [data.itemId]: updatedList,
          },
          assignments: {
            ...currentClaims,
            [data.itemId]: updatedList,
          },
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
      setExpenses((prev) => [newExpense, ...prev]);
      fetchSettlements();
      toast.info(`Nuevo movimiento: ${newExpense.description} (${formatCOP(newExpense.amount)})`);
    });

    newSocket.on('bill_added', (newBill) => {
      setBills((prev) => [newBill, ...prev]);
      fetchSettlements();
      setActiveLiveBill(null);
      setShowLiveClaimModal(false);
      toast.success(
        `Nueva factura registrada: ${newBill.description} (${formatCOP(newBill.total_amount)})`
      );
    });

    newSocket.on('expense_deleted', ({ id: deletedId }) => {
      setExpenses((prev) => prev.filter((e) => e.id !== deletedId));
      fetchSettlements();
      toast.info('Movimiento eliminado');
    });

    newSocket.on('profile_added', (newProfile) => {
      setProfiles((prev) => [...prev, newProfile]);
      fetchSettlements();
    });

    newSocket.on('profile_updated', (updatedProfile) => {
      setProfiles((prev) =>
        prev.map((p) => (p.id === updatedProfile.id ? { ...p, ...updatedProfile } : p))
      );
      if (me.id === updatedProfile.id) {
        setMe((prev) => ({ ...prev, ...updatedProfile }));
        localStorage.setItem(
          `paysync_${id}_profile`,
          JSON.stringify({ ...me, ...updatedProfile })
        );
      }
      fetchSettlements();
    });

    return () => {
      newSocket.disconnect();
      setSocket(null);
    };
  }, [id, me, navigate, toast, fetchSettlements]);

  // Balance & Financial Calculations
  const {
    balances,
    totalSpent,
    fairShare,
    myBalance,
    timelineData,
    paymentsPieData,
    transfersPieData,
  } = useMemo(() => {
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
    profiles.forEach((p) => {
      totals[p.id] = { ...p, paid: 0, transferred: 0, received: 0, billDebt: 0 };
    });

    // Accumulate individual bill split debts
    (bills || []).forEach((bill) => {
      (bill.splits || []).forEach((split) => {
        if (totals[split.profile_id]) {
          totals[split.profile_id].billDebt += Number(split.amount) || 0;
        }
      });
    });

    const monthlyMap = {};

    expenses.forEach((ex) => {
      const amt = Number(ex.amount) || 0;
      const dateObj = ex.date ? new Date(ex.date) : new Date();
      const monthLabel = dateObj.toLocaleDateString('es-CO', {
        month: 'short',
        day: 'numeric',
      });

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

    const fairShareCalc = profiles.length > 0 ? generalSpentCalc / profiles.length : 0;

    const balancesCalc = profiles
      .map((p) => {
        const t = totals[p.id] || { paid: 0, transferred: 0, received: 0, billDebt: 0 };
        const consumed = fairShareCalc + (t.billDebt || 0);
        const balance = t.paid + t.transferred - t.received - consumed;
        return {
          ...t,
          consumed,
          balance: Math.round(balance * 100) / 100,
        };
      })
      .sort((a, b) => b.balance - a.balance);

    const meObj = balancesCalc.find((b) => b.id === me?.id);
    const myBalanceCalc = meObj ? meObj.balance : 0;

    // Timeline for charts
    const timelineDataCalc = Object.keys(monthlyMap)
      .slice(-7)
      .map((k) => ({
        name: k,
        Gasto: monthlyMap[k],
      }));

    const paymentsPieDataCalc = profiles
      .map((p) => ({
        name: p.name,
        value: totals[p.id]?.paid || 0,
      }))
      .filter((d) => d.value > 0);

    const transfersPieDataCalc = profiles
      .map((p) => ({
        name: p.name,
        value: totals[p.id]?.transferred || 0,
      }))
      .filter((d) => d.value > 0);

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

  // Handlers
  const handleDeleteExpense = async (expenseId) => {
    setIsDeletingExpense(true);
    try {
      const res = await fetch(`${API_URL}/expenses/${expenseId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('No se pudo eliminar el movimiento');
      }
      setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
      fetchSettlements();
      setExpenseToDelete(null);
      toast.success('Movimiento eliminado correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al eliminar movimiento');
    } finally {
      setIsDeletingExpense(false);
    }
  };

  const handleProfileUpdated = (updated) => {
    setMe(updated);
    localStorage.setItem(`paysync_${id}_profile`, JSON.stringify(updated));
    setProfiles((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
    fetchSettlements();
  };

  // Loading Screen
  if (loading || !group || !me) {
    return (
      <>
        <Navbar />
        <div
          className="flex-center"
          style={{
            minHeight: '80vh',
            flexDirection: 'column',
            gap: '1rem',
            padding: '1.5rem',
            textAlign: 'center',
          }}
        >
          <div
            className="status-dot"
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: 'var(--primary)',
              animation: 'ripplePulse 1.5s infinite',
            }}
          />
          <p className="text-muted" style={{ fontWeight: '600' }}>
            Conectando con la sala...
          </p>
          {slowLoad && (
            <p
              className="animate-fade-in"
              style={{
                fontSize: '0.85rem',
                color: 'var(--accent, #06b6d4)',
                maxWidth: '380px',
                lineHeight: '1.4',
              }}
            >
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
        <ActiveSessionsBanner
          activeLiveBill={activeLiveBill}
          onOpenClaimModal={() => setShowLiveClaimModal(true)}
        />

        {/* Top Greeting & Action Header */}
        <DashboardHeader
          group={group}
          currentProfile={me}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          expensesCount={expenses.length}
          onOpenProfileModal={() => setShowProfileModal(true)}
          onOpenBillModal={() => setShowBillModal(true)}
          onOpenAddExpenseModal={() => setShowModal(true)}
        />

        {/* Bento Metrics Grid */}
        <DashboardSummaryCards
          totalSpent={totalSpent}
          myBalance={myBalance}
          fairShare={fairShare}
          registeredExpensesCount={expenses.filter((e) => e.type === 'expense').length}
          profilesCount={profiles.length}
        />

        {/* Tab 1: Balances & Smart Settlement */}
        {activeTab === 'balances' && (
          <SettlementCard
            balances={balances}
            settlements={settlements}
            profiles={profiles}
            me={me}
            fairShare={fairShare}
            onSelectPayProfile={setSelectedPayProfile}
          />
        )}

        {/* Tab 2: Visual Analytics */}
        {activeTab === 'analytics' && (
          <SpendingAnalytics
            timelineData={timelineData}
            paymentsPieData={paymentsPieData}
            transfersPieData={transfersPieData}
            isDark={isDark}
          />
        )}

        {/* Tab 3: Transaction History */}
        {activeTab === 'history' && (
          <ExpensesList
            expenses={expenses}
            profiles={profiles}
            bills={bills}
            onViewBill={setViewingBill}
            onDeleteExpense={setExpenseToDelete}
          />
        )}

        {/* Modal: Add Transaction (Expense / Transfer) */}
        <AddTransactionModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          groupId={id}
          currentProfile={me}
          profiles={profiles}
          onSuccess={() => fetchSettlements()}
        />

        {/* Modal: Profile & Payment Key */}
        <ProfileKeyModal
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          groupId={id}
          currentProfile={me}
          onProfileUpdated={handleProfileUpdated}
        />

        {/* Modal: View Digital Payment Card */}
        <PaymentInfoModal
          profile={selectedPayProfile}
          onClose={() => setSelectedPayProfile(null)}
        />

        {/* Modal: Confirm Delete Expense */}
        <DeleteExpenseModal
          expense={expenseToDelete}
          onClose={() => setExpenseToDelete(null)}
          onConfirm={handleDeleteExpense}
          isDeleting={isDeletingExpense}
        />

        {/* Modal: Bill Splitter (Pago total mediante factura) */}
        {showBillModal && (
          <BillSplitterModal
            groupId={id}
            profiles={profiles}
            currentProfile={me}
            socket={socket}
            onClose={() => setShowBillModal(false)}
            onSuccess={(newBill) => {
              setBills((prev) => [newBill, ...prev]);
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
        <BillDetailsModal
          bill={viewingBill}
          onClose={() => setViewingBill(null)}
        />
      </main>
    </>
  );
}
