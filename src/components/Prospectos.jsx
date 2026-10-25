import React, { useEffect, useState } from 'react';
import { prospectosApi, agentesApi } from '../api';
import { obtenerSesion } from '../utils/sesion';
import { telefono } from '../utils/formato';
import PageHeader from './common/PageHeader';
import Paginacion, { SelectorPorPagina } from './common/Paginacion';
import { useListadoRemoto } from '../hooks/useListadoRemoto';
import { soloLetras, soloTelefono, soloCorreo, soloDireccion } from '../utils/validadores';
import { SelectorFecha } from './common/Calendario';
import NotasSeguimiento, { notasDesdeServidor, notasParaServidor, resumenNotas } from './common/NotasSeguimiento';
import {
  UserPlus, Plus, X, Save, Search, Pencil, UserCheck, Eye,
  Mail, Phone, TrendingUp,
} from 'lucide-react';

const EMPTY_FORM = {
  _id: null, nombreCompleto: '', correo: '', telefono: '',
  direccion: '', fechaNacimiento: '', ciudad: '', pais: 'México',
};

const inputClass = 'mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo focus:border-brand-petroleo';
const labelClass = 'block text-sm font-semibold text-slate-700';

export default function Prospectos() {
  const sesion = obtenerSesion();
  const esAdministrador = sesion?.rol === 'Administrador';

  const [guardando, setGuardando] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [notas, setNotas] = useState([]);

  const [estadisticas, setEstadisticas] = useState(null);
  const [loadingEstadisticas, setLoadingEstadisticas] = useState(false);

  const esEdicion = Boolean(form._id);

  // Todos consultan los prospectos de la empresa; editar y convertir es del
  // agente responsable o del Administrador.
  const puedeGestionar = (p) => esAdministrador || (p.agente?._id || p.agente) === sesion?.id;

  const [agentes, setAgentes] = useState([]);
  useEffect(() => {
    agentesApi.list({ estatus: 'Activo', orden: 'nombre', porPagina: 100 })
      .then(r => setAgentes(r.datos.filter(a => a.rol !== 'superAdmin')))
      .catch(() => setAgentes([]));
  }, []);
  // '' = todos, 'mios' = mis prospectos, o el id de un agente.
  const [filtroAgente, setFiltroAgente] = useState('');

  const listado = useListadoRemoto(params => prospectosApi.list(params), {
    filtros: filtroAgente === 'mios' ? { mios: 1 } : filtroAgente ? { agente: filtroAgente } : {},
  });
  const cargarProspectos = listado.recargar;
  const { error } = listado;

  const cargarEstadisticas = async () => {
    if (!esAdministrador) return;
    try {
      setLoadingEstadisticas(true);
      setEstadisticas(await prospectosApi.estadisticas());
    } catch (err) {
      // Silencioso: la gráfica es un complemento, no bloquea el resto del módulo.
    } finally {
      setLoadingEstadisticas(false);
    }
  };

  useEffect(() => { cargarEstadisticas(); }, [esAdministrador]);


  const resetForm = () => {
    setForm(EMPTY_FORM);
    setNotas([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { _id, ...payload } = form;
    payload.notas = notasParaServidor(notas);

    setGuardando(true);
    try {
      if (_id) {
        await prospectosApi.update(_id, payload);
      } else {
        await prospectosApi.create(payload);
      }
      resetForm();
      await cargarProspectos();
      alert('Se guardaron correctamente los datos.');
    } catch (err) {
      alert(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleEditar = (prospecto) => {
    setForm({
      ...EMPTY_FORM,
      ...prospecto,
      fechaNacimiento: prospecto.fechaNacimiento ? prospecto.fechaNacimiento.slice(0, 10) : '',
    });
    setNotas(notasDesdeServidor(prospecto.notas));
  };

  // Consulta de solo lectura para quien no es el responsable (p.ej. para atender
  // al prospecto si su agente no está disponible).
  const handleVer = (p) => {
    const seguimiento = resumenNotas(p.notas);
    alert(
      `${p.nombreCompleto}\nTel. ${p.telefono}${p.correo ? ` · ${p.correo}` : ''}\nAgente responsable: ${p.agente?.nombre || '—'}\n\n` +
      `Seguimiento:\n${seguimiento || 'Sin notas registradas.'}`
    );
  };

  const handleConvertir = async (prospecto) => {
    if (!confirm(`¿Convertir a ${prospecto.nombreCompleto} en cliente?`)) return;
    try {
      await prospectosApi.convertir(prospecto._id);
      await cargarProspectos();
      await cargarEstadisticas();
      alert('El prospecto se convirtió en cliente correctamente.');
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={UserPlus}
        title="Prospectos"
        subtitle="Da seguimiento a tus prospectos hasta convertirlos en clientes."
        action={
          <button
            onClick={resetForm}
            className="inline-flex items-center gap-2 bg-brand-petroleo hover:bg-brand-noche text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition"
          >
            <Plus size={16} /> Nuevo Prospecto
          </button>
        }
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {esAdministrador && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-brand-petroleo" />
            <h2 className="text-base font-bold text-brand-noche">Prospectos de este mes</h2>
          </div>
          {loadingEstadisticas && <p className="text-sm text-slate-400">Cargando estadísticas...</p>}
          {!loadingEstadisticas && estadisticas && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-slate-800">{estadisticas.totalMes}</div>
                  <div className="text-xs text-slate-500">Registrados este mes</div>
                </div>
                <div className="bg-brand-coral/10 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-brand-coral">{estadisticas.prospectosMes}</div>
                  <div className="text-xs text-slate-500">Aún como prospecto</div>
                </div>
                <div className="bg-emerald-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-emerald-600">{estadisticas.convertidosMes}</div>
                  <div className="text-xs text-slate-500">Convertidos a cliente</div>
                </div>
              </div>
              {estadisticas.totalMes > 0 && (
                <div className="space-y-2">
                  <div className="w-full h-4 rounded-full bg-slate-100 overflow-hidden flex">
                    <div
                      className="h-full bg-brand-coral"
                      style={{ width: `${(estadisticas.prospectosMes / estadisticas.totalMes) * 100}%` }}
                      title={`Prospectos: ${estadisticas.prospectosMes}`}
                    />
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${(estadisticas.convertidosMes / estadisticas.totalMes) * 100}%` }}
                      title={`Convertidos: ${estadisticas.convertidosMes}`}
                    />
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-brand-coral inline-block" /> Prospecto</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Cliente</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-6">
          <UserPlus size={18} className="text-brand-petroleo" />
          <h2 className="text-base font-bold text-brand-noche">Información del Prospecto</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
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
              <SelectorFecha nacimiento placeholder="Ej. 15 de mayo de 1990"
                valor={form.fechaNacimiento} onCambio={fechaNacimiento => setForm(f => ({ ...f, fechaNacimiento }))} />
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
          </div>

          <NotasSeguimiento notas={notas} onChange={setNotas} vacio="No hay notas agregadas a este prospecto." />

          <div className="flex justify-end gap-3">
            <button type="button" onClick={resetForm}
              className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-semibold transition">
              <X size={16} /> Cancelar
            </button>
            <button type="submit" disabled={guardando}
              className="inline-flex items-center gap-2 bg-brand-petroleo hover:bg-brand-noche disabled:opacity-60 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition">
              <Save size={16} /> {guardando ? 'Guardando...' : 'Guardar Prospecto'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <UserPlus size={18} className="text-brand-petroleo" />
            <h2 className="text-base font-bold text-brand-noche">Listado de Prospectos</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input type="text" placeholder="Buscar nombre, correo, teléfono..." value={listado.busqueda} onChange={e => listado.setBusqueda(e.target.value)}
                className="w-full sm:w-64 pl-3 pr-9 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo" />
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
            <select value={filtroAgente} onChange={e => setFiltroAgente(e.target.value)} title="Agente responsable"
              className="p-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-petroleo">
              <option value="">Todos los agentes</option>
              <option value="mios">Mis prospectos</option>
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
                <th className="p-3 font-semibold">Correo</th>
                <th className="p-3 font-semibold">Teléfono</th>
                <th className="p-3 font-semibold">Ciudad</th>
                <th className="p-3 font-semibold">Agente</th>
                <th className="p-3 font-semibold">Fecha Registro</th>
                <th className="p-3 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {listado.cargando && listado.datos.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-slate-400 text-sm">Cargando prospectos...</td></tr>
              )}
              {listado.datos.map(p => (
                <tr key={p._id} className="text-sm hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-700">{p.nombreCompleto}</td>
                  <td className="p-3 text-slate-600">{p.correo}</td>
                  <td className="p-3 text-slate-600 whitespace-nowrap tabular-nums">{telefono(p.telefono)}</td>
                  <td className="p-3 text-slate-600">{p.ciudad}</td>
                  <td className="p-3 text-slate-600">{p.agente?.nombre || '—'}</td>
                  <td className="p-3 text-slate-600">{new Date(p.fechaRegistro).toLocaleDateString('es-MX')}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-2">
                      {puedeGestionar(p) ? (
                        <>
                          <button onClick={() => handleEditar(p)} title="Editar" className="w-8 h-8 rounded-full bg-brand-coralClaro hover:brightness-95 text-brand-noche flex items-center justify-center">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => handleConvertir(p)} title="Convertir a Cliente" className="w-8 h-8 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center">
                            <UserCheck size={14} />
                          </button>
                        </>
                      ) : (
                        <button onClick={() => handleVer(p)} title="Ver seguimiento" className="w-8 h-8 rounded-full bg-brand-petroleo hover:bg-brand-noche text-white flex items-center justify-center">
                          <Eye size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!listado.cargando && listado.total === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-400 text-sm">No se encontraron prospectos.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Paginacion listado={listado} etiqueta="prospectos" />
      </div>
    </div>
  );
}
