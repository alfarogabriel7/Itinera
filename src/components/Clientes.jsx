import React, { useEffect, useMemo, useState } from 'react';
import { clientesApi } from '../api';
import PageHeader from './common/PageHeader';
import { Users, Plus, X, Save, Search, Eye, Pencil, Trash2, Mail, Phone, ChevronLeft, ChevronRight } from 'lucide-react';
import { soloLetras, soloTelefono, soloCorreo, soloDireccion, soloLetrasYNumeros } from '../utils/validadores';
import { obtenerSesion } from '../utils/sesion';

const OPCIONES_POR_PAGINA = [25, 50, 100];

const EMPTY_FORM = {
  _id: null, nombreCompleto: '', correo: '', telefono: '',
  direccion: '', fechaNacimiento: '', ciudad: '', notas: '', pais: 'México', estatus: 'Activo',
};

const inputClass = 'mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-brand-teal';
const labelClass = 'block text-sm font-semibold text-slate-700';

export default function Clientes() {
  const sesion = obtenerSesion();
  // Un Agente puede editar clientes de su empresa, pero no darlos de baja.
  const puedeDarDeBaja = sesion?.rol !== 'Agente';

  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busqueda, setBusqueda] = useState('');
  const [porPagina, setPorPagina] = useState(25);
  const [pagina, setPagina] = useState(1);

  const cargarClientes = async () => {
    try {
      setLoading(true);
      setClientes(await clientesApi.list());
      setError('');
    } catch (err) {
      setError('No se pudo conectar con el servidor. ¿Está corriendo "npm run server"?');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarClientes(); }, []);

  const clientesFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(c =>
      c.nombreCompleto.toLowerCase().includes(q) ||
      (c.correo || '').toLowerCase().includes(q) ||
      (c.ciudad || '').toLowerCase().includes(q)
    );
  }, [clientes, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(clientesFiltrados.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const clientesPaginados = useMemo(() => {
    const inicio = (paginaSegura - 1) * porPagina;
    return clientesFiltrados.slice(inicio, inicio + porPagina);
  }, [clientesFiltrados, paginaSegura, porPagina]);

  // Si cambia la búsqueda o el tamaño de página, siempre volvemos a la página 1.
  useEffect(() => { setPagina(1); }, [busqueda, porPagina]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { _id, ...payload } = form;
    setGuardando(true);
    try {
      if (_id) {
        await clientesApi.update(_id, payload);
      } else {
        await clientesApi.create(payload);
      }
      setForm(EMPTY_FORM);
      await cargarClientes();
      alert('Se guardaron correctamente los datos.');
    } catch (err) {
      alert(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleEditar = (cliente) => setForm({
    ...EMPTY_FORM,
    ...cliente,
    fechaNacimiento: cliente.fechaNacimiento ? cliente.fechaNacimiento.slice(0, 10) : '',
  });

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
            onClick={() => setForm(EMPTY_FORM)}
            className="inline-flex items-center gap-2 bg-brand-teal hover:bg-brand-tealDark text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition"
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
          <Users size={18} className="text-brand-teal" />
          <h2 className="text-base font-bold text-brand-tealDark">Información del Cliente</h2>
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
              {puedeDarDeBaja && <option value="Baja">Baja</option>}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>Notas</label>
            <textarea rows={3} placeholder="Información adicional del cliente" className={inputClass}
              value={form.notas} onChange={e => setForm({ ...form, notas: soloLetrasYNumeros(e.target.value) })} />
          </div>

          <div className="md:col-span-2 flex justify-end gap-3 mt-4">
            <button type="button" onClick={() => setForm(EMPTY_FORM)}
              className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-semibold transition">
              <X size={16} /> Cancelar
            </button>
            <button type="submit" disabled={guardando}
              className="inline-flex items-center gap-2 bg-brand-teal hover:bg-brand-tealDark disabled:opacity-60 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition">
              <Save size={16} /> {guardando ? 'Guardando...' : 'Guardar Cliente'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-brand-teal" />
            <h2 className="text-base font-bold text-brand-tealDark">Listado de Clientes</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input type="text" placeholder="Buscar cliente..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
                className="w-full sm:w-64 pl-3 pr-9 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 shrink-0">
              Mostrar
              <select value={porPagina} onChange={e => setPorPagina(Number(e.target.value))}
                className="p-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal">
                {OPCIONES_POR_PAGINA.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-tealDark text-white text-sm">
                <th className="p-3 font-semibold">Nombre</th>
                <th className="p-3 font-semibold">Correo electrónico</th>
                <th className="p-3 font-semibold">Teléfono</th>
                <th className="p-3 font-semibold">Ciudad</th>
                <th className="p-3 font-semibold">Estatus</th>
                <th className="p-3 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={6} className="p-6 text-center text-slate-400 text-sm">Cargando clientes...</td></tr>
              )}
              {!loading && clientesPaginados.map(c => (
                <tr key={c._id} className="text-sm hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-700">{c.nombreCompleto}</td>
                  <td className="p-3 text-slate-600">{c.correo}</td>
                  <td className="p-3 text-slate-600">{c.telefono}</td>
                  <td className="p-3 text-slate-600">{c.ciudad}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${c.estatus === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {c.estatus}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => handleVer(c)} title="Ver" className="w-8 h-8 rounded-full bg-brand-teal hover:bg-brand-tealDark text-white flex items-center justify-center">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => handleEditar(c)} title="Editar" className="w-8 h-8 rounded-full bg-brand-yellow hover:brightness-95 text-brand-tealDark flex items-center justify-center">
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
              {!loading && clientesFiltrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400 text-sm">No se encontraron clientes.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!loading && clientesFiltrados.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
            <p className="text-sm text-slate-500">
              Mostrando {(paginaSegura - 1) * porPagina + 1}–{Math.min(paginaSegura * porPagina, clientesFiltrados.length)} de {clientesFiltrados.length} clientes
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={paginaSegura === 1}
                className="w-8 h-8 rounded-lg border border-slate-300 text-slate-600 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-slate-600 px-2">Página {paginaSegura} de {totalPaginas}</span>
              <button type="button" onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={paginaSegura === totalPaginas}
                className="w-8 h-8 rounded-lg border border-slate-300 text-slate-600 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
