import React, { useEffect, useMemo, useState } from 'react';
import { clientesApi, proveedoresApi, reservacionesApi } from '../api';
import { obtenerSesion } from '../utils/sesion';
import PageHeader from './common/PageHeader';
import { Compass, Plus, Send, Search, Eye, ChevronLeft, ChevronRight, X } from 'lucide-react';

const OPCIONES_POR_PAGINA = [25, 50, 100];

const MAESTRO_VACIO = { idCliente: '', fechaEntrada: '', fechaSalida: '', destino: '', descripcion: '', montoTotal: '', notas: '' };

export default function Reservaciones() {
  const sesion = obtenerSesion();

  const [clientes, setClientes] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [reservaciones, setReservaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingListado, setLoadingListado] = useState(true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [maestro, setMaestro] = useState(MAESTRO_VACIO);
  const [detalles, setDetalles] = useState([]);

  const [busqueda, setBusqueda] = useState('');
  const [porPagina, setPorPagina] = useState(25);
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [c, p] = await Promise.all([clientesApi.list(), proveedoresApi.list()]);
        setClientes(c);
        setProveedores(p);
        setError('');
      } catch (err) {
        setError('No se pudo conectar con el servidor. ¿Está corriendo "npm run server"?');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cargarReservaciones = async () => {
    try {
      setLoadingListado(true);
      setReservaciones(await reservacionesApi.list());
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingListado(false);
    }
  };

  useEffect(() => { cargarReservaciones(); }, []);

  const clientesActivos = clientes.filter(c => c.estatus === 'Activo');
  const proveedoresActivos = proveedores.filter(p => p.estatus === 'Activo');

  const reservacionesFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return reservaciones;
    return reservaciones.filter(r =>
      r.destino.toLowerCase().includes(q) ||
      (r.idCliente?.nombreCompleto || '').toLowerCase().includes(q) ||
      (r.agente?.nombre || '').toLowerCase().includes(q)
    );
  }, [reservaciones, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(reservacionesFiltradas.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const reservacionesPaginadas = useMemo(() => {
    const inicio = (paginaSegura - 1) * porPagina;
    return reservacionesFiltradas.slice(inicio, inicio + porPagina);
  }, [reservacionesFiltradas, paginaSegura, porPagina]);

  useEffect(() => { setPagina(1); }, [busqueda, porPagina]);

  const agregarFilaDetalle = () => {
    setDetalles([...detalles, { key: Date.now(), manual: false, idProveedor: '', claveReservacion: '', montoReservacion: 0, porcentajeReservacion: 0, montoComisionable: 0, totalReservacion: 0 }]);
  };

  // Si se dio varias veces clic en "Añadir Proveedor/Servicio", esto permite
  // quitar una línea de más y vaciar/inicializar sus campos.
  const eliminarFilaDetalle = (index) => {
    setDetalles(detalles.filter((_, i) => i !== index));
  };

  const handleDetalleChange = (index, field, value) => {
    const nuevosDetalles = [...detalles];
    const fila = { ...nuevosDetalles[index] };

    if (field === 'manual') {
      fila.manual = value;
      if (value) {
        // Modo manual: el % descuento se limpia y queda bloqueado.
        fila.porcentajeReservacion = 0;
      } else {
        // Modo automático: el monto comisionable vuelve a calcularse solo.
        fila.montoComisionable = 0;
      }
    } else {
      fila[field] = value;
    }

    const monto = parseFloat(fila.montoReservacion) || 0;
    if (fila.manual) {
      // Manual: el monto calculado sale de monto base - monto comisionable.
      const comisionable = parseFloat(fila.montoComisionable) || 0;
      fila.totalReservacion = monto - comisionable;
    } else {
      // Automático: se sigue usando la fórmula existente (monto - % descuento),
      // y el monto comisionable queda igual al calculado (no editable).
      const porcentaje = parseFloat(fila.porcentajeReservacion) || 0;
      const calculado = monto - (monto * porcentaje) / 100;
      fila.totalReservacion = calculado;
      fila.montoComisionable = calculado;
    }

    nuevosDetalles[index] = fila;
    setDetalles(nuevosDetalles);
  };

  const guardarTodo = async (e) => {
    e.preventDefault();
    if (!maestro.idCliente || detalles.length === 0) {
      alert('Completa los datos maestros y añade al menos un servicio en el detalle.');
      return;
    }
    setGuardando(true);
    try {
      await reservacionesApi.create({
        ...maestro,
        // Se manda totalReservacion ya calculado: en modo manual sale de
        // monto base - monto comisionable, una fórmula que el backend no conoce.
        detalleReservacion: detalles.map(({ key, manual, ...d }) => d),
      });
      setMaestro(MAESTRO_VACIO);
      setDetalles([]);
      await cargarReservaciones();
      alert('Se guardaron correctamente los datos.');
    } catch (err) {
      alert(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleVer = (r) => {
    const servicios = r.detalleReservacion
      .map(d => `- ${d.idProveedor?.nombreProveedor || 'Proveedor'}: comisionable $${d.montoComisionable.toFixed(2)} · total $${d.totalReservacion.toFixed(2)}`)
      .join('\n');
    alert(
      `Destino: ${r.destino}\nCliente: ${r.idCliente?.nombreCompleto || ''}\nAgente: ${r.agente?.nombre || ''}\n` +
      `Entrada: ${new Date(r.fechaEntrada).toLocaleDateString('es-MX')}  Salida: ${new Date(r.fechaSalida).toLocaleDateString('es-MX')}\n` +
      `Descripción: ${r.descripcion || '—'}\nNotas: ${r.notas || '—'}\n\nServicios:\n${servicios || '—'}\n\n` +
      `Monto Total de la Reservación: $${r.montoTotal.toFixed(2)}\nCosto con Proveedores: $${r.totalViaje.toFixed(2)}`
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Compass} title="Reservaciones" subtitle="Arma el viaje de tu cliente y añade los servicios contratados." />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <form onSubmit={guardarTodo} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div className="md:col-span-3 font-semibold text-brand-tealDark text-sm">Datos del viaje</div>
            <div>
              <label className="block text-xs font-bold text-slate-600">Cliente Activo *</label>
              <select required disabled={loading} className="mt-1 w-full p-2.5 border border-slate-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" value={maestro.idCliente} onChange={e => setMaestro({ ...maestro, idCliente: e.target.value })}>
                <option value="">-- Seleccionar --</option>
                {clientesActivos.map(c => <option key={c._id} value={c._id}>{c.nombreCompleto}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600">Fecha de Entrada *</label>
              <input type="date" required className="mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" value={maestro.fechaEntrada} onChange={e => setMaestro({ ...maestro, fechaEntrada: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600">Fecha de Salida *</label>
              <input type="date" required className="mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" value={maestro.fechaSalida} onChange={e => setMaestro({ ...maestro, fechaSalida: e.target.value })} />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-slate-600">Destino Turístico *</label>
              <input type="text" maxLength={100} required className="mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" placeholder="Ej. Cancún, México" value={maestro.destino} onChange={e => setMaestro({ ...maestro, destino: e.target.value })} />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-slate-600">Descripción del viaje</label>
              <textarea rows={2} className="mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" placeholder="Ej. Viaje familiar todo incluido, vuelo redondo + hotel" value={maestro.descripcion} onChange={e => setMaestro({ ...maestro, descripcion: e.target.value })} />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-slate-600">Monto Total de la Reservación ($) *</label>
              <input type="number" required step="0.01" min="0" className="mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" placeholder="0.00" value={maestro.montoTotal} onChange={e => setMaestro({ ...maestro, montoTotal: e.target.value })} />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-slate-600">Notas / Pendientes del agente</label>
              <textarea rows={2} className="mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" placeholder="Ej. Confirmar tarifa con el proveedor antes del 10 de diciembre" value={maestro.notas} onChange={e => setMaestro({ ...maestro, notas: e.target.value })} />
            </div>
          </div>

          <div className="border border-slate-100 rounded-xl p-4">
            <div className="flex justify-between items-center mb-4">
              <span className="font-semibold text-slate-700 text-sm">Detalle de servicios / proveedores</span>
              <button type="button" onClick={agregarFilaDetalle} disabled={loading} className="inline-flex items-center gap-1.5 bg-brand-purple text-white px-3 py-1.5 text-xs font-semibold rounded-lg hover:brightness-90 disabled:opacity-60">
                <Plus size={14} /> Añadir Proveedor/Servicio
              </button>
            </div>

            {detalles.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">No hay servicios agregados a esta reservación.</p>
            ) : (
              <div className="space-y-3">
                {detalles.map((d, index) => (
                  <div key={d.key} className="p-3 bg-brand-teal/10 rounded-lg border border-brand-teal/20">
                    <div className="flex items-center justify-between mb-2">
                      <label className="flex items-center gap-1.5 text-2xs uppercase text-slate-600 font-bold cursor-pointer">
                        <input type="checkbox" checked={d.manual}
                          onChange={e => handleDetalleChange(index, 'manual', e.target.checked)}
                          className="rounded border-slate-300 text-brand-teal focus:ring-brand-teal" />
                        Manual
                      </label>
                      <button type="button" onClick={() => eliminarFilaDetalle(index)} title="Quitar este servicio"
                        className="text-slate-400 hover:text-red-600">
                        <X size={16} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                      <div>
                        <label className="block text-2xs uppercase text-slate-500 font-bold">Proveedor *</label>
                        <select required className="w-full p-1.5 border border-slate-300 rounded bg-white text-xs" value={d.idProveedor} onChange={e => handleDetalleChange(index, 'idProveedor', e.target.value)}>
                          <option value="">-- Prov --</option>
                          {proveedoresActivos.map(p => <option key={p._id} value={p._id}>{p.nombreProveedor}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-2xs uppercase text-slate-500 font-bold">Clave Confirmación *</label>
                        <input type="text" required className="w-full p-1.5 border border-slate-300 rounded text-xs" value={d.claveReservacion} onChange={e => handleDetalleChange(index, 'claveReservacion', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-2xs uppercase text-slate-500 font-bold">Monto Base ($) *</label>
                        <input type="number" required step="0.01" className="w-full p-1.5 border border-slate-300 rounded text-xs" value={d.montoReservacion} onChange={e => handleDetalleChange(index, 'montoReservacion', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-2xs uppercase text-slate-500 font-bold">% Descuento {!d.manual && '*'}</label>
                        <input type="number" required={!d.manual} disabled={d.manual} max={100}
                          className="w-full p-1.5 border border-slate-300 rounded text-xs disabled:bg-slate-100 disabled:text-slate-400"
                          value={d.porcentajeReservacion} onChange={e => handleDetalleChange(index, 'porcentajeReservacion', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-2xs uppercase text-slate-500 font-bold">Monto Comisionable ($) {d.manual && '*'}</label>
                        <input type="number" required={d.manual} disabled={!d.manual} step="0.01" min="0"
                          className="w-full p-1.5 border border-slate-300 rounded text-xs disabled:bg-slate-100 disabled:text-slate-400"
                          value={d.montoComisionable} onChange={e => handleDetalleChange(index, 'montoComisionable', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-2xs uppercase text-slate-500 font-bold">Total Calculado ($)</label>
                        <input type="text" disabled className="w-full p-1.5 border border-slate-200 rounded bg-slate-100 font-bold text-xs text-brand-tealDark" value={`$${d.totalReservacion.toFixed(2)}`} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={guardando} className="inline-flex items-center gap-2 bg-brand-teal text-white px-6 py-2.5 rounded-lg font-semibold shadow-sm hover:bg-brand-tealDark disabled:opacity-60">
              <Send size={16} /> {guardando ? 'Guardando...' : 'Procesar y Guardar Reservación'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Compass size={18} className="text-brand-teal" />
            <h2 className="text-base font-bold text-brand-tealDark">
              {sesion?.rol === 'Agente' ? 'Mis Reservaciones' : 'Listado de Reservaciones'}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input type="text" placeholder="Buscar por destino, cliente o agente..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
                className="w-full sm:w-64 pl-3 pr-9 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 shrink-0">
              Mostrar
              <select value={porPagina} onChange={e => setPorPagina(Number(e.target.value))}
                className="p-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal">
                {OPCIONES_POR_PAGINA.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-tealDark text-white text-sm">
                <th className="p-3 font-semibold">Cliente</th>
                <th className="p-3 font-semibold">Destino</th>
                <th className="p-3 font-semibold">Entrada</th>
                <th className="p-3 font-semibold">Salida</th>
                <th className="p-3 font-semibold">Agente</th>
                <th className="p-3 font-semibold">Total</th>
                <th className="p-3 font-semibold">Estatus</th>
                <th className="p-3 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingListado && (
                <tr><td colSpan={8} className="p-6 text-center text-slate-400 text-sm">Cargando reservaciones...</td></tr>
              )}
              {!loadingListado && reservacionesPaginadas.map(r => (
                <tr key={r._id} className="text-sm hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-700">{r.idCliente?.nombreCompleto || '—'}</td>
                  <td className="p-3 text-slate-600">{r.destino}</td>
                  <td className="p-3 text-slate-600">{new Date(r.fechaEntrada).toLocaleDateString('es-MX')}</td>
                  <td className="p-3 text-slate-600">{new Date(r.fechaSalida).toLocaleDateString('es-MX')}</td>
                  <td className="p-3 text-slate-600">{r.agente?.nombre || '—'}</td>
                  <td className="p-3 text-slate-600 font-mono text-xs">${r.totalViaje.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                  <td className="p-3">
                    <span className="px-2 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">{r.estatus}</span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-center">
                      <button onClick={() => handleVer(r)} title="Ver" className="w-8 h-8 rounded-full bg-brand-teal hover:bg-brand-tealDark text-white flex items-center justify-center">
                        <Eye size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loadingListado && reservacionesFiltradas.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-400 text-sm">No se encontraron reservaciones.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!loadingListado && reservacionesFiltradas.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
            <p className="text-sm text-slate-500">
              Mostrando {(paginaSegura - 1) * porPagina + 1}–{Math.min(paginaSegura * porPagina, reservacionesFiltradas.length)} de {reservacionesFiltradas.length} reservaciones
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={paginaSegura === 1}
                className="w-8 h-8 rounded-lg border border-slate-300 text-slate-600 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-slate-600 px-2">Página {paginaSegura} de {totalPaginas}</span>
              <button type="button" onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={paginaSegura === totalPaginas}
                className="w-8 h-8 rounded-lg border border-slate-300 text-slate-600 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
