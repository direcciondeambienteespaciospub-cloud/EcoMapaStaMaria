import React from 'react';

interface EcoLogoProps {
  className?: string;
}

export const EcoLogo: React.FC<EcoLogoProps> = ({className = 'w-9 h-9'}) => {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="16" fill="#1B5E20" />
      {/* Cerros de los Valles Calchaquíes / Santa María */}
      <path
        d="M6 48 L21 29 L31 41 L41 26 L58 48 Z"
        fill="#2E7D32"
      />
      <path
        d="M6 48 L21 29 L27 36.5 L19.5 48 Z"
        fill="#66BB6A"
        opacity="0.45"
      />
      {/* Pin de ubicación */}
      <path
        d="M32 10 C23.7 10 17 16.7 17 25 C17 36.2 32 52 32 52 C32 52 47 36.2 47 25 C47 16.7 40.3 10 32 10 Z"
        fill="#F1F8E9"
      />
      {/* Hoja ecológica integrada */}
      <path
        d="M32 16.5 C27 19.2 25.2 24.4 27.3 29.4 C29.1 33.6 34.9 34.1 38 30.7 C40.6 27.8 39.8 21 32 16.5 Z"
        fill="#1B5E20"
      />
      <path
        d="M32 18.8 L32 34.5"
        stroke="#F1F8E9"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M32 25.5 L35.4 22.6"
        stroke="#F1F8E9"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M32 28.6 L28.8 25.8"
        stroke="#F1F8E9"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
};
