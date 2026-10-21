import React, { useRef, useState } from 'react';
import { empresasApi } from '../api';
import PageHeader from './common/PageHeader';
import { Building2, Plus, X, Save, Search, Eye, Pencil, Trash2, Mail, Phone, ImagePlus } from 'lucide-react';
import Paginacion, { SelectorPorPagina } from './common/Paginacion';
import { useListadoRemoto } from '../hooks/useListadoRemoto';
import { soloLetras, soloLetrasYNumeros, soloTelefono, soloCorreo, soloDireccion, soloCodigoPostal, soloRFC } from '../utils/validadores';
import SelectorRemoto from './common/SelectorRemoto';
import { ESTADOS_MEXICO } from '../../database/catalogos/estados.js';


const EMPTY_FORM = {
  _id: null, nombreEmpresa: '', correo: '', nombreTitular: '', codigoPostal: '', direccion: '', colonia: '',
  telefonoPrincipal: '', telefonoSecundario: '', rfc: '', ciudad: '', estado: '', pais: 'México', estatus: 'Activo',
};

// Catálogo de estados en orden alfabético, con el nombre como id (es lo que se guarda).
const OPCIONES_ESTADOS = ESTADOS_MEXICO
  .map(e => ({ _id: e.nombre, nombre: e.nombre }))
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
const sinAcentos = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Búsqueda local (sin servidor) e insensible a acentos: "queretaro" encuentra "Querétaro".
const buscarEstados = async (q) => OPCIONES_ESTADOS.filter(e => sinAcentos(e.nombre).includes(sinAcentos(q)));

// Mismo límite y tipos que valida el servidor (allá se revisa el contenido real).
const LIMITE_LOGO = 1024 * 1024;
const TIPOS_LOGO = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';

const inputClass ='mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo focus:border-brand-petroleo';
const labelClass = 'block text-sm font-semibold text-slate-700';

