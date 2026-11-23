import React, { useEffect, useRef, useState } from 'react';
import { pagosApi, reservacionesApi } from '../api';
import { obtenerSesion } from '../utils/sesion';
import { imprimirRecibo, imprimirEstadoCuenta, folioDePago } from '../utils/recibo';
import { exportarAbonosExcel } from '../utils/exportaciones';
import { TIPOS_COMPROBANTE, validarComprobante, abrirComprobante } from '../utils/comprobantes';
import PageHeader from './common/PageHeader';
import SelectorRemoto from './common/SelectorRemoto';
import { SelectorFecha, aTexto } from './common/Calendario';
import CampoMonto from './common/CampoMonto';
import PagosProveedor from './PagosProveedor';
import { dinero, fechaCorta, fechaViaje } from '../utils/formato';
import { DollarSign, CreditCard, Ban, CheckCircle2, Paperclip, Upload, Printer, FileCheck, Users, Truck, Clock, FileSpreadsheet, FileText } from 'lucide-react';
import { avisarExito, avisarAdvertencia, avisarError } from '../utils/avisos';
import { confirmar, pedirTexto } from '../utils/confirmar';

const etiquetaReservacion = (r) => `${r.idCliente?.nombreCompleto || 'Cliente'} — ${r.destino}`;

// Búsqueda de reservaciones (por destino o nombre/teléfono del cliente) en toda la empresa:
// cualquier agente puede registrar el abono aunque la venta sea de otro.
const buscarReservaciones = (q) => reservacionesApi.list({ q, porPagina: 15 }).then(r => r.datos);

