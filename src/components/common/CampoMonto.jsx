import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Campo de cantidad con máscara: al escribir 3198 se ve "3,198" y al salir del
// campo "3,198.00". Hacia el formulario siempre entrega el número sin comas
// ("3198" / "3198.5") para que los cálculos y la API no cambien.
//   valor: número o texto sin formato · onCambio(texto sin comas)
//   min / max: se validan con el mensaje nativo del formulario.

const miles = (entero) => entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// Deja solo dígitos y un punto con máximo 2 decimales.
export function limpiar(texto) {
  const s = String(texto ?? '').replace(/[^\d.]/g, '');
  const [entero, ...resto] = s.split('.');
  const enteroLimpio = entero.replace(/^0+(?=\d)/, '');
  return resto.length ? `${enteroLimpio || '0'}.${resto.join('').slice(0, 2)}` : enteroLimpio;
}

// Mientras se escribe: comas en los miles, decimales tal cual se van tecleando.
export function alEscribir(crudo) {
  if (crudo === '') return '';
  const [entero, decimales] = crudo.split('.');
  return decimales === undefined ? miles(entero) : `${miles(entero || '0')}.${decimales}`;
}

// Al salir del campo: siempre con 2 decimales.
export function completo(crudo) {
  if (crudo === '' || Number.isNaN(Number(crudo))) return '';
  const [entero, decimales] = Number(crudo).toFixed(2).split('.');
  return `${miles(entero)}.${decimales}`;
}

export default function CampoMonto({ valor, onCambio, min, max, required = false, disabled = false, className = '', placeholder = '0.00' }) {
  const crudo = limpiar(valor === 0 && !required ? '' : valor);
  const [enFoco, setEnFoco] = useState(false);
  const ref = useRef(null);
  const cursor = useRef(null);

  const texto = enFoco ? alEscribir(crudo) : completo(crudo);

  // Validación de rango con el mensaje nativo (min/max no aplican a type="text").
  useEffect(() => {
    const n = Number(crudo);
    let mensaje = '';
    if (crudo !== '' && min !== undefined && n < Number(min)) mensaje = `El monto debe ser de al menos ${completo(String(min))}.`;
    else if (crudo !== '' && max !== undefined && n > Number(max)) mensaje = `El monto no puede ser mayor a ${completo(String(max))}.`;
    ref.current?.setCustomValidity(mensaje);
  }, [crudo, min, max]);

  // Al reformatear (se agregan o quitan comas) el cursor se queda junto al mismo dígito.
  useLayoutEffect(() => {
    if (cursor.current === null || !ref.current) return;
    let vistos = 0;
    let pos = texto.length;
    for (let i = 0; i < texto.length; i++) {
      if (vistos === cursor.current) { pos = i; break; }
      if (/[\d.]/.test(texto[i])) vistos++;
    }
    ref.current.setSelectionRange(pos, pos);
    cursor.current = null;
  }, [texto]);

  const cambiar = (e) => {
    const { value, selectionStart } = e.target;
    cursor.current = value.slice(0, selectionStart).replace(/[^\d.]/g, '').length;
    onCambio(limpiar(value));
  };

  return (
    <input ref={ref} type="text" inputMode="decimal" autoComplete="off" required={required} disabled={disabled}
      placeholder={placeholder} className={`text-right tabular-nums ${className}`}
      value={texto} onChange={cambiar} onFocus={() => setEnFoco(true)} onBlur={() => setEnFoco(false)} />
  );
}
