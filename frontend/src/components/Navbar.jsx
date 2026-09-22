import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, Copy, Check, ArrowLeft, Radio } from 'lucide-react';
import Logo from './Logo';
import NFCShareModal from './NFCShareModal';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';

export default function Navbar({ 
  group = null, 
  me = null, 
  currentProfile = null,
  onOpenProfile = null, 
  onSwitchProfile = null,
  showBackButton = false, 
  onBack = null,
  socketConnected = true,
  isConnected = true
}) {
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [showNFCModal, setShowNFCModal] = useState(false);

  const activeProfile = me || currentProfile;
  const isLive = socketConnected !== false && isConnected !== false;
  const handleProfileClick = onOpenProfile || onSwitchProfile;

  const handleCopyCode = () => {
    if (!group?.id) return;
    navigator.clipboard.writeText(group.id);
    setCopied(true);
    showToast(`Código de sala "${group.id}" copiado al portapapeles`, 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <header className="navbar-root">
        <div className="navbar-container">
          <div className="navbar-left">
            {showBackButton && (
              <button 
                className="btn-icon-subtle" 
                onClick={onBack || (() => navigate(-1))} 
                title="Volver"
              >
                <ArrowLeft size={18} />
              </button>
            )}

            <div 
              className="navbar-brand-clickable" 
              onClick={() => navigate('/')} 
              title="Ir al inicio"
            >
              <Logo size="sm" />
            </div>

            {group && (
              <div className="navbar-group-info">
                <span className="navbar-group-separator">/</span>
                <span className="navbar-group-title" title={group.name}>{group.name}</span>
                <span className={`status-pill ${isLive ? 'status-online' : 'status-offline'}`}>
                  <span className="status-dot"></span>
                  <span className="status-label">{isLive ? 'En vivo' : 'Reconectando'}</span>
                </span>
              </div>
            )}
          </div>

          <div className="navbar-right">
            {group && (
              <>
                <button 
                  className="room-code-badge" 
                  onClick={handleCopyCode} 
                  title="Haz clic para copiar el código de sala"
                >
                  <span className="room-code-label">SALA</span>
                  <span className="room-code-value">{group.id}</span>
                  {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                </button>

                <button 
                  className="theme-toggle-btn" 
                  onClick={() => setShowNFCModal(true)} 
                  title="Compartir sala por NFC (Tap-to-Join)"
                  style={{ color: '#06b6d4' }}
                >
                  <Radio size={17} />
                </button>
              </>
            )}

            {activeProfile && (
              <button 
                className="user-pill-btn" 
                onClick={handleProfileClick || undefined} 
                title={handleProfileClick ? "Cambiar o ver participante" : ""}
              >
                <div className="avatar-chip">
                  {activeProfile.name.charAt(0).toUpperCase()}
                </div>
                <span className="user-pill-name">{activeProfile.name}</span>
              </button>
            )}

            <button 
              className="theme-toggle-btn" 
              onClick={toggleTheme} 
              title={`Cambiar a modo ${theme === 'dark' ? 'claro' : 'oscuro'}`}
              aria-label="Alternar tema"
            >
              {theme === 'dark' ? (
                <Sun size={18} className="theme-icon sun-icon animate-spin-gentle" />
              ) : (
                <Moon size={18} className="theme-icon moon-icon animate-spin-gentle" />
              )}
            </button>
          </div>
        </div>
      </header>

      <NFCShareModal 
        isOpen={showNFCModal} 
        onClose={() => setShowNFCModal(false)} 
        group={group} 
      />
    </>
  );
}
