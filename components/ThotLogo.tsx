export default function ThotLogo({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="thotGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#d4af37" />
          <stop offset="50%" stopColor="#f4d03f" />
          <stop offset="100%" stopColor="#d4af37" />
        </linearGradient>
        <linearGradient id="thotShadow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b6914" />
          <stop offset="100%" stopColor="#d4af37" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Bec de l'ibis - plus détaillé */}
      <path
        d="M 28 52 Q 18 47 12 40 Q 8 35 10 28 Q 12 22 18 26 Q 24 30 28 36 L 32 42 Z"
        fill="url(#thotGradient)"
        stroke="#8b6914"
        strokeWidth="1.5"
        filter="url(#glow)"
      />
      
      {/* Tête de l'ibis */}
      <ellipse
        cx="50"
        cy="45"
        rx="20"
        ry="22"
        fill="url(#thotGradient)"
        stroke="#8b6914"
        strokeWidth="2"
        filter="url(#glow)"
      />
      
      {/* Contour de la tête */}
      <ellipse
        cx="50"
        cy="45"
        rx="18"
        ry="20"
        fill="none"
        stroke="#f4d03f"
        strokeWidth="1"
        opacity="0.5"
      />
      
      {/* Œil */}
      <circle
        cx="56"
        cy="42"
        r="5"
        fill="#1a1a1a"
      />
      <circle
        cx="57"
        cy="41"
        r="2"
        fill="#ffffff"
      />
      <circle
        cx="57.5"
        cy="40.5"
        r="0.8"
        fill="#1a1a1a"
      />
      
      {/* Couronne/Atef stylisée */}
      <path
        d="M 42 28 Q 50 20 58 28 Q 55 24 50 18 Q 45 24 42 28"
        fill="url(#thotShadow)"
        stroke="#8b6914"
        strokeWidth="1.5"
        filter="url(#glow)"
      />
      <circle
        cx="50"
        cy="16"
        r="4"
        fill="#d4af37"
        filter="url(#glow)"
      />
      <circle
        cx="50"
        cy="16"
        r="2"
        fill="#f4d03f"
      />
      
      {/* Détails décoratifs - hiéroglyphes stylisés */}
      <path
        d="M 38 38 Q 44 40 50 38"
        stroke="#8b6914"
        strokeWidth="1.5"
        fill="none"
        opacity="0.6"
      />
      <circle cx="44" cy="50" r="1.5" fill="#d4af37" opacity="0.7" />
      <circle cx="56" cy="50" r="1.5" fill="#d4af37" opacity="0.7" />
    </svg>
  );
}

