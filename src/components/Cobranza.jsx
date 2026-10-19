import React, { useEffect, useState } from 'react';
import { pagosApi, agentesApi } from '../api';
import { dinero, fechaCorta, fechaViaje, diasHasta } from '../utils/formato';
import PageHeader from './common/PageHeader';
import Paginacion, { SelectorPorPagina } from './common/Paginacion';
import { useListadoRemoto } from '../hooks/useListadoRemoto';
import { Wallet, Search, AlarmClock, AlertTriangle, ListChecks, CreditCard, MessageCircle, Download } from 'lucide-react';

const URGENCIAS = [
  { key: 'todas', label: 'Todas' },
  { key: 'iniciado', label: 'Viaje iniciado o terminado' },
  { key: '7', label: 'Viajan en 7 días o menos' },
  { key: '30', label: 'Viajan en 30 días o menos' },
  { key: 'mas', label: 'Viajan en más de 30 días' },
];

export function EtiquetaViaje({ fila }) {
  const dias = diasHasta(fila.fechaEntrada);
  if (dias < 0) {
    const termino = diasHasta(fila.fechaSalida) < 0;
    return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-600 text-white">{termino ? 'Ya viajó' : 'En viaje'}</span>;
  }
  const texto = dias === 0 ? 'Viaja hoy' : dias === 1 ? 'Viaja mañana' : `En ${dias} días`;
  const color = dias <= 7 ? 'bg-red-100 text-red-700' : dias <= 30 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600';
  return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${color}`}>{texto}</span>;
}

// Liga de WhatsApp con un recordatorio ya redactado. Los teléfonos de 10 dígitos
// se asumen de México (+52); si ya traen lada internacional se usan tal cual.
export function ligaWhatsApp(fila) {
  const digitos = String(fila.cliente?.telefono || '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  const numero = digitos.length === 10 ? `52${digitos}` : digitos;
  const mensaje =
    `Hola ${fila.cliente.nombre}, te escribimos para recordarte que tu viaje a ${fila.destino} ` +
    `del ${fechaViaje(fila.fechaEntrada)} tiene un saldo pendiente de ${dinero(fila.saldo)} MXN. ` +
    '¡Quedamos atentos para cualquier duda!';
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

function exportarCSV(filas, conAgente) {
  const encabezados = ['Cliente', 'Teléfono', 'Correo', 'Destino', 'Inicio del viaje', 'Fin del viaje', 'Días para viajar',
    ...(conAgente ? ['Agente'] : []), 'Total', 'Pagado', 'Saldo', 'Abonos', 'Último abono'];
  const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lineas = filas.map(f => [
    f.cliente?.nombre, f.cliente?.telefono, f.cliente?.correo, f.destino,
    fechaViaje(f.fechaEntrada), fechaViaje(f.fechaSalida), diasHasta(f.fechaEntrada),
    ...(conAgente ? [f.agente] : []),
    f.total.toFixed(2), f.pagado.toFixed(2), f.saldo.toFixed(2), f.abonos,
    f.ultimoAbono ? fechaCorta(f.ultimoAbono) : '',
  ].map(celda).join(','));
  // BOM para que Excel abra los acentos correctamente.
  const blob = new Blob(['﻿' + [encabezados.map(celda).join(','), ...lineas].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cobranza-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const INDICADORES_VACIOS = { porCobrar: 0, reservaciones: 0, proximos: { cantidad: 0, monto: 0 }, iniciados: { cantidad: 0, monto: 0 } };

export default function Cobranza({ onAbonar }) {
  // Toda la empresa ve toda la cobranza (cualquier agente puede cobrar); el
  // filtro de agente permite ver "mis reservaciones" o las de un compañero.
  const [urgencia, setUrgencia] = useState('todas');
  const [agente, setAgente] = useState('');
  const [orden, setOrden] = useState('fecha');
  const [incluirLiquidadas, setIncluirLiquidadas] = useState(false);
  const [agentes, setAgentes] = useState([]);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    agentesApi.list({ estatus: 'Activo', orden: 'nombre', porPagina: 100 })
      .then(r => setAgentes(r.datos.filter(a => a.rol !== 'superAdmin')))
      .catch(() => setAgentes([]));
  }, []);

  // Filtros, orden, paginación e indicadores se resuelven en el servidor.
  const filtros = {
    ...(urgencia !== 'todas' ? { urgencia } : {}),
    ...(agente === 'mios' ? { mios: 1 } : agente ? { agente } : {}),
    orden,
    ...(incluirLiquidadas ? { incluirLiquidadas: 1 } : {}),
  };
  const listado = useListadoRemoto(params => pagosApi.cobranza(params), { filtros });
  const { error, datos: filtradas, cargando: loading } = listado;
  const indicadores = listado.extra.indicadores || INDICADORES_VACIOS;

  // El CSV trae todo lo que coincide con los filtros (no solo la página visible).
  const handleExportar = async () => {
    setExportando(true);
    try {
      const r = await pagosApi.cobranza({ ...filtros, q: listado.busqueda.trim(), exportar: 1, porPagina: 5000 });
      exportarCSV(r.datos, true);
    } catch (err) {
      alert(err.message);
    } finally {
      setExportando(false);
    }
  };

  const columnas = 9;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Wallet}
        title="Cobranza"
        subtitle="Reservaciones activas con saldo pendiente, de la más próxima a viajar a la más lejana."
        action={
          <button onClick={handleExportar} disabled={listado.total === 0 || exportando} className="inline-flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 shadow-sm">
            <Download size={16} /> {exportando ? 'Exportando...' : 'Exportar a Excel (CSV)'}
          </button>
        }
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider"><Wallet size={14} /> Total por cobrar</div>
          <div className="mt-2 text-2xl font-bold text-slate-800">{dinero(indicadores.porCobrar)}</div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider"><ListChecks size={14} /> Reservaciones con saldo</div>
          <div className="mt-2 text-2xl font-bold text-slate-800">{indicadores.reservaciones}</div>
        </div>
        <button onClick={() => setUrgencia('30')} className="text-left bg-amber-50 rounded-2xl shadow-sm border border-amber-200 p-5 hover:brightness-95">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 uppercase tracking-wider"><AlarmClock size={14} /> Viajan en 30 días o menos</div>
          <div className="mt-2 text-2xl font-bold text-amber-900">{dinero(indicadores.proximos.monto)}</div>
          <div className="text-xs text-amber-800">{indicadores.proximos.cantidad} reservación(es)</div>
        </button>
        <button onClick={() => setUrgencia('iniciado')} className="text-left bg-red-50 rounded-2xl shadow-sm border border-red-200 p-5 hover:brightness-95">
          <div className="flex items-center gap-2 text-xs font-semibold text-red-700 uppercase tracking-wider"><AlertTriangle size={14} /> Ya viajaron sin liquidar</div>
          <div className="mt-2 text-2xl font-bold text-red-700">{dinero(indicadores.iniciados.monto)}</div>
          <div className="text-xs text-red-700">{indicadores.iniciados.cantidad} reservación(es)</div>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-center gap-3 mb-4">
          <div className="relative lg:w-64">
            <input type="text" placeholder="Buscar cliente, destino o teléfono..." value={listado.busqueda} onChange={e => listado.setBusqueda(e.target.value)}
              className="w-full pl-3 pr-9 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo" />
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          <select value={urgencia} onChange={e => setUrgencia(e.target.value)} className="p-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-petroleo">
            {URGENCIAS.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
          </select>
          <select value={agente} onChange={e => setAgente(e.target.value)} title="Agente que vendió" className="p-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-petroleo">
            <option value="">Todos los agentes</option>
            <option value="mios">Mis reservaciones</option>
            {agentes.map(a => <option key={a._id} value={a._id}>{a.nombre}</option>)}
          </select>
          <select value={orden} onChange={e => setOrden(e.target.value)} className="p-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-petroleo">
            <option value="fecha">Ordenar: viaje más próximo</option>
            <option value="saldo">Ordenar: saldo mayor</option>
            <option value="avance">Ordenar: menor avance de pago</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600 lg:ml-auto">
            <input type="checkbox" checked={incluirLiquidadas} onChange={e => setIncluirLiquidadas(e.target.checked)} className="rounded border-slate-300 text-brand-petroleo focus:ring-brand-petroleo" />
            Incluir liquidadas
          </label>
          <SelectorPorPagina listado={listado} />
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-noche text-white text-sm">
                <th className="p-3 font-semibold">Cliente</th>
                <th className="p-3 font-semibold">Viaje</th>
                <th className="p-3 font-semibold">Inicio</th>
                <th className="p-3 font-semibold">Vendió</th>
                <th className="p-3 font-semibold">Total</th>
                <th className="p-3 font-semibold">Pagado</th>
                <th className="p-3 font-semibold min-w-[140px]">Saldo</th>
                <th className="p-3 font-semibold">Último abono</th>
                <th className="p-3 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && filtradas.length === 0 && (
                <tr><td colSpan={columnas} className="p-6 text-center text-slate-400 text-sm">Cargando cobranza...</td></tr>
              )}
              {filtradas.map(f => {
                const porcentaje = f.total > 0 ? Math.min(100, Math.round((f.pagado / f.total) * 100)) : 0;
                const whatsapp = f.saldo > 0 && ligaWhatsApp(f);
                return (
                  <tr key={f.idReservacion} className="text-sm hover:bg-slate-50">
                    <td className="p-3">
                      <div className="font-medium text-slate-700">{f.cliente?.nombre || '—'}</div>
                      {f.cliente?.telefono && <div className="text-xs text-slate-400">{f.cliente.telefono}</div>}
                    </td>
                    <td className="p-3 text-slate-600">
                      {f.destino}
                      <div className="text-xs text-slate-400">{fechaViaje(f.fechaEntrada)} al {fechaViaje(f.fechaSalida)}</div>
                    </td>
                    <td className="p-3 whitespace-nowrap"><EtiquetaViaje fila={f} /></td>
                    <td className="p-3 text-slate-600">{f.agente || '—'}</td>
                    <td className="p-3 font-mono text-xs text-slate-600">{dinero(f.total)}</td>
                    <td className="p-3 font-mono text-xs text-emerald-700">{dinero(f.pagado)}</td>
                    <td className="p-3">
                      {f.saldo > 0
                        ? <div className="font-mono text-xs font-bold text-red-600">{dinero(f.saldo)}</div>
                        : <div className="text-xs font-semibold text-emerald-700">Liquidada</div>}
                      <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${porcentaje}%` }} />
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{porcentaje}% pagado</div>
                    </td>
                    <td className="p-3 text-slate-600 text-xs">
                      {f.ultimoAbono ? fechaCorta(f.ultimoAbono) : <span className="text-red-600 font-semibold">Sin abonos</span>}
                      {f.abonos > 0 && <div className="text-slate-400">{f.abonos} abono(s)</div>}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {f.saldo > 0 && (
                          <button onClick={() => onAbonar(f.idReservacion)} title="Registrar abono" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand-coral hover:brightness-90">
                            <CreditCard size={14} /> Abonar
                          </button>
                        )}
                        {whatsapp && (
                          <a href={whatsapp} target="_blank" rel="noopener noreferrer" title="Enviar recordatorio por WhatsApp" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 border border-emerald-200 hover:bg-emerald-50">
                            <MessageCircle size={14} /> Recordar
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && listado.total === 0 && (
                <tr><td colSpan={columnas} className="p-6 text-center text-slate-400 text-sm">
                  {indicadores.reservaciones === 0 ? 'No hay reservaciones con saldo pendiente.' : 'Ninguna reservación coincide con los filtros.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <Paginacion listado={listado} etiqueta="reservaciones" />
      </div>
    </div>
  );
}
