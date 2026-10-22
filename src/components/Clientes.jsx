import React, { useEffect, useState } from 'react';
import { clientesApi, agentesApi } from '../api';
import PageHeader from './common/PageHeader';
import Paginacion, { SelectorPorPagina } from './common/Paginacion';
import { useListadoRemoto } from '../hooks/useListadoRemoto';
import { Users, Plus, X, Save, Search, Eye, Pencil, Trash2, Mail, Phone } from 'lucide-react';
import { soloLetras, soloTelefono, soloCorreo, soloDireccion, soloLetrasYNumeros } from '../utils/validadores';
import { obtenerSesion } from '../utils/sesion';
import { telefono } from '../utils/formato';

const EMPTY_FORM = {
  _id: null, nombreCompleto: '', correo: '', telefono: '',
  direccion: '', fechaNacimiento: '', ciudad: '', notas: '', pais: 'México', estatus: 'Activo', agente: '',
};

const inputClass = 'mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo focus:border-brand-petroleo';
const labelClass = 'block text-sm font-semibold text-slate-700';

export default function Clientes() {
  const sesion = obtenerSesion();
  // Un Agente puede editar clientes de su empresa, pero no darlos de baja.
  const puedeDarDeBaja = sesion?.rol !== 'Agente';
  // Cada cliente tiene un agente responsable, pero todos los usuarios de la
  // empresa pueden consultarlo y atenderlo (p.ej. si su agente no está). Solo
  // el Administrador asigna/reasigna el agente responsable.
  const esAdministrador = sesion?.rol === 'Administrador';
  const [agentes, setAgentes] = useState([]);
  const columnas = 7;

  // Los agentes de una empresa son pocos: una sola página de 100 basta para el filtro y el selector.
  useEffect(() => {
    agentesApi.list({ estatus: 'Activo', orden: 'nombre', porPagina: 100 })
      .then(r => setAgentes(r.datos.filter(a => a.rol !== 'superAdmin')))
      .catch(() => setAgentes([]));
  }, []);

  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  // Filtro por agente responsable: '' = todos, 'mios' = mis clientes, o el id de un agente.
  const [filtroAgente, setFiltroAgente] = useState('');

  const listado = useListadoRemoto(params => clientesApi.list(params), {
    filtros: filtroAgente === 'mios' ? { mios: 1 } : filtroAgente ? { agente: filtroAgente } : {},
  });
  const cargarClientes = listado.recargar;
  const { error } = listado;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { _id, agente, ...payload } = form;
    // Solo el Administrador asigna agente; si no elige, el servidor lo deja a nombre de quien da de alta.
    if (esAdministrador && agente) payload.agente = agente;
    setGuardando(true);
    try {
      if (_id) {
        await clientesApi.update(_id, payload);
      } else {
        await clientesApi.create(payload);
      }
      resetForm();
      await cargarClientes();
      alert('Se guardaron correctamente los datos.');
    } catch (err) {
      alert(err.message);
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

  const handleEditar = (cliente) => {
    setForm({
      ...EMPTY_FORM,
      ...cliente,
      fechaNacimiento: cliente.fechaNacimiento ? cliente.fechaNacimiento.slice(0, 10) : '',
      agente: cliente.agente?._id || cliente.agente || '',
    });
    setEstatusOriginal(cliente.estatus);
  };

  // No se elimina el registro de la BD: se da de baja lógicamente (estatus = Baja)
  // para conservar el historial del cliente.
  const handleEliminar = async (cliente) => {
    if (!confirm(`¿Deseas dar de baja a ${cliente.nombreCompleto}?`)) return;
    try {
      await clientesApi.update(cliente._id, { estatus: 'Baja' });
      await cargarClientes();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleVer = (cliente) => {
    alert(`${cliente.nombreCompleto} (${cliente.estatus})\n${cliente.correo || ''}\n${cliente.telefono}\n${cliente.direccion || ''}, ${cliente.ciudad || ''}, ${cliente.pais}`);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Users}
        title="Clientes"
        subtitle="Administra la información de tus clientes."
        action={
          <button
            onClick={resetForm}
            className="inline-flex items-center gap-2 bg-brand-petroleo hover:bg-brand-noche text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition"
          >
            <Plus size={16} /> Nuevo Cliente
          </button>
        }
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Users size={18} className="text-brand-petroleo" />
          <h2 className="text-base font-bold text-brand-noche">Información del Cliente</h2>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <label className={labelClass}>Nombre completo *</label>
            <input type="text" required placeholder="Ej. Juan Pérez López" className={inputClass}
              value={form.nombreCompleto} onChange={e => setForm({ ...form, nombreCompleto: soloLetras(e.target.value) })} />
          </div>
          <div>
            <label className={labelClass}>Correo electrónico</label>
            <div className="relative">
              <input type="text" placeholder="Ej. juan.perez@email.com" className={`${inputClass} pr-9`}
                value={form.correo} onChange={e => setForm({ ...form, correo: soloCorreo(e.target.value) })} />
              <Mail size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          <div>
            <label className={labelClass}>Teléfono *</label>
            <div className="relative">
              <input type="tel" required placeholder="Ej. 4771234567" className={`${inputClass} pr-9`}
                value={form.telefono} onChange={e => setForm({ ...form, telefono: soloTelefono(e.target.value) })} />
              <Phone size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Dirección</label>
            <input type="text" placeholder="Ej. Av Principal 123 Col Centro" className={inputClass}
              value={form.direccion} onChange={e => setForm({ ...form, direccion: soloDireccion(e.target.value) })} />
          </div>

          <div>
            <label className={labelClass}>Fecha de nacimiento</label>
            <input type="date" className={inputClass}
              value={form.fechaNacimiento} onChange={e => setForm({ ...form, fechaNacimiento: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Ciudad</label>
            <input type="text" placeholder="Ej. León" className={inputClass}
              value={form.ciudad} onChange={e => setForm({ ...form, ciudad: soloLetras(e.target.value) })} />
          </div>

          <div>
            <label className={labelClass}>País *</label>
            <select required className={`${inputClass} bg-white`}
              value={form.pais} onChange={e => setForm({ ...form, pais: e.target.value })}>
              <option value="">Selecciona un país</option>
              <option value="México">México</option>
              <option value="Estados Unidos">Estados Unidos</option>
              <option value="España">España</option>
              <option value="Colombia">Colombia</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Estatus *</label>
            <select required className={`${inputClass} bg-white`}
              value={form.estatus} onChange={e => setForm({ ...form, estatus: e.target.value })}>
              <option value="Activo">Activo</option>
              {/* Siempre se muestra para que se vea el estatus real del cliente. Un
                  Agente no puede dar de baja, pero sí reactivar uno que ya lo estaba. */}
              <option value="Baja" disabled={!puedeDarDeBaja && estatusOriginal !== 'Baja'}>
                Baja{!puedeDarDeBaja && estatusOriginal !== 'Baja' ? ' (solo Administrador)' : ''}
              </option>
            </select>
          </div>

          {esAdministrador && (
            <div className="md:col-span-2">
              <label className={labelClass}>Agente responsable</label>
              <select className={`${inputClass} bg-white`}
                value={form.agente} onChange={e => setForm({ ...form, agente: e.target.value })}>
                <option value="">{form._id ? 'Sin cambio' : 'Yo (quien da de alta)'}</option>
                {agentes.map(a => <option key={a._id} value={a._id}>{a.nombre}{a.rol === 'Administrador' ? ' (Administrador)' : ''}</option>)}
              </select>
              <p className="mt-1 text-xs text-slate-500">El agente responsable le da seguimiento al cliente. Cualquier agente de la empresa puede consultarlo y registrarle pagos si el responsable no está disponible.</p>
            </div>
          )}

          <div className="md:col-span-2">
            <label className={labelClass}>Notas</label>
            <textarea rows={3} placeholder="Información adicional del cliente" className={inputClass}
              value={form.notas} onChange={e => setForm({ ...form, notas: soloLetrasYNumeros(e.target.value) })} />
          </div>

          <div className="md:col-span-2 flex justify-end gap-3 mt-4">
            <button type="button" onClick={resetForm}
              className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-semibold transition">
              <X size={16} /> Cancelar
            </button>
            <button type="submit" disabled={guardando}
              className="inline-flex items-center gap-2 bg-brand-petroleo hover:bg-brand-noche disabled:opacity-60 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition">
              <Save size={16} /> {guardando ? 'Guardando...' : 'Guardar Cliente'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-brand-petroleo" />
            <h2 className="text-base font-bold text-brand-noche">Listado de Clientes</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <input type="text" placeholder="Buscar nombre, correo, teléfono..." value={listado.busqueda} onChange={e => listado.setBusqueda(e.target.value)}
                className="w-full sm:w-64 pl-3 pr-9 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo" />
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
            <select value={filtroAgente} onChange={e => setFiltroAgente(e.target.value)} title="Agente responsable"
              className="p-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-petroleo">
              <option value="">Todos los agentes</option>
              <option value="mios">Mis clientes</option>
              {agentes.map(a => <option key={a._id} value={a._id}>{a.nombre}</option>)}
            </select>
            <SelectorPorPagina listado={listado} />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-noche text-white text-sm">
                <th className="p-3 font-semibold">Nombre</th>
                <th className="p-3 font-semibold">Correo electrónico</th>
                <th className="p-3 font-semibold">Teléfono</th>
                <th className="p-3 font-semibold">Ciudad</th>
                <th className="p-3 font-semibold">Agente responsable</th>
                <th className="p-3 font-semibold">Estatus</th>
                <th className="p-3 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {listado.cargando && listado.datos.length === 0 && (
                <tr><td colSpan={columnas} className="p-6 text-center text-slate-400 text-sm">Cargando clientes...</td></tr>
              )}
              {listado.datos.map(c => (
                <tr key={c._id} className="text-sm hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-700">{c.nombreCompleto}</td>
                  <td className="p-3 text-slate-600">{c.correo}</td>
                  <td className="p-3 text-slate-600 whitespace-nowrap tabular-nums">{telefono(c.telefono)}</td>
                  <td className="p-3 text-slate-600">{c.ciudad}</td>
                  <td className="p-3 text-slate-600">{c.agente?.nombre || '—'}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${c.estatus === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {c.estatus}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => handleVer(c)} title="Ver" className="w-8 h-8 rounded-full bg-brand-petroleo hover:bg-brand-noche text-white flex items-center justify-center">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => handleEditar(c)} title="Editar" className="w-8 h-8 rounded-full bg-brand-coralClaro hover:brightness-95 text-brand-noche flex items-center justify-center">
                        <Pencil size={14} />
                      </button>
                      {puedeDarDeBaja && (
                        <button onClick={() => handleEliminar(c)} title="Dar de baja" className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!listado.cargando && listado.total === 0 && (
                <tr>
                  <td colSpan={columnas} className="p-6 text-center text-slate-400 text-sm">No se encontraron clientes.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Paginacion listado={listado} etiqueta="clientes" />
      </div>
    </div>
  );
}
