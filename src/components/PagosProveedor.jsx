import React, { useEffect, useRef, useState } from 'react';
import { pagosProveedorApi } from '../api';
import { dinero, fechaCorta } from '../utils/formato';
import { TIPOS_COMPROBANTE, validarComprobante, abrirComprobante } from '../utils/comprobantes';
import { Truck, Send, Ban, CheckCircle2, Paperclip, Upload, FileCheck } from 'lucide-react';

// Pagos de la agencia a los proveedores de una reservación (cuentas por pagar).
// Por cada servicio del detalle: lo que se le debe al proveedor (ya descontada
// la comisión), lo pagado y el saldo. Cada pago guarda quién lo capturó, puede
// llevar comprobante y queda en la bitácora; cancelarlo es del Administrador.
const FORMULARIO_VACIO = { idDetalle: '', monto: '', formaPago: 'Transferencia', referencia: '' };

export default function PagosProveedor({ idReservacion, esAdministrador }) {
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(FORMULARIO_VACIO);
  const [archivo, setArchivo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendoId, setSubiendoId] = useState('');
  const inputArchivoForm = useRef(null);
  const inputArchivoFila = useRef(null);
  const pagoParaAdjuntar = useRef(null);

  const cargar = async () => {
    try {
      setEstado(await pagosProveedorApi.estadoReservacion(idReservacion));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    setEstado(null);
    setForm(FORMULARIO_VACIO);
    cargar();
  }, [idReservacion]);

  const elegirServicio = (d) => setForm({ ...form, idDetalle: d.idDetalle, monto: String(d.saldo) });

  const handleArchivoForm = (e) => {
    const elegido = e.target.files[0] || null;
    const problema = elegido && validarComprobante(elegido);
    if (problema) { alert(problema); e.target.value = ''; setArchivo(null); return; }
    setArchivo(elegido);
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    const detalle = estado.detalles.find(d => d.idDetalle === form.idDetalle);
    const monto = Math.round(parseFloat(form.monto) * 100) / 100;
    if (!detalle) { alert('Selecciona el servicio que se le paga al proveedor.'); return; }
    if (!(monto > 0)) { alert('El monto debe ser mayor a cero.'); return; }
    if (monto > detalle.saldo) { alert(`El monto excede el saldo pendiente con el proveedor (${dinero(detalle.saldo)}).`); return; }
    setGuardando(true);
    try {
      const pago = await pagosProveedorApi.create({ idReservacion, ...form, monto });
      let aviso = 'Pago al proveedor registrado correctamente.';
      if (archivo) {
        try {
          await pagosProveedorApi.subirComprobante(pago._id, archivo);
        } catch (err) {
          aviso = `El pago se registró, pero no se pudo subir el comprobante: ${err.message}\nPuedes adjuntarlo desde el historial.`;
        }
      }
      alert(aviso);
      setForm(FORMULARIO_VACIO);
      setArchivo(null);
      if (inputArchivoForm.current) inputArchivoForm.current.value = '';
      await cargar();
    } catch (err) {
      alert(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleCancelar = async (pago) => {
    const motivo = window.prompt(`Cancelar el pago de ${dinero(pago.monto)} a ${pago.idProveedor?.nombreProveedor || 'el proveedor'}.\n\nEscribe el motivo de la cancelación:`);
    if (motivo === null) return;
    if (!motivo.trim()) { alert('El motivo de la cancelación es obligatorio.'); return; }
    try {
      await pagosProveedorApi.cancelar(pago._id, motivo.trim());
      await cargar();
    } catch (err) {
      alert(err.message);
    }
  };

  const elegirComprobante = (pago) => {
    if (pago.comprobante?.id && !window.confirm(`Este pago ya tiene el comprobante "${pago.comprobante.nombreArchivo}". ¿Reemplazarlo?`)) return;
    pagoParaAdjuntar.current = pago;
    inputArchivoFila.current.value = '';
    inputArchivoFila.current.click();
  };

  const handleArchivoFila = async (e) => {
    const elegido = e.target.files[0];
    const pago = pagoParaAdjuntar.current;
    if (!elegido || !pago) return;
    const problema = validarComprobante(elegido);
    if (problema) { alert(problema); return; }
    setSubiendoId(pago._id);
    try {
      await pagosProveedorApi.subirComprobante(pago._id, elegido);
      await cargar();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubiendoId('');
    }
  };

  if (error) return <div className="mt-6 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>;
  if (!estado) return <p className="mt-6 text-sm text-slate-400">Cargando pagos a proveedores...</p>;

  const pendientes = estado.detalles.filter(d => d.saldo > 0);
  const admitePagos = estado.estatusReservacion !== 'Cancelada';
  const porcentaje = estado.totales.total > 0 ? Math.min(100, Math.round((estado.totales.pagado / estado.totales.total) * 100)) : 0;

  return (
    <div className="space-y-6 animate-fadeIn mt-6">
      <input ref={inputArchivoFila} type="file" accept={TIPOS_COMPROBANTE} className="hidden" onChange={handleArchivoFila} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-sky-50 border border-sky-200 p-4 rounded-xl text-sm">
        <div><span className="text-slate-500">Total a pagar a proveedores:</span> <div className="font-bold text-slate-800">{dinero(estado.totales.total)} {estado.moneda || 'MXN'}</div></div>
        <div><span className="text-slate-500">Pagado a la fecha:</span> <div className="font-semibold text-emerald-700">{dinero(estado.totales.pagado)}</div></div>
        <div>
          <span className="text-slate-500">Saldo con proveedores:</span>
          {estado.totales.saldo <= 0
            ? <div className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700"><CheckCircle2 size={14} /> Liquidado</div>
            : <div className="font-bold text-red-600 text-lg">{dinero(estado.totales.saldo)}</div>}
        </div>
        <div className="md:col-span-3">
          <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Avance de pago a proveedores</span><span className="font-semibold text-slate-700">{porcentaje}%</span></div>
          <div className="h-2.5 w-full rounded-full bg-sky-100 overflow-hidden"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${porcentaje}%` }} /></div>
        </div>
      </div>

      {/* Saldo por servicio */}
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <th className="p-3 font-semibold">Proveedor</th>
              <th className="p-3 font-semibold">Clave</th>
              <th className="p-3 font-semibold text-right">A pagar</th>
              <th className="p-3 font-semibold text-right">Pagado</th>
              <th className="p-3 font-semibold text-right">Saldo</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {estado.detalles.map(d => (
              <tr key={d.idDetalle} className={form.idDetalle === d.idDetalle ? 'bg-brand-petroleo/5' : 'hover:bg-slate-50'}>
                <td className="p-3 font-medium text-slate-700">{d.proveedor?.nombre || '—'}</td>
                <td className="p-3 font-mono text-xs text-slate-500">{d.claveReservacion}</td>
                <td className="p-3 text-right text-slate-600">{dinero(d.total)}</td>
                <td className="p-3 text-right text-emerald-700">{dinero(d.pagado)}</td>
                <td className="p-3 text-right font-semibold">{d.saldo > 0 ? <span className="text-red-600">{dinero(d.saldo)}</span> : <span className="text-emerald-700">Liquidado</span>}</td>
                <td className="p-3 text-right">
                  {admitePagos && d.saldo > 0 && (
                    <button type="button" onClick={() => elegirServicio(d)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand-coral hover:brightness-90">
                      <Send size={13} /> Pagar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {estado.detalles.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-slate-400">Esta reservación no tiene servicios con proveedores.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {!admitePagos && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">La reservación está cancelada: no admite pagos nuevos a proveedores.</div>
      )}

      {admitePagos && pendientes.length > 0 && (
        <form onSubmit={handleGuardar} className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 border border-slate-100 rounded-xl">
          <div className="md:col-span-2 font-semibold text-slate-700 text-xs uppercase tracking-wider">Registrar pago a proveedor</div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-600">Servicio / proveedor *</label>
            <select required className="mt-1 w-full p-2.5 border border-slate-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo"
              value={form.idDetalle} onChange={e => { const d = pendientes.find(x => x.idDetalle === e.target.value); d ? elegirServicio(d) : setForm({ ...form, idDetalle: '' }); }}>
              <option value="">-- Selecciona el servicio --</option>
              {pendientes.map(d => <option key={d.idDetalle} value={d.idDetalle}>{d.proveedor?.nombre} · {d.claveReservacion} · saldo {dinero(d.saldo)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600">Monto ($) *</label>
            <input type="number" step="0.01" min="0.01" required className="mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white font-mono focus:outline-none focus:ring-2 focus:ring-brand-petroleo"
              value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600">Forma de pago *</label>
            <select className="mt-1 w-full p-2.5 border border-slate-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo"
              value={form.formaPago} onChange={e => setForm({ ...form, formaPago: e.target.value })}>
              <option value="Transferencia">Transferencia SPEI</option>
              <option value="Efectivo">Efectivo</option>
              <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
              <option value="Tarjeta de Débito">Tarjeta de Débito</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600">Folio / clave de rastreo <span className="font-normal text-slate-400">(opcional)</span></label>
            <input type="text" maxLength={60} className="mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white font-mono focus:outline-none focus:ring-2 focus:ring-brand-petroleo"
              value={form.referencia} onChange={e => setForm({ ...form, referencia: e.target.value })} placeholder="Ej. clave de rastreo SPEI" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600">Comprobante <span className="font-normal text-slate-400">(opcional · PDF o imagen, máx. 4 MB)</span></label>
            <input ref={inputArchivoForm} type="file" accept={TIPOS_COMPROBANTE} onChange={handleArchivoForm}
              className="mt-1 w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-petroleo file:text-white hover:file:bg-brand-noche" />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button type="submit" disabled={guardando} className="inline-flex items-center gap-2 bg-brand-coral text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:brightness-90 disabled:opacity-60 shadow-sm">
              <Truck size={16} /> {guardando ? 'Procesando...' : 'Registrar pago'}
            </button>
          </div>
        </form>
      )}

      <div>
        <div className="font-semibold text-slate-700 text-xs uppercase tracking-wider mb-3">Historial de pagos a proveedores</div>
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-noche text-white text-sm">
                <th className="p-3 font-semibold">Fecha</th>
                <th className="p-3 font-semibold">Proveedor</th>
                <th className="p-3 font-semibold">Monto</th>
                <th className="p-3 font-semibold">Forma de pago</th>
                <th className="p-3 font-semibold" title="Usuario que capturó el pago en el sistema">Capturó</th>
                <th className="p-3 font-semibold">Estatus</th>
                <th className="p-3 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {estado.pagos.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-slate-400 text-sm">Aún no hay pagos a proveedores.</td></tr>
              )}
              {estado.pagos.map(p => {
                const cancelado = p.estatus === 'Cancelado';
                const puedeAdjuntar = !cancelado && (!p.comprobante?.id || esAdministrador);
                return (
                  <tr key={p._id} className={`text-sm ${cancelado ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                    <td className="p-3 text-slate-600">{fechaCorta(p.fecha)}</td>
                    <td className="p-3 text-slate-700">{p.idProveedor?.nombreProveedor || '—'}</td>
                    <td className={`p-3 font-mono text-xs ${cancelado ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{dinero(p.monto)}</td>
                    <td className="p-3 text-slate-600">
                      {p.formaPago}
                      {p.referencia && <div className="text-xs text-slate-400 font-mono">Ref. {p.referencia}</div>}
                    </td>
                    <td className="p-3 text-slate-600">{p.agente?.nombre || '—'}</td>
                    <td className="p-3">
                      {cancelado ? (
                        <div>
                          <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">Cancelado</span>
                          <div className="mt-1 text-xs text-slate-500">{p.canceladoPor?.nombre} · {fechaCorta(p.fechaCancelacion)}<div className="italic">"{p.motivoCancelacion}"</div></div>
                        </div>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Aplicado</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        {p.comprobante?.id && (
                          <button onClick={() => abrirComprobante(() => pagosProveedorApi.descargarComprobante(p._id))} title={`Ver comprobante: ${p.comprobante.nombreArchivo}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-brand-noche border border-brand-petroleo/20 hover:bg-brand-petroleo/5">
                            <FileCheck size={14} /> Comprobante
                          </button>
                        )}
                        {puedeAdjuntar && (
                          <button onClick={() => elegirComprobante(p)} disabled={subiendoId === p._id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-100 disabled:opacity-60">
                            {p.comprobante?.id ? <Upload size={14} /> : <Paperclip size={14} />}
                            {subiendoId === p._id ? 'Subiendo...' : p.comprobante?.id ? 'Reemplazar' : 'Adjuntar'}
                          </button>
                        )}
                        {esAdministrador && !cancelado && (
                          <button onClick={() => handleCancelar(p)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50">
                            <Ban size={14} /> Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
