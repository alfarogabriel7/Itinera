import React, { useState, useRef } from 'react';
import { proveedoresApi } from '../api';
import PageHeader from './common/PageHeader';
import Paginacion, { SelectorPorPagina } from './common/Paginacion';
import { useListadoRemoto } from '../hooks/useListadoRemoto';
import { Truck, Plus, X, Save, Search, Eye, Pencil, Trash2 } from 'lucide-react';
import { obtenerSesion } from '../utils/sesion';
import { telefono, cuentaBancaria } from '../utils/formato';
import FichaDetalle from './common/FichaDetalle';
import ListadoAdaptable from './common/ListadoAdaptable';
import { confirmar } from '../utils/confirmar';

const estatusProveedor = (p) => (
  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${p.estatus === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
    {p.estatus}
  </span>
);
import { soloTelefono, soloNumeros } from '../utils/validadores';
import { limpiar as limpiarMonto } from './common/CampoMonto';
import { avisarExito, avisarError } from '../utils/avisos';
import { irAlFormulario } from '../utils/irAlFormulario';

const EMPTY_FORM = {
  _id: null, nombreProveedor: '', telefono1: '', telefono2: '',
  numeroCuenta1: '', numeroCuenta2: '', porcentajeComision: '', estatus: 'Activo',
};

const porcentajeVisible = (p) => `${Number(p.porcentajeComision || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })} %`;

const inputClass = 'mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo focus:border-brand-petroleo';
const labelClass = 'block text-sm font-semibold text-slate-700';

export default function Proveedores() {
  const sesion = obtenerSesion();
  // Un Agente puede editar proveedores de su empresa, pero no darlos de baja.
  const puedeDarDeBaja = sesion?.rol !== 'Agente';

  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // Listado paginado y filtrado en el servidor.
  const listado = useListadoRemoto(params => proveedoresApi.list(params), { porPaginaInicial: 10 });
  const cargarProveedores = listado.recargar;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { _id, ...datos } = form;
    const payload = { ...datos, porcentajeComision: Number(datos.porcentajeComision) || 0 };
    setGuardando(true);
    try {
      if (_id) {
        await proveedoresApi.update(_id, payload);
      } else {
        await proveedoresApi.create(payload);
      }
      resetForm();
      await cargarProveedores();
      avisarExito(_id ? 'Datos del proveedor actualizados correctamente.' : 'Proveedor registrado correctamente.');
    } catch (err) {
      avisarError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  // Estatus con el que se abrió el registro (decide si un Agente puede elegir "Baja").
  const [estatusOriginal, setEstatusOriginal] = useState('Activo');

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEstatusOriginal('Activo');
  };

  const formRef = useRef(null);

  const handleEditar = (proveedor) => {
    irAlFormulario(formRef.current);
    setForm({ ...EMPTY_FORM, ...proveedor, porcentajeComision: proveedor.porcentajeComision ? String(proveedor.porcentajeComision) : '' });
    setEstatusOriginal(proveedor.estatus);
  };

  // No se elimina el registro de la BD: se da de baja lógicamente (estatus = Baja)
  // para conservar el historial del proveedor.
  const handleEliminar = async (proveedor) => {
    if (!(await confirmar({
      titulo: `¿Dar de baja a ${proveedor.nombreProveedor}?`,
      mensaje: 'Ya no aparecerá al registrar reservaciones nuevas. Sus reservaciones y pagos anteriores se conservan; puedes reactivarlo editándolo.',
      textoAceptar: 'Dar de baja', tono: 'peligro',
    }))) return;
    try {
      await proveedoresApi.update(proveedor._id, { estatus: 'Baja' });
      await cargarProveedores();
    } catch (err) {
      avisarError(err.message);
    }
  };

  const [viendo, setViendo] = useState(null);
  const handleVer = (proveedor) => setViendo(proveedor);

  return (
    <div className="flex flex-col gap-6">
      {viendo && (
        <FichaDetalle icono={Truck} titulo={viendo.nombreProveedor} onCerrar={() => setViendo(null)}
          estatus={{ texto: viendo.estatus, tono: viendo.estatus === 'Activo' ? 'ok' : 'baja' }}
          subtitulo={`Comisión ${porcentajeVisible(viendo)}`}
          secciones={[
            { titulo: 'Contacto', campos: [
              { etiqueta: 'Teléfono principal', valor: viendo.telefono1 && telefono(viendo.telefono1), mono: true },
              { etiqueta: 'Teléfono secundario', valor: viendo.telefono2 && telefono(viendo.telefono2), mono: true },
            ] },
            { titulo: 'Datos bancarios', campos: [
              { etiqueta: 'Cuenta / CLABE 1', valor: viendo.numeroCuenta1 && cuentaBancaria(viendo.numeroCuenta1), mono: true },
              { etiqueta: 'Cuenta / CLABE 2', valor: viendo.numeroCuenta2 && cuentaBancaria(viendo.numeroCuenta2), mono: true },
            ] },
            { titulo: 'Condiciones', campos: [
              { etiqueta: '% Comisión', valor: porcentajeVisible(viendo) },
            ] },
          ]} />
      )}
      <PageHeader
        icon={Truck}
        title="Proveedores"
        subtitle="Administra hoteles, aerolíneas y demás proveedores de servicios."
        action={
          <button
            onClick={resetForm}
            className="inline-flex items-center gap-2 bg-brand-petroleo hover:bg-brand-noche text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition"
          >
            <Plus size={16} /> Nuevo Proveedor
          </button>
        }
      />

      {listado.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{listado.error}</div>
      )}

      <div data-tarjeta-formulario className="scroll-mt-24 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Truck size={18} className="text-brand-petroleo" />
          <h2 className="text-base font-bold text-brand-noche">Información del Proveedor</h2>
        </div>
        <form ref={formRef} onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <div className="md:col-span-2">
            <label className={labelClass}>Nombre o Razón Social *</label>
            <input type="text" maxLength={100} required placeholder="Ej. Aeroméxico" className={inputClass} value={form.nombreProveedor} onChange={e => setForm({ ...form, nombreProveedor: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Teléfono Principal *</label>
            <input type="tel" inputMode="numeric" required maxLength={10} placeholder="Ej. 4771234567" className={inputClass} value={form.telefono1} onChange={e => setForm({ ...form, telefono1: soloTelefono(e.target.value).slice(0, 10) })} />
          </div>
          <div>
            <label className={labelClass}>Teléfono Secundario</label>
            <input type="tel" inputMode="numeric" maxLength={10} placeholder="Ej. 4777654321" className={inputClass} value={form.telefono2} onChange={e => setForm({ ...form, telefono2: soloTelefono(e.target.value).slice(0, 10) })} />
          </div>
          <div>
            <label className={labelClass}>Cuenta Bancaria / CLABE 1 * (18 dígitos)</label>
            <input type="text" inputMode="numeric" required maxLength={18} placeholder="Ej. 012180001234567891" className={inputClass} value={form.numeroCuenta1} onChange={e => setForm({ ...form, numeroCuenta1: soloNumeros(e.target.value).slice(0, 18) })} />
          </div>
          <div>
            <label className={labelClass}>Cuenta Bancaria / CLABE 2</label>
            <input type="text" inputMode="numeric" maxLength={18} placeholder="Ej. 012180001234567891" className={inputClass} value={form.numeroCuenta2} onChange={e => setForm({ ...form, numeroCuenta2: soloNumeros(e.target.value).slice(0, 18) })} />
          </div>
          <div>
            <label className={labelClass}>% Comisión</label>
            {/* De 0 a 100, máximo 2 decimales. Se precarga al elegir el proveedor en una reservación. */}
            <div className="relative">
              <input type="text" inputMode="decimal" autoComplete="off" placeholder="Ej. 10" className={`${inputClass} pr-8 tabular-nums`}
                value={form.porcentajeComision}
                onChange={e => { const v = limpiarMonto(e.target.value); setForm({ ...form, porcentajeComision: Number(v) > 100 ? '100' : v }); }} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-sm text-slate-400">%</span>
            </div>
          </div>
          <div>
            <label className={labelClass}>Estatus *</label>
            <select required className={`${inputClass} bg-white`}
              value={form.estatus} onChange={e => setForm({ ...form, estatus: e.target.value })}>
              <option value="Activo">Activo</option>
              {/* Siempre se muestra para que se vea el estatus real del proveedor. Un
                  Agente no puede dar de baja, pero sí reactivar uno que ya lo estaba. */}
              <option value="Baja" disabled={!puedeDarDeBaja && estatusOriginal !== 'Baja'}>
                Baja{!puedeDarDeBaja && estatusOriginal !== 'Baja' ? ' (solo Administrador)' : ''}
              </option>
            </select>
          </div>

          <div className="md:col-span-2 flex justify-end gap-3 mt-4">
            <button type="button" onClick={resetForm}
              className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-semibold transition">
              <X size={16} /> Cancelar
            </button>
            <button type="submit" disabled={guardando} className="inline-flex items-center gap-2 bg-brand-petroleo hover:bg-brand-noche disabled:opacity-60 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition">
              <Save size={16} /> {guardando ? 'Guardando...' : 'Guardar Proveedor'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Truck size={18} className="text-brand-petroleo" />
            <h2 className="text-base font-bold text-brand-noche">Listado de Proveedores</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input type="text" placeholder="Buscar proveedor..." value={listado.busqueda} onChange={e => listado.setBusqueda(e.target.value)}
                className="w-full sm:w-64 pl-3 pr-9 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo" />
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
            <SelectorPorPagina listado={listado} />
          </div>
        </div>
        <ListadoAdaptable
          filas={listado.datos}
          cargando={listado.cargando && listado.datos.length === 0} textoCargando="Cargando proveedores..."
          vacio={!listado.cargando && listado.total === 0} textoVacio="No se encontraron proveedores."
          columnas={[
            { titulo: 'Proveedor', celda: p => <span className="font-medium text-slate-700">{p.nombreProveedor}</span> },
            { titulo: 'Teléfono', className: 'whitespace-nowrap tabular-nums', celda: p => telefono(p.telefono1) },
            { titulo: 'Cuenta principal', className: 'whitespace-nowrap tabular-nums', celda: p => cuentaBancaria(p.numeroCuenta1) },
            { titulo: '% Comisión', className: 'whitespace-nowrap tabular-nums text-right', celda: p => porcentajeVisible(p) },
            { titulo: 'Estatus', celda: p => estatusProveedor(p) },
          ]}
          tarjeta={p => ({
            titulo: p.nombreProveedor, estatus: estatusProveedor(p),
            campos: [
              { etiqueta: 'Teléfono', valor: telefono(p.telefono1) },
              { etiqueta: 'Cuenta principal', valor: cuentaBancaria(p.numeroCuenta1) },
              { etiqueta: '% Comisión', valor: porcentajeVisible(p) },
            ],
          })}
          acciones={p => (
                    <>
                      <button onClick={() => handleVer(p)} title="Ver" className="w-8 h-8 rounded-full bg-brand-petroleo hover:bg-brand-noche text-white flex items-center justify-center">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => handleEditar(p)} title="Editar" className="w-8 h-8 rounded-full bg-brand-coralClaro hover:brightness-95 text-brand-noche flex items-center justify-center">
                        <Pencil size={14} />
                      </button>
                      {puedeDarDeBaja && (
                        <button onClick={() => handleEliminar(p)} title="Dar de baja" className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </>
          )} />

        <Paginacion listado={listado} etiqueta="proveedores" />
      </div>
    </div>
  );
}
