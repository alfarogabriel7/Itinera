import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, MessageCircle, Plus, Trash2 } from 'lucide-react';
import { pendientesApi, clientesApi, prospectosApi, reservacionesApi } from '../../api';
import { TIPOS_PENDIENTE } from '../../../database/catalogos/tiposPendiente.js';
import { SelectorFecha, aTexto, aFecha } from '../common/Calendario';
import SelectorRemoto from '../common/SelectorRemoto';
import { fechaViaje } from '../../utils/formato';

// Piezas del módulo de pendientes ("Mi día"): chip de tipo, captura, fila y el
// panel de pendientes de un registro (cliente o prospecto).

const inputClass = 'w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-petroleo';

export function ChipTipo({ tipo }) {
  const t = TIPOS_PENDIENTE[tipo] || TIPOS_PENDIENTE.otro;
  return <span className="shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold" style={{ color: t.color, backgroundColor: t.fondo }}>{t.nombre}</span>;
}

const DIA = 86_400_000;
const SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// "Vencido hace 3 días", "Hoy · 11:00", "Mañana", "Lun 9 nov".
export function textoVence(p, hoy) {
  const dias = Math.round((aFecha(p.fecha) - aFecha(hoy)) / DIA);
  const hora = p.hora ? ` · ${p.hora}` : '';
  if (p.estatus === 'pendiente' && dias < 0) return { texto: dias === -1 ? 'Vencido ayer' : `Vencido hace ${-dias} días`, clase: 'text-red-700' };
  if (dias === 0) return { texto: `Hoy${hora}`, clase: 'text-slate-800' };
  if (dias === 1) return { texto: `Mañana${hora}`, clase: 'text-slate-600' };
  const f = aFecha(p.fecha);
  return { texto: `${SEMANA[f.getDay()]} ${f.getDate()} ${MESES[f.getMonth()]}${hora}`, clase: 'text-slate-500' };
}

