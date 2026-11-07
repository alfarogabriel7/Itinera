import React, { useEffect, useState } from 'react';
import { CalendarCheck, Plus } from 'lucide-react';
import { pendientesApi, agentesApi } from '../api';
import { obtenerSesion } from '../utils/sesion';
import { TIPOS_PENDIENTE } from '../../database/catalogos/tiposPendiente.js';
import { aFecha } from './common/Calendario';
import { FormPendiente, FilaPendiente } from './pendientes/Pendientes';

// "Mi día": los pendientes del usuario agrupados en Vencidos / Hoy / Próximos 7
// días, captura rápida y las ventas (prospectos y reservaciones activas) que no
// tienen ningún pendiente abierto. El Administrador puede asignar pendientes y
// ver el día de cualquier usuario de su empresa.

const fechaLarga = (texto) => {
  const t = aFecha(texto)?.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }) || '';
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function Contador({ titulo, valor, clase = 'text-slate-800' }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-4">
      <span className="text-xs font-medium text-slate-500">{titulo}</span>
      <span className={`text-2xl font-bold ${clase}`}>{valor}</span>
    </div>
  );
}

export default function MiDia({ onCambioPendientes }) {
  const sesion = obtenerSesion();
  const esAdmin = sesion?.rol === 'Administrador';
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [usuarios, setUsuarios] = useState(null);
  const [verDe, setVerDe] = useState('');
  const [inicial, setInicial] = useState(null);

  useEffect(() => {
    if (!esAdmin) return;
    agentesApi.list({ estatus: 'Activo', orden: 'nombre', porPagina: 100 })
      .then(r => setUsuarios(r.datos.filter(a => a.rol !== 'superAdmin' && a._id !== sesion?.id)))
      .catch(() => setUsuarios([]));
  }, [esAdmin]);

  const cargar = async () => {
    try {
      setDatos(await pendientesApi.miDia(verDe ? { agente: verDe } : {}));
      setError('');
    } catch (err) {
      setError(err.message);
    }
    onCambioPendientes?.();
  };
  useEffect(() => { cargar(); }, [verDe]);

  const pasa = (p) => filtro === 'todos' || p.tipo === filtro;
  const abiertos = (lista) => lista.filter(p => p.estatus === 'pendiente').length;
  const secciones = datos ? [
    { clave: 'vencidos', titulo: 'Vencidos', clase: 'text-red-700', lista: datos.vencidos },
    { clave: 'hoy', titulo: 'Hoy', clase: 'text-slate-800', lista: datos.hoyLista },
    { clave: 'proximos', titulo: 'Próximos 7 días', clase: 'text-slate-800', lista: datos.proximos },
  ] : [];

  const agregarPara = (venta) => {
    setInicial({ titulo: '', liga: venta.tipo === 'prospecto'
      ? { tipo: 'prospecto', id: venta.id, nombre: venta.nombre }
      : { tipo: 'reservacion', id: venta.id, nombre: `${venta.nombre} · ${venta.detalle.split(' · ')[0]}` } });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{datos ? fechaLarga(datos.hoy) : ''}</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800"><CalendarCheck size={24} className="text-brand-petroleo" /> Mi día</h1>
        </div>
        {esAdmin && usuarios?.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Ver el día de
            <select value={verDe} onChange={e => setVerDe(e.target.value)} className="rounded-lg border border-slate-300 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo">
              <option value="">Mí</option>
              {usuarios.map(u => <option key={u._id} value={u._id}>{u.nombre}</option>)}
            </select>
          </label>
        )}
      </header>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Nuevo pendiente</h2>
        <FormPendiente elegirLiga responsables={esAdmin ? usuarios || [] : null} inicial={inicial} onCreado={cargar} />
      </section>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {datos && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Contador titulo="Vencidos" valor={abiertos(datos.vencidos)} clase="text-red-700" />
            <Contador titulo="Para hoy" valor={abiertos(datos.hoyLista)} />
            <Contador titulo="Próximos 7 días" valor={abiertos(datos.proximos)} />
          </div>

          <div role="group" aria-label="Filtrar por tipo" className="flex flex-wrap gap-2">
            {[['todos', 'Todos'], ...Object.entries(TIPOS_PENDIENTE).map(([k, t]) => [k, t.nombre])].map(([clave, nombre]) => (
              <button key={clave} type="button" onClick={() => setFiltro(clave)} aria-pressed={filtro === clave}
                className={`min-h-[36px] rounded-full border px-3.5 text-sm font-medium ${filtro === clave ? 'border-brand-noche bg-brand-noche text-white' : 'border-slate-300 bg-white text-slate-600 hover:text-slate-800'}`}>
                {nombre}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-start gap-6">
            <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
              {secciones.map(s => {
                const lista = s.lista.filter(pasa);
                return (
                  <section key={s.clave} className="flex flex-col gap-2">
                    <h2 className={`flex items-center gap-2 text-sm font-semibold ${s.clase}`}>
                      {s.titulo}
                      <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-xs font-semibold text-slate-600">{abiertos(lista)}</span>
                    </h2>
                    {lista.length === 0
                      ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">Nada pendiente aquí.</p>
                      : lista.map(p => <FilaPendiente key={p._id} p={p} hoy={datos.hoy} onCambio={cargar} />)}
                  </section>
                );
              })}
            </div>

            <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
              <section className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-800">Ventas sin próximo paso</h2>
                <p className="text-xs text-slate-500">Toda venta abierta debería tener un pendiente. Asígnale uno para no perderla.</p>
                {datos.sinProximoPaso.length === 0 && <p className="text-sm text-emerald-700">Todas tus ventas tienen un próximo paso.</p>}
                {datos.sinProximoPaso.map(v => (
                  <div key={`${v.tipo}-${v.id}`} className="flex items-center gap-3 border-t border-slate-100 pt-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-700">{v.nombre}</div>
                      <div className="truncate text-xs text-slate-500">{v.detalle} · {v.diasSinActividad} día(s) sin actividad</div>
                    </div>
                    <button type="button" onClick={() => agregarPara(v)}
                      className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border border-brand-petroleo px-2.5 text-xs font-semibold text-brand-petroleo hover:bg-brand-petroleo/5">
                      <Plus size={13} /> Pendiente
                    </button>
                  </div>
                ))}
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
