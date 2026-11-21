import React, { useEffect, useState, useRef } from 'react';
import { clientesApi, agentesApi } from '../api';
import PageHeader from './common/PageHeader';
import Paginacion, { SelectorPorPagina } from './common/Paginacion';
import { useListadoRemoto } from '../hooks/useListadoRemoto';
import { Users, Plus, X, Save, Search, Eye, Pencil, Trash2, Mail, Phone, Compass } from 'lucide-react';
import { soloLetras, soloTelefono, soloCorreo, soloDireccion } from '../utils/validadores';
import { obtenerSesion } from '../utils/sesion';
import { telefono, fechaViaje } from '../utils/formato';
import FichaDetalle from './common/FichaDetalle';
import ListadoAdaptable from './common/ListadoAdaptable';
import { confirmar } from '../utils/confirmar';

const estatusCliente = (c) => (
  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${c.estatus === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
    {c.estatus}
  </span>
);
import { SelectorFecha } from './common/Calendario';
import { PendientesDeRegistro } from './pendientes/Pendientes';
import NotasSeguimiento, { notasDesdeServidor, notasParaServidor } from './common/NotasSeguimiento';
import { avisarExito, avisarError } from '../utils/avisos';
import { irAlFormulario } from '../utils/irAlFormulario';

const EMPTY_FORM = {
  _id: null, nombreCompleto: '', correo: '', telefono: '',
  direccion: '', fechaNacimiento: '', ciudad: '', observaciones: '', pais: 'México', estatus: 'Activo', agente: '',
  tipoDocumento: '', numeroDocumento: '',
};

const TIPOS_DOCUMENTO = ['INE', 'Pasaporte', 'Cédula'];

const inputClass = 'mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo focus:border-brand-petroleo';
const labelClass = 'block text-sm font-semibold text-slate-700';

// onGenerarReservacion({ id, nombre }): abre Reservaciones con el cliente ya elegido.
export default function Clientes({ onGenerarReservacion }) {
  const sesion = obtenerSesion();
  // Un Agente puede editar clientes de su empresa, pero no darlos de baja.
  const puedeDarDeBaja = sesion?.rol !== 'Agente';
  // Cada cliente tiene un agente responsable, pero todos los usuarios de la
  // empresa pueden consultarlo y atenderlo (p.ej. si su agente no está). Solo
  // el Administrador asigna/reasigna el agente responsable.
  const esAdministrador = sesion?.rol === 'Administrador';
  const [agentes, setAgentes] = useState([]);

  // Los agentes de una empresa son pocos: una sola página de 100 basta para el filtro y el selector.
  useEffect(() => {
    agentesApi.list({ estatus: 'Activo', orden: 'nombre', porPagina: 100 })
      .then(r => setAgentes(r.datos.filter(a => a.rol !== 'superAdmin')))
      .catch(() => setAgentes([]));
  }, []);

  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  // Notas de seguimiento con acciones (mismo editor que Prospectos).
  const [notas, setNotas] = useState([]);
  // Filtro por agente responsable: '' = todos, 'mios' = mis clientes, o el id de un agente.
  const [filtroAgente, setFiltroAgente] = useState('');

  const listado = useListadoRemoto(params => clientesApi.list(params), {
    porPaginaInicial: 10,
    filtros: filtroAgente === 'mios' ? { mios: 1 } : filtroAgente ? { agente: filtroAgente } : {},
  });
  const cargarClientes = listado.recargar;
  const { error } = listado;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { _id, agente, ...payload } = form;
    // Solo el Administrador asigna agente; si no elige, el servidor lo deja a nombre de quien da de alta.
    if (esAdministrador && agente) payload.agente = agente;
    payload.notas = notasParaServidor(notas);
    // Sin documento: null (el servidor borra el tipo; '' no es un tipo válido).
    payload.numeroDocumento = (payload.numeroDocumento || '').trim();
    payload.tipoDocumento = payload.numeroDocumento ? payload.tipoDocumento : null;
    if (payload.numeroDocumento && !payload.tipoDocumento) {
      avisarError('Selecciona el tipo de documento (INE, Pasaporte o Cédula).');
      return;
    }
    setGuardando(true);
    try {
      if (_id) {
        await clientesApi.update(_id, payload);
      } else {
        await clientesApi.create(payload);
      }
      resetForm();
      await cargarClientes();
      avisarExito(_id ? 'Datos del cliente actualizados correctamente.' : 'Cliente registrado correctamente.');
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
    setNotas([]);
    setEstatusOriginal('Activo');
  };

  const formRef = useRef(null);

  const handleEditar = (cliente) => {
    irAlFormulario(formRef.current);
    setForm({
      ...EMPTY_FORM,
      ...cliente,
      fechaNacimiento: cliente.fechaNacimiento ? cliente.fechaNacimiento.slice(0, 10) : '',
      agente: cliente.agente?._id || cliente.agente || '',
      tipoDocumento: cliente.tipoDocumento || '',
      numeroDocumento: cliente.numeroDocumento || '',
    });
    setNotas(notasDesdeServidor(cliente.notas));
    setEstatusOriginal(cliente.estatus);
  };

  // No se elimina el registro de la BD: se da de baja lógicamente (estatus = Baja)
  // para conservar el historial del cliente.
  const handleEliminar = async (cliente) => {
    if (!(await confirmar({
      titulo: `¿Dar de baja a ${cliente.nombreCompleto}?`,
      mensaje: 'El cliente no se borra: conserva su historial de viajes y pagos. Puedes reactivarlo editándolo.',
      textoAceptar: 'Dar de baja', tono: 'peligro',
    }))) return;
    try {
      await clientesApi.update(cliente._id, { estatus: 'Baja' });
      await cargarClientes();
    } catch (err) {
      avisarError(err.message);
    }
  };

  const [viendo, setViendo] = useState(null);
  const handleVer = (cliente) => setViendo(cliente);

  return (
    <div className="flex flex-col gap-6">
      {viendo && (
        <FichaDetalle icono={Users} titulo={viendo.nombreCompleto} onCerrar={() => setViendo(null)}
          estatus={{ texto: viendo.estatus, tono: viendo.estatus === 'Activo' ? 'ok' : 'baja' }}
          subtitulo={viendo.agente?.nombre ? `Agente: ${viendo.agente.nombre}` : null}
          secciones={[
            { titulo: 'Contacto y datos personales', columnas: 4, campos: [
              { etiqueta: 'Teléfono', valor: viendo.telefono && telefono(viendo.telefono), mono: true },
              { etiqueta: 'Correo', valor: viendo.correo },
              { etiqueta: 'Documento', valor: viendo.numeroDocumento && `${viendo.tipoDocumento ? `${viendo.tipoDocumento} · ` : ''}${viendo.numeroDocumento}` },
              { etiqueta: 'Fecha de nacimiento', valor: viendo.fechaNacimiento && fechaViaje(viendo.fechaNacimiento) },
            ] },
            { titulo: 'Ubicación', columnas: 4, campos: [
              { etiqueta: 'Dirección', valor: viendo.direccion, doble: true },
              { etiqueta: 'Ciudad', valor: viendo.ciudad },
              { etiqueta: 'País', valor: viendo.pais },
            ] },
            { titulo: 'Observaciones / datos de interés', campos: [
              { etiqueta: 'Observaciones', valor: viendo.observaciones, completo: true },
            ] },
          ]}
          notas={viendo.notas || []} />
      )}
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

      <div data-tarjeta-formulario className="scroll-mt-24 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Users size={18} className="text-brand-petroleo" />
          <h2 className="text-base font-bold text-brand-noche">Información del Cliente</h2>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
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
            <label className={labelClass}>Tipo de documento {form.numeroDocumento && '*'}</label>
            <select required={Boolean(form.numeroDocumento)} className={`${inputClass} bg-white`}
              value={form.tipoDocumento} onChange={e => setForm({ ...form, tipoDocumento: e.target.value })}>
              <option value="">Sin documento</option>
              {TIPOS_DOCUMENTO.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Número de documento</label>
            {/* Solo letras y números, en mayúsculas (así viene en INE y pasaporte). */}
            <input type="text" maxLength={20} autoComplete="off" className={`${inputClass} font-mono uppercase`}
              placeholder={form.tipoDocumento === 'Pasaporte' ? 'Ej. G12345678' : form.tipoDocumento === 'INE' ? 'Ej. clave de elector o IDMEX' : 'Ej. G12345678'}
              value={form.numeroDocumento}
              onChange={e => setForm({ ...form, numeroDocumento: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) })} />
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
            <label className={labelClass}>Observaciones / datos de interés <span className="font-normal text-slate-400">(para ofrecerle promociones con anticipación)</span></label>
            <textarea rows={3} maxLength={1000} className={inputClass}
              placeholder={'Ej. "Viaja en agosto, 5 habitaciones dobles" o "Viaja en pareja en septiembre"'}
              value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} />
            <div className="mt-1 text-right text-2xs text-slate-400">{(form.observaciones || '').length}/1000</div>
          </div>

          <div className="md:col-span-2">
            <NotasSeguimiento notas={notas} onChange={setNotas} vacio="No hay notas agregadas a este cliente." />
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

      {/* Pendientes del cliente (fuera del formulario: tienen su propio formulario de captura). */}
      {form._id && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="mb-3 text-base font-bold text-brand-noche">Pendientes de {form.nombreCompleto || 'este cliente'}</h2>
          <PendientesDeRegistro ligas={{ cliente: form._id }} />
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-brand-petroleo" />
            <h2 className="text-base font-bold text-brand-noche">Listado de Clientes</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <input type="text" placeholder="Buscar nombre, teléfono u observaciones..." title="Busca en nombre, correo, teléfono, ciudad y observaciones (p.ej. «agosto»)" value={listado.busqueda} onChange={e => listado.setBusqueda(e.target.value)}
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

        <ListadoAdaptable
          filas={listado.datos}
          cargando={listado.cargando && listado.datos.length === 0} textoCargando="Cargando clientes..."
          vacio={!listado.cargando && listado.total === 0} textoVacio="No se encontraron clientes."
          columnas={[
            { titulo: 'Cliente', celda: c => <><div className="font-medium text-slate-700">{c.nombreCompleto}</div>{c.correo && <div className="text-xs text-slate-500 break-all">{c.correo}</div>}</> },
            { titulo: 'Teléfono', className: 'whitespace-nowrap tabular-nums', celda: c => telefono(c.telefono) },
            { titulo: 'Ciudad', celda: c => c.ciudad },
            { titulo: 'Agente responsable', celda: c => c.agente?.nombre || '—' },
            { titulo: 'Estatus', celda: c => estatusCliente(c) },
          ]}
          tarjeta={c => ({
            titulo: c.nombreCompleto, estatus: estatusCliente(c),
            campos: [
              { etiqueta: 'Teléfono', valor: telefono(c.telefono) },
              { etiqueta: 'Correo', valor: c.correo },
              { etiqueta: 'Ciudad', valor: c.ciudad },
              { etiqueta: 'Agente responsable', valor: c.agente?.nombre },
            ],
          })}
          acciones={c => (
                    <>
                      <button onClick={() => handleVer(c)} title="Ver" className="w-8 h-8 rounded-full bg-brand-petroleo hover:bg-brand-noche text-white flex items-center justify-center">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => handleEditar(c)} title="Editar" className="w-8 h-8 rounded-full bg-brand-coralClaro hover:brightness-95 text-brand-noche flex items-center justify-center">
                        <Pencil size={14} />
                      </button>
                      {/* Solo clientes activos: Reservaciones no permite elegir clientes dados de baja. */}
                      <button onClick={() => onGenerarReservacion({ id: c._id, nombre: c.nombreCompleto })} disabled={c.estatus !== 'Activo'}
                        title={c.estatus === 'Activo' ? 'Generar reservación' : 'El cliente está dado de baja'}
                        className="w-8 h-8 rounded-full bg-brand-coral hover:brightness-90 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100">
                        <Compass size={14} />
                      </button>
                      {puedeDarDeBaja && (
                        <button onClick={() => handleEliminar(c)} title="Dar de baja" className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </>
          )} />

        <Paginacion listado={listado} etiqueta="clientes" />
      </div>
    </div>
  );
}