function whatsapp(p) {
  const digitos = String(p.contacto?.telefono || '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  const numero = digitos.length === 10 ? `52${digitos}` : digitos;
  return `https://wa.me/${numero}?text=${encodeURIComponent(`Hola ${p.contacto.nombre}, `)}`;
}

// A qué está ligado: reservación, cliente o prospecto.
function TextoLiga({ p }) {
  const partes = [];
  if (p.cliente) partes.push(<span key="c" className="font-medium text-slate-700">{p.cliente.nombre}</span>);
  else if (p.prospecto) partes.push(<span key="p" className="font-medium text-slate-700">{p.prospecto.nombre} <span className="font-normal text-slate-400">(prospecto)</span></span>);
  if (p.reservacion) partes.push(<span key="r">{p.reservacion.destino} · viaja {fechaViaje(p.reservacion.fechaEntrada)}</span>);
  return partes.length ? <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">{partes}</div> : null;
}

// Una fila de pendiente con sus acciones (hecho, WhatsApp, posponer, eliminar).
export function FilaPendiente({ p, hoy, onCambio, mostrarResponsable = false, compacta = false }) {
  const [menu, setMenu] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const ref = useRef(null);
  const hecho = p.estatus === 'hecho';
  const vence = textoVence(p, hoy);
  const wa = !hecho && whatsapp(p);

  useEffect(() => {
    if (!menu) return undefined;
    const fuera = (e) => { if (!ref.current?.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [menu]);

  const accion = async (fn) => {
    setOcupado(true);
    setMenu(false);
    try { await fn(); await onCambio(); } catch (err) { alert(err.message); } finally { setOcupado(false); }
  };

  return (
    <article className={`flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white ${compacta ? 'px-3 py-2' : 'px-4 py-3'} ${hecho ? 'opacity-60' : ''} ${ocupado ? 'pointer-events-none opacity-50' : ''}`}>
      <button type="button" onClick={() => accion(() => pendientesApi.hecho(p._id, !hecho))}
        aria-label={hecho ? 'Marcar como pendiente' : 'Marcar como hecho'} title={hecho ? 'Reabrir' : 'Marcar como hecho'}
        className="-m-1.5 flex h-9 w-9 shrink-0 items-center justify-center">
        <span className={`flex h-5 w-5 items-center justify-center rounded-md border-2 ${hecho ? 'border-brand-petroleo bg-brand-petroleo' : 'border-slate-400 bg-white'}`}>
          {hecho && <CheckCircle2 size={14} className="text-white" />}
        </span>
      </button>
      <div className="min-w-0 flex-1 basis-56 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-semibold ${hecho ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{p.titulo}</span>
          <ChipTipo tipo={p.tipo} />
          {p.pospuesto >= 2 && !hecho && <span className="text-2xs font-semibold text-amber-700" title="Veces que se ha pospuesto">Pospuesto {p.pospuesto}×</span>}
        </div>
        <TextoLiga p={p} />
        {p.detalle && <div className="truncate text-xs italic text-slate-400" title={p.detalle}>{p.detalle}</div>}
        {mostrarResponsable && p.agente && <div className="text-xs text-slate-400">Responsable: {p.agente.nombre}</div>}
      </div>
      <span className={`whitespace-nowrap text-xs font-semibold ${vence.clase}`}>{vence.texto}</span>
      <div className="flex items-center gap-1.5">
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`Escribir a ${p.contacto.nombre} por WhatsApp`} title="WhatsApp"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-emerald-700 hover:bg-emerald-50">
            <MessageCircle size={16} />
          </a>
        )}
        <div ref={ref} className="relative">
          <button type="button" onClick={() => setMenu(m => !m)} aria-label="Posponer o eliminar" aria-expanded={menu} title="Posponer o eliminar"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Clock size={16} />
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 z-30 mt-1 w-44 rounded-xl border border-slate-100 bg-white py-1 text-sm shadow-lg">
              {!hecho && [['Mañana', 1], ['En 3 días', 3], ['En 1 semana', 7]].map(([etiqueta, dias]) => (
                <button key={dias} type="button" role="menuitem" onClick={() => accion(() => pendientesApi.posponer(p._id, { dias }))}
                  className="block w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50">Posponer: {etiqueta}</button>
              ))}
              <button type="button" role="menuitem"
                onClick={() => { if (confirm(`¿Eliminar el pendiente "${p.titulo}"?`)) accion(() => pendientesApi.remove(p._id)); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"><Trash2 size={14} /> Eliminar</button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// Búsquedas para ligar el pendiente a un registro.
const BUSCAR = {
  cliente: (q) => clientesApi.list({ q, estatus: 'Activo', orden: 'nombre', porPagina: 15 }).then(r => r.datos),
  prospecto: (q) => prospectosApi.list({ q, porPagina: 15 }).then(r => r.datos),
  reservacion: (q) => reservacionesApi.list({ q, estatus: 'Activa', porPagina: 15 }).then(r => r.datos),
};
const ETIQUETA_LIGA = {
  cliente: (c) => c.nombreCompleto,
  prospecto: (p) => p.nombreCompleto,
  reservacion: (r) => `${r.idCliente?.nombreCompleto || '—'} · ${r.destino}`,
};

// Captura rápida: qué, tipo, para cuándo (hoy por defecto) y hora opcional.
//   ligas: ligas fijas (panel de un registro) · elegirLiga: permite ligarlo a un registro
//   responsables: lista de usuarios (solo Administrador) · inicial: prellenado ({ titulo, liga })
export function FormPendiente({ ligas = null, elegirLiga = false, responsables = null, inicial = null, onCreado, autoFocus = false }) {
  const vacio = () => ({ titulo: '', tipo: 'otro', fecha: aTexto(new Date()), hora: '', agente: '', ligaTipo: '', ligaId: '', ligaNombre: '' });
  const [f, setF] = useState(vacio);
  const [guardando, setGuardando] = useState(false);
  const titulo = useRef(null);

  // Prellenado (p.ej. desde "Ventas sin próximo paso").
  useEffect(() => {
    if (!inicial) return;
    setF({ ...vacio(), titulo: inicial.titulo || '', agente: inicial.agente || '', ligaTipo: inicial.liga?.tipo || '', ligaId: inicial.liga?.id || '', ligaNombre: inicial.liga?.nombre || '' });
    titulo.current?.focus();
  }, [inicial]);

  const enviar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const datos = { titulo: f.titulo.trim(), tipo: f.tipo, fecha: f.fecha, ...(f.hora ? { hora: f.hora } : {}), ...(f.agente ? { agente: f.agente } : {}) };
      if (ligas) Object.assign(datos, ligas);
      else if (f.ligaTipo && f.ligaId) datos[f.ligaTipo] = f.ligaId;
      await pendientesApi.create(datos);
      setF(vacio());
      await onCreado?.();
      titulo.current?.focus();
    } catch (err) {
      alert(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="grid grid-cols-1 gap-3 md:grid-cols-12">
      {/* Primero: a qué registro se liga (a todo lo ancho, para que el buscador tenga espacio).
          Desde "+ Pendiente" de "Ventas sin próximo paso" llega ya elegido. */}
      {elegirLiga && !ligas && (
        <div className="md:col-span-12">
          <label htmlFor="pendiente-liga" className="block text-xs font-bold text-slate-600">Ligar a <span className="font-normal text-slate-400">(opcional)</span></label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <select id="pendiente-liga" className={`${inputClass} sm:w-44 sm:shrink-0`} value={f.ligaTipo}
              onChange={e => setF({ ...f, ligaTipo: e.target.value, ligaId: '', ligaNombre: '' })}>
              <option value="">Sin ligar</option>
              <option value="cliente">Cliente</option>
              <option value="prospecto">Prospecto</option>
              <option value="reservacion">Reservación</option>
            </select>
            <div className="min-w-0 flex-1">
              {f.ligaTipo ? (
                <SelectorRemoto buscar={BUSCAR[f.ligaTipo]} valor={f.ligaId} etiquetaValor={f.ligaNombre}
                  placeholder={`Busca el ${f.ligaTipo === 'reservacion' ? 'cliente o destino de la reservación' : f.ligaTipo}…`}
                  etiqueta={ETIQUETA_LIGA[f.ligaTipo]} onCambio={(id, x) => setF(v => ({ ...v, ligaId: id, ligaNombre: x ? ETIQUETA_LIGA[v.ligaTipo](x) : '' }))} />
              ) : (
                <p className="flex h-full items-center px-1 text-xs text-slate-400">Elige si es de un cliente, prospecto o reservación para verlo ligado (y poder escribirle por WhatsApp).</p>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="md:col-span-12">
        <label htmlFor="pendiente-titulo" className="sr-only">Nuevo pendiente</label>
        <input id="pendiente-titulo" ref={titulo} autoFocus={autoFocus} required maxLength={200} className={inputClass}
          placeholder="¿Qué hay que hacer? Ej. Llamar a Ana para su cotización"
          value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} />
      </div>
      <div className="md:col-span-3">
        <label className="block text-xs font-bold text-slate-600">Tipo</label>
        <select className={`${inputClass} mt-1`} value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>
          {Object.entries(TIPOS_PENDIENTE).map(([clave, t]) => <option key={clave} value={clave}>{t.nombre}</option>)}
        </select>
      </div>
      <div className="md:col-span-3">
        <label className="block text-xs font-bold text-slate-600">Para cuándo *</label>
        <SelectorFecha required valor={f.fecha} onCambio={fecha => setF(x => ({ ...x, fecha }))} />
      </div>
      <div className="md:col-span-2">
        <label htmlFor="pendiente-hora" className="block text-xs font-bold text-slate-600">Hora <span className="font-normal text-slate-400">(opcional)</span></label>
        <input id="pendiente-hora" type="time" className={`${inputClass} mt-1`} value={f.hora} onChange={e => setF({ ...f, hora: e.target.value })} />
      </div>
      {responsables && (
        <div className="md:col-span-4">
          <label className="block text-xs font-bold text-slate-600">Responsable</label>
          <select className={`${inputClass} mt-1`} value={f.agente} onChange={e => setF({ ...f, agente: e.target.value })}>
            <option value="">Yo</option>
            {responsables.map(a => <option key={a._id} value={a._id}>{a.nombre}</option>)}
          </select>
        </div>
      )}
      <div className={`flex items-end ${responsables ? 'md:col-span-12 justify-end' : 'md:col-span-4'}`}>
        <button type="submit" disabled={guardando}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-brand-petroleo px-5 text-sm font-semibold text-white hover:bg-brand-noche disabled:opacity-60 md:w-auto">
          <Plus size={16} /> {guardando ? 'Agregando…' : 'Agregar pendiente'}
        </button>
      </div>
    </form>
  );
}

// Panel de pendientes de un registro (formulario de Cliente o Prospecto).
//   ligas: { cliente } o { prospecto } — el registro debe estar guardado.
export function PendientesDeRegistro({ ligas }) {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const hoy = aTexto(new Date());
  const clave = JSON.stringify(ligas);

  const cargar = async () => {
    try { setLista(await pendientesApi.deRegistro(ligas)); setError(''); } catch (err) { setError(err.message); }
  };
  useEffect(() => { setLista(null); cargar(); }, [clave]);

  const abiertos = (lista || []).filter(p => p.estatus === 'pendiente');
  const hechos = (lista || []).filter(p => p.estatus === 'hecho').slice(0, 5);

  return (
    <div className="space-y-3 rounded-xl border border-slate-100 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-700">Pendientes</span>
        {lista && <span className="text-xs text-slate-400">{abiertos.length} abierto(s)</span>}
      </div>
      <FormPendiente ligas={ligas} onCreado={cargar} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!lista && !error && <p className="text-sm text-slate-400">Cargando pendientes…</p>}
      {lista && abiertos.length === 0 && <p className="text-sm text-slate-400">No hay pendientes abiertos.</p>}
      <div className="space-y-2">
        {abiertos.map(p => <FilaPendiente key={p._id} p={p} hoy={hoy} onCambio={cargar} mostrarResponsable compacta />)}
      </div>
      {hechos.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-400">Hechos recientemente</summary>
          <div className="mt-2 space-y-2">{hechos.map(p => <FilaPendiente key={p._id} p={p} hoy={hoy} onCambio={cargar} compacta />)}</div>
        </details>
      )}
    </div>
  );
}
