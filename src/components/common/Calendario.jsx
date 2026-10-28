import React, { useEffect, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { es } from 'react-day-picker/locale';
import { CalendarDays, X } from 'lucide-react';

// Selectores de fecha con calendario (react-day-picker, en español y con los
// colores del tema; estilos en index.css). Reciben y devuelven texto
// 'YYYY-MM-DD', igual que el <input type="date"> que reemplazan, y trabajan en
// fecha local para que no se recorra un día por la zona horaria.

const dos = (n) => String(n).padStart(2, '0');
export const aFecha = (texto) => {
  if (!texto) return undefined;
  const [a, m, d] = String(texto).slice(0, 10).split('-').map(Number);
  return a && m && d ? new Date(a, m - 1, d) : undefined;
};
export const aTexto = (fecha) => (fecha ? `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}` : '');
const largo = (f) => f.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
const corto = (f) => f.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
const noches = (desde, hasta) => Math.round((hasta - desde) / 86_400_000);

// Panel flotante bajo el campo: se cierra al hacer clic fuera o con Escape.
function usePanel() {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (!ref.current?.contains(e.target)) setAbierto(false); };
    const escape = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);
  return { abierto, setAbierto, ref };
}

function Campo({ texto, placeholder, onAbrir, onLimpiar, required, valorRequerido }) {
  return (
    <>
      {/* Input oculto para que la validación nativa "required" del formulario funcione */}
      {required && <input tabIndex={-1} aria-hidden="true" className="absolute inset-0 opacity-0 pointer-events-none" value={valorRequerido} required onChange={() => {}} />}
      <button type="button" onClick={onAbrir}
        className="relative w-full flex items-center gap-2 p-2.5 border border-slate-300 rounded-lg text-sm bg-white text-left focus:outline-none focus:ring-2 focus:ring-brand-petroleo">
        <CalendarDays size={16} className="shrink-0 text-brand-petroleo" />
        <span className={`flex-1 truncate ${texto ? 'text-slate-800' : 'text-slate-400'}`}>{texto || placeholder}</span>
        {texto && onLimpiar && (
          <X size={14} className="shrink-0 text-slate-400 hover:text-red-600" aria-label="Limpiar fecha"
            onClick={(e) => { e.stopPropagation(); onLimpiar(); }} />
        )}
      </button>
    </>
  );
}

const panelClass = 'absolute z-30 mt-1 rounded-xl border border-slate-200 bg-white p-3 shadow-lg';

// Una fecha (p.ej. nacimiento). Con `nacimiento` muestra selectores de mes y año
// desde 1920 y no deja elegir fechas futuras; con `sinFuturas`, solo lo último.
export function SelectorFecha({ valor, onCambio, placeholder = 'Selecciona una fecha', required = false, nacimiento = false, sinFuturas = false }) {
  const { abierto, setAbierto, ref } = usePanel();
  const seleccion = aFecha(valor);
  const hoy = new Date();

  return (
    <div ref={ref} className="relative mt-1">
      <Campo texto={seleccion ? largo(seleccion) : ''} placeholder={placeholder} required={required} valorRequerido={valor || ''}
        onAbrir={() => setAbierto(a => !a)} onLimpiar={() => onCambio('')} />
      {abierto && (
        <div className={panelClass}>
          <DayPicker mode="single" locale={es} selected={seleccion}
            defaultMonth={seleccion || (nacimiento ? new Date(hoy.getFullYear() - 30, 0) : hoy)}
            onSelect={(f) => { onCambio(aTexto(f)); if (f) setAbierto(false); }}
            {...(sinFuturas && { endMonth: hoy, disabled: { after: hoy } })}
            {...(nacimiento && {
              captionLayout: 'dropdown',
              startMonth: new Date(1920, 0),
              endMonth: hoy,
              disabled: { after: hoy },
            })} />
        </div>
      )}
    </div>
  );
}

// Rango en un solo calendario: primer clic = fecha de entrada, segundo = salida.
// onCambio(desde, hasta) se llama al completar el rango (o con '' al limpiarlo).
export function SelectorRangoFechas({ desde, hasta, onCambio, required = false, placeholder = 'Selecciona entrada y salida' }) {
  const { abierto, setAbierto, ref } = usePanel();
  const inicio = aFecha(desde);
  const fin = aFecha(hasta);
  // Mientras se elige: el rango en construcción (aún no se manda al formulario).
  const [borrador, setBorrador] = useState({ from: inicio, to: fin });
  const [dosMeses, setDosMeses] = useState(true);

  const abrir = () => {
    setBorrador({ from: inicio, to: fin });
    setDosMeses(window.matchMedia('(min-width: 768px)').matches);
    setAbierto(a => !a);
  };

  const elegir = (dia) => {
    if (!dia) return;
    const { from, to } = borrador;
    if (!from || to || dia < from) {
      setBorrador({ from: dia, to: undefined }); // empieza un rango nuevo
      return;
    }
    setBorrador({ from, to: dia });
    onCambio(aTexto(from), aTexto(dia));
    setAbierto(false);
  };

  const texto = inicio && fin
    ? `${corto(inicio)} → ${corto(fin)} · ${noches(inicio, fin)} noche${noches(inicio, fin) === 1 ? '' : 's'}`
    : '';

  return (
    <div ref={ref} className="relative mt-1">
      <Campo texto={texto} placeholder={placeholder} required={required} valorRequerido={inicio && fin ? `${desde}|${hasta}` : ''}
        onAbrir={abrir} onLimpiar={() => onCambio('', '')} />
      {abierto && (
        <div className={`${panelClass} left-0`}>
          <DayPicker mode="range" locale={es} numberOfMonths={dosMeses ? 2 : 1}
            selected={borrador} defaultMonth={borrador.from || new Date()}
            onSelect={(_, dia) => elegir(dia)} />
          <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
            {!borrador.from || borrador.to
              ? 'Elige la fecha de entrada.'
              : <>Entrada: <strong className="text-slate-700">{largo(borrador.from)}</strong>. Ahora elige la fecha de salida.</>}
          </div>
        </div>
      )}
    </div>
  );
}
