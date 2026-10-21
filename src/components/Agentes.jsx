import React, { useMemo, useState } from 'react';
import { agentesApi, empresasApi } from '../api';
import { obtenerSesion } from '../utils/sesion';
import PageHeader from './common/PageHeader';
import Paginacion, { SelectorPorPagina } from './common/Paginacion';
import SelectorRemoto from './common/SelectorRemoto';
import IndicadorPassword, { CoincidenciaPassword } from './common/IndicadorPassword';
import { useListadoRemoto } from '../hooks/useListadoRemoto';
import { UserCog, Plus, X, Save, Search, Pencil, Trash2, Lock, Eye, EyeOff, AtSign } from 'lucide-react';

const EMPTY_FORM = { _id: null, nombre: '', userId: '', rol: 'Agente', empresa: '', empresaNombre: '', estatus: 'Activo', password: '', confirmPassword: '' };

// Debe reflejar la misma regla que valida el backend (database/models/Agente.js):
// mínimo 8 caracteres, al menos una mayúscula, un número y un carácter especial.
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const inputClass = 'mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo focus:border-brand-petroleo';
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

  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(formVacio);
  const [verPassword, setVerPassword] = useState(false);
  const [verConfirmPassword, setVerConfirmPassword] = useState(false);

  const esEdicion = Boolean(form._id);

  // Listado paginado y filtrado en el servidor.
  const listado = useListadoRemoto(params => agentesApi.list(params));
  const cargarAgentes = listado.recargar;
  const { error } = listado;

  // El selector de empresa (solo superAdmin) busca en el servidor entre las empresas activas.
  const buscarEmpresas = (q) => empresasApi.list({ q, estatus: 'Activo', orden: 'nombre', porPagina: 15 }).then(r => r.datos);

  // El rol también queda fijo según quién está creando; al editar un registro con
  // otro rol (p.ej. un superAdmin abriendo un Agente ya existente) lo dejamos visible.
  const opcionesRol = useMemo(() => {
    const base = rolFijo ? [rolFijo] : [];
    if (form.rol && !base.includes(form.rol)) return [...base, form.rol];
    return base;
  }, [rolFijo, form.rol]);


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

    const { _id, confirmPassword, password, empresaNombre, ...resto } = form;
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
    empresaNombre: agente.empresa?.nombreEmpresa || '',
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
              className="inline-flex items-center gap-2 bg-brand-petroleo hover:bg-brand-noche text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition"
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
            <UserCog size={18} className="text-brand-petroleo" />
            <h2 className="text-base font-bold text-brand-noche">Información del Agente</h2>
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
                <option value="Baja">Baja</option>
              </select>
            </div>

            {esSuperAdmin && (
              <div className="md:col-span-2">
                <label className={labelClass}>Empresa *</label>
                <div className="mt-1">
                  <SelectorRemoto required buscar={buscarEmpresas} placeholder="Busca y selecciona una empresa"
                    valor={form.empresa} etiquetaValor={form.empresaNombre}
                    etiqueta={emp => emp.nombreEmpresa} detalle={emp => `RFC ${emp.rfc}${emp.ciudad ? ` · ${emp.ciudad}` : ''}`}
                    onCambio={(id, emp) => setForm({ ...form, empresa: id, empresaNombre: emp?.nombreEmpresa || '' })} />
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
              {form.password
                ? <IndicadorPassword password={form.password} datosPersonales={[form.nombre, form.userId]} />
                : <p className="mt-1 text-2xs text-slate-500">Mín. 8 caracteres, una mayúscula, un número y un carácter especial.</p>}
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
              <CoincidenciaPassword password={form.password} confirmacion={form.confirmPassword} />
            </div>

            <div className="md:col-span-2 flex justify-end gap-3 mt-4">
              <button type="button" onClick={resetForm}
                className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-semibold transition">
                <X size={16} /> Cancelar
              </button>
              <button type="submit" disabled={guardando}
                className="inline-flex items-center gap-2 bg-brand-petroleo hover:bg-brand-noche disabled:opacity-60 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition">
                <Save size={16} /> {guardando ? 'Guardando...' : 'Guardar Agente'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <UserCog size={18} className="text-brand-petroleo" />
            <h2 className="text-base font-bold text-brand-noche">Listado de Agentes</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input type="text" placeholder="Buscar por nombre, usuario o empresa..." value={listado.busqueda} onChange={e => listado.setBusqueda(e.target.value)}
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
                <th className="p-3 font-semibold">Nombre</th>
                <th className="p-3 font-semibold">Usuario</th>
                <th className="p-3 font-semibold">Rol</th>
                <th className="p-3 font-semibold">Empresa</th>
                <th className="p-3 font-semibold">Estatus</th>
                <th className="p-3 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {listado.cargando && listado.datos.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-slate-400 text-sm">Cargando agentes...</td></tr>
              )}
              {listado.datos.map(a => (
                <tr key={a._id} className="text-sm hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-700">{a.nombre}</td>
                  <td className="p-3 text-slate-600 font-mono text-xs">{a.userId}</td>
                  <td className="p-3 text-slate-600">{a.rol}</td>
                  <td className="p-3 text-slate-600">{a.empresa?.nombreEmpresa || '—'}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${a.estatus === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {a.estatus}
                    </span>
                  </td>
                  <td className="p-3">
                    {puedeCrear ? (
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleEditar(a)} title="Editar" className="w-8 h-8 rounded-full bg-brand-coralClaro hover:brightness-95 text-brand-noche flex items-center justify-center">
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
              {!listado.cargando && listado.total === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400 text-sm">No se encontraron agentes.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Paginacion listado={listado} etiqueta="agentes" />
      </div>
    </div>
  );
}
