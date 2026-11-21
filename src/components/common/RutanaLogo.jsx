import React from 'react';

// Logo de Rutana (concepto «R de ruta»: la pierna punteada es el trayecto y el
// punto coral, el destino). Va como componente y no como <img> porque el
// logotipo usa texto en Manrope 800, y un SVG dentro de <img> no puede usar las
// fuentes que carga la página (index.html).
//
//   <RutanaLogo />                      horizontal, a color (fondos claros)
//   <RutanaLogo variante="blanco" />    para fondos oscuros
//   <RutanaLogo slogan={false} />       sin "Gestión para agencias de viajes"
//   <RutanaIsotipo size={32} />         solo la R

const MARINO = '#0F2A4A';
const CORAL = '#F26B4F';

export function RutanaIsotipo({ size = 40, color = MARINO, titulo = 'Rutana', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={titulo} className={className}>
      <path d="M16 56 V 10 H 32 C 42 10 47 16.5 47 23 C 47 29.5 42 35.5 32 35.5 H 16"
        fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M28 40.5 L 41 53.5"
        fill="none" stroke={color} strokeWidth="6.4" strokeLinecap="round" strokeDasharray="0.1 6.5" />
      <circle cx="46.5" cy="57.5" r="5.6" fill={CORAL} />
    </svg>
  );
}

export default function RutanaLogo({ variante = 'color', slogan = true, alto = 48, className = '' }) {
  const principal = variante === 'blanco' ? '#FFFFFF' : MARINO;
  const secundario = variante === 'blanco' ? '#C9D3E0' : '#3B4C63';
  return (
    <div className={`inline-flex items-center ${className}`} style={{ gap: alto * 0.28 }}>
      <RutanaIsotipo size={alto} color={principal} />
      <div className="flex flex-col" style={{ lineHeight: 1 }}>
        <span style={{ fontFamily: 'Manrope, system-ui, sans-serif', fontWeight: 800, fontSize: alto * 0.72, letterSpacing: '-0.03em', color: principal }}>
          Rutana
        </span>
        {slogan && (
          <span style={{ fontFamily: 'Manrope, system-ui, sans-serif', fontWeight: 500, fontSize: Math.max(11, alto * 0.2), letterSpacing: '0.04em', color: secundario, marginTop: alto * 0.1 }}>
            Gestión para agencias de viajes
          </span>
        )}
      </div>
    </div>
  );
}