// pestanaInicial: 'cobros' (abonos del cliente) o 'proveedores' (al llegar desde "Pago a Proveedores").
export default function Pagos({ reservaInicial = '', pestanaInicial = 'cobros' }) {
  const esAdministrador = obtenerSesion()?.rol === 'Administrador';

  const [pestana, setPestana] = useState(pestanaInicial);
  useEffect(() => { setPestana(pestanaInicial); }, [pestanaInicial, reservaInicial]);
  const [error, setError] = useState('');
  const [selectedReservaId, setSelectedReservaId] = useState('');
  const [etiquetaSeleccion, setEtiquetaSeleccion] = useState('');
  const [resumen, setResumen] = useState(null);
  const [montoPago, setMontoPago] = useState('');
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [referencia, setReferencia] = useState('');
  // Cuándo pagó el cliente: hoy por defecto; puede ser anterior, nunca futura.
  const [fechaPago, setFechaPago] = useState(() => aTexto(new Date()));
  const [archivo, setArchivo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendoId, setSubiendoId] = useState('');

  const inputArchivoForm = useRef(null);
  const inputArchivoFila = useRef(null);
  const pagoParaAdjuntar = useRef(null);

  const cargarResumen = async (id) => {
    try {
      setResumen(await pagosApi.resumen(id));
    } catch (err) {
      avisarError(err.message);
    }
  };

  const limpiarCaptura = () => {
    setMontoPago('');
    setReferencia('');
    setFechaPago(aTexto(new Date()));
    setArchivo(null);
    if (inputArchivoForm.current) inputArchivoForm.current.value = '';
  };

  const handleSelectReserva = async (id, reservacion) => {
    setSelectedReservaId(id);
    setEtiquetaSeleccion(reservacion ? etiquetaReservacion(reservacion) : '');
    limpiarCaptura();
    if (!id) { setResumen(null); return; }
    await cargarResumen(id);
  };

  // Llegando desde Cobranza o Mi Panel con una reservación ya elegida.
  useEffect(() => {
    if (!reservaInicial) return;
    reservacionesApi.get(reservaInicial)
      .then(r => handleSelectReserva(r._id, r))
      .catch(err => setError(err.message));
  }, [reservaInicial]);

  const handleArchivoForm = (e) => {
    const elegido = e.target.files[0] || null;
    const problema = elegido && validarComprobante(elegido);
    if (problema) {
      avisarError(problema);
      e.target.value = '';
      setArchivo(null);
      return;
    }
    setArchivo(elegido);
  };

  const handleLiquidacion = async (e) => {
    e.preventDefault();
    const monto = Math.round(parseFloat(montoPago) * 100) / 100;
    if (!(monto > 0)) {
      avisarError('El monto del abono debe ser mayor a cero.');
      return;
    }
    if (monto > disponible) {
      avisarError(`El monto capturado (${dinero(monto)}) excede el saldo pendiente (${dinero(disponible)}) de la reservación${porAutorizar > 0 ? `, descontando ${dinero(porAutorizar)} en pagos por autorizar` : ''}.`);
      return;
    }
    setGuardando(true);
    try {
      const pago = await pagosApi.create({ idReservacion: selectedReservaId, monto, formaPago, referencia, fecha: fechaPago });
      let aviso = pago.estatus === 'Pendiente'
        ? 'Pago registrado. Queda pendiente de que el Administrador lo autorice; hasta entonces no se suma al saldo.'
        : 'Pago registrado correctamente.';
      let archivoFallo = false;
      if (archivo) {
        try {
          await pagosApi.subirComprobante(pago._id, archivo);
        } catch (err) {
          archivoFallo = true;
          aviso = `El pago se registró, pero no se pudo subir el comprobante: ${err.message}\nPuedes adjuntarlo desde el historial de abonos.`;
        }
      }
      (archivoFallo ? avisarAdvertencia : avisarExito)(aviso);
      limpiarCaptura();
      await cargarResumen(selectedReservaId);
    } catch (err) {
      avisarError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleCancelar = async (pago) => {
    const motivo = await pedirTexto({
      titulo: 'Cancelar abono del cliente',
      detalles: [
        { etiqueta: 'Monto', valor: dinero(pago.monto), destacado: true },
        { etiqueta: 'Fecha del abono', valor: fechaCorta(pago.fecha) },
      ],
      etiqueta: 'Motivo de la cancelación', placeholder: 'Ej. se capturó dos veces', requerido: true,
      nota: 'El abono no se borra: queda como cancelado y deja de contar en el saldo del cliente.',
      textoAceptar: 'Cancelar abono', textoCancelar: 'Volver', tono: 'peligro',
    });
    if (motivo === null) return;
    try {
      await pagosApi.cancelar(pago._id, motivo.trim());
      await cargarResumen(selectedReservaId);
    } catch (err) {
      avisarError(err.message);
    }
  };

  // Un solo <input type="file"> oculto para todas las filas del historial.
  const elegirComprobante = async (pago) => {
    if (pago.comprobante?.id && !(await confirmar({
      titulo: '¿Reemplazar el comprobante?',
      mensaje: `Este abono ya tiene el comprobante "${pago.comprobante.nombreArchivo}". Si eliges otro archivo, sustituye al actual.`,
      textoAceptar: 'Elegir otro archivo',
    }))) return;
    pagoParaAdjuntar.current = pago;
    inputArchivoFila.current.value = '';
    inputArchivoFila.current.click();
  };

  const handleArchivoFila = async (e) => {
    const elegido = e.target.files[0];
    const pago = pagoParaAdjuntar.current;
    if (!elegido || !pago) return;
    const problema = validarComprobante(elegido);
    if (problema) { avisarError(problema); return; }
    setSubiendoId(pago._id);
    try {
      await pagosApi.subirComprobante(pago._id, elegido);
      await cargarResumen(selectedReservaId);
    } catch (err) {
      avisarError(err.message);
    } finally {
      setSubiendoId('');
    }
  };

  const verComprobante = (pago) => abrirComprobante(() => pagosApi.descargarComprobante(pago._id));

  // Historial completo (incluye cancelados y por autorizar, con su estatus) en Excel.
  const exportarAbonos = () => exportarAbonosExcel(resumen);

  const liquidada = resumen && resumen.saldo <= 0;
  // Lo registrado que espera autorización ya ocupa saldo: no se puede volver a cobrar.
  const porAutorizar = resumen?.porAutorizar || 0;
  const disponible = resumen ? Math.round((resumen.saldo - porAutorizar) * 100) / 100 : 0;
  const porcentaje = resumen && resumen.total > 0
    ? Math.min(100, Math.round((resumen.pagado / resumen.total) * 100))
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={DollarSign} title="Registro de Pagos" subtitle="Cobros a clientes y pagos a proveedores de cada reservación. Queda registrado quién captura cada movimiento." />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      <input ref={inputArchivoFila} type="file" accept={TIPOS_COMPROBANTE} className="hidden" onChange={handleArchivoFila} />

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <label className="block text-sm font-semibold text-slate-700 mb-2">Buscar y Vincular Reservación</label>
        <SelectorRemoto buscar={buscarReservaciones} placeholder="Busca por cliente, teléfono o destino"
          valor={selectedReservaId} etiquetaValor={etiquetaSeleccion}
          etiqueta={etiquetaReservacion}
          detalle={r => `${fechaViaje(r.fechaEntrada)} al ${fechaViaje(r.fechaSalida)} · ${r.estatus} · Vendió: ${r.agente?.nombre || '—'}`}
          onCambio={(id, r) => handleSelectReserva(id, r)} />
        <p className="mt-1 text-xs text-slate-500">Puedes registrar el pago de cualquier reservación de la empresa, aunque la haya vendido otro agente.</p>

        {resumen && (
          <div className="mt-6 inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
            <button type="button" onClick={() => setPestana('cobros')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold ${pestana === 'cobros' ? 'bg-brand-noche text-white' : 'text-slate-500 hover:text-slate-700'}`}>
              <Users size={15} /> Cobros al cliente
            </button>
            <button type="button" onClick={() => setPestana('proveedores')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold ${pestana === 'proveedores' ? 'bg-brand-noche text-white' : 'text-slate-500 hover:text-slate-700'}`}>
              <Truck size={15} /> Pagos a proveedores
            </button>
          </div>
        )}

        {resumen && pestana === 'proveedores' && (
          <PagosProveedor idReservacion={selectedReservaId} esAdministrador={esAdministrador} cliente={resumen.cliente} />
        )}

        {resumen && pestana === 'cobros' && (
          <div className="space-y-6 animate-fadeIn mt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-amber-50 border border-amber-200 p-4 rounded-xl text-sm">
              <div><span className="text-slate-500">Cliente Asociado:</span> <div className="font-bold text-slate-800">{resumen.cliente}</div></div>
              <div><span className="text-slate-500">Destino del Viaje:</span> <div className="font-bold text-slate-800">{resumen.destino}</div><div className="text-xs text-slate-500">Vendió: {resumen.vendedor || '—'} · {resumen.estatusReservacion}</div></div>
              <div><span className="text-slate-500">Total a Pagar por el Cliente:</span> <div className="font-bold text-slate-800">{dinero(resumen.total)} {resumen.moneda || 'MXN'}</div></div>
              <div className="md:col-span-3 border-t border-amber-200 my-1 pt-3 grid grid-cols-2 gap-4">
                <div><span className="text-slate-500">Abonado a la Fecha:</span> <div className="font-semibold text-emerald-700">{dinero(resumen.pagado)}</div></div>
                <div>
                  <span className="text-slate-500">Saldo Neto Pendiente:</span>
                  {liquidada
                    ? <div className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700"><CheckCircle2 size={14} /> Liquidada</div>
                    : <div className="font-bold text-red-600 text-lg">{dinero(resumen.saldo)}</div>}
                  {porAutorizar > 0 && (
                    <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800" title="Pagos registrados que esperan autorización del Administrador">
                      <Clock size={12} /> {dinero(porAutorizar)} por autorizar
                    </div>
                  )}
                </div>
              </div>
              <div className="md:col-span-3">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Avance de pago</span>
                  <span className="font-semibold text-slate-700">{porcentaje}%</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-amber-100 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${porcentaje}%` }} />
                </div>
              </div>
            </div>

            {resumen.estatusReservacion !== 'Activa' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Esta reservación está {resumen.estatusReservacion.toLowerCase()}: no admite abonos nuevos del cliente.
              </div>
            )}

            {!liquidada && resumen.estatusReservacion === 'Activa' && disponible <= 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Todo el saldo está cubierto con pagos por autorizar. Cuando el Administrador los revise, se aplicarán o se podrá registrar otro.
              </div>
            )}

            {!liquidada && resumen.estatusReservacion === 'Activa' && disponible > 0 && (
              <form onSubmit={handleLiquidacion} className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 border border-slate-100 rounded-xl">
                <div className="md:col-span-2 font-semibold text-slate-700 text-xs uppercase tracking-wider">Captura de Pago</div>
                <div>
                  <label className="block text-xs font-bold text-slate-600">Monto a Abonar ($) *</label>
                  <div className="relative mt-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                    <CampoMonto required min={0.01} max={disponible}
                      className="w-full p-2.5 pl-6 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-petroleo"
                      valor={montoPago} onCambio={setMontoPago} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600">Fecha del pago *</label>
                  <SelectorFecha required sinFuturas valor={fechaPago} onCambio={setFechaPago} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600">Método de Cobro *</label>
                  <select className="mt-1 w-full p-2.5 border border-slate-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo" value={formaPago} onChange={e => setFormaPago(e.target.value)}>
                    <option value="Efectivo">Efectivo</option>
                    <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                    <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                    <option value="Transferencia">Transferencia SPEI</option>
                    <option value="Depósito">Depósito</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600">No. de Autorización / Folio SPEI <span className="font-normal text-slate-400">(opcional)</span></label>
                  <input type="text" maxLength={60} className="mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white font-mono focus:outline-none focus:ring-2 focus:ring-brand-petroleo" placeholder="Ej. 482913 o clave de rastreo" value={referencia} onChange={e => setReferencia(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600">Comprobante del Cliente <span className="font-normal text-slate-400">(opcional · PDF o imagen, máx. 4 MB)</span></label>
                  <input ref={inputArchivoForm} type="file" accept={TIPOS_COMPROBANTE} onChange={handleArchivoForm} className="mt-1 w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-petroleo file:text-white hover:file:bg-brand-noche" />
                </div>
                <div className="md:col-span-2 flex justify-end mt-2">
                  <button type="submit" disabled={guardando} className="inline-flex items-center gap-2 bg-brand-coral text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:brightness-90 disabled:opacity-60 shadow-sm">
                    <CreditCard size={16} /> {guardando ? 'Procesando...' : 'Aplicar Pago'}
                  </button>
                </div>
              </form>
            )}

            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-slate-700 text-xs uppercase tracking-wider">Historial de Abonos</div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={exportarAbonos} disabled={resumen.pagos.length === 0}
                    title={resumen.pagos.length === 0 ? 'Aún no hay abonos para exportar' : 'Descargar el historial de abonos en Excel'}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                    <FileSpreadsheet size={15} /> Exportar a Excel
                  </button>
                  <button type="button" onClick={() => imprimirEstadoCuenta(resumen)}
                    title="Estado de cuenta imprimible (o para guardar en PDF) con los abonos, el total y el saldo"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand-petroleo/30 bg-white px-3 py-1.5 text-xs font-semibold text-brand-petroleo hover:bg-brand-petroleo/5">
                    <FileText size={15} /> Estado de cuenta
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-brand-noche text-white text-sm">
                      <th className="p-3 font-semibold">Fecha / Folio</th>
                      <th className="p-3 font-semibold">Monto</th>
                      <th className="p-3 font-semibold">Forma de Pago</th>
                      <th className="p-3 font-semibold" title="Usuario que capturó el abono en el sistema">Capturó</th>
                      <th className="p-3 font-semibold">Estatus</th>
                      <th className="p-3 font-semibold text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resumen.pagos.length === 0 && (
                      <tr><td colSpan={6} className="p-6 text-center text-slate-400 text-sm">Aún no hay abonos registrados.</td></tr>
                    )}
                    {resumen.pagos.map(p => {
                      const cancelado = p.estatus === 'Cancelado';
                      const porAutorizarPago = p.estatus === 'Pendiente';
                      const puedeAdjuntar = !cancelado && (!p.comprobante?.id || esAdministrador);
                      return (
                        <tr key={p._id} className={`text-sm ${cancelado ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                          <td className="p-3 text-slate-600">
                            {fechaCorta(p.fecha)}
                            {/* Si se capturó otro día, se indica cuándo (la fecha de arriba es cuando pagó el cliente). */}
                            {p.createdAt && fechaCorta(p.createdAt) !== fechaCorta(p.fecha) && (
                              <div className="text-2xs text-slate-400">capturado el {fechaCorta(p.createdAt)}</div>
                            )}
                            <div className="text-xs text-slate-400 font-mono">{folioDePago(p)}</div>
                          </td>
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
                                <div className="mt-1 text-xs text-slate-500">
                                  {p.canceladoPor?.nombre} · {fechaCorta(p.fechaCancelacion)}
                                  <div className="italic">"{p.motivoCancelacion}"</div>
                                </div>
                              </div>
                            ) : porAutorizarPago ? (
                              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800" title="Espera autorización del Administrador; aún no se suma al saldo">Por autorizar</span>
                            ) : (
                              <div>
                                <span className="px-2 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Aplicado</span>
                                {p.autorizadoPor?.nombre && <div className="mt-1 text-xs text-slate-500">Autorizó: {p.autorizadoPor.nombre}</div>}
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap items-center justify-center gap-1.5">
                              {p.comprobante?.id && (
                                <button onClick={() => verComprobante(p)} title={`Ver comprobante: ${p.comprobante.nombreArchivo}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-brand-noche border border-brand-petroleo/20 hover:bg-brand-petroleo/5">
                                  <FileCheck size={14} /> Comprobante
                                </button>
                              )}
                              {puedeAdjuntar && (
                                <button onClick={() => elegirComprobante(p)} disabled={subiendoId === p._id} title={p.comprobante?.id ? 'Reemplazar comprobante' : 'Adjuntar comprobante'} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-100 disabled:opacity-60">
                                  {p.comprobante?.id ? <Upload size={14} /> : <Paperclip size={14} />}
                                  {subiendoId === p._id ? 'Subiendo...' : p.comprobante?.id ? 'Reemplazar' : 'Adjuntar'}
                                </button>
                              )}
                              {!cancelado && !porAutorizarPago && (
                                <button onClick={() => imprimirRecibo(resumen, p)} title="Imprimir recibo" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-brand-coral border border-brand-coral/30 hover:bg-brand-coral/5">
                                  <Printer size={14} /> Recibo
                                </button>
                              )}
                              {esAdministrador && !cancelado && (
                                <button onClick={() => handleCancelar(p)} title={porAutorizarPago ? 'Rechazar abono (no se aplicó)' : 'Cancelar abono'} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50">
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
        )}
      </div>
    </div>
  );
}
