import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Ban, CheckCircle2, CreditCard, FileSpreadsheet, FileText, MessageCircle, Pencil, Plus, Send, Trash2, X,
} from 'lucide-react';
import { reservacionesApi, pagosApi, pagosProveedorApi } from '../api';
import { exportarAbonosExcel, exportarPagosProveedorExcel } from '../utils/exportaciones';
import { imprimirEstadoCuenta } from '../utils/recibo';
import { dinero, fechaViaje, telefono } from '../utils/formato';
import { PendientesDeRegistro } from './pendientes/Pendientes';
import { avisarError } from '../utils/avisos';
import { confirmar, pedirTexto } from '../utils/confirmar';

// Ficha de reservación (pantalla completa): resumen del viaje, cobro al cliente,
// servicios y proveedores, peticiones del cliente, pendientes, checklist de
// documentos y bitácora con notas. Se abre con "Ver" en el listado.

const tarjeta = 'rounded-2xl border border-slate-100 bg-white p-5 shadow-sm';
const COLOR_ESTATUS = { Activa: 'bg-emerald-100 text-emerald-700', Completada: 'bg-slate-100 text-slate-600', Cancelada: 'bg-red-100 text-red-700' };
const PASOS = ['Solicitada', 'Enviada', 'Confirmada'];
const CANALES = ['WhatsApp', 'Llamada', 'Correo', 'En persona'];
const ESTATUS_DOC = [['Pendiente', 'Pendiente'], ['Listo', 'Recibido / enviado'], ['No aplica', 'No aplica']];

