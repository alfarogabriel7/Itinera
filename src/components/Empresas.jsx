import React, { useEffect, useMemo, useState } from 'react';
import { empresasApi } from '../api';
import PageHeader from './common/PageHeader';
import { Building2, Plus, X, Save, Search, Eye, Pencil, Trash2, Mail, Phone, ChevronLeft, ChevronRight } from 'lucide-react';
import { soloLetras, soloTelefono, soloCorreo, soloDireccion, soloRFC } from '../utils/validadores';

const OPCIONES_POR_PAGINA = [25, 50, 100];

const EMPTY_FORM = {
  _id: null, nombreEmpresa: '', correo: '', nombreTitular: '', direccion: '',
  telefonoPrincipal: '', telefonoSecundario: '', rfc: '', ciudad: '', pais: 'México', estatus: 'Activo',
};

const inputClass = 'mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-brand-teal';
const labelClass = 'block text-sm font-semibold text-slate-700';

export default function Empresas() {
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busqueda, setBusqueda] = useState('');
  const [porPagina, setPorPagina] = useState(25);
  const [pagina, setPagina] = useState(1);

  const cargarEmpresas = async () => {
    try {
      setLoading(true);
      setEmpresas(await empresasApi.list());
      setError('');
    } catch (err) {
      setError('No se pudo conectar con el servidor. ¿Está corriendo "npm run server"?');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarEmpresas(); }, []);

  const empresasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return empresas;
    return empresas.filter(e =>
      e.nombreEmpresa.toLowerCase().includes(q) ||
      (e.rfc || '').toLowerCase().includes(q) ||
      (e.correo || '').toLowerCase().includes(q)
    );
  }, [empresas, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(empresasFiltradas.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const empresasPaginadas = useMemo(() => {
    const inicio = (paginaSegura - 1) * porPagina;
    return empresasFiltradas.slice(inicio, inicio + porPagina);
  }, [empresasFiltradas, paginaSegura, porPagina]);

  // Si cambia la búsqueda o el tamaño de página, siempre volvemos a la página 1.
  useEffect(() => { setPagina(1); }, [busqueda, porPagina]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { _id, ...payload } = form;
    setGuardando(true);
    try {
      if (_id) {
        await empresasApi.update(_id, payload);
      } else {
        await empresasApi.create(payload);
      }
      setForm(EMPTY_FORM);
      await cargarEmpresas();
      alert('Se guardaron correctamente los datos.');
    } catch (err) {
      alert(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleEditar = (empresa) => setForm({ ...EMPTY_FORM, ...empresa });

  // No se elimina el registro de la BD: se da de baja lógicamente (estatus = Baja)
  // para conservar el historial de la empresa.
  const handleEliminar = async (empresa) => {
    if (!confirm(`¿Deseas dar de baja a ${empresa.nombreEmpresa}?`)) return;
    try {
      await empresasApi.update(empresa._id, { estatus: 'Baja' });
      await cargarEmpresas();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleVer = (empresa) => {
    alert(`${empresa.nombreEmpresa} (${empresa.estatus})\nTitular: ${empresa.nombreTitular || ''}\nRFC: ${empresa.rfc}\n${empresa.correo || ''}\n${empresa.telefonoPrincipal}\n${empresa.direccion || ''}, ${empresa.ciudad || ''}, ${empresa.pais}`);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Building2}
        title="Empresas"
        subtitle="Administra las empresas y su información de contacto."
        action={
          <button
            onClick={() => setForm(EMPTY_FORM)}
            className="inline-flex items-center gap-2 bg-brand-teal hover:bg-brand-tealDark text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition"
          >
            <Plus size={16} /> Nueva Empresa
          </button>
        }
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Building2 size={18} className="text-brand-teal" />
          <h2 className="text-base font-bold text-brand-tealDark">Información de la Empresa</h2>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <label className={labelClass}>Nombre de la empresa *</label>
            <input type="text" required placeholder="Ej. Viajes del Bajío" className={inputClass}
              value={form.nombreEmpresa} onChange={e => setForm({ ...form, nombreEmpresa: soloLetras(e.target.value) })} />
          </div>
          <div>
            <label className={labelClass}>Correo electrónico</label>
            <div className="relative">
              <input type="text" placeholder="Ej. contacto@empresa.com" className={`${inputClass} pr-9`}
                value={form.correo} onChange={e => setForm({ ...form, correo: soloCorreo(e.target.value) })} />
              <Mail size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          <div>
            <label className={labelClass}>Nombre del titular</label>
            <input type="text" placeholder="Ej. Juan Pérez López" className={inputClass}
              value={form.nombreTitular} onChange={e => setForm({ ...form, nombreTitular: soloLetras(e.target.value) })} />
          </div>
          <div>
            <label className={labelClass}>RFC *</label>
            <input type="text" required maxLength={13} placeholder="Ej. VBAJ850101AB1" className={inputClass}
              value={form.rfc} onChange={e => setForm({ ...form, rfc: soloRFC(e.target.value) })} />
          </div>

          <div>
            <label className={labelClass}>Teléfono principal *</label>
            <div className="relative">
              <input type="tel" required placeholder="Ej. 4771234567" className={`${inputClass} pr-9`}
                value={form.telefonoPrincipal} onChange={e => setForm({ ...form, telefonoPrincipal: soloTelefono(e.target.value) })} />
              <Phone size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Teléfono secundario</label>
            <div className="relative">
              <input type="tel" placeholder="Ej. 4777654321" className={`${inputClass} pr-9`}
                value={form.telefonoSecundario} onChange={e => setForm({ ...form, telefonoSecundario: soloTelefono(e.target.value) })} />
              <Phone size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          <div>
            <label className={labelClass}>Dirección</label>
            <input type="text" placeholder="Ej. Av Principal 123 Col Centro" className={inputClass}
              value={form.direccion} onChange={e => setForm({ ...form, direccion: soloDireccion(e.target.value) })} />
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
              <option value="Baja">Baja</option>
            </select>
          </div>

          <div className="md:col-span-2 flex justify-end gap-3 mt-4">
            <button type="button" onClick={() => setForm(EMPTY_FORM)}
              className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-semibold transition">
              <X size={16} /> Cancelar
            </button>
            <button type="submit" disabled={guardando}
              className="inline-flex items-center gap-2 bg-brand-teal hover:bg-brand-tealDark disabled:opacity-60 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition">
              <Save size={16} /> {guardando ? 'Guardando...' : 'Guardar Empresa'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-brand-teal" />
            <h2 className="text-base font-bold text-brand-tealDark">Listado de Empresas</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input type="text" placeholder="Buscar empresa..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
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
                <th className="p-3 font-semibold">Empresa</th>
                <th className="p-3 font-semibold">RFC</th>
                <th className="p-3 font-semibold">Titular</th>
                <th className="p-3 font-semibold">Correo</th>
                <th className="p-3 font-semibold">Teléfono</th>
                <th className="p-3 font-semibold">Estatus</th>
                <th className="p-3 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={7} className="p-6 text-center text-slate-400 text-sm">Cargando empresas...</td></tr>
              )}
              {!loading && empresasPaginadas.map(e => (
                <tr key={e._id} className="text-sm hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-700">{e.nombreEmpresa}</td>
                  <td className="p-3 text-slate-600 font-mono text-xs">{e.rfc}</td>
                  <td className="p-3 text-slate-600">{e.nombreTitular}</td>
                  <td className="p-3 text-slate-600">{e.correo}</td>
                  <td className="p-3 text-slate-600">{e.telefonoPrincipal}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${e.estatus === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {e.estatus}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => handleVer(e)} title="Ver" className="w-8 h-8 rounded-full bg-brand-teal hover:bg-brand-tealDark text-white flex items-center justify-center">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => handleEditar(e)} title="Editar" className="w-8 h-8 rounded-full bg-brand-yellow hover:brightness-95 text-brand-tealDark flex items-center justify-center">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleEliminar(e)} title="Dar de baja" className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && empresasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-400 text-sm">No se encontraron empresas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!loading && empresasFiltradas.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
            <p className="text-sm text-slate-500">
              Mostrando {(paginaSegura - 1) * porPagina + 1}–{Math.min(paginaSegura * porPagina, empresasFiltradas.length)} de {empresasFiltradas.length} empresas
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
