import React, { useEffect, useRef, useState } from 'react';
import { Building2, Save, Mail, Phone, ImagePlus, Trash2, SlidersHorizontal, ShieldCheck, RotateCcw } from 'lucide-react';
import { miAgenciaApi, empresasApi } from '../api';
import PageHeader from './common/PageHeader';
import SelectorRemoto from './common/SelectorRemoto';
import { ESTADOS_MEXICO } from '../../database/catalogos/estados.js';
import { soloLetras, soloTelefono, soloCorreo, soloDireccion, soloCodigoPostal, soloLetrasYNumeros } from '../utils/validadores';
import { avisarExito, avisarAdvertencia, avisarError } from '../utils/avisos';
import { confirmar } from '../utils/confirmar';
import { obtenerSesion } from '../utils/sesion';

// "Mi agencia" (solo Administrador): datos de contacto y logo de su empresa (los
// que salen en los recibos) y parámetros de operación, como pedir autorización
// para los pagos que registran los agentes.

const CAMPOS = ['nombreEmpresa', 'correo', 'telefonoPrincipal', 'telefonoSecundario', 'codigoPostal', 'direccion', 'colonia', 'ciudad', 'estado', 'pais'];
const VACIO = Object.fromEntries(CAMPOS.map(c => [c, c === 'pais' ? 'México' : '']));

