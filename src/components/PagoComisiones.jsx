import React, { useEffect, useMemo, useState } from 'react';
import { BadgePercent, Wallet, AlertTriangle, Undo2, CheckCircle2 } from 'lucide-react';
import { agentesApi, comisionesApi } from '../api';
import { dinero, fechaCorta, fechaViaje } from '../utils/formato';
import PageHeader from './common/PageHeader';
import ListadoAdaptable from './common/ListadoAdaptable';
import CampoMonto from './common/CampoMonto';
import { SelectorRangoFechas, aTexto } from './common/Calendario';
import { avisarExito, avisarError } from '../utils/avisos';
import { confirmar } from '../utils/confirmar';

// Pago de comisiones (solo Administrador). Por agente y periodo: las ventas
// LIQUIDADAS (el cliente pagó todo) en el rango, por la fecha del último abono.
// Comisión = venta al público × % del agente, o un monto especial a mano.
// "Pagar" marca las seleccionadas como pagadas al agente (pagadalagente).

const rapido = {
  mes: () => { const h = new Date(); return [new Date(h.getFullYear(), h.getMonth(), 1), new Date(h.getFullYear(), h.getMonth() + 1, 0)]; },
  anterior: () => { const h = new Date(); return [new Date(h.getFullYear(), h.getMonth() - 1, 1), new Date(h.getFullYear(), h.getMonth(), 0)]; },
  anio: () => { const h = new Date(); return [new Date(h.getFullYear(), 0, 1), new Date(h.getFullYear(), 11, 31)]; },
};
const ATAJOS = [['mes', 'Este mes'], ['anterior', 'Mes anterior'], ['anio', 'Este año']];
const rangoDe = (clave) => rapido[clave]().map(aTexto);
const pct = (n) => `${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })} %`;
const conMoneda = (monto, moneda) => <>{dinero(monto)} <span className="text-2xs font-semibold text-slate-400">{moneda}</span></>;

