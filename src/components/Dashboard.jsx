import React, { useEffect, useState } from 'react';
import { dashboardApi } from '../api';
import { dinero, dineroCompacto, variacion, nombreMes } from '../utils/formato';
import GraficaVentas from './dashboard/GraficaVentas';
import {
  LayoutDashboard, TrendingUp, TrendingDown, Receipt, Wallet, HandCoins, CalendarCheck, Trophy, BarChart3, Table2, Crown, ArrowDownUp,
} from 'lucide-react';

const PERIODOS = [
  { key: 'mes', label: 'Este mes', previo: 'vs. mismos días del mes anterior' },
  { key: '12m', label: 'Últimos 12 meses', previo: 'vs. 12 meses anteriores' },
  { key: 'anio', label: 'Este año', previo: 'vs. mismo periodo del año pasado' },
  { key: '24m', label: '24 meses', previo: null },
];

const iniciales = (nombre) => nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

// Delta con flecha + color de estado (nunca solo color).
function Delta({ valor, sufijo, claro = false, compacto = false }) {
  if (valor === null || valor === undefined) {
    return compacto
      ? <span className="text-slate-400" title="Sin ventas en el periodo anterior para comparar">—</span>
      : <span className={claro ? 'text-white/60' : 'text-slate-400'}>Sin periodo previo para comparar</span>;
  }
  const sube = valor >= 0;
  const Icono = sube ? TrendingUp : TrendingDown;
  const color = claro
    ? (sube ? 'bg-emerald-400/20 text-emerald-100' : 'bg-red-400/25 text-red-100')
    : (sube ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700');
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
        <Icono size={13} /> {sube ? '+' : '−'}{Math.abs(valor).toFixed(1)}%
      </span>
      {sufijo && <span className={`text-xs ${claro ? 'text-white/70' : 'text-slate-500'}`}>{sufijo}</span>}
    </span>
  );
}

function Tarjeta({ icono: Icono, titulo, valor, children }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        <Icono size={14} className="text-brand-petroleo" /> {titulo}
      </div>
      <div className="text-2xl font-bold text-slate-800">{valor}</div>
      <div className="text-xs">{children}</div>
    </div>
  );
}

