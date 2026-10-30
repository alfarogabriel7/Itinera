import React, { useEffect, useState } from 'react';
import { pagosProveedorApi, agentesApi } from '../api';
import { obtenerSesion } from '../utils/sesion';
import { dinero, fechaViaje } from '../utils/formato';
import PageHeader from './common/PageHeader';
import MasUSD from './common/MasUSD';
import Paginacion, { SelectorPorPagina } from './common/Paginacion';
import { useListadoRemoto } from '../hooks/useListadoRemoto';
import { EtiquetaViaje } from './Cobranza';
import { HandCoins, Search, AlarmClock, AlertTriangle, ListChecks, Send } from 'lucide-react';

// Módulo "Pago a Proveedores": reservaciones activas con saldo pendiente con
// sus proveedores, de la fecha de entrada más próxima a la más lejana. Un
// Agente ve su cartera (lo que vendió y lo de sus clientes asignados); el
// Administrador, toda la empresa (lo aplica el servidor). "Pagar" abre
// Registro de Pagos → pestaña Proveedores con la reservación elegida.

const URGENCIAS = [
  { key: 'todas', label: 'Todas' },
  { key: 'iniciado', label: 'Viaje iniciado o terminado' },
  { key: '7', label: 'Viajan en 7 días o menos' },
  { key: '30', label: 'Viajan en 30 días o menos' },
  { key: 'mas', label: 'Viajan en más de 30 días' },
];
const INDICADORES_VACIOS = { porPagar: 0, reservaciones: 0, proximos: { cantidad: 0, monto: 0 }, iniciados: { cantidad: 0, monto: 0 } };

