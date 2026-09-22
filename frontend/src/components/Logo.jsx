export default function Logo({ size = 'md', showText = true, className = '' }) {
  const iconSizes = {
    sm: 24,
    md: 32,
    lg: 44
  };

  const currentSize = iconSizes[size] || iconSizes.md;

  return (
    <div className={`brand-logo-wrap ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem' }}>
      <svg
        width={currentSize}
        height={currentSize}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="brand-logo-icon"
      >
        <defs>
          <linearGradient id="psGrad1" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
          <linearGradient id="psGrad2" x1="8" y1="24" x2="40" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#06B6D4" />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
          <filter id="logoGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#6366F1" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* Back ring / node */}
        <circle cx="18" cy="24" r="13" stroke="url(#psGrad1)" strokeWidth="4.5" strokeLinecap="round" strokeDasharray="60 20" filter="url(#logoGlow)" />
        {/* Front ring / node */}
        <circle cx="30" cy="24" r="13" stroke="url(#psGrad2)" strokeWidth="4.5" strokeLinecap="round" strokeDasharray="60 20" />
        {/* Dynamic synchronization pulses */}
        <circle cx="18" cy="24" r="3.5" fill="#6366F1" />
        <circle cx="30" cy="24" r="3.5" fill="#10B981" />
      </svg>

      {showText && (
        <span className={`brand-title brand-title-${size}`}>
          <span className="brand-highlight">Pay</span>Sync
          <span className="brand-badge-pro">PRO</span>
        </span>
      )}
    </div>
  );
}
