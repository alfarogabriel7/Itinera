import React from 'react';
import { Check, X } from 'lucide-react';

// Políticas obligatorias: las mismas que valida el backend (database/models/Agente.js).
const POLITICAS = [
  { id: 'largo', texto: 'Mínimo 8 caracteres', cumple: (p) => p.length >= 8 },
  { id: 'mayuscula', texto: 'Una letra mayúscula', cumple: (p) => /[A-Z]/.test(p) },
  { id: 'numero', texto: 'Un número', cumple: (p) => /\d/.test(p) },
  { id: 'especial', texto: 'Un carácter especial (p.ej. # $ ! .)', cumple: (p) => /[^A-Za-z0-9]/.test(p) },
];

// Patrones que hacen predecible una contraseña aunque cumpla las políticas.
const PATRONES_DEBILES = [
  /(.)\1\1/, // el mismo carácter 3 veces seguidas: "aaa", "111"
  /(012|123|234|345|456|567|678|789|890)/,
  /(abc|bcd|cde|def|qwe|wer|asd|sdf|zxc)/i,
  /(password|contrase|admin|qwerty|itinera|viaje|agencia|12345)/i,
];

const NIVELES = [
  { etiqueta: 'Muy débil', color: 'bg-red-500', texto: 'text-red-600' },
  { etiqueta: 'Débil', color: 'bg-orange-500', texto: 'text-orange-600' },
  { etiqueta: 'Aceptable', color: 'bg-amber-400', texto: 'text-amber-600' },
  { etiqueta: 'Fuerte', color: 'bg-emerald-500', texto: 'text-emerald-600' },
  { etiqueta: 'Muy fuerte', color: 'bg-emerald-600', texto: 'text-emerald-700' },
];

// Nivel 0-4. Sin cumplir las políticas nunca pasa de "Débil"; cumpliéndolas
// parte de "Aceptable" y sube con la longitud, baja con patrones obvios o si
// incluye el nombre o usuario de la persona.
export function evaluarPassword(password, datosPersonales = []) {
  const cumplidas = POLITICAS.filter((p) => p.cumple(password)).length;
  if (cumplidas < POLITICAS.length) return cumplidas >= 2 ? 1 : 0;

  let nivel = 2;
  if (password.length >= 12) nivel++;
  if (password.length >= 16) nivel++;
  if (/[a-z]/.test(password) && new Set(password).size >= password.length * 0.7) nivel += 0.5;

  const minuscula = password.toLowerCase();
  if (PATRONES_DEBILES.some((re) => re.test(password))) nivel--;
  const partes = datosPersonales
    .flatMap((d) => String(d || '').toLowerCase().split(/[\s._-]+/))
    .filter((p) => p.length >= 3);
  if (partes.some((p) => minuscula.includes(p))) nivel--;

  return Math.max(1, Math.min(4, Math.floor(nivel)));
}

export default function IndicadorPassword({ password, datosPersonales = [] }) {
  if (!password) return null;
  const nivel = evaluarPassword(password, datosPersonales);
  const { etiqueta, color, texto } = NIVELES[nivel];

  return (
    <div className="mt-2 space-y-2" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" role="meter" aria-valuemin={0} aria-valuemax={4} aria-valuenow={nivel} aria-label="Robustez de la contraseña">
          {NIVELES.slice(1).map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < Math.max(nivel, 1) ? color : 'bg-slate-200'}`} />
          ))}
        </div>
        <span className={`w-20 text-right text-xs font-semibold ${texto}`}>{etiqueta}</span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5">
        {POLITICAS.map((p) => {
          const ok = p.cumple(password);
          return (
            <li key={p.id} className={`flex items-center gap-1.5 text-2xs ${ok ? 'text-emerald-700' : 'text-slate-500'}`}>
              {ok ? <Check size={12} className="shrink-0" /> : <X size={12} className="shrink-0 text-slate-400" />}
              {p.texto}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Aviso bajo "Confirmar contraseña": coincide o no con la primera.
export function CoincidenciaPassword({ password, confirmacion }) {
  if (!confirmacion) return null;
  const coincide = password === confirmacion;
  return (
    <p className={`mt-1 flex items-center gap-1.5 text-2xs ${coincide ? 'text-emerald-700' : 'text-red-600'}`} aria-live="polite">
      {coincide ? <Check size={12} /> : <X size={12} />}
      {coincide ? 'Las contraseñas coinciden' : 'Las contraseñas no coinciden'}
    </p>
  );
}