const OPCIONES_ESTADOS = ESTADOS_MEXICO.map(e => ({ _id: e.nombre, nombre: e.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
const sinAcentos = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const buscarEstados = async (q) => OPCIONES_ESTADOS.filter(e => sinAcentos(e.nombre).includes(sinAcentos(q)));

const LIMITE_LOGO = 1024 * 1024;
const TIPOS_LOGO = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';

const inputClass = 'mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo focus:border-brand-petroleo';
const labelClass = 'block text-sm font-semibold text-slate-700';

// Avisa al menú lateral que cambió el logo para que lo vuelva a descargar.
const avisarLogoActualizado = () => window.dispatchEvent(new Event('rutana:logo-actualizado'));

function Interruptor({ activo, onCambio, deshabilitado, id }) {
  return (
    <button type="button" id={id} role="switch" aria-checked={activo} disabled={deshabilitado} onClick={() => onCambio(!activo)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50 ${activo ? 'bg-brand-petroleo' : 'bg-slate-300'}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${activo ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

const PARAMETROS = [
  {
    clave: 'autorizarPagosClientes',
    titulo: 'Autorizar pagos de clientes',
    descripcion: 'Los abonos de clientes que registren los agentes quedan "Pendiente" y no se suman al saldo de la reservación hasta que tú los autorices.',
  },
  {
    clave: 'autorizarPagosProveedores',
    titulo: 'Autorizar pagos a proveedores',
    descripcion: 'Los pagos a proveedores que registren los agentes quedan "Pendiente" y no se descuentan de lo que se le debe al proveedor hasta que tú los autorices.',
  },
];

export default function MiAgencia() {
  const sesion = obtenerSesion();
  const [form, setForm] = useState(VACIO);
  const [original, setOriginal] = useState(VACIO);
  const [rfc, setRfc] = useState('');
  const [config, setConfig] = useState({ autorizarPagosClientes: false, autorizarPagosProveedores: false });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardandoParam, setGuardandoParam] = useState('');

  // Logo: archivo nuevo, vista previa y si se pidió quitarlo.
  const [tieneLogo, setTieneLogo] = useState(false);
  const [logoArchivo, setLogoArchivo] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [quitarLogo, setQuitarLogo] = useState(false);
  const inputLogo = useRef(null);

  const cambiarPreview = (url) => setLogoPreview(anterior => { if (anterior) URL.revokeObjectURL(anterior); return url; });
  useEffect(() => () => cambiarPreview(''), []);

  const cargarLogo = async (conLogo) => {
    setLogoArchivo(null);
    setQuitarLogo(false);
    if (inputLogo.current) inputLogo.current.value = '';
    if (!conLogo || !sesion?.empresa) { cambiarPreview(''); return; }
    try { cambiarPreview(URL.createObjectURL(await empresasApi.descargarLogo(sesion.empresa))); } catch { cambiarPreview(''); }
  };

  const aplicar = (e) => {
    const datos = Object.fromEntries(CAMPOS.map(c => [c, e[c] ?? VACIO[c]]));
    setForm(datos);
    setOriginal(datos);
    setRfc(e.rfc || '');
    setConfig({ autorizarPagosClientes: Boolean(e.configuracion?.autorizarPagosClientes), autorizarPagosProveedores: Boolean(e.configuracion?.autorizarPagosProveedores) });
    setTieneLogo(Boolean(e.logo?.tipo));
    cargarLogo(Boolean(e.logo?.tipo));
  };

  useEffect(() => {
    miAgenciaApi.get()
      .then(e => { aplicar(e); setError(''); })
      .catch(err => setError(err.message))
      .finally(() => setCargando(false));
  }, []);

  const handleLogo = (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    if (!/\.(png|jpe?g|webp)$/i.test(archivo.name)) { avisarError('El logo debe ser una imagen PNG, JPG o WEBP.'); e.target.value = ''; return; }
    if (archivo.size > LIMITE_LOGO) { avisarError('El logo no puede pesar más de 1 MB.'); e.target.value = ''; return; }
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

  const hayCambios = CAMPOS.some(c => (form[c] || '') !== (original[c] || '')) || Boolean(logoArchivo) || quitarLogo;

  const descartar = () => {
    setForm(original);
    cargarLogo(tieneLogo);
  };

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const guardada = await miAgenciaApi.update(form);
      let avisoLogo = '';
      let conLogo = Boolean(guardada.logo?.tipo);
      try {
        if (logoArchivo) { await miAgenciaApi.subirLogo(logoArchivo); conLogo = true; avisarLogoActualizado(); }
        else if (quitarLogo) { await miAgenciaApi.quitarLogo(); conLogo = false; avisarLogoActualizado(); }
      } catch (err) {
        avisoLogo = `Los datos se guardaron, pero no se pudo actualizar el logo: ${err.message}`;
      }
      aplicar({ ...guardada, logo: conLogo ? { tipo: 'imagen' } : null, configuracion: config });
      if (avisoLogo) avisarAdvertencia(avisoLogo); else avisarExito('Datos de la agencia actualizados correctamente.');
    } catch (err) {
      avisarError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const cambiarParametro = async (clave, valor) => {
    const p = PARAMETROS.find(x => x.clave === clave);
    if (!valor && !(await confirmar({
      titulo: `¿Desactivar "${p.titulo}"?`,
      mensaje: 'Los pagos nuevos se aplicarán al momento de registrarlos. Los que ya están pendientes siguen esperando tu autorización en el módulo Autorizaciones.',
      textoAceptar: 'Desactivar',
    }))) return;
    setGuardandoParam(clave);
    try {
      const r = await miAgenciaApi.configuracion({ [clave]: valor });
      setConfig({ autorizarPagosClientes: Boolean(r.configuracion?.autorizarPagosClientes), autorizarPagosProveedores: Boolean(r.configuracion?.autorizarPagosProveedores) });
      avisarExito(`${p.titulo}: ${valor ? 'activado' : 'desactivado'}.`);
    } catch (err) {
      avisarError(err.message);
    } finally {
      setGuardandoParam('');
    }
  };

  const set = (campo, filtro) => (e) => setForm(f => ({ ...f, [campo]: filtro ? filtro(e.target.value) : e.target.value }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Building2} title="Mi agencia" subtitle="Datos de contacto, logo y parámetros de tu agencia." />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}
      {cargando && <p className="text-sm text-slate-400">Cargando datos de la agencia…</p>}

      {!cargando && !error && (
        <>
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-brand-petroleo" />
                <h2 className="text-base font-bold text-brand-noche">Datos de la agencia</h2>
              </div>
              {rfc && <span className="text-xs text-slate-500">RFC <span className="font-mono font-semibold text-slate-700">{rfc}</span></span>}
            </div>

            <form onSubmit={guardar} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="md:col-span-2">
                <label htmlFor="ag-nombre" className={labelClass}>Nombre de la agencia *</label>
                <input id="ag-nombre" type="text" required maxLength={150} className={inputClass} value={form.nombreEmpresa} onChange={set('nombreEmpresa', soloLetras)} />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="ag-correo" className={labelClass}>Correo electrónico</label>
                <div className="relative">
                  <input id="ag-correo" type="text" placeholder="Ej. contacto@agencia.com" className={`${inputClass} pr-9`} value={form.correo} onChange={set('correo', soloCorreo)} />
                  <Mail size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
              <div>
                <label htmlFor="ag-tel1" className={labelClass}>Teléfono principal *</label>
                <div className="relative">
                  <input id="ag-tel1" type="tel" required placeholder="Ej. 4771234567" className={`${inputClass} pr-9`} value={form.telefonoPrincipal} onChange={set('telefonoPrincipal', soloTelefono)} />
                  <Phone size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
              <div>
                <label htmlFor="ag-tel2" className={labelClass}>Teléfono secundario</label>
                <div className="relative">
                  <input id="ag-tel2" type="tel" placeholder="Ej. 4777654321" className={`${inputClass} pr-9`} value={form.telefonoSecundario} onChange={set('telefonoSecundario', soloTelefono)} />
                  <Phone size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>

              <h3 className="md:col-span-2 mt-2 text-xs font-bold uppercase tracking-wider text-slate-400">Domicilio</h3>
              <div>
                <label htmlFor="ag-dir" className={labelClass}>Dirección</label>
                <input id="ag-dir" type="text" placeholder="Ej. Av. Principal #123" className={inputClass} value={form.direccion} onChange={set('direccion', soloDireccion)} />
              </div>
              <div>
                <label htmlFor="ag-col" className={labelClass}>Colonia</label>
                <input id="ag-col" type="text" placeholder="Ej. Jardines del Moral" className={inputClass} value={form.colonia} onChange={set('colonia', soloLetrasYNumeros)} />
              </div>
              <div>
                <label htmlFor="ag-cp" className={labelClass}>Código postal</label>
                <input id="ag-cp" type="text" inputMode="numeric" maxLength={5} pattern="\d{5}" title="El código postal debe tener 5 dígitos" placeholder="Ej. 37000"
                  className={inputClass} value={form.codigoPostal} onChange={set('codigoPostal', soloCodigoPostal)} />
              </div>
              <div>
                <label htmlFor="ag-ciudad" className={labelClass}>Ciudad</label>
                <input id="ag-ciudad" type="text" placeholder="Ej. León" className={inputClass} value={form.ciudad} onChange={set('ciudad', soloLetras)} />
              </div>
              <div>
                <label className={labelClass}>Estado</label>
                <div className="mt-1">
                  <SelectorRemoto buscar={buscarEstados} disabled={form.pais !== 'México'}
                    placeholder={form.pais === 'México' ? 'Busca y selecciona un estado' : 'Solo aplica para México'}
                    valor={form.estado} etiquetaValor={form.estado} etiqueta={e => e.nombre}
                    onCambio={id => setForm(f => ({ ...f, estado: id || '' }))} />
                </div>
              </div>
              <div>
                <label htmlFor="ag-pais" className={labelClass}>País *</label>
                <select id="ag-pais" required className={`${inputClass} bg-white`} value={form.pais}
                  onChange={e => setForm(f => ({ ...f, pais: e.target.value, estado: e.target.value === 'México' ? f.estado : '' }))}>
                  <option value="México">México</option>
                  <option value="Estados Unidos">Estados Unidos</option>
                  <option value="España">España</option>
                  <option value="Colombia">Colombia</option>
                </select>
              </div>

              <div className="md:col-span-2 mt-2">
                <label className={labelClass}>Logo de la agencia <span className="font-normal text-slate-400">(se muestra en el menú y en los recibos al cliente)</span></label>
                <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-4 p-4 border border-dashed border-slate-300 rounded-xl bg-slate-50">
                  <div className="w-40 h-20 shrink-0 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden">
                    {logoPreview ? <img src={logoPreview} alt="Logo de la agencia" className="max-w-full max-h-full object-contain p-1" /> : <ImagePlus size={28} className="text-slate-300" />}
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
                    {logoArchivo && <p className="mt-2 text-xs text-brand-petroleo">El logo nuevo se guardará al dar clic en "Guardar cambios".</p>}
                  </div>
                  <input ref={inputLogo} type="file" accept={TIPOS_LOGO} className="hidden" onChange={handleLogo} />
                </div>
              </div>

              <div className="md:col-span-2 flex flex-wrap justify-end gap-3 mt-2">
                {hayCambios && (
                  <button type="button" onClick={descartar}
                    className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-semibold transition">
                    <RotateCcw size={16} /> Descartar cambios
                  </button>
                )}
                <button type="submit" disabled={guardando || !hayCambios}
                  className="inline-flex items-center gap-2 bg-brand-petroleo hover:bg-brand-noche disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition">
                  <Save size={16} /> {guardando ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center gap-2 mb-1">
              <SlidersHorizontal size={18} className="text-brand-petroleo" />
              <h2 className="text-base font-bold text-brand-noche">Parámetros</h2>
            </div>
            <p className="mb-5 text-sm text-slate-500">Se aplican al momento; no necesitas guardar.</p>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              {PARAMETROS.map(p => (
                <div key={p.clave} className="flex items-start gap-4 p-4">
                  <ShieldCheck size={20} className={`mt-0.5 shrink-0 ${config[p.clave] ? 'text-brand-coral' : 'text-slate-300'}`} />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`param-${p.clave}`} className="text-sm font-semibold text-slate-800">{p.titulo}</label>
                    <p className="mt-0.5 text-sm text-slate-500">{p.descripcion}</p>
                    <p className="mt-1 text-xs text-slate-400">Los pagos que registras tú (Administrador) se aplican directo.</p>
                  </div>
                  <Interruptor id={`param-${p.clave}`} activo={config[p.clave]} deshabilitado={guardandoParam === p.clave}
                    onCambio={valor => cambiarParametro(p.clave, valor)} />
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