// agenteInicial: agente ya elegido al llegar desde la acción rápida de Agentes.
export default function PagoComisiones({ agenteInicial = '' }) {
  const [agentes, setAgentes] = useState([]);
  const [agenteId, setAgenteId] = useState(agenteInicial);
  const [[desde, hasta], setRango] = useState(() => rangoDe('mes'));
  const [verPagadas, setVerPagadas] = useState(false);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [recarga, setRecarga] = useState(0);
  // Por reservación: { sel, especial, monto } (monto = texto del campo editable).
  const [marcas, setMarcas] = useState({});

  // Agentes de la empresa: primero los activos, luego los dados de baja.
  useEffect(() => {
    agentesApi.list({ orden: 'nombre', porPagina: 100 })
      .then(r => {
        const lista = r.datos.filter(a => a.rol !== 'superAdmin')
          .sort((a, b) => (a.estatus === b.estatus ? a.nombre.localeCompare(b.nombre, 'es') : a.estatus === 'Activo' ? -1 : 1));
        setAgentes(lista);
        setAgenteId(id => id || lista.find(a => a.estatus === 'Activo')?._id || lista[0]?._id || '');
      })
      .catch(err => avisarError(err.message));
  }, []);

  useEffect(() => {
    if (!agenteId || !desde || !hasta) return undefined;
    let cancelado = false;
    setCargando(true);
    comisionesApi.listar({ agente: agenteId, desde, hasta, pagadas: verPagadas })
      .then(d => {
        if (cancelado) return;
        setDatos(d);
        // Por defecto todas seleccionadas, con la comisión calculada.
        setMarcas(Object.fromEntries(d.filas.map(f => [f.id, { sel: true, especial: false, monto: String(f.comision) }])));
      })
      .catch(err => { if (!cancelado) { setDatos(null); avisarError(err.message); } })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [agenteId, desde, hasta, verPagadas, recarga]);

  const filas = datos?.filas || [];
  const porcentaje = datos?.agente?.porcentaje || 0;
  const cambiar = (id, cambios) => setMarcas(m => ({ ...m, [id]: { ...m[id], ...cambios } }));
  const montoDe = (f) => { const m = marcas[f.id]; return m?.especial ? (parseFloat(m.monto) || 0) : f.comision; };

  const seleccionadas = filas.filter(f => marcas[f.id]?.sel);
  const todas = filas.length > 0 && seleccionadas.length === filas.length;
  // Totales de lo seleccionado, por moneda (pesos y dólares nunca se mezclan).
  const totales = useMemo(() => {
    const t = {};
    for (const f of seleccionadas) {
      t[f.moneda] = t[f.moneda] || { venta: 0, comision: 0, n: 0 };
      t[f.moneda].venta += f.venta;
      t[f.moneda].comision += montoDe(f);
      t[f.moneda].n += 1;
    }
    return t;
  }, [seleccionadas, marcas]); // eslint-disable-line react-hooks/exhaustive-deps

  const sinPorcentajeSinEspecial = porcentaje <= 0 && seleccionadas.some(f => !marcas[f.id]?.especial);
  const especialInvalido = seleccionadas.find(f => marcas[f.id]?.especial && (montoDe(f) < 0 || montoDe(f) > f.venta || marcas[f.id].monto === ''));

  const pagar = async () => {
    if (seleccionadas.length === 0) return;
    if (sinPorcentajeSinEspecial) { avisarError(`${datos.agente.nombre} no tiene % de comisión registrado: regístralo en Agentes o marca las reservaciones como pago especial.`); return; }
    if (especialInvalido) { avisarError(`Revisa el monto especial de ${especialInvalido.cliente} (${especialInvalido.destino}): debe ser de $0 a la venta.`); return; }
    const resumen = Object.entries(totales).map(([mon, t]) => `${dinero(t.comision)} ${mon}`).join(' + ');
    const especiales = seleccionadas.filter(f => marcas[f.id]?.especial).length;
    const ok = await confirmar({
      titulo: `¿Pagar comisiones a ${datos.agente.nombre}?`,
      detalles: [
        { etiqueta: 'Reservaciones', valor: `${seleccionadas.length}${especiales ? ` (${especiales} especial${especiales > 1 ? 'es' : ''})` : ''}` },
        { etiqueta: 'Comisión registrada', valor: pct(porcentaje) },
        { etiqueta: 'Total a pagar', valor: resumen, destacado: true, completo: true },
      ],
      nota: 'Se marcarán como pagadas al agente. Si te equivocas, puedes deshacerlo en "Ya pagadas".',
      textoAceptar: 'Pagar comisiones',
    });
    if (!ok) return;
    setPagando(true);
    try {
      const r = await comisionesApi.pagar(agenteId, seleccionadas.map(f => ({ id: f.id, especial: Boolean(marcas[f.id]?.especial), monto: montoDe(f) })));
      const pagado = Object.entries(r.totales).map(([mon, m]) => `${dinero(m)} ${mon}`).join(' + ');
      avisarExito(`Comisiones pagadas a ${datos.agente.nombre}: ${r.pagadas} reservación(es) · ${pagado}.${r.omitidas ? ` ${r.omitidas} ya estaban pagadas.` : ''}`);
      setRecarga(n => n + 1);
    } catch (err) {
      avisarError(err.message);
    } finally {
      setPagando(false);
    }
  };

  const revertir = async (f) => {
    const ok = await confirmar({
      titulo: '¿Deshacer el pago de comisión?',
      detalles: [
        { etiqueta: 'Reservación', valor: `${f.cliente} · ${f.destino}`, completo: true },
        { etiqueta: 'Comisión pagada', valor: `${dinero(f.pago?.monto)} ${f.pago?.moneda || f.moneda}`, destacado: true },
        { etiqueta: 'Pagada el', valor: f.pago?.fecha ? fechaCorta(f.pago.fecha) : '—' },
      ],
      nota: 'La reservación vuelve a quedar pendiente de pagar al agente.',
      textoAceptar: 'Deshacer pago',
      tono: 'peligro',
    });
    if (!ok) return;
    try {
      await comisionesApi.revertir(f.id);
      avisarExito('Pago de comisión deshecho: la reservación vuelve a pendientes.');
      setRecarga(n => n + 1);
    } catch (err) {
      avisarError(err.message);
    }
  };

  const atajoActivo = ATAJOS.find(([clave]) => rangoDe(clave).join() === [desde, hasta].join())?.[0];
  const activos = agentes.filter(a => a.estatus === 'Activo');
  const deBaja = agentes.filter(a => a.estatus !== 'Activo');
  const etiquetaAgente = (a) => `${a.nombre} · ${pct(a.porcentajeComision)}`;

  // Celdas del listado de pendientes (se reutilizan en tabla y tarjetas).
  const casilla = (f) => (
    <input type="checkbox" checked={Boolean(marcas[f.id]?.sel)} onChange={e => cambiar(f.id, { sel: e.target.checked })}
      aria-label={`Pagar ${f.cliente}`} className="h-4 w-4 rounded border-slate-300 text-brand-petroleo focus:ring-brand-petroleo" />
  );
  const especial = (f) => (
    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer" title="Se paga un monto distinto al % del agente">
      <input type="checkbox" checked={Boolean(marcas[f.id]?.especial)} disabled={!marcas[f.id]?.sel}
        onChange={e => cambiar(f.id, { especial: e.target.checked, monto: String(f.comision) })}
        className="h-4 w-4 rounded border-slate-300 text-brand-coral focus:ring-brand-coral disabled:opacity-40" />
      Especial
    </label>
  );
  const campoComision = (f) => {
    const m = marcas[f.id] || {};
    const excede = m.especial && montoDe(f) > f.venta;
    return (
      <div>
        <div className="relative w-32">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
          <CampoMonto min={0} disabled={!m.especial || !m.sel}
            className={`w-full p-1.5 pl-5 border rounded text-xs text-right tabular-nums disabled:bg-slate-100 disabled:text-slate-500 ${excede ? 'border-red-400' : 'border-slate-300'}`}
            valor={m.especial ? m.monto : f.comision} onCambio={v => cambiar(f.id, { monto: v })} />
        </div>
        <div className="mt-0.5 text-2xs text-slate-400">{m.especial ? (excede ? <span className="text-red-600">Mayor a la venta</span> : 'Monto especial') : `${pct(porcentaje)} de la venta`}</div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={BadgePercent} title="Pago de comisiones"
        subtitle="Comisiones de los agentes por sus ventas liquidadas en el periodo." />

      {/* Filtros */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="lg:w-72">
          <label className="block text-sm font-semibold text-slate-700">Agente</label>
          <select value={agenteId} onChange={e => setAgenteId(e.target.value)}
            className="mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-petroleo">
            {activos.length > 0 && <optgroup label="Activos">{activos.map(a => <option key={a._id} value={a._id}>{etiquetaAgente(a)}</option>)}</optgroup>}
            {deBaja.length > 0 && <optgroup label="Dados de baja">{deBaja.map(a => <option key={a._id} value={a._id}>{etiquetaAgente(a)}</option>)}</optgroup>}
          </select>
        </div>
        <div className="flex-1 min-w-0">
          <label className="block text-sm font-semibold text-slate-700">{verPagadas ? 'Pagadas entre' : 'Liquidadas entre'}</label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-wrap rounded-lg border border-slate-200 p-0.5 text-sm">
              {ATAJOS.map(([clave, etiqueta]) => (
                <button key={clave} onClick={() => setRango(rangoDe(clave))}
                  className={`rounded-md px-3 py-1.5 font-semibold ${atajoActivo === clave ? 'bg-brand-noche text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                  {etiqueta}
                </button>
              ))}
            </div>
            <div className="sm:w-80 [&>div]:mt-0">
              <SelectorRangoFechas desde={desde} hasta={hasta} onCambio={(d, h) => setRango([d, h])} placeholder="Elige el periodo" />
            </div>
          </div>
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-sm self-start lg:self-end">
          {[[false, 'Por pagar'], [true, 'Ya pagadas']].map(([valor, texto]) => (
            <button key={texto} onClick={() => setVerPagadas(valor)}
              className={`rounded-md px-3 py-1.5 font-semibold ${verPagadas === valor ? 'bg-brand-petroleo text-white' : 'text-slate-500 hover:text-slate-700'}`}>
              {texto}
            </button>
          ))}
        </div>
      </div>

      <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 p-6 transition-opacity ${cargando ? 'opacity-60' : ''}`}>
        {datos && (
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-brand-noche">{datos.agente.nombre}{datos.agente.estatus !== 'Activo' && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-2xs font-semibold text-red-700">Baja</span>}</h2>
              <p className="text-sm text-slate-500">Comisión registrada: <strong className="text-slate-700">{pct(porcentaje)}</strong> de la venta al público</p>
            </div>
            {!verPagadas && filas.length > 0 && (
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 cursor-pointer">
                <input type="checkbox" checked={todas} onChange={e => setMarcas(m => Object.fromEntries(Object.entries(m).map(([id, v]) => [id, { ...v, sel: e.target.checked }])))}
                  className="h-4 w-4 rounded border-slate-300 text-brand-petroleo focus:ring-brand-petroleo" />
                Seleccionar todas ({seleccionadas.length}/{filas.length})
              </label>
            )}
          </div>
        )}

        {datos && !verPagadas && porcentaje <= 0 && filas.length > 0 && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            Este agente no tiene % de comisión registrado. Regístralo en Agentes, o marca las reservaciones como "Especial" y captura el monto.
          </div>
        )}

        {!verPagadas ? (
          <ListadoAdaptable
            filas={filas} clave={f => f.id}
            cargando={!datos && cargando} textoCargando="Cargando ventas..."
            vacio={datos && filas.length === 0} textoVacio="No hay ventas liquidadas pendientes de pagar en este periodo."
            columnas={[
              { titulo: 'Pagar', className: 'w-14 text-center', celda: casilla },
              { titulo: 'Reservación', celda: f => <><div className="font-medium text-slate-700">{f.cliente}</div><div className="text-xs text-slate-500">{f.destino}</div></> },
              { titulo: 'Viaje', className: 'whitespace-nowrap', celda: f => <><div>{fechaViaje(f.fechaEntrada)}</div><div className="text-xs text-slate-400">al {fechaViaje(f.fechaSalida)}</div></> },
              { titulo: 'Liquidada', className: 'whitespace-nowrap', celda: f => (f.fechaLiquidacion ? fechaCorta(f.fechaLiquidacion) : '—') },
              { titulo: 'Venta', className: 'whitespace-nowrap tabular-nums text-right', celda: f => conMoneda(f.venta, f.moneda) },
              { titulo: 'Pago especial', celda: especial },
              { titulo: 'Comisión', celda: campoComision },
            ]}
            tarjeta={f => ({
              titulo: <label className="inline-flex items-center gap-2 cursor-pointer">{casilla(f)} {f.cliente}</label>,
              subtitulo: f.destino,
              campos: [
                { etiqueta: 'Viaje', valor: `${fechaViaje(f.fechaEntrada)} al ${fechaViaje(f.fechaSalida)}` },
                { etiqueta: 'Liquidada', valor: f.fechaLiquidacion ? fechaCorta(f.fechaLiquidacion) : '—' },
                { etiqueta: 'Venta', valor: conMoneda(f.venta, f.moneda) },
                { etiqueta: 'Comisión', valor: <div className="flex flex-wrap items-start gap-3">{campoComision(f)}{especial(f)}</div> },
              ],
            })}
          />
        ) : (
          <ListadoAdaptable
            filas={filas} clave={f => f.id}
            cargando={!datos && cargando} textoCargando="Cargando historial..."
            vacio={datos && filas.length === 0} textoVacio="No hay comisiones pagadas a este agente en este periodo."
            columnas={[
              { titulo: 'Reservación', celda: f => <><div className="font-medium text-slate-700">{f.cliente}</div><div className="text-xs text-slate-500">{f.destino}</div></> },
              { titulo: 'Liquidada', className: 'whitespace-nowrap', celda: f => (f.fechaLiquidacion ? fechaCorta(f.fechaLiquidacion) : '—') },
              { titulo: 'Venta', className: 'whitespace-nowrap tabular-nums text-right', celda: f => conMoneda(f.pago?.base ?? f.venta, f.moneda) },
              { titulo: 'Comisión pagada', className: 'whitespace-nowrap tabular-nums text-right', celda: f => <><div className="font-semibold text-slate-800">{conMoneda(f.pago?.monto, f.pago?.moneda || f.moneda)}</div><div className="text-2xs text-slate-400">{f.pago?.especial ? 'Pago especial' : pct(f.pago?.porcentaje)}</div></> },
              { titulo: 'Pagada', celda: f => <><div className="whitespace-nowrap">{f.pago?.fecha ? fechaCorta(f.pago.fecha) : '—'}</div><div className="text-xs text-slate-400">{f.pago?.pagadoPor?.nombre}</div></> },
            ]}
            tarjeta={f => ({
              titulo: f.cliente, subtitulo: f.destino,
              estatus: <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={12} /> Pagada</span>,
              campos: [
                { etiqueta: 'Comisión pagada', valor: <>{conMoneda(f.pago?.monto, f.pago?.moneda || f.moneda)} {f.pago?.especial ? '(especial)' : `(${pct(f.pago?.porcentaje)})`}</> },
                { etiqueta: 'Venta', valor: conMoneda(f.pago?.base ?? f.venta, f.moneda) },
                { etiqueta: 'Liquidada', valor: f.fechaLiquidacion ? fechaCorta(f.fechaLiquidacion) : '—' },
                { etiqueta: 'Pagada', valor: `${f.pago?.fecha ? fechaCorta(f.pago.fecha) : '—'}${f.pago?.pagadoPor?.nombre ? ` · ${f.pago.pagadoPor.nombre}` : ''}` },
              ],
            })}
            acciones={f => (
              <button onClick={() => revertir(f)} title="Deshacer este pago"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                <Undo2 size={13} /> Deshacer
              </button>
            )}
          />
        )}

        {/* Totales y botón de pagar (solo pendientes). */}
        {!verPagadas && filas.length > 0 && (
          <div className="mt-5 flex flex-col gap-4 rounded-xl border border-brand-petroleo/20 bg-brand-petroleo/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              {Object.keys(totales).length === 0 && <span className="text-slate-500">Selecciona las reservaciones a pagar.</span>}
              {Object.entries(totales).map(([mon, t]) => (
                <div key={mon}>
                  <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500">{t.n} venta(s) · {dinero(t.venta)} {mon}</div>
                  <div className="text-xl font-bold text-brand-noche tabular-nums">Comisión: {dinero(t.comision)} <span className="text-sm">{mon}</span></div>
                </div>
              ))}
            </div>
            <button onClick={pagar} disabled={pagando || seleccionadas.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-coral px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-90 disabled:opacity-50">
              <Wallet size={16} /> {pagando ? 'Pagando...' : `Pagar ${seleccionadas.length} comisión(es)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