export default function Dashboard() {
  const [datos, setDatos] = useState(null);
  const [periodo, setPeriodo] = useState('mes');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [vista, setVista] = useState('grafica');
  const [ascendente, setAscendente] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        setCargando(true);
        const d = await dashboardApi.admin(periodo);
        if (!cancelado) { setDatos(d); setError(''); }
      } catch (err) {
        if (!cancelado) setError(err.message);
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [periodo]);

  if (!datos) {
    return (
      <div className="flex flex-col gap-6">
        <Encabezado />
        {error
          ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          : <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-sm text-slate-400 shadow-sm">Cargando tablero...</div>}
      </div>
    );
  }

  const { indicadores: ind, meses, ranking, diaDelMes, generado } = datos;
  const var12 = variacion(ind.ultimos12.ventas, ind.ultimos12.ventasPrevio);
  const varMes = variacion(ind.mesALaFecha.ventas, ind.mesALaFecha.ventasPrevio);
  const periodoActual = PERIODOS.find((p) => p.key === periodo);
  const agentes = ascendente ? [...ranking.agentes].reverse() : ranking.agentes;
  const maxVentas = Math.max(...ranking.agentes.map((a) => a.ventas), 1);
  const lider = ranking.agentes[0]?.ventas > 0 ? ranking.agentes[0] : null;

  return (
    // Al recargar por cambio de periodo se mantiene lo anterior atenuado (sin parpadeo).
    <div className={`flex flex-col gap-6 transition-opacity ${cargando ? 'opacity-60' : ''}`}>
      <Encabezado generado={generado} />
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Cifra principal + indicadores */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-noche to-brand-petroleo p-6 text-white shadow-sm lg:row-span-2">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="absolute -bottom-16 -right-4 h-48 w-48 rounded-full bg-white/5" />
          <div className="relative flex h-full flex-col justify-between gap-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-white/70">Ventas · últimos 12 meses</div>
              <div className="mt-3 text-5xl font-bold">{dineroCompacto(ind.ultimos12.ventas)}</div>
              <div className="mt-1 text-sm text-white/70">{dinero(ind.ultimos12.ventas)} MXN · {ind.ultimos12.reservaciones} reservaciones</div>
              <div className="mt-4"><Delta valor={var12} sufijo="vs. los 12 meses anteriores" claro /></div>
            </div>
            {ind.mejorMes && (
              <div className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3">
                <Crown size={20} className="text-brand-coralClaro" />
                <div className="text-sm">
                  <div className="text-white/70">Mejor mes de los últimos 24</div>
                  <div className="font-semibold capitalize">{nombreMes(ind.mejorMes.mes, { largo: true, conAnio: true })} · {dineroCompacto(ind.mejorMes.ventas)}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
          <Tarjeta icono={CalendarCheck} titulo={`Ventas del mes · al día ${diaDelMes}`} valor={dinero(ind.mesALaFecha.ventas)}>
            <Delta valor={varMes} sufijo="vs. mismos días del mes anterior" />
          </Tarjeta>
          <Tarjeta icono={Receipt} titulo="Ticket promedio · 12 meses" valor={dinero(ind.ticketPromedio12)}>
            <span className="text-slate-500">Venta promedio por reservación</span>
          </Tarjeta>
          <Tarjeta icono={HandCoins} titulo="Cobrado este mes" valor={dinero(ind.cobradoMes)}>
            <span className="text-slate-500">Abonos aplicados de clientes</span>
          </Tarjeta>
          <Tarjeta icono={Wallet} titulo="Por cobrar" valor={dinero(ind.porCobrar.monto)}>
            <span className="text-slate-500">Saldo de {ind.porCobrar.reservaciones} reservaciones activas</span>
          </Tarjeta>
        </div>
      </div>

      {/* Ventas por mes */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800">Ventas por mes · últimos 24 meses</h2>
            <p className="text-sm text-slate-500">Monto vendido según la fecha de registro de cada reservación (sin canceladas).</p>
          </div>
          <div className="inline-flex shrink-0 rounded-lg border border-slate-200 p-0.5 text-sm">
            <button onClick={() => setVista('grafica')} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold ${vista === 'grafica' ? 'bg-slate-100 text-slate-800' : 'text-slate-500'}`}>
              <BarChart3 size={15} /> Gráfica
            </button>
            <button onClick={() => setVista('tabla')} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold ${vista === 'tabla' ? 'bg-slate-100 text-slate-800' : 'text-slate-500'}`}>
              <Table2 size={15} /> Tabla
            </button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-brand-petroleoMedio" /> Ventas del mes</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-brand-petroleoMedio/40" /> Mes en curso</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-px w-4 bg-slate-600" /> Promedio 12 meses</span>
          <span className="inline-flex items-center gap-1.5"><span className="text-emerald-600">▲</span> Vendió más que el mes anterior</span>
          <span className="inline-flex items-center gap-1.5"><span className="text-red-600">▼</span> Vendió menos</span>
        </div>

        {vista === 'grafica' ? (
          <GraficaVentas meses={meses} variacionEnCurso={varMes} diaDelMes={diaDelMes} />
        ) : (
          <TablaMeses meses={meses} varMes={varMes} />
        )}
      </div>

      {/* Ranking de agentes */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-800"><Trophy size={18} className="text-brand-coralClaro" /> Ranking de agentes</h2>
            <p className="text-sm text-slate-500">
              {lider ? <>Top vendedor: <span className="font-semibold text-slate-700">{lider.nombre}</span> con {dinero(lider.ventas)}</> : 'Aún no hay ventas en este periodo.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap rounded-lg border border-slate-200 p-0.5 text-sm">
              {PERIODOS.map((p) => (
                <button key={p.key} onClick={() => setPeriodo(p.key)}
                  className={`rounded-md px-3 py-1.5 font-semibold ${periodo === p.key ? 'bg-brand-noche text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <button onClick={() => setAscendente((v) => !v)} title="Cambiar orden"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              <ArrowDownUp size={15} /> {ascendente ? 'Menor a mayor' : 'Mayor a menor'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <th className="p-3 font-semibold">#</th>
                <th className="p-3 font-semibold">Agente</th>
                <th className="p-3 font-semibold min-w-[220px]">Ventas</th>
                <th className="p-3 font-semibold text-right">Participación</th>
                <th className="p-3 font-semibold text-right">Reservaciones</th>
                <th className="p-3 font-semibold text-right">Ticket promedio</th>
                {periodoActual.previo && <th className="p-3 font-semibold">{periodoActual.previo}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {agentes.map((a) => {
                const lugar = ranking.agentes.indexOf(a) + 1;
                const esLider = lugar === 1 && a.ventas > 0;
                return (
                  <tr key={a.id} className={`text-sm ${esLider ? 'bg-amber-50/50' : 'hover:bg-slate-50'}`}>
                    <td className="p-3">
                      {esLider
                        ? <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-coralClaro text-brand-noche"><Trophy size={14} /></span>
                        : <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">{lugar}</span>}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-petroleo text-xs font-bold text-white">{iniciales(a.nombre)}</div>
                        <div>
                          <div className="font-semibold text-slate-700">{a.nombre}</div>
                          <div className="text-xs text-slate-400">
                            {a.rol === 'Administrador' ? 'Administrador' : 'Agente'}
                            {a.estatus !== 'Activo' && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-2xs font-semibold text-slate-500">Inactivo</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-brand-petroleoMedio" style={{ width: `${(a.ventas / maxVentas) * 100}%` }} />
                        </div>
                        <span className="w-28 text-right font-semibold text-slate-800">{dinero(a.ventas)}</span>
                      </div>
                    </td>
                    <td className="p-3 text-right text-slate-600">{a.participacion.toFixed(1)}%</td>
                    <td className="p-3 text-right text-slate-600">{a.reservaciones}</td>
                    <td className="p-3 text-right text-slate-600">{a.reservaciones ? dinero(a.ticketPromedio) : '—'}</td>
                    {periodoActual.previo && (
                      <td className="p-3"><Delta valor={variacion(a.ventas, a.ventasPrevio)} compacto /></td>
                    )}
                  </tr>
                );
              })}
              {agentes.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-sm text-slate-400">No hay agentes registrados.</td></tr>
              )}
            </tbody>
            {ranking.agentes.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
                  <td className="p-3" colSpan={2}>Total del periodo</td>
                  <td className="p-3 text-right">{dinero(ranking.total)}</td>
                  <td className="p-3 text-right">100%</td>
                  <td className="p-3 text-right">{ranking.agentes.reduce((acc, a) => acc + a.reservaciones, 0)}</td>
                  <td className="p-3" colSpan={periodoActual.previo ? 2 : 1} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

function Encabezado({ generado }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-petroleo text-white shadow-sm">
          <LayoutDashboard size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Tablero de Ventas</h1>
          <p className="text-sm text-slate-500">Cómo va el negocio: tendencia mensual, indicadores clave y desempeño del equipo.</p>
        </div>
      </div>
      {generado && (
        <p className="text-xs text-slate-400">
          Actualizado {new Date(generado).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
}

// Vista de tabla equivalente a la gráfica (accesible, y útil para leer cifras exactas).
function TablaMeses({ meses, varMes }) {
  const filas = [...meses].reverse();
  return (
    <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-100">
      <table className="w-full border-collapse text-left text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <thead className="sticky top-0">
          <tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <th className="p-3 font-semibold">Mes</th>
            <th className="p-3 text-right font-semibold">Ventas</th>
            <th className="p-3 text-right font-semibold">Reservaciones</th>
            <th className="p-3 text-right font-semibold">Cobrado</th>
            <th className="p-3 font-semibold">vs. mes anterior</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filas.map((m) => {
            const i = meses.indexOf(m);
            const v = m.enCurso ? varMes : i > 0 ? variacion(m.ventas, meses[i - 1].ventas) : null;
            return (
              <tr key={m.mes} className="hover:bg-slate-50">
                <td className="p-3 capitalize text-slate-700">
                  {nombreMes(m.mes, { largo: true, conAnio: true })}
                  {m.enCurso && <span className="ml-1.5 text-xs normal-case text-slate-400">(en curso)</span>}
                </td>
                <td className="p-3 text-right font-semibold text-slate-800">{dinero(m.ventas)}</td>
                <td className="p-3 text-right text-slate-600">{m.reservaciones}</td>
                <td className="p-3 text-right text-slate-600">{dinero(m.cobrado)}</td>
                <td className="p-3"><Delta valor={v} sufijo={m.enCurso ? 'mismos días' : ''} compacto /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
