import React, { useEffect, useState } from 'react';
import { CalendarCheck, ClipboardList, Plus } from 'lucide-react';
import PageHeader from './common/PageHeader';
import { pendientesApi } from '../api';
import { FormPendiente, FilaPendiente } from './pendientes/Pendientes';

// "Pendientes del equipo" (solo Administrador): carga de pendientes por agente,
// pendientes sin responsable activo, vencidos más antiguos y ventas sin próximo
// paso de todo el equipo. Desde aquí se reasigna y se crean pendientes para otros.

const tarjeta = 'rounded-2xl border border-slate-100 bg-white p-5 shadow-sm';

function Contador({ titulo, valor, clase = 'text-slate-800' }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-4">
      <span className="text-xs font-medium text-slate-500">{titulo}</span>
      <span className={`text-2xl font-bold ${clase}`}>{valor}</span>
    </div>
  );
}

// Barra de carga: largo relativo al agente más cargado; color por vencidos.
function BarraCarga({ a, maximo }) {
  const total = a.vencidos + a.hoy + a.proximos;
  const pct = maximo ? Math.max(total ? 6 : 0, Math.round((total / maximo) * 100)) : 0;
  const [color, nivel] = a.vencidos >= 5 ? ['bg-red-600', 'muy alta, con vencidos'] : a.vencidos > 0 ? ['bg-orange-600', 'con vencidos'] : ['bg-brand-petroleo', 'al día'];
  return (
    <div className="flex items-center gap-2">
      <div role="img" aria-label={`${total} pendientes, ${nivel}`} className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500">{total}</span>
    </div>
  );
}

function SelectorResponsable({ usuarios, excluir, onElegir, etiqueta = 'Asignar a…' }) {
  return (
    <select value="" aria-label={etiqueta} onChange={e => e.target.value && onElegir(e.target.value)}
      className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-petroleo">
      <option value="">{etiqueta}</option>
      {usuarios.filter(u => String(u._id) !== String(excluir)).map(u => <option key={u._id} value={u._id}>{u.nombre}</option>)}
    </select>
  );
}

