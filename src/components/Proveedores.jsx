import React, { useState } from 'react';
import { proveedoresApi } from '../api';
import PageHeader from './common/PageHeader';
import Paginacion, { SelectorPorPagina } from './common/Paginacion';
import { useListadoRemoto } from '../hooks/useListadoRemoto';
import { Truck, Plus, X, Save, Search, Eye, Pencil, Trash2 } from 'lucide-react';
import { obtenerSesion } from '../utils/sesion';
import { telefono } from '../utils/formato';
import { soloTelefono } from '../utils/validadores';

const EMPTY_FORM = {
  _id: null, nombreProveedor: '', telefono1: '', telefono2: '',
  numeroCuenta1: '', numeroCuenta2: '', estatus: 'Activo',
};

const inputClass = 'mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo focus:border-brand-petroleo';
const labelClass = 'block text-sm font-semibold text-slate-700';

export default function Proveedores() {
  const sesion = obtenerSesion();
  // Un Agente puede editar proveedores de su empresa, pero no darlos de baja.
  const puedeDarDeBaja = sesion?.rol !== 'Agente';

  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // Listado paginado y filtrado en el servidor.
  const listado = useListadoRemoto(params => proveedoresApi.list(params));
  const cargarProveedores = listado.recargar;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { _id, ...payload } = form;
    setGuardando(true);
    try {
      if (_id) {
        await proveedoresApi.update(_id, payload);
      } else {
        await proveedoresApi.create(payload);
      }
      setForm(EMPTY_FORM);
      await cargarProveedores();
      alert('Se guardaron correctamente los datos.');
    } catch (err) {
      alert(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleEditar = (proveedor) => setForm({ ...EMPTY_FORM, ...proveedor });

  // No se elimina el registro de la BD: se da de baja lógicamente (estatus = Baja)
  // para conservar el historial del proveedor.
  const handleEliminar = async (proveedor) => {
    if (!confirm(`¿Deseas dar de baja a ${proveedor.nombreProveedor}?`)) return;
    try {
      await proveedoresApi.update(proveedor._id, { estatus: 'Baja' });
      await cargarProveedores();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleVer = (proveedor) => {
    alert(`${proveedor.nombreProveedor} (${proveedor.estatus})\nTeléfono: ${proveedor.telefono1}\nCLABE: ${proveedor.numeroCuenta1}`);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Truck}
        title="Proveedores"
        subtitle="Administra hoteles, aerolíneas y demás proveedores de servicios."
        action={
          <button
            onClick={() => setForm(EMPTY_FORM)}
            className="inline-flex items-center gap-2 bg-brand-petroleo hover:bg-brand-noche text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition"
          >
            <Plus size={16} /> Nuevo Proveedor
          </button>
        }
      />

      {listado.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{listado.error}</div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Truck size={18} className="text-brand-petroleo" />
          <h2 className="text-base font-bold text-brand-noche">Información del Proveedor</h2>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
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
            <input type="text" required maxLength={18} className={inputClass} value={form.numeroCuenta1} onChange={e => setForm({ ...form, numeroCuenta1: e.target.value.slice(0, 18) })} />
          </div>
          <div>
            <label className={labelClass}>Cuenta Bancaria / CLABE 2</label>
            <input type="text" maxLength={18} className={inputClass} value={form.numeroCuenta2} onChange={e => setForm({ ...form, numeroCuenta2: e.target.value.slice(0, 18) })} />
          </div>
          <div>
            <label className={labelClass}>Estatus *</label>
            <select required className={`${inputClass} bg-white`}
              value={form.estatus} onChange={e => setForm({ ...form, estatus: e.target.value })}>
              <option value="Activo">Activo</option>
              {puedeDarDeBaja && <option value="Baja">Baja</option>}
            </select>
          </div>

          <div className="md:col-span-2 flex justify-end gap-3 mt-4">
            <button type="button" onClick={() => setForm(EMPTY_FORM)}
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
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-noche text-white text-sm">
                <th className="p-3 font-semibold">Proveedor</th>
                <th className="p-3 font-semibold">Teléfono</th>
                <th className="p-3 font-semibold">CLABE Principal</th>
                <th className="p-3 font-semibold">Estatus</th>
                <th className="p-3 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {listado.cargando && listado.datos.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-slate-400 text-sm">Cargando proveedores...</td></tr>
              )}
              {listado.datos.map(p => (
                <tr key={p._id} className="text-sm hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-700">{p.nombreProveedor}</td>
                  <td className="p-3 text-slate-600 whitespace-nowrap tabular-nums">{telefono(p.telefono1)}</td>
                  <td className="p-3 text-slate-600 font-mono text-xs">{p.numeroCuenta1}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${p.estatus === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {p.estatus}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-2">
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
                    </div>
                  </td>
                </tr>
              ))}
              {!listado.cargando && listado.total === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-slate-400 text-sm">No se encontraron proveedores.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <Paginacion listado={listado} etiqueta="proveedores" />
      </div>
    </div>
  );
}