function SaldoConAvance({ fila: f }) {
  const porcentaje = f.total > 0 ? Math.min(100, Math.round((f.pagado / f.total) * 100)) : 0;
  return (
    <div>
      <div className="text-xs font-bold text-red-600 tabular-nums">{dinero(f.saldo)}{f.moneda === 'USD' && ' USD'}</div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${porcentaje}%` }} />
      </div>
      <div className="text-[11px] text-slate-400 mt-0.5">{porcentaje}% pagado</div>
    </div>
  );
}

// Servicios con saldo: proveedor · clave · lo que falta pagarle.
function ServiciosPendientes({ fila: f }) {
  return (
    <ul className="space-y-0.5">
      {f.pendientes.map((s, i) => (
        <li key={i} className="flex items-baseline justify-between gap-2 text-xs">
          <span className="min-w-0 truncate text-slate-600" title={`${s.proveedor} · ${s.clave}`}>
            {s.proveedor} <span className="text-slate-400">· {s.clave}</span>
          </span>
          <span className="shrink-0 tabular-nums font-semibold text-red-600">{dinero(s.saldo)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PagoProveedores({ onPagar }) {
  const esAgente = obtenerSesion()?.rol === 'Agente';
  const [urgencia, setUrgencia] = useState('todas');
  const [agente, setAgente] = useState('');
  const [agentes, setAgentes] = useState([]);

  useEffect(() => {
    if (esAgente) return;
    agentesApi.list({ estatus: 'Activo', orden: 'nombre', porPagina: 100 })
      .then(r => setAgentes(r.datos.filter(a => a.rol !== 'superAdmin')))
      .catch(() => setAgentes([]));
  }, [esAgente]);

  const filtros = {
    ...(urgencia !== 'todas' ? { urgencia } : {}),
    ...(agente === 'mios' ? { mios: 1 } : agente ? { agente } : {}),
  };
  const listado = useListadoRemoto(params => pagosProveedorApi.pendientes(params), { filtros });
  const { error, datos: filas, cargando } = listado;
  const ind = listado.extra.indicadores || INDICADORES_VACIOS;
  const vacio = ind.reservaciones === 0 ? 'No hay pagos pendientes a proveedores.' : 'Ninguna reservación coincide con los filtros.';

  const BotonPagar = ({ fila }) => (
    <button onClick={() => onPagar(fila.idReservacion)} title="Registrar pago a proveedor"
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand-coral hover:brightness-90">
      <Send size={13} /> Pagar
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={HandCoins} title="Pago a Proveedores"
        subtitle="Reservaciones activas con pagos pendientes a proveedores, por fecha de entrada más próxima." />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider"><HandCoins size={14} /> Total por pagar</div>
          <div className="mt-2 text-2xl font-bold text-slate-800">{dinero(ind.porPagar)}</div>
          <MasUSD monto={ind.usd?.porPagar} className="text-slate-500" />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider"><ListChecks size={14} /> Reservaciones con saldo</div>
          <div className="mt-2 text-2xl font-bold text-slate-800">{ind.reservaciones}</div>
        </div>
        <button onClick={() => setUrgencia('7')} className="text-left bg-amber-50 rounded-2xl shadow-sm border border-amber-200 p-5 hover:brightness-95">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 uppercase tracking-wider"><AlarmClock size={14} /> Viajan en 7 días o menos</div>
          <div className="mt-2 text-2xl font-bold text-amber-900">{dinero(ind.proximos.monto)}</div>
          <MasUSD monto={ind.usd?.proximos} className="text-amber-800" />
          <div className="text-xs text-amber-800">{ind.proximos.cantidad} reservación(es)</div>
        </button>
        <button onClick={() => setUrgencia('iniciado')} className="text-left bg-red-50 rounded-2xl shadow-sm border border-red-200 p-5 hover:brightness-95">
          <div className="flex items-center gap-2 text-xs font-semibold text-red-700 uppercase tracking-wider"><AlertTriangle size={14} /> Ya viajaron sin pagar al proveedor</div>
          <div className="mt-2 text-2xl font-bold text-red-700">{dinero(ind.iniciados.monto)}</div>
          <MasUSD monto={ind.usd?.iniciados} className="text-red-700" />
          <div className="text-xs text-red-700">{ind.iniciados.cantidad} reservación(es)</div>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-center gap-3 mb-4">
          <div className="relative lg:w-72">
            <input type="text" placeholder="Buscar cliente, destino, proveedor o clave..." value={listado.busqueda} onChange={e => listado.setBusqueda(e.target.value)}
              className="w-full pl-3 pr-9 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo" />
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          <select value={urgencia} onChange={e => setUrgencia(e.target.value)} className="p-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-petroleo">
            {URGENCIAS.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
          </select>
          {esAgente ? (
            <span className="text-xs text-slate-500" title="Lo que tú vendiste y lo de los clientes que tienes asignados">Tus ventas y tus clientes asignados</span>
          ) : (
            <select value={agente} onChange={e => setAgente(e.target.value)} title="Agente que vendió" className="p-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-petroleo">
              <option value="">Todos los agentes</option>
              <option value="mios">Mis reservaciones</option>
              {agentes.map(a => <option key={a._id} value={a._id}>{a.nombre}</option>)}
            </select>
          )}
          <div className="lg:ml-auto"><SelectorPorPagina listado={listado} /></div>
        </div>

        {/* Pantallas anchas: tabla. */}
        <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-noche text-white text-sm">
                <th className="p-3 font-semibold">Viaje</th>
                <th className="p-3 font-semibold">Cliente</th>
                <th className="p-3 font-semibold min-w-[220px]">Pendiente por proveedor</th>
                <th className="p-3 font-semibold text-right">Montos</th>
                <th className="p-3 font-semibold min-w-[120px]">Saldo</th>
                <th className="p-3 font-semibold text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cargando && filas.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400 text-sm">Cargando pagos a proveedores...</td></tr>}
              {filas.map(f => (
                <tr key={f.idReservacion} className="text-sm hover:bg-slate-50 align-top">
                  <td className="p-3 text-slate-600">
                    <div className="font-medium text-slate-700">{f.destino}</div>
                    <div className="text-xs text-slate-400 whitespace-nowrap">{fechaViaje(f.fechaEntrada)} al {fechaViaje(f.fechaSalida)}</div>
                    <div className="mt-1"><EtiquetaViaje fila={f} /></div>
                  </td>
                  <td className="p-3">
                    <div className="text-slate-700">{f.cliente?.nombre || '—'}</div>
                    {f.agente && <div className="text-xs text-slate-400">Vendió: {f.agente}</div>}
                  </td>
                  <td className="p-3"><ServiciosPendientes fila={f} /></td>
                  <td className="p-3 text-right text-xs tabular-nums whitespace-nowrap">
                    <div className="text-slate-600">A pagar {dinero(f.total)}</div>
                    <div className="text-emerald-700">Pagado {dinero(f.pagado)}</div>
                  </td>
                  <td className="p-3"><SaldoConAvance fila={f} /></td>
                  <td className="p-3 text-center"><BotonPagar fila={f} /></td>
                </tr>
              ))}
              {!cargando && listado.total === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400 text-sm">{vacio}</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Celular: tarjetas. */}
        <div className="md:hidden space-y-3">
          {cargando && filas.length === 0 && <p className="p-6 text-center text-slate-400 text-sm">Cargando pagos a proveedores...</p>}
          {filas.map(f => (
            <div key={f.idReservacion} className="rounded-xl border border-slate-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-700 truncate">{f.destino}</div>
                  <div className="text-xs text-slate-500 truncate">{f.cliente?.nombre || '—'} · {fechaViaje(f.fechaEntrada)} al {fechaViaje(f.fechaSalida)}</div>
                  {f.agente && <div className="text-xs text-slate-400">Vendió: {f.agente}</div>}
                </div>
                <div className="shrink-0"><EtiquetaViaje fila={f} /></div>
              </div>
              <div className="mt-3"><ServiciosPendientes fila={f} /></div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="w-40"><SaldoConAvance fila={f} /></div>
                <BotonPagar fila={f} />
              </div>
            </div>
          ))}
          {!cargando && listado.total === 0 && <p className="p-6 text-center text-slate-400 text-sm">{vacio}</p>}
        </div>

        <Paginacion listado={listado} etiqueta="reservaciones" />
      </div>
    </div>
  );
}
