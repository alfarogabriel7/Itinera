import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, Check, X, FileText, Users, Truck, RefreshCw } from 'lucide-react';
import { autorizacionesApi, pagosApi, pagosProveedorApi } from '../api';
import PageHeader from './common/PageHeader';
import { dinero, fechaViaje } from '../utils/formato';
import { avisarExito, avisarError } from '../utils/avisos';
import { confirmar, pedirTexto } from '../utils/confirmar';
import { abrirComprobante } from '../utils/comprobantes';

// Bandeja de Autorizaciones (solo Administrador): pagos de clientes y a
// proveedores que registraron los agentes y esperan autorización. Autorizar los
// aplica a la reservación; rechazar los deja cancelados con el motivo.
//   pagoInicial: { tipo, pago } — llega desde el seguimiento de "Mi día"; ese pago
//   se muestra primero y resaltado.

const fechaHora = (f) => new Date(f).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fechaPago = (f) => new Date(f).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', year: 'numeric' });
const monto = (p) => `${dinero(p.monto)} ${p.moneda}`;

const FILTROS = [
  { clave: 'todos', texto: 'Todos' },
  { clave: 'cliente', texto: 'Pagos de clientes', icono: Users },
  { clave: 'proveedor', texto: 'Pagos a proveedores', icono: Truck },
];

function Dato({ etiqueta, children, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-400">{etiqueta}</dt>
      <dd className="text-sm text-slate-700 break-words">{children || '—'}</dd>
    </div>
  );
}