export default function EquipoPendientes({ onVerDia, onCambioPendientes }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [inicial, setInicial] = useState(null);

  const cargar = async () => {
    try { setD(await pendientesApi.equipo()); setError(''); } catch (err) { setError(err.message); }
    onCambioPendientes?.();
  };
  useEffect(() => { cargar(); }, []);

  const ejecutar = async (fn) => {
    try { await fn(); await cargar(); } catch (err) { alert(err.message); }
  };

  const agregarPara = (v) => {
    setInicial({
      titulo: '',
      agente: v.agente && !v.agente.deBaja ? v.agente.id : '',
      liga: v.tipo === 'prospecto'
        ? { tipo: 'prospecto', id: v.id, nombre: v.nombre }
        : { tipo: 'reservacion', id: v.id, nombre: `${v.nombre} · ${v.detalle.split(' · ')[0]}` },
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Sin asignar, agrupados por su responsable anterior (para reasignarlos todos juntos).
  const grupos = [];
  for (const p of d?.sinAsignar || []) {
    const id = p.agente?.id || 'x';
    let g = grupos.find(x => x.id === id);
    if (!g) grupos.push(g = { id, nombre: p.agente?.nombre || 'Sin responsable', lista: [] });
    g.lista.push(p);
  }
  const maximo = Math.max(0, ...(d?.agentes || []).map(a => a.vencidos + a.hoy + a.proximos));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={ClipboardList} title="Pendientes del equipo" subtitle="Quién tiene qué, qué se está atrasando y qué ventas no tienen próximo paso." />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {!d && !error && <p className="py-10 text-center text-sm text-slate-400">Cargando…</p>}

      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Contador titulo="Vencidos del equipo" valor={d.totales.vencidos} clase={d.totales.vencidos ? 'text-red-700' : 'text-slate-800'} />
            <Contador titulo="Para hoy" valor={d.totales.hoy} />
            <Contador titulo="Sin asignar" valor={d.totales.sinAsignar} clase={d.totales.sinAsignar ? 'text-orange-700' : 'text-slate-800'} />
            <Contador titulo="Ventas sin próximo paso" valor={d.totales.sinProximoPaso} clase={d.totales.sinProximoPaso ? 'text-orange-700' : 'text-slate-800'} />
          </div>

          <section className={tarjeta}>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Nuevo pendiente para alguien del equipo</h2>
            <FormPendiente elegirLiga responsables={d.usuariosActivos} inicial={inicial} onCreado={cargar} />
          </section>

          <section className={tarjeta}>
            <h2 className="mb-3 text-base font-bold text-slate-800">Carga por agente</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead><tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th scope="col" className="px-2 py-2.5">Agente</th>
                  <th scope="col" className="px-2 py-2.5 text-right">Vencidos</th>
                  <th scope="col" className="px-2 py-2.5 text-right">Hoy</th>
                  <th scope="col" className="px-2 py-2.5 text-right">Próx. 7 días</th>
                  <th scope="col" className="px-2 py-2.5 text-right">Sin próximo paso</th>
                  <th scope="col" className="px-2 py-2.5">Carga</th>
                  <th scope="col" className="px-2 py-2.5"><span className="sr-only">Acciones</span></th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {d.agentes.map(a => (
                    <tr key={a.id}>
                      <td className="px-2 py-3 font-semibold text-slate-800">{a.nombre}{a.esYo && <span className="ml-1 font-normal text-slate-400">(tú)</span>}</td>
                      <td className={`px-2 py-3 text-right font-semibold ${a.vencidos ? 'text-red-700' : 'text-slate-400'}`}>{a.vencidos}</td>
                      <td className="px-2 py-3 text-right">{a.hoy}</td>
                      <td className="px-2 py-3 text-right">{a.proximos}</td>
                      <td className={`px-2 py-3 text-right ${a.sinProximoPaso ? 'font-semibold text-orange-700' : 'text-slate-400'}`}>{a.sinProximoPaso}</td>
                      <td className="px-2 py-3"><BarraCarga a={a} maximo={maximo} /></td>
                      <td className="px-2 py-3 text-right">
                        <button type="button" onClick={() => onVerDia(a.esYo ? '' : a.id)}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-brand-petroleo hover:bg-brand-petroleo/5">
                          <CalendarCheck size={13} /> Ver su día
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex flex-wrap items-start gap-6">
            <section className={`${tarjeta} flex min-w-0 flex-[1_1_420px] flex-col gap-3`}>
              <div>
                <h2 className="text-base font-bold text-slate-800">Sin asignar</h2>
                <p className="text-xs text-slate-500">Pendientes abiertos de usuarios dados de baja. Pásalos a alguien activo.</p>
              </div>
              {grupos.length === 0 && <p className="text-sm text-emerald-700">Todos los pendientes tienen un responsable activo.</p>}
              {grupos.map(g => (
                <div key={g.id} className="flex flex-col gap-2 border-t border-slate-100 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-700">{g.nombre} <span className="font-normal text-slate-400">(de baja) · {g.lista.length}</span></span>
                    {g.id !== 'x' && (
                      <SelectorResponsable usuarios={d.usuariosActivos} etiqueta="Reasignar todos a…"
                        onElegir={(a) => ejecutar(() => pendientesApi.reasignar(g.id, a))} />
                    )}
                  </div>
                  {g.lista.map(p => (
                    <div key={p._id} className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1 basis-56"><FilaPendiente p={p} hoy={d.hoy} onCambio={cargar} compacta /></div>
                      <SelectorResponsable usuarios={d.usuariosActivos} onElegir={(a) => ejecutar(() => pendientesApi.update(p._id, { agente: a }))} />
                    </div>
                  ))}
                </div>
              ))}
            </section>

            <section className={`${tarjeta} flex min-w-0 flex-[1_1_420px] flex-col gap-3`}>
              <div>
                <h2 className="text-base font-bold text-slate-800">Vencidos más antiguos</h2>
                <p className="text-xs text-slate-500">Lo que más tiempo lleva atrasado en el equipo.</p>
              </div>
              {d.vencidosAntiguos.length === 0 && <p className="text-sm text-emerald-700">El equipo no tiene pendientes vencidos.</p>}
              {d.vencidosAntiguos.map(p => (
                <div key={p._id} className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1 basis-56"><FilaPendiente p={p} hoy={d.hoy} onCambio={cargar} mostrarResponsable compacta /></div>
                  <SelectorResponsable usuarios={d.usuariosActivos} excluir={p.agente?.id} etiqueta="Reasignar a…"
                    onElegir={(a) => ejecutar(() => pendientesApi.update(p._id, { agente: a }))} />
                </div>
              ))}
            </section>
          </div>

          <section className={`${tarjeta} flex flex-col gap-3`}>
            <div>
              <h2 className="text-base font-bold text-slate-800">Ventas sin próximo paso</h2>
              <p className="text-xs text-slate-500">Prospectos y reservaciones activas sin ningún pendiente abierto, las más olvidadas primero.</p>
            </div>
            {d.ventasSinProximoPaso.length === 0 && <p className="text-sm text-emerald-700">Todas las ventas del equipo tienen un próximo paso.</p>}
            <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
              {d.ventasSinProximoPaso.map(v => (
                <div key={`${v.tipo}-${v.id}`} className="flex items-center gap-3 border-t border-slate-100 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-700">{v.nombre}</div>
                    <div className="truncate text-xs text-slate-500">
                      {v.detalle} · {v.agente ? `${v.agente.nombre}${v.agente.deBaja ? ' (de baja)' : ''}` : '—'} · {v.diasSinActividad} día(s) sin actividad
                    </div>
                  </div>
                  <button type="button" onClick={() => agregarPara(v)}
                    className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border border-brand-petroleo px-2.5 text-xs font-semibold text-brand-petroleo hover:bg-brand-petroleo/5">
                    <Plus size={13} /> Pendiente
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