export default function Empresas() {
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // Listado paginado y filtrado en el servidor.
  const listado = useListadoRemoto(params => empresasApi.list(params));
  const cargarEmpresas = listado.recargar;
  const { error } = listado;

  // Logo: archivo nuevo elegido, vista previa (del archivo o del guardado) y si se pidió quitarlo.
  const [logoArchivo, setLogoArchivo] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [quitarLogo, setQuitarLogo] = useState(false);
  const inputLogo = useRef(null);

  const cambiarPreview = (url) => {
    setLogoPreview(anterior => {
      if (anterior) URL.revokeObjectURL(anterior);
      return url;
    });
  };

  const limpiarLogo = () => {
    setLogoArchivo(null);
    setQuitarLogo(false);
    cambiarPreview('');
    if (inputLogo.current) inputLogo.current.value = '';
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    limpiarLogo();
  };

  const handleLogo = (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    if (!/\.(png|jpe?g|webp)$/i.test(archivo.name)) {
      alert('El logo debe ser una imagen PNG, JPG o WEBP.');
      e.target.value = '';
      return;
    }
    if (archivo.size > LIMITE_LOGO) {
      alert('El logo no puede pesar más de 1 MB.');
      e.target.value = '';
      return;
    }
    setLogoArchivo(archivo);
    setQuitarLogo(false);
    cambiarPreview(URL.createObjectURL(archivo));
  };

  const handleQuitarLogo = () => {
    setLogoArchivo(null);
    setQuitarLogo(true);
    cambiarPreview('');
    if (inputLogo.current) inputLogo.current.value = '';
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    const { _id, ...payload } = form;
    setGuardando(true);
    try {
      const guardada = _id ? await empresasApi.update(_id, payload) : await empresasApi.create(payload);
      // El logo va en una petición aparte, ya con el id de la empresa.
      let avisoLogo = '';
      try {
        if (logoArchivo) await empresasApi.subirLogo(guardada._id, logoArchivo);
        else if (quitarLogo && _id) await empresasApi.quitarLogo(_id);
      } catch (err) {
        avisoLogo = `\n\nLos datos se guardaron, pero no se pudo actualizar el logo: ${err.message}`;
      }
      resetForm();
      await cargarEmpresas();
      alert(`Se guardaron correctamente los datos.${avisoLogo}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleEditar = async (empresa) => {
    setForm({ ...EMPTY_FORM, ...empresa });
    limpiarLogo();
    if (empresa.logo?.tipo) {
      try {
        cambiarPreview(URL.createObjectURL(await empresasApi.descargarLogo(empresa._id)));
      } catch {
        /* sin vista previa: el resto del formulario sigue editable */
      }
    }
  };

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
    alert(`${empresa.nombreEmpresa} (${empresa.estatus})\nTitular: ${empresa.nombreTitular || ''}\nRFC: ${empresa.rfc}\n${empresa.correo || ''}\n${empresa.telefonoPrincipal}\n${[empresa.direccion, empresa.colonia && `Col. ${empresa.colonia}`, empresa.codigoPostal && `C.P. ${empresa.codigoPostal}`, empresa.ciudad, empresa.estado, empresa.pais].filter(Boolean).join(', ')}`);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Building2}
        title="Empresas"
        subtitle="Administra las empresas y su información de contacto."
        action={
          <button
            onClick={resetForm}
            className="inline-flex items-center gap-2 bg-brand-petroleo hover:bg-brand-noche text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition"
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
          <Building2 size={18} className="text-brand-petroleo" />
          <h2 className="text-base font-bold text-brand-noche">Información de la Empresa</h2>
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
            <label className={labelClass}>Código postal</label>
            <input type="text" inputMode="numeric" maxLength={5} pattern="\d{5}" title="El código postal debe tener 5 dígitos"
              placeholder="Ej. 37000" className={inputClass}
              value={form.codigoPostal} onChange={e => setForm({ ...form, codigoPostal: soloCodigoPostal(e.target.value) })} />
          </div>
          <div>
            <label className={labelClass}>Dirección</label>
            <input type="text" placeholder="Ej. Av. Principal #123" className={inputClass}
              value={form.direccion} onChange={e => setForm({ ...form, direccion: soloDireccion(e.target.value) })} />
          </div>

          <div>
            <label className={labelClass}>Colonia</label>
            <input type="text" placeholder="Ej. Jardines del Moral" className={inputClass}
              value={form.colonia} onChange={e => setForm({ ...form, colonia: soloLetrasYNumeros(e.target.value) })} />
          </div>
          <div>
            <label className={labelClass}>Ciudad</label>
            <input type="text" placeholder="Ej. León" className={inputClass}
              value={form.ciudad} onChange={e => setForm({ ...form, ciudad: soloLetras(e.target.value) })} />
          </div>

          <div>
            <label className={labelClass}>Estado</label>
            <div className="mt-1">
              <SelectorRemoto buscar={buscarEstados} disabled={form.pais !== 'México'}
                placeholder={form.pais === 'México' ? 'Busca y selecciona un estado' : 'Solo aplica para México'}
                valor={form.estado} etiquetaValor={form.estado}
                etiqueta={e => e.nombre}
                onCambio={id => setForm({ ...form, estado: id })} />
            </div>
          </div>
          <div>
            <label className={labelClass}>País *</label>
            <select required className={`${inputClass} bg-white`}
              value={form.pais} onChange={e => setForm({ ...form, pais: e.target.value, estado: e.target.value === 'México' ? form.estado : '' })}>
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

          <div className="md:col-span-2">
            <label className={labelClass}>Logo de la empresa <span className="font-normal text-slate-400">(opcional · se imprime en los recibos al cliente)</span></label>
            <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-4 p-4 border border-dashed border-slate-300 rounded-xl bg-slate-50">
              <div className="w-40 h-20 shrink-0 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden">
                {logoPreview
                  ? <img src={logoPreview} alt="Logo de la empresa" className="max-w-full max-h-full object-contain p-1" />
                  : <ImagePlus size={28} className="text-slate-300" />}
              </div>
              <div className="flex-1 text-sm text-slate-500">
                <p>PNG, JPG o WEBP de máximo 1 MB. Se recomienda fondo blanco o transparente, en horizontal.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => inputLogo.current.click()}
                    className="inline-flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-sm font-semibold">
                    <ImagePlus size={16} /> {logoPreview ? 'Cambiar logo' : 'Subir logo'}
                  </button>
                  {logoPreview && (
                    <button type="button" onClick={handleQuitarLogo}
                      className="inline-flex items-center gap-2 bg-white border border-red-200 hover:bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm font-semibold">
                      <Trash2 size={16} /> Quitar logo
                    </button>
                  )}
                </div>
                {quitarLogo && <p className="mt-2 text-xs text-red-600">El logo se quitará al guardar.</p>}
              </div>
              <input ref={inputLogo} type="file" accept={TIPOS_LOGO} className="hidden" onChange={handleLogo} />
            </div>
          </div>

          <div className="md:col-span-2 flex justify-end gap-3 mt-4">
            <button type="button" onClick={resetForm}
              className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-semibold transition">
              <X size={16} /> Cancelar
            </button>
            <button type="submit" disabled={guardando}
              className="inline-flex items-center gap-2 bg-brand-petroleo hover:bg-brand-noche disabled:opacity-60 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition">
              <Save size={16} /> {guardando ? 'Guardando...' : 'Guardar Empresa'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-brand-petroleo" />
            <h2 className="text-base font-bold text-brand-noche">Listado de Empresas</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input type="text" placeholder="Buscar empresa, RFC o correo..." value={listado.busqueda} onChange={e => listado.setBusqueda(e.target.value)}
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
              {listado.cargando && listado.datos.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-slate-400 text-sm">Cargando empresas...</td></tr>
              )}
              {listado.datos.map(e => (
                <tr key={e._id} className="text-sm hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-700">
                    {e.nombreEmpresa}
                    {e.logo?.tipo && <span className="ml-2 px-1.5 py-0.5 rounded text-2xs font-semibold bg-brand-petroleo/5 text-brand-noche">Con logo</span>}
                  </td>
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
                      <button onClick={() => handleVer(e)} title="Ver" className="w-8 h-8 rounded-full bg-brand-petroleo hover:bg-brand-noche text-white flex items-center justify-center">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => handleEditar(e)} title="Editar" className="w-8 h-8 rounded-full bg-brand-coralClaro hover:brightness-95 text-brand-noche flex items-center justify-center">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleEliminar(e)} title="Dar de baja" className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!listado.cargando && listado.total === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-400 text-sm">No se encontraron empresas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Paginacion listado={listado} etiqueta="empresas" />
      </div>
    </div>
  );
}
