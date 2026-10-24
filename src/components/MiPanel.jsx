import React, { useEffect, useState } from 'react';
import { dashboardApi, pagosApi, prospectosApi, clientesApi } from '../api';
import { dinero, fechaViaje, variacion } from '../utils/formato';
import { EtiquetaViaje, ligaWhatsApp } from './Cobranza';
import {
  Sun, Sunset, Moon, TrendingUp, TrendingDown, Trophy, Wallet, ListTodo, CheckCircle2, Circle, Undo2,
  Phone, CreditCard, MessageCircle, ArrowRight, Plane,
} from 'lucide-react';

function saludo() {
  const h = new Date().getHours();
  if (h < 12) return { texto: 'Buenos días', Icono: Sun };
  if (h < 19) return { texto: 'Buenas tardes', Icono: Sunset };
  return { texto: 'Buenas noches', Icono: Moon };
}

// Días transcurridos desde una fecha (hora local).
const diasDesde = (f) => Math.max(0, Math.floor((Date.now() - new Date(f).getTime()) / 86_400_000));
const haceTexto = (dias) => (dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`);

function Tarjeta({ icono: Icono, titulo, valor, children, acento = 'text-brand-petroleo' }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        <Icono size={14} className={acento} /> {titulo}
      </div>
      <div className="text-2xl font-bold text-slate-800">{valor}</div>
      <div className="text-xs text-slate-500">{children}</div>
    </div>
  );
}

// De quién es el seguimiento: un prospecto (o uno que ya se convirtió) o un cliente.
function EtiquetaTipo({ accion }) {
  const [texto, clase] = accion.tipo === 'cliente'
    ? ['cliente', 'bg-brand-petroleo/10 text-brand-noche']
    : accion.esCliente ? ['ya es cliente', 'bg-brand-petroleo/5 text-brand-noche'] : ['prospecto', 'bg-brand-coral/10 text-brand-coral'];
  return <span className={`ml-1 rounded px-1 text-2xs font-semibold ${clase}`}>{texto}</span>;
}

export default function MiPanel({ nombre, onAbonar, onIr }) {
  const [resumen, setResumen] = useState(null);
  // Mi cobranza: las 10 más próximas a viajar + totales de toda mi cartera (calculados en el servidor).
  const [cobranza, setCobranza] = useState([]);
  const [totalesCobranza, setTotalesCobranza] = useState({ porCobrar: 0, reservaciones: 0, proximos: { cantidad: 0 } });
  const [acciones, setAcciones] = useState({ pendientes: [], completadas: [] });
  const [cargando, setCargando] = useState(true);
  const [errores, setErrores] = useState([]);
  const [procesando, setProcesando] = useState('');

  // Seguimientos de mis prospectos y de mis clientes en una sola lista.
  const obtenerAcciones = async () => {
    const [p, c] = await Promise.all([prospectosApi.acciones({ mios: 1 }), clientesApi.acciones({ mios: 1 })]);
    return {
      pendientes: [...p.pendientes, ...c.pendientes].sort((a, b) => new Date(a.fecha) - new Date(b.fecha)),
      completadas: [...p.completadas, ...c.completadas].sort((a, b) => new Date(b.fechaCompletada) - new Date(a.fechaCompletada)),
    };
  };
  const cargarAcciones = async () => setAcciones(await obtenerAcciones());

  useEffect(() => {
    (async () => {
      // Cada sección carga por separado: si una falla, las demás se muestran igual.
      const [r, c, a] = await Promise.allSettled([
        dashboardApi.agente(),
        pagosApi.cobranza({ mios: 1, porPagina: 10 }),
        obtenerAcciones(),
      ]);
      if (r.status === 'fulfilled') setResumen(r.value);
      if (c.status === 'fulfilled') {
        setCobranza(c.value.datos);
        setTotalesCobranza(c.value.indicadores);
      }
      if (a.status === 'fulfilled') setAcciones(a.value);
      setErrores([r, c, a].filter((x) => x.status === 'rejected').map((x) => x.reason.message));
      setCargando(false);
    })();
  }, []);

  const cambiarEstatus = async (accion, estatus) => {
    setProcesando(accion.idAccion);
    try {
      const api = accion.tipo === 'cliente' ? clientesApi : prospectosApi;
      await api.cambiarEstatusAccion(accion.idRegistro, accion.idNota, accion.idAccion, estatus);
      await cargarAcciones();
    } catch (err) {
      alert(err.message);
    } finally {
      setProcesando('');
    }
  };

  const { texto: textoSaludo, Icono: IconoSaludo } = saludo();
  const primerNombre = (nombre || '').split(' ')[0];
  const porCobrar = totalesCobranza.porCobrar;
  const proximos30 = totalesCobranza.proximos.cantidad;
  const mes = resumen?.mesALaFecha;
  const varMes = mes ? variacion(mes.ventas, mes.ventasPrevio) : null;
  const masAntigua = acciones.pendientes[0];

  return (
    <div className="flex flex-col gap-6">
      {/* Saludo */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-noche to-brand-petroleo p-6 text-white shadow-sm">
        <Plane size={120} className="absolute -right-4 -top-6 rotate-12 text-white/10" />
        <div className="relative">
          <div className="flex items-center gap-2 text-sm text-white/80"><IconoSaludo size={16} /> {textoSaludo}</div>
          <h1 className="mt-1 text-2xl font-bold">{primerNombre ? `¡Hola, ${primerNombre}!` : '¡Hola!'}</h1>
          <p className="mt-1 text-sm text-white/80">
            {cargando
              ? 'Cargando tus pendientes...'
              : `Tienes ${acciones.pendientes.length} seguimiento(s) por hacer y ${totalesCobranza.reservaciones} reservación(es) con saldo por cobrar.`}
          </p>
        </div>
      </div>

      {errores.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudo cargar parte del panel: {errores.join(' · ')}
        </div>
      )}

      {/* Indicadores */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tarjeta icono={varMes !== null && varMes < 0 ? TrendingDown : TrendingUp} titulo="Mis ventas del mes" valor={mes ? dinero(mes.ventas) : '—'}>
          {mes && (varMes === null
            ? `${mes.reservaciones} reservación(es) este mes`
            : <span className={varMes >= 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>
                {varMes >= 0 ? '▲ +' : '▼ −'}{Math.abs(varMes).toFixed(1)}% <span className="font-normal text-slate-500">vs. mismos días del mes anterior</span>
              </span>)}
        </Tarjeta>
        <Tarjeta icono={Trophy} titulo="Mi lugar este mes" valor={resumen?.lugarEnElMes ? `#${resumen.lugarEnElMes}` : '—'} acento="text-brand-coralClaro">
          {resumen?.lugarEnElMes
            ? `de ${resumen.agentesConVentas} vendedor(es) con ventas en el mes`
            : 'Registra tu primera venta del mes para entrar al ranking'}
        </Tarjeta>
        <Tarjeta icono={Wallet} titulo="Por cobrar a mis clientes" valor={dinero(porCobrar)}>
          {totalesCobranza.reservaciones} reservación(es) · {proximos30} viajan en 30 días o menos
        </Tarjeta>
        <Tarjeta icono={ListTodo} titulo="Seguimientos pendientes" valor={acciones.pendientes.length} acento="text-brand-coral">
          {masAntigua ? `El más antiguo es de ${haceTexto(diasDesde(masAntigua.fecha))}` : 'Estás al día'}
        </Tarjeta>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        {/* Seguimientos a prospectos */}
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-800"><ListTodo size={18} className="text-brand-coral" /> Seguimientos</h2>
            <div className="flex items-center gap-3">
              <button onClick={() => onIr('prospectos')} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-noche hover:underline">
                Prospectos <ArrowRight size={14} />
              </button>
              <button onClick={() => onIr('clientes')} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-noche hover:underline">
                Clientes <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {!cargando && acciones.pendientes.length === 0 && (
            <div className="rounded-xl bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-700">
              <CheckCircle2 size={22} className="mx-auto mb-1" /> No tienes seguimientos pendientes.
            </div>
          )}

          <ul className="space-y-2">
            {acciones.pendientes.map((a) => {
              const dias = diasDesde(a.fecha);
              return (
                <li key={a.idAccion} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3 hover:bg-slate-50">
                  <button onClick={() => cambiarEstatus(a, 'Completada')} disabled={procesando === a.idAccion} title="Marcar como completada"
                    className="mt-0.5 shrink-0 text-slate-300 hover:text-emerald-600 disabled:opacity-50">
                    <Circle size={20} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-700">{a.descripcion}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {a.nombre}<EtiquetaTipo accion={a} />
                      {' · '}<span className={dias > 5 ? 'font-semibold text-red-600' : ''}>{haceTexto(dias)}</span>
                    </div>
                    <div className="mt-1 truncate text-xs italic text-slate-400" title={a.nota}>"{a.nota}"</div>
                  </div>
                  {a.telefono && (
                    <a href={`tel:${a.telefono.replace(/\s/g, '')}`} title={`Llamar a ${a.nombre}`} className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-white hover:text-brand-noche">
                      <Phone size={14} />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>

          {acciones.completadas.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Completadas en los últimos 7 días</div>
              <ul className="space-y-1.5">
                {acciones.completadas.map((a) => (
                  <li key={a.idAccion} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400">
                    <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />
                    <span className="min-w-0 flex-1 truncate line-through">{a.descripcion} · {a.nombre}</span>
                    <button onClick={() => cambiarEstatus(a, 'En seguimiento')} disabled={procesando === a.idAccion} title="Volver a pendiente"
                      className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50">
                      <Undo2 size={13} /> Deshacer
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Cobranza de mis clientes */}
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm xl:col-span-3">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-800"><Wallet size={18} className="text-brand-petroleo" /> Cobranza de mis clientes</h2>
            <button onClick={() => onIr('cobranza')} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-noche hover:underline">
              Ver cobranza completa <ArrowRight size={14} />
            </button>
          </div>
          <p className="-mt-2 mb-4 text-xs text-slate-500">
            Las {Math.min(cobranza.length, 10)} más próximas a viajar{totalesCobranza.reservaciones > cobranza.length ? ` de ${totalesCobranza.reservaciones}` : ''}: las de arriba son las más urgentes.
          </p>

          {!cargando && cobranza.length === 0 && (
            <div className="rounded-xl bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-700">
              <CheckCircle2 size={22} className="mx-auto mb-1" /> Tus clientes no tienen saldos pendientes.
            </div>
          )}

          <ul className="divide-y divide-slate-100">
            {cobranza.map((f) => {
              const porcentaje = f.total > 0 ? Math.min(100, Math.round((f.pagado / f.total) * 100)) : 0;
              const whatsapp = ligaWhatsApp(f);
              return (
                <li key={f.idReservacion} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                  <div className="w-28 shrink-0"><EtiquetaViaje fila={f} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-700">{f.cliente?.nombre || '—'}</div>
                    <div className="truncate text-xs text-slate-500">{f.destino} · {fechaViaje(f.fechaEntrada)} al {fechaViaje(f.fechaSalida)}</div>
                  </div>
                  <div className="w-full sm:w-40">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">{porcentaje}% pagado</span>
                      <span className="font-mono font-bold text-red-600">{dinero(f.saldo)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${porcentaje}%` }} />
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button onClick={() => onAbonar(f.idReservacion)} title="Registrar abono"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-coral px-2.5 py-1.5 text-xs font-semibold text-white hover:brightness-90">
                      <CreditCard size={14} /> Abonar
                    </button>
                    {whatsapp && (
                      <a href={whatsapp} target="_blank" rel="noopener noreferrer" title="Enviar recordatorio por WhatsApp"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                        <MessageCircle size={14} />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