export default function Autorizaciones({ pagoInicial = null, onCambio }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [ocupado, setOcupado] = useState('');
  const destacado = useRef(null);

  const cargar = async () => {
    try {
      setDatos(await autorizacionesApi.list());
      setError('');
    } catch (err) {
      setError(err.message);
    }
    onCambio?.();
  };
  useEffect(() => { cargar(); }, []);

  // El pago que llegó desde el seguimiento: a la vista.
  useEffect(() => {
    if (datos && pagoInicial && destacado.current) destacado.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [datos, pagoInicial]);

  const esInicial = (p) => pagoInicial && String(p.id) === String(pagoInicial.pago);
  const lista = (datos?.datos || [])
    .filter(p => filtro === 'todos' || p.tipo === filtro)
    .sort((a, b) => (esInicial(b) ? 1 : 0) - (esInicial(a) ? 1 : 0));
  const inicialYaNoEsta = datos && pagoInicial && !datos.datos.some(esInicial);

  const detallesDe = (p) => [
    { etiqueta: p.tipo === 'cliente' ? 'Cliente' : 'Proveedor', valor: p.tipo === 'cliente' ? p.reservacion?.cliente : `${p.proveedor}${p.servicio ? ` · ${p.servicio}` : ''}` },
    { etiqueta: 'Reservación', valor: p.reservacion ? `${p.reservacion.destino}` : '—' },
    { etiqueta: 'Monto', valor: monto(p), destacado: true },
    { etiqueta: 'Forma de pago', valor: `${p.formaPago}${p.referencia ? ` · ref. ${p.referencia}` : ''}` },
    { etiqueta: 'Registró', valor: p.capturista },
    { etiqueta: 'Saldo actual', valor: p.saldoActual === null ? '—' : `${dinero(p.saldoActual)} ${p.moneda}` },
  ];

  const autorizar = async (p) => {
    if (!(await confirmar({
      titulo: p.tipo === 'cliente' ? '¿Autorizar el abono del cliente?' : '¿Autorizar el pago al proveedor?',
      mensaje: p.tipo === 'cliente' ? 'Se aplicará a la reservación y se descontará del saldo del cliente.' : 'Se aplicará y se descontará de lo que se le debe al proveedor.',
      detalles: detallesDe(p),
      textoAceptar: 'Autorizar',
    }))) return;
    setOcupado(p.id);
    try {
      await autorizacionesApi.autorizar(p.tipo, p.id);
      avisarExito(`Pago de ${monto(p)} autorizado y aplicado.`);
      await cargar();
    } catch (err) {
      avisarError(err.message);
    } finally {
      setOcupado('');
    }
  };

  const rechazar = async (p) => {
    const motivo = await pedirTexto({
      titulo: '¿Rechazar este pago?',
      mensaje: 'El pago quedará cancelado y no se aplicará a la reservación.',
      detalles: detallesDe(p),
      etiqueta: 'Motivo del rechazo', placeholder: 'Ej. La transferencia no aparece en el banco', requerido: true, maxLength: 280,
      textoAceptar: 'Rechazar', tono: 'peligro',
    });
    if (motivo === null) return;
    setOcupado(p.id);
    try {
      await autorizacionesApi.rechazar(p.tipo, p.id, motivo);
      avisarExito('Pago rechazado.');
      await cargar();
    } catch (err) {
      avisarError(err.message);
    } finally {
      setOcupado('');
    }
  };

  const verComprobante = (p) => abrirComprobante(() => (p.tipo === 'cliente' ? pagosApi : pagosProveedorApi).descargarComprobante(p.id));

  const totales = datos?.totales || { clientes: 0, proveedores: 0 };
  const cuenta = { todos: totales.clientes + totales.proveedores, cliente: totales.clientes, proveedor: totales.proveedores };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={ShieldCheck} title="Autorizaciones" subtitle="Pagos que registraron los agentes y esperan tu autorización."
        action={(
          <button type="button" onClick={cargar}
            className="inline-flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-semibold">
            <RefreshCw size={16} /> Actualizar
          </button>
        )} />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}
      {inicialYaNoEsta && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
          El pago de este seguimiento ya fue autorizado o rechazado.
        </div>
      )}

      <div role="group" aria-label="Filtrar por tipo de pago" className="flex flex-wrap gap-2">
        {FILTROS.map(({ clave, texto, icono: Icono }) => (
          <button key={clave} type="button" onClick={() => setFiltro(clave)} aria-pressed={filtro === clave}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium ${filtro === clave ? 'border-brand-noche bg-brand-noche text-white' : 'border-slate-300 bg-white text-slate-600 hover:text-slate-800'}`}>
            {Icono && <Icono size={14} />} {texto}
            <span className={`rounded-full px-1.5 text-xs font-bold ${filtro === clave ? 'bg-white/20' : 'bg-slate-100'}`}>{cuenta[clave]}</span>
          </button>
        ))}
      </div>

      {!datos && !error && <p className="text-sm text-slate-400">Cargando pagos por autorizar…</p>}
      {datos && lista.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <ShieldCheck size={32} className="mx-auto text-emerald-500" />
          <p className="mt-2 text-sm font-semibold text-slate-700">No hay pagos por autorizar.</p>
          <p className="text-sm text-slate-500">Cuando un agente registre un pago, aparecerá aquí y en tu "Mi día".</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {lista.map(p => {
          const inicial = esInicial(p);
          const esCliente = p.tipo === 'cliente';
          return (
            <article key={`${p.tipo}-${p.id}`} ref={inicial ? destacado : undefined}
              className={`rounded-2xl border bg-white p-5 shadow-sm ${inicial ? 'border-brand-coral ring-2 ring-brand-coral/40' : 'border-slate-100'} ${ocupado === p.id ? 'pointer-events-none opacity-50' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${esCliente ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'}`}>
                      {esCliente ? <Users size={12} /> : <Truck size={12} />} {esCliente ? 'Pago de cliente' : 'Pago a proveedor'}
                    </span>
                    {inicial && <span className="rounded-md bg-brand-coral px-2 py-0.5 text-xs font-semibold text-white">Del seguimiento</span>}
                  </div>
                  <div className="mt-1 text-2xl font-bold text-slate-800 tabular-nums">{monto(p)}</div>
                  <div className="text-sm text-slate-500">
                    {esCliente ? p.reservacion?.cliente : p.proveedor}
                    {p.reservacion && <> · {p.reservacion.destino}</>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => rechazar(p)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 text-sm font-semibold text-red-600 hover:bg-red-50">
                    <X size={16} /> Rechazar
                  </button>
                  <button type="button" onClick={() => autorizar(p)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-brand-petroleo px-4 text-sm font-semibold text-white hover:bg-brand-noche">
                    <Check size={16} /> Autorizar
                  </button>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                <Dato etiqueta="Fecha del pago">{fechaPago(p.fecha)}</Dato>
                <Dato etiqueta="Forma de pago">{p.formaPago}{p.referencia && <span className="text-slate-500"> · ref. <span className="font-mono">{p.referencia}</span></span>}</Dato>
                <Dato etiqueta="Registró">{p.capturista}<div className="text-xs text-slate-400">{fechaHora(p.registrado)}</div></Dato>
                <Dato etiqueta={esCliente ? 'Saldo del cliente' : 'Saldo con el proveedor'}>
                  {p.saldoActual === null ? '—' : `${dinero(p.saldoActual)} ${p.moneda}`}
                  {p.saldoActual !== null && <div className="text-xs text-slate-400">antes de este pago</div>}
                </Dato>
                {!esCliente && <Dato etiqueta="Servicio">{p.servicio}</Dato>}
                {!esCliente && <Dato etiqueta="Cliente">{p.reservacion?.cliente}</Dato>}
                <Dato etiqueta="Viaje">{p.reservacion ? `${fechaViaje(p.reservacion.fechaEntrada)} – ${fechaViaje(p.reservacion.fechaSalida)}` : ''}</Dato>
                <Dato etiqueta="Comprobante">
                  {p.comprobante
                    ? <button type="button" onClick={() => verComprobante(p)} className="inline-flex items-center gap-1 font-semibold text-brand-petroleo hover:underline"><FileText size={14} /> Ver comprobante</button>
                    : <span className="text-slate-400">Sin comprobante</span>}
                </Dato>
              </dl>
            </article>
          );
        })}
      </div>
    </div>
  );
}
