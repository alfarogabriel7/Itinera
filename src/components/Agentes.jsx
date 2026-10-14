import React, { useEffect, useMemo, useState } from 'react';
import { agentesApi, empresasApi } from '../api';
import { obtenerSesion } from '../utils/sesion';
import PageHeader from './common/PageHeader';
import { UserCog, Plus, X, Save, Search, Pencil, Trash2, Lock, Eye, EyeOff, AtSign, Building2, ChevronLeft, ChevronRight } from 'lucide-react';

const OPCIONES_POR_PAGINA = [25, 50, 100];

const EMPTY_FORM = { _id: null, nombre: '', userId: '', rol: 'Agente', empresa: '', estatus: 'Activo', password: '', confirmPassword: '' };

// Debe reflejar la misma regla que valida el backend (database/models/Agente.js):
// mínimo 8 caracteres, al menos una mayúscula, un número y un carácter especial.
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const inputClass = 'mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-brand-teal';
const labelClass = 'block text-sm font-semibold text-slate-700';

export default function Agentes() {
  const sesion = obtenerSesion();
  const esSuperAdmin = sesion?.rol === 'superAdmin';
  const esAdministrador = sesion?.rol === 'Administrador';
  const puedeCrear = esSuperAdmin || esAdministrador;
  // superAdmin solo da de alta Administradores (eligiendo empresa);
  // un Administrador solo da de alta Agentes (la empresa se toma de su sesión).
  const rolFijo = esSuperAdmin ? 'Administrador' : esAdministrador ? 'Agente' : '';

  const formVacio = () => ({ ...EMPTY_FORM, rol: rolFijo });

  const [agentes, setAgentes] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(formVacio);
  const [busqueda, setBusqueda] = useState('');
  const [porPagina, setPorPagina] = useState(25);
  const [pagina, setPagina] = useState(1);
  const [verPassword, setVerPassword] = useState(false);
  const [verConfirmPassword, setVerConfirmPassword] = useState(false);

  const esEdicion = Boolean(form._id);

  const cargarAgentes = async () => {
    try {
      setLoading(true);
      setAgentes(await agentesApi.list());
      setError('');
    } catch (err) {
      setError('No se pudo conectar con el servidor. ¿Está corriendo "npm run server"?');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarAgentes(); }, []);

  // El select de empresas solo lo necesita (y lo puede ver) el superAdmin.
  useEffect(() => {
    if (!esSuperAdmin) return;
    (async () => {
      try {
        setEmpresas(await empresasApi.list());
      } catch (err) {
        setError('No se pudo conectar con el servidor. ¿Está corriendo "npm run server"?');
      }
    })();
  }, [esSuperAdmin]);

  const empresasActivas = useMemo(() => empresas.filter(e => e.estatus === 'Activo'), [empresas]);
  // Si se edita un agente cuya empresa ya no está activa, igual la dejamos como opción
  // seleccionable para que no "desaparezca" del formulario.
  const opcionesEmpresa = useMemo(() => {
    if (form.empresa && !empresasActivas.some(e => e._id === form.empresa)) {
      const actual = empresas.find(e => e._id === form.empresa);
      if (actual) return [...empresasActivas, actual];
    }
    return empresasActivas;
  }, [empresas, empresasActivas, form.empresa]);

  // El rol también queda fijo según quién está creando; al editar un registro con
  // otro rol (p.ej. un superAdmin abriendo un Agente ya existente) lo dejamos visible.
  const opcionesRol = useMemo(() => {
    const base = rolFijo ? [rolFijo] : [];
    if (form.rol && !base.includes(form.rol)) return [...base, form.rol];
    return base;
  }, [rolFijo, form.rol]);

  const agentesFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return agentes;
    return agentes.filter(a =>
      a.nombre.toLowerCase().includes(q) ||
      (a.userId || '').toLowerCase().includes(q) ||
      (a.empresa?.nombreEmpresa || '').toLowerCase().includes(q)
    );
  }, [agentes, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(agentesFiltrados.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const agentesPaginados = useMemo(() => {
    const inicio = (paginaSegura - 1) * porPagina;
    return agentesFiltrados.slice(inicio, inicio + porPagina);
  }, [agentesFiltrados, paginaSegura, porPagina]);

  // Si cambia la búsqueda o el tamaño de página, siempre volvemos a la página 1.
  useEffect(() => { setPagina(1); }, [busqueda, porPagina]);

  const resetForm = () => {
    setForm(formVacio());
    setVerPassword(false);
    setVerConfirmPassword(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!esEdicion && !form.password) {
      alert('La contraseña es obligatoria para un nuevo agente.');
      return;
    }
    if (form.password && !PASSWORD_REGEX.test(form.password)) {
      alert('La contraseña debe tener al menos 8 caracteres, una mayúscula, un número y un carácter especial.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      alert('Las contraseñas no coinciden.');
      return;
    }
    if (!esEdicion && esSuperAdmin && !form.empresa) {
      alert('Selecciona la empresa para el administrador.');
      return;
    }

    const { _id, confirmPassword, password, ...resto } = form;
    const payload = password ? { ...resto, password } : resto;

    setGuardando(true);
    try {
      if (_id) {
        await agentesApi.update(_id, payload);
      } else {
        await agentesApi.create(payload);
      }
      resetForm();
      await cargarAgentes();
      alert('Se guardaron correctamente los datos.');
    } catch (err) {
      alert(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleEditar = (agente) => setForm({
    ...formVacio(),
    ...agente,
    empresa: agente.empresa?._id || agente.empresa || '',
    password: '',
    confirmPassword: '',
  });

  const handleEliminar = async (id) => {
    if (!confirm('¿Eliminar este agente?')) return;
    try {
      await agentesApi.remove(id);
      await cargarAgentes();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={UserCog}
        title="Agentes"
        subtitle="Administra los usuarios que operan el sistema."
        action={
          puedeCrear ? (
            <button
              onClick={resetForm}
              className="inline-flex items-center gap-2 bg-brand-teal hover:bg-brand-tealDark text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition"
            >
              <Plus size={16} /> Nuevo Agente
            </button>
          ) : null
        }
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {puedeCrear && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center gap-2 mb-6">
            <UserCog size={18} className="text-brand-teal" />
            <h2 className="text-base font-bold text-brand-tealDark">Información del Agente</h2>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <label className={labelClass}>Nombre del agente *</label>
              <input type="text" required placeholder="Ej. Gabriel Alfaro" className={inputClass}
                value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Usuario (para iniciar sesión) *</label>
              <div className="relative">
                <input type="text" required minLength={3} pattern="[a-z0-9._-]+"
                  title="Solo minúsculas, números, puntos, guiones y guiones bajos"
                  placeholder="Ej. gabriel.alfaro" className={`${inputClass} pr-9`}
                  value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value.toLowerCase() })} />
                <AtSign size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>

            <div>
              <label className={labelClass}>Rol *</label>
              <select required className={`${inputClass} bg-white`}
                value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })}>
                {opcionesRol.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Estatus *</label>
              <select required className={`${inputClass} bg-white`}
                value={form.estatus} onChange={e => setForm({ ...form, estatus: e.target.value })}>
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
            </div>

            {esSuperAdmin && (
              <div className="md:col-span-2">
                <label className={labelClass}>Empresa *</label>
                <div className="relative">
                  <select required className={`${inputClass} bg-white pr-9`}
                    value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })}>
                    <option value="">Selecciona una empresa</option>
                    {opcionesEmpresa.map(emp => <option key={emp._id} value={emp._id}>{emp.nombreEmpresa}</option>)}
                  </select>
                  <Building2 size={16} className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
            )}

            <div>
              <label className={labelClass}>Contraseña {esEdicion ? '' : '*'}</label>
              <div className="relative">
                <input type={verPassword ? 'text' : 'password'} required={!esEdicion} minLength={8}
                  placeholder={esEdicion ? 'Dejar en blanco para no cambiarla' : 'Mínimo 8 caracteres'}
                  className={`${inputClass} pr-9`}
                  value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                <Lock size={16} className="absolute right-9 top-1/2 -translate-y-1/2 text-slate-400" />
                <button type="button" onClick={() => setVerPassword(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {verPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="mt-1 text-2xs text-slate-500">Mín. 8 caracteres, una mayúscula, un número y un carácter especial.</p>
            </div>
            <div>
              <label className={labelClass}>Confirmar contraseña {esEdicion ? '' : '*'}</label>
              <div className="relative">
                <input type={verConfirmPassword ? 'text' : 'password'} required={!esEdicion} minLength={8}
                  placeholder={esEdicion ? 'Dejar en blanco para no cambiarla' : 'Repite la contraseña'}
                  className={`${inputClass} pr-9`}
                  value={form.confirmPassword} onChange={e => setForm({ ...form, confirmPassword: e.target.value })} />
                <Lock size={16} className="absolute right-9 top-1/2 -translate-y-1/2 text-slate-400" />
                <button type="button" onClick={() => setVerConfirmPassword(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {verConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="md:col-span-2 flex justify-end gap-3 mt-4">
              <button type="button" onClick={resetForm}
                className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-semibold transition">
                <X size={16} /> Cancelar
              </button>
              <button type="submit" disabled={guardando}
                className="inline-flex items-center gap-2 bg-brand-teal hover:bg-brand-tealDark disabled:opacity-60 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition">
                <Save size={16} /> {guardando ? 'Guardando...' : 'Guardar Agente'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <UserCog size={18} className="text-brand-teal" />
            <h2 className="text-base font-bold text-brand-tealDark">Listado de Agentes</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input type="text" placeholder="Buscar por nombre, usuario o empresa..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
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
                <th className="p-3 font-semibold">Usuario</th>
                <th className="p-3 font-semibold">Rol</th>
                <th className="p-3 font-semibold">Empresa</th>
                <th className="p-3 font-semibold">Estatus</th>
                <th className="p-3 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={6} className="p-6 text-center text-slate-400 text-sm">Cargando agentes...</td></tr>
              )}
              {!loading && agentesPaginados.map(a => (
                <tr key={a._id} className="text-sm hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-700">{a.nombre}</td>
                  <td className="p-3 text-slate-600 font-mono text-xs">{a.userId}</td>
                  <td className="p-3 text-slate-600">{a.rol}</td>
                  <td className="p-3 text-slate-600">{a.empresa?.nombreEmpresa || '—'}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${a.estatus === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {a.estatus}
                    </span>
                  </td>
                  <td className="p-3">
                    {puedeCrear ? (
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleEditar(a)} title="Editar" className="w-8 h-8 rounded-full bg-brand-yellow hover:brightness-95 text-brand-tealDark flex items-center justify-center">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleEliminar(a._id)} title="Eliminar" className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="block text-center text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && agentesFiltrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400 text-sm">No se encontraron agentes.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!loading && agentesFiltrados.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
            <p className="text-sm text-slate-500">
              Mostrando {(paginaSegura - 1) * porPagina + 1}–{Math.min(paginaSegura * porPagina, agentesFiltrados.length)} de {agentesFiltrados.length} agentes
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