function Barra({ valor, total }) {
  const pct = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0;
  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${pct}% pagado`}>
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-0.5 text-[11px] text-slate-400">{pct}% pagado</div>
    </div>
  );
}

function textoSale(dias) {
  if (dias > 1) return { texto: `Sale en ${dias} días`, clase: dias <= 7 ? 'text-red-700' : dias <= 30 ? 'text-amber-700' : 'text-slate-500' };
  if (dias === 1) return { texto: 'Sale mañana', clase: 'text-red-700' };
  if (dias === 0) return { texto: 'Sale hoy', clase: 'text-red-700' };
  return { texto: 'Viaje iniciado o terminado', clase: 'text-slate-500' };
}

// Una línea de la bitácora en lenguaje claro.
function textoBitacora(b) {
  const valor = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  const prefijo = b.entidad === 'Pago' ? 'Abono · ' : b.entidad === 'PagoProveedor' ? 'Pago a proveedor · ' : b.entidad === 'Pendiente' ? 'Pendiente · ' : '';
  if (b.campo === 'nota') return { titulo: valor(b.nuevo), nota: true };
  if (b.anterior !== null && b.anterior !== undefined) return { titulo: `${prefijo}${b.campo}: ${valor(b.anterior)} → ${valor(b.nuevo)}` };
  const evento = b.campo.charAt(0).toUpperCase() + b.campo.slice(1);
  return { titulo: `${prefijo}${evento}${b.nuevo ? `: ${valor(b.nuevo)}` : ''}` };
}

export default function FichaReservacion({ id, onVolver, onEditar, onCancelar, onAbonar, onPagarProveedor }) {
  const [f, setF] = useState(null);
  const [error, setError] = useState('');
  const [peticion, setPeticion] = useState({ descripcion: '', canal: 'WhatsApp' });
  const [nuevoDoc, setNuevoDoc] = useState('');
  const [nota, setNota] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const cargar = async () => {
    try { setF(await reservacionesApi.ficha(id)); setError(''); } catch (err) { setError(err.message); }
  };
  useEffect(() => { setF(null); cargar(); window.scrollTo({ top: 0 }); }, [id]);

  // Exportaciones: los datos se piden al momento (la ficha no trae el detalle de cada pago).
  const [descargando, setDescargando] = useState('');
  const descargar = async (cual, fn) => {
    setDescargando(cual);
    try { await fn(); } catch (err) { avisarError(err.message); } finally { setDescargando(''); }
  };
  const exportarAbonos = () => descargar('abonos', async () => exportarAbonosExcel(await pagosApi.resumen(id)));
  const exportarPagosProveedor = () => descargar('proveedores', async () =>
    exportarPagosProveedorExcel(await pagosProveedorApi.estadoReservacion(id), f?.cliente?.nombre || ''));

  const accion = async (fn) => {
    setOcupado(true);
    try { await fn(); await cargar(); } catch (err) { avisarError(err.message); } finally { setOcupado(false); }
  };

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <button onClick={onVolver} className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-brand-noche hover:underline"><ArrowLeft size={16} /> Volver a reservaciones</button>
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      </div>
    );
  }
  if (!f) return <p className="py-10 text-center text-sm text-slate-400">Cargando ficha…</p>;

  const r = f.reservacion;
  const sale = textoSale(f.diasParaViajar);
  const operar = f.permisos.operar;
  const digitos = String(f.cliente?.telefono || '').replace(/\D/g, '');
  const wa = digitos.length >= 10 ? `https://wa.me/${digitos.length === 10 ? `52${digitos}` : digitos}?text=${encodeURIComponent(`Hola ${f.cliente.nombre}, `)}` : null;
  const moneda = r.moneda || 'MXN';

  const guardarDocs = (lista) => accion(() => reservacionesApi.guardarDocumentos(id, lista.map(({ _id, nombre, estatus }) => ({ _id, nombre, estatus }))));

  return (
    <div className={`flex flex-col gap-6 ${ocupado ? 'pointer-events-none opacity-70' : ''}`}>
      <button onClick={onVolver} className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-brand-noche hover:underline">
        <ArrowLeft size={16} /> Volver a reservaciones
      </button>

      {/* Encabezado */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800">{f.cliente?.nombre || '—'} · {r.destino}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLOR_ESTATUS[r.estatus] || COLOR_ESTATUS.Activa}`}>{r.estatus}</span>
          </div>
          <p className="text-sm text-slate-500">Vendió: {f.vendedor || '—'} · Registrada el {new Date(r.createdAt).toLocaleDateString('es-MX')} · {moneda}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">
              <MessageCircle size={15} /> WhatsApp al cliente
            </a>
          )}
          {f.permisos.cobrar && f.cobro.saldo > 0.005 && (
            <button onClick={() => onAbonar(r._id)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-brand-coral px-3 text-sm font-semibold text-white hover:brightness-90"><CreditCard size={15} /> Registrar abono</button>
          )}
          {r.estatus !== 'Cancelada' && f.proveedores.saldo > 0.005 && (
            <button onClick={() => onPagarProveedor(r._id)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-brand-coral px-3 text-sm font-semibold text-brand-coral hover:bg-brand-coral/5"><Send size={15} /> Pagar a proveedor</button>
          )}
          {f.permisos.editar && (
            <button onClick={() => onEditar(r)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-brand-coralClaro px-3 text-sm font-semibold text-brand-noche hover:brightness-95"><Pencil size={15} /> Editar</button>
          )}
          {f.permisos.cancelar && (
            <button onClick={async () => { if (await onCancelar(r)) cargar(); }} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-red-500 px-3 text-sm font-semibold text-white hover:bg-red-600"><Ban size={15} /> Cancelar</button>
          )}
        </div>
      </header>

      {/* Resumen */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <div className={tarjeta}>
          <div className="text-xs font-medium text-slate-500">Viaje</div>
          <div className="mt-1 font-semibold text-slate-800">{fechaViaje(r.fechaEntrada)} al {fechaViaje(r.fechaSalida)}</div>
          <div className={`text-sm font-semibold ${sale.clase}`}>{sale.texto}</div>
          {r.descripcion && <div className="mt-1 text-xs text-slate-500">{r.descripcion}</div>}
        </div>
        <div className={tarjeta}>
          <div className="text-xs font-medium text-slate-500">Cliente</div>
          <div className="mt-1 font-semibold text-slate-800">{f.cliente?.nombre || '—'}</div>
          {f.cliente?.telefono && <div className="text-sm text-slate-500">{telefono(f.cliente.telefono)}</div>}
          {f.cliente?.correo && <div className="truncate text-sm text-slate-500">{f.cliente.correo}</div>}
        </div>
        <div className={tarjeta}>
          <div className="text-xs font-medium text-slate-500">Cobro al cliente</div>
          <div className="mt-1 font-semibold text-slate-800">{f.cobro.saldo > 0.005 ? `Saldo ${dinero(f.cobro.saldo)}` : 'Liquidado'}</div>
          <div className="mb-1 text-xs text-slate-500">Total {dinero(f.cobro.total)} · abonado {dinero(f.cobro.abonado)}</div>
          <Barra valor={f.cobro.abonado} total={f.cobro.total} />
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <button type="button" onClick={exportarAbonos} disabled={descargando === 'abonos'} title="Descargar el historial de abonos del cliente en Excel"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
              <FileSpreadsheet size={14} /> {descargando === 'abonos' ? 'Descargando…' : 'Excel'}
            </button>
            <button type="button" onClick={() => imprimirEstadoCuenta(pagosApi.resumen(r._id))} title="Estado de cuenta imprimible (o para guardar en PDF) con los abonos, el total y el saldo"
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-petroleo/30 bg-white px-2.5 py-1.5 text-xs font-semibold text-brand-petroleo hover:bg-brand-petroleo/5">
              <FileText size={14} /> Estado de cuenta
            </button>
          </div>
        </div>
        <div className={tarjeta}>
          <div className="text-xs font-medium text-slate-500">Pago a proveedores</div>
          <div className="mt-1 font-semibold text-slate-800">{f.proveedores.saldo > 0.005 ? `Saldo ${dinero(f.proveedores.saldo)}` : 'Liquidado'}</div>
          <div className="mb-1 text-xs text-slate-500">A pagar {dinero(f.proveedores.total)} · pagado {dinero(f.proveedores.pagado)}</div>
          <Barra valor={f.proveedores.pagado} total={f.proveedores.total} />
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          {/* Peticiones del cliente */}
          <section className={`${tarjeta} space-y-4`}>
            <h2 className="text-base font-bold text-slate-800">Peticiones del cliente</h2>
            {f.peticiones.length === 0 && <p className="text-sm text-slate-400">Sin peticiones registradas.</p>}
            {f.peticiones.map(p => {
              const paso = PASOS.indexOf(p.estatus);
              const rechazada = p.estatus === 'Rechazada';
              return (
                <div key={p._id} className="space-y-2.5 rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="font-semibold text-slate-800">{p.descripcion}</span>
                    <span className="text-xs text-slate-500">Pedida el {new Date(p.fechaSolicitud).toLocaleDateString('es-MX')}{p.canal ? ` por ${p.canal}` : ''}</span>
                  </div>
                  {rechazada ? (
                    <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><strong>Rechazada</strong>{p.motivo ? `: ${p.motivo}` : ''}</div>
                  ) : (
                    <ol className="grid grid-cols-3 gap-1.5 text-xs font-semibold">
                      {PASOS.map((nombre, i) => (
                        <li key={nombre} className={`rounded-md px-2 py-1.5 ${i <= paso ? (paso === 2 ? 'bg-emerald-600 text-white' : 'bg-brand-coral text-white') : 'bg-slate-100 text-slate-500'}`}>
                          {i + 1} · {nombre === 'Enviada' ? 'Enviada al proveedor' : nombre}
                        </li>
                      ))}
                    </ol>
                  )}
                  {operar && (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {p.estatus === 'Solicitada' && <button onClick={() => accion(() => reservacionesApi.cambiarPeticion(id, p._id, { estatus: 'Enviada' }))} className="min-h-[34px] rounded-lg bg-brand-coral/10 px-3 text-xs font-semibold text-brand-coral hover:bg-brand-coral/20">Marcar enviada al proveedor</button>}
                      {p.estatus === 'Enviada' && <button onClick={() => accion(() => reservacionesApi.cambiarPeticion(id, p._id, { estatus: 'Confirmada' }))} className="min-h-[34px] rounded-lg bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">Marcar confirmada</button>}
                      {(p.estatus === 'Solicitada' || p.estatus === 'Enviada') && (
                        <button onClick={async () => {
                          const motivo = await pedirTexto({
                            titulo: 'Petición rechazada', detalles: [{ etiqueta: 'Petición', valor: p.descripcion, completo: true }],
                            etiqueta: '¿Por qué no se pudo?', placeholder: 'Ej. el hotel no tiene cunas disponibles', requerido: true,
                            nota: 'Se guarda el motivo y se crea el pendiente de avisar al cliente.', textoAceptar: 'Marcar rechazada', textoCancelar: 'Volver',
                          });
                          if (motivo) accion(() => reservacionesApi.cambiarPeticion(id, p._id, { estatus: 'Rechazada', motivo }));
                        }}
                          className="min-h-[34px] rounded-lg bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100">Rechazada</button>
                      )}
                      {(p.estatus === 'Confirmada' || rechazada) && <button onClick={() => accion(() => reservacionesApi.cambiarPeticion(id, p._id, { estatus: 'Solicitada' }))} className="min-h-[34px] rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">Reabrir</button>}
                      <button onClick={async () => { if (await confirmar({ titulo: '¿Eliminar la petición?', mensaje: `"${p.descripcion}"`, textoAceptar: 'Eliminar', tono: 'peligro' })) accion(() => reservacionesApi.eliminarPeticion(id, p._id)); }} aria-label="Eliminar petición" title="Eliminar petición" className="flex h-[34px] w-[34px] items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
              );
            })}
            {operar && (
              <form onSubmit={(e) => { e.preventDefault(); accion(async () => { await reservacionesApi.agregarPeticion(id, peticion); setPeticion({ descripcion: '', canal: peticion.canal }); }); }}
                className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
                <label htmlFor="peticion" className="sr-only">Nueva petición</label>
                <input id="peticion" required maxLength={300} value={peticion.descripcion} onChange={e => setPeticion({ ...peticion, descripcion: e.target.value })}
                  placeholder="Nueva petición. Ej. Cuna en la habitación" className="min-w-0 flex-1 rounded-lg border border-slate-300 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo" />
                <select aria-label="Cómo la pidió" value={peticion.canal} onChange={e => setPeticion({ ...peticion, canal: e.target.value })} className="rounded-lg border border-slate-300 bg-white p-2.5 text-sm">
                  {CANALES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="submit" className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-brand-petroleo px-4 text-sm font-semibold text-white hover:bg-brand-noche"><Plus size={15} /> Agregar</button>
              </form>
            )}
            <p className="text-xs text-slate-400">Cada paso crea su pendiente en "Mi día": enviar al proveedor, confirmar la respuesta o avisar al cliente si se rechazó.</p>
          </section>

          {/* Pendientes */}
          <section className={tarjeta}>
            <h2 className="mb-3 text-base font-bold text-slate-800">Pendientes de esta reservación</h2>
            <PendientesDeRegistro ligas={{ reservacion: id }} />
          </section>

          {/* Servicios */}
          <section className={tarjeta}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-800">Servicios y proveedores</h2>
              {f.servicios.length > 0 && (
                <button type="button" onClick={exportarPagosProveedor} disabled={descargando === 'proveedores'} title="Descargar el historial de pagos a proveedores en Excel"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                  <FileSpreadsheet size={14} /> {descargando === 'proveedores' ? 'Descargando…' : 'Exportar pagos a Excel'}
                </button>
              )}
            </div>
            {/* Un bloque por servicio (no tabla): esta columna es angosta y una tabla de 6 columnas hacía scroll. */}
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {f.servicios.map(s => {
                const liquidado = !(s.saldo > 0.005);
                return (
                  <div key={s._id} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-700 break-words">{s.proveedor}</div>
                        <div className="font-mono text-xs text-slate-400 break-all">{s.clave}</div>
                      </div>
                      {liquidado
                        ? <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Liquidado</span>
                        : <span className="shrink-0 text-right"><span className="block text-2xs uppercase tracking-wide text-slate-400">Saldo</span><span className="font-semibold text-red-600">{dinero(s.saldo)}</span></span>}
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
                      {[
                        ['Base', s.montoBase, 'text-slate-600'],
                        ['Comisión', s.comision, 'text-slate-600'],
                        ['A pagar', s.total, 'text-slate-700'],
                        ['Pagado', s.pagado, 'text-emerald-700'],
                      ].map(([etiqueta, monto, color]) => (
                        <div key={etiqueta}>
                          <dt className="text-2xs uppercase tracking-wide text-slate-400">{etiqueta}</dt>
                          <dd className={color}>{dinero(monto)}</dd>
                        </div>
                      ))}
                    </dl>
                    {s.extras?.length > 0 && (
                      <ul className="mt-2 space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                        <li className="text-2xs font-semibold uppercase tracking-wide text-slate-400">Incluye extras</li>
                        {s.extras.map((x, i) => (
                          <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <span className="text-slate-600 break-words">
                              {x.descripcion} <span className="text-slate-400">· {dinero(x.monto)}</span>
                              {x.comisionable
                                ? <span className="ml-1 text-emerald-700">· comisión {dinero(x.comision)}{x.porcentaje > 0 ? ` (${x.porcentaje} %)` : ''}</span>
                                : <span className="ml-1 text-slate-400">· sin comisión</span>}
                            </span>
                            <span className="font-medium text-slate-700">{dinero(x.total)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
              {f.servicios.length === 0 && <p className="p-4 text-center text-slate-400">Sin servicios registrados.</p>}
            </div>
          </section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-6">
          {/* Documentos */}
          <section className={`${tarjeta} space-y-3`}>
            <h2 className="text-base font-bold text-slate-800">Documentos</h2>
            {f.documentos.map((d, i) => (
              <div key={d._id || i} className="space-y-1.5 border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-medium ${d.estatus === 'No aplica' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{d.nombre}</span>
                  {operar && (
                    <button onClick={async () => { if (await confirmar({ titulo: `¿Quitar "${d.nombre}" de la lista?`, mensaje: 'Se quita del checklist de documentos de esta reservación.', textoAceptar: 'Quitar', tono: 'peligro' })) guardarDocs(f.documentos.filter((_, j) => j !== i)); }} aria-label={`Quitar ${d.nombre}`} title="Quitar" className="text-slate-300 hover:text-red-600"><X size={14} /></button>
                  )}
                </div>
                <div role="group" aria-label={`Estatus de ${d.nombre}`} className="flex flex-wrap gap-1">
                  {ESTATUS_DOC.map(([valor, etiqueta]) => {
                    const activo = d.estatus === valor;
                    const color = valor === 'Listo' ? 'bg-emerald-600 text-white border-emerald-600' : valor === 'Pendiente' ? 'bg-amber-500 text-white border-amber-500' : 'bg-slate-500 text-white border-slate-500';
                    return (
                      <button key={valor} type="button" disabled={!operar} aria-pressed={activo}
                        onClick={() => !activo && guardarDocs(f.documentos.map((x, j) => (j === i ? { ...x, estatus: valor } : x)))}
                        className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${activo ? color : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'} disabled:cursor-default`}>
                        {activo && valor === 'Listo' && <CheckCircle2 size={11} className="mr-0.5 inline" />}{etiqueta}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {operar && (
              <form onSubmit={(e) => { e.preventDefault(); if (!nuevoDoc.trim()) return; guardarDocs([...f.documentos, { nombre: nuevoDoc.trim(), estatus: 'Pendiente' }]); setNuevoDoc(''); }} className="flex gap-2 border-t border-slate-100 pt-3">
                <label htmlFor="nuevo-doc" className="sr-only">Agregar documento</label>
                <input id="nuevo-doc" maxLength={80} value={nuevoDoc} onChange={e => setNuevoDoc(e.target.value)} placeholder="Agregar documento. Ej. Visa" className="min-w-0 flex-1 rounded-lg border border-slate-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo" />
                <button type="submit" aria-label="Agregar documento" className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-petroleo text-white hover:bg-brand-noche"><Plus size={16} /></button>
              </form>
            )}
          </section>

          {/* Bitácora */}
          <section className={`${tarjeta} space-y-3`}>
            <h2 className="text-base font-bold text-slate-800">Bitácora</h2>
            {operar && (
              <form onSubmit={(e) => { e.preventDefault(); if (!nota.trim()) return; accion(async () => { await reservacionesApi.agregarNota(id, nota.trim()); setNota(''); }); }} className="flex gap-2">
                <label htmlFor="nota-bitacora" className="sr-only">Agregar nota</label>
                <input id="nota-bitacora" maxLength={1000} value={nota} onChange={e => setNota(e.target.value)} placeholder="Agregar nota…" className="min-w-0 flex-1 rounded-lg border border-slate-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo" />
                <button type="submit" aria-label="Guardar nota" className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-petroleo text-white hover:bg-brand-noche"><Plus size={16} /></button>
              </form>
            )}
            <ol className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {f.bitacora.map(b => {
                const t = textoBitacora(b);
                return (
                  <li key={b._id} className={`border-l-2 pl-3 text-sm ${t.nota ? 'border-brand-coral' : 'border-slate-200'}`}>
                    <div className={t.nota ? 'font-medium text-slate-800' : 'text-slate-700'}>{t.nota && <span className="mr-1 text-xs font-semibold uppercase text-brand-coral">Nota</span>}{t.titulo}</div>
                    <div className="text-xs text-slate-400">{new Date(b.fecha).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{b.usuario ? ` · ${b.usuario}` : ''}</div>
                  </li>
                );
              })}
              {f.bitacora.length === 0 && <li className="text-sm text-slate-400">Sin movimientos.</li>}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
