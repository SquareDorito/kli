import React from 'react';

function pickStrokeColor(pct, thresholdPct, customColor) {
  if (customColor) return customColor;
  if (thresholdPct && pct >= thresholdPct) return 'var(--accent-coral)';
  if (pct >= 85) return 'var(--accent-coral)';
  if (pct >= 65) return 'var(--accent-amber)';
  return 'var(--accent-primary)';
}

export default function CircularTracker({
  label,
  sublabel,
  pct = 0,
  thresholdPct = null,
  color = null,
  tooltip = '',
  onClick,
}) {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
  const size = 36;
  const stroke = 3.2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  const strokeColor = pickStrokeColor(clamped, thresholdPct, color);

  // Optional threshold tick mark on the circle
  let tickPos = null;
  if (thresholdPct !== null && thresholdPct > 0 && thresholdPct < 100) {
    const angleRad = ((thresholdPct / 100) * 360 - 90) * (Math.PI / 180);
    tickPos = {
      x: size / 2 + radius * Math.cos(angleRad),
      y: size / 2 + radius * Math.sin(angleRad),
    };
  }

  return (
    <button
      type="button"
      className="tracker-card"
      title={tooltip || `${label}: ${clamped}%`}
      onClick={onClick}
    >
      <div className="tracker-ring-wrap">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--ring-track)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 0.35s ease, stroke 0.25s ease' }}
          />
          {tickPos && (
            <circle
              cx={tickPos.x}
              cy={tickPos.y}
              r={2.2}
              fill="var(--accent-amber)"
              stroke="var(--bg-topbar)"
              strokeWidth={1}
            />
          )}
        </svg>
        <span className="tracker-ring-text">{Math.round(clamped)}%</span>
      </div>
      <div className="tracker-meta">
        <span className="tracker-label">{label}</span>
        <span className="tracker-sub">{sublabel}</span>
      </div>
    </button>
  );
}
