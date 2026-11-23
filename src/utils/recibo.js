// Recibo de abono imprimible: se arma como HTML en una ventana nueva y se
// manda a imprimir (desde ahí también se puede "Guardar como PDF").

import { dinero, fechaViajeLarga } from './formato';
import { empresasApi } from '../api';
import { TEMAS, TEMA_PREDETERMINADO } from '../../database/catalogos/temas.js';
import { avisarError } from './avisos';

// El logo se incrusta como data URL para que la ventana del recibo no dependa
// de la sesión (la ruta del logo pide token) y salga también al guardar en PDF.
async function logoComoDataUrl(empresa) {
  if (!empresa?._id || !empresa.logo?.tipo) return null;
  try {
    const blob = await empresasApi.descargarLogo(empresa._id);
    return await new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result);
      lector.onerror = reject;
      lector.readAsDataURL(blob);
    });
  } catch {
    return null; // sin logo, el recibo sale igual con el nombre de la empresa
  }
}

// Fecha del abono (momento real, hora local).
const fechaLarga = (f) => new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

const escapar = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function centenasALetras(n) {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  let texto = CENTENAS[c];
  if (resto > 0) {
    const dec = resto < 30
      ? UNIDADES[resto]
      : DECENAS[Math.floor(resto / 10)] + (resto % 10 ? ` y ${UNIDADES[resto % 10]}` : '');
    texto = texto ? `${texto} ${dec}` : dec;
  }
  return texto;
}

// "uno" se apocopa a "un" delante de "mil", "millones" y "pesos".
const apocopar = (t) => t.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');

function enteroALetras(n) {
  if (n === 0) return 'cero';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes = [];
  if (millones) partes.push(millones === 1 ? 'un millón' : `${apocopar(centenasALetras(millones))} millones`);
  if (miles) partes.push(miles === 1 ? 'mil' : `${apocopar(centenasALetras(miles))} mil`);
  if (resto) partes.push(centenasALetras(resto));
  return partes.join(' ');
}

// 25660.5 -> "Veinticinco mil seiscientos sesenta pesos 50/100 M.N."
// 25660.5, 'USD' -> "Veinticinco mil seiscientos sesenta dólares 50/100 USD"
const MONEDAS = {
  MXN: { singular: 'peso', plural: 'pesos', sufijo: 'M.N.' },
  USD: { singular: 'dólar', plural: 'dólares', sufijo: 'USD' },
};
export function montoEnLetra(monto, moneda = 'MXN') {
  const m = MONEDAS[moneda] || MONEDAS.MXN;
  const centavos = Math.round(Number(monto) * 100);
  const enteros = Math.floor(centavos / 100);
  const texto = apocopar(enteroALetras(enteros));
  // Millones exactos llevan "de": "un millón de pesos", pero "un millón cien pesos".
  const de = enteros >= 1_000_000 && enteros % 1_000_000 === 0 ? 'de ' : '';
  const frase = `${texto} ${de}${enteros === 1 ? m.singular : m.plural} ${String(centavos % 100).padStart(2, '0')}/100 ${m.sufijo}`;
  return frase.charAt(0).toUpperCase() + frase.slice(1);
}

export function folioDePago(pago) {
  return String(pago._id).slice(-8).toUpperCase();
}

// Encabezado de la empresa (logo, nombre, RFC y contacto) que comparten el recibo y el estado de cuenta.
function datosEmpresa(e) {
  const paleta = (TEMAS[e.tema] || TEMAS[TEMA_PREDETERMINADO]).colores;
  const contacto = [e.direccion, e.colonia && `Col. ${e.colonia}`, e.codigoPostal && `C.P. ${e.codigoPostal}`, e.ciudad, e.estado, e.telefonoPrincipal && `Tel. ${e.telefonoPrincipal}`, e.correo]
    .filter(Boolean)
    .map(escapar)
    .join(' · ');
  return { paleta, contacto };
}

function abrirVentana(texto) {
  const ventana = window.open('', '_blank');
  if (!ventana) {
    avisarError('El navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio.');
    return null;
  }
  ventana.document.write(`<p style="font-family:system-ui;padding:32px;color:#64748b">${texto}</p>`);
  return ventana;
}

// Estado de cuenta del cliente para una reservación: datos del viaje, abonos
// aplicados (con el saldo después de cada uno), total, abonado y saldo.
// Los abonos cancelados y los que esperan autorización no se incluyen.
export async function imprimirEstadoCuenta(resumen) {
  const ventana = abrirVentana('Generando estado de cuenta…');
  if (!ventana) return;
  const logo = await logoComoDataUrl(resumen.empresa);
  const e = resumen.empresa || {};
  const { paleta, contacto } = datosEmpresa(e);
  const moneda = escapar(resumen.moneda || 'MXN');

  const aplicados = resumen.pagos
    .filter((p) => p.estatus !== 'Cancelado' && p.estatus !== 'Pendiente')
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha) || new Date(a.createdAt) - new Date(b.createdAt));
  let acumulado = 0;
  const renglones = aplicados.map((p) => {
    acumulado += p.monto;
    const saldo = Math.round((resumen.total - acumulado) * 100) / 100;
    return `<tr>
      <td>${escapar(fechaLarga(p.fecha))}</td>
      <td class="mono">${escapar(folioDePago(p))}</td>
      <td>${escapar(p.formaPago)}${p.referencia ? `<div class="ref">Ref. ${escapar(p.referencia)}</div>` : ''}</td>
      <td class="num">${dinero(p.monto)}</td>
      <td class="num">${saldo <= 0 ? 'Liquidado' : dinero(saldo)}</td>
    </tr>`;
  }).join('');
  const liquidada = resumen.saldo <= 0;

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Estado de cuenta · ${escapar(resumen.cliente)} · ${escapar(resumen.destino)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1e293b; margin: 0; padding: 32px; }
  .hoja { max-width: 800px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 12px; padding: 32px; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 24px; border-bottom: 2px solid ${paleta.noche}; padding-bottom: 16px; }
  .marca { display: flex; align-items: center; gap: 16px; }
  .logo { max-width: 160px; max-height: 72px; object-fit: contain; }
  h1 { margin: 0; font-size: 20px; color: ${paleta.noche}; }
  .sub { font-size: 12px; color: #64748b; margin-top: 4px; }
  .doc { text-align: right; font-size: 12px; color: #64748b; }
  .doc strong { display: block; font-size: 18px; color: #1e293b; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin: 24px 0 8px; }
  .datos { width: 100%; border-collapse: collapse; font-size: 14px; }
  .datos td { padding: 5px 0; vertical-align: top; }
  .datos td:first-child { color: #64748b; width: 32%; }
  .resumen { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 20px; }
  .caja { background: ${paleta.arena}; border-radius: 10px; padding: 14px 16px; }
  .caja span { display: block; font-size: 12px; color: #64748b; }
  .caja strong { display: block; font-size: 20px; margin-top: 4px; color: ${paleta.noche}; }
  .caja.saldo { border: 1px solid ${paleta.coral}; }
  .caja.saldo strong { color: ${liquidada ? '#047857' : '#b91c1c'}; }
  .letra { font-size: 12px; color: #334155; margin-top: 8px; }
  .abonos { width: 100%; border-collapse: collapse; font-size: 13px; }
  .abonos th { background: ${paleta.noche}; color: #fff; text-align: left; padding: 8px 10px; font-weight: 600; }
  .abonos td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .abonos tfoot td { font-weight: 700; border-top: 2px solid ${paleta.noche}; border-bottom: none; }
  .num { text-align: right; white-space: nowrap; }
  .mono { font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
  .ref { font-size: 11px; color: #64748b; }
  .vacio { text-align: center; color: #94a3b8; padding: 16px; }
  .nota { font-size: 12px; color: #64748b; margin-top: 16px; }
  footer { margin-top: 32px; font-size: 11px; color: #94a3b8; text-align: center; }
  @media print { body { padding: 0; } .hoja { border: none; } .abonos th { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .caja { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head>
<body><div class="hoja">
  <header>
    <div class="marca">
      ${logo ? `<img class="logo" src="${logo}" alt="">` : ''}
      <div>
        <h1>${escapar(e.nombreEmpresa || 'Estado de cuenta')}</h1>
        ${e.rfc ? `<div class="sub">RFC ${escapar(e.rfc)}</div>` : ''}
        ${contacto ? `<div class="sub">${contacto}</div>` : ''}
      </div>
    </div>
    <div class="doc">Estado de cuenta<strong>${escapar(fechaLarga(new Date()))}</strong></div>
  </header>

  <h2>Cliente y viaje</h2>
  <table class="datos">
    <tr><td>Cliente</td><td><strong>${escapar(resumen.cliente)}</strong>${resumen.telefonoCliente ? ` · Tel. ${escapar(resumen.telefonoCliente)}` : ''}</td></tr>
    <tr><td>Viaje</td><td>${escapar(resumen.destino)}</td></tr>
    ${resumen.descripcion ? `<tr><td>Descripción</td><td style="white-space:pre-line">${escapar(resumen.descripcion)}</td></tr>` : ''}
    <tr><td>Fechas</td><td>${escapar(fechaViajeLarga(resumen.fechaEntrada))} al ${escapar(fechaViajeLarga(resumen.fechaSalida))}</td></tr>
    ${resumen.vendedor ? `<tr><td>Agente</td><td>${escapar(resumen.vendedor)}</td></tr>` : ''}
  </table>

  <div class="resumen">
    <div class="caja"><span>Total de la reservación</span><strong>${dinero(resumen.total)} ${moneda}</strong></div>
    <div class="caja"><span>Abonado</span><strong>${dinero(resumen.pagado)} ${moneda}</strong></div>
    <div class="caja saldo"><span>Saldo pendiente</span><strong>${liquidada ? 'Liquidado' : `${dinero(resumen.saldo)} ${moneda}`}</strong></div>
  </div>
  ${liquidada ? '' : `<div class="letra">Saldo: ${escapar(montoEnLetra(resumen.saldo, resumen.moneda))}</div>`}

  <h2>Abonos</h2>
  <table class="abonos">
    <thead><tr><th>Fecha</th><th>Folio</th><th>Forma de pago</th><th class="num">Monto</th><th class="num">Saldo</th></tr></thead>
    <tbody>${renglones || '<tr><td colspan="5" class="vacio">Aún no hay abonos registrados.</td></tr>'}</tbody>
    ${aplicados.length ? `<tfoot><tr><td colspan="3">Total abonado</td><td class="num">${dinero(resumen.pagado)}</td><td class="num">${liquidada ? 'Liquidado' : dinero(resumen.saldo)}</td></tr></tfoot>` : ''}
  </table>
  ${resumen.porAutorizar > 0 ? `<p class="nota">Hay ${dinero(resumen.porAutorizar)} ${moneda} en pagos recibidos que están en revisión; se reflejarán al confirmarse.</p>` : ''}

  <footer>Documento informativo generado el ${escapar(new Date().toLocaleString('es-MX'))}. No es un comprobante fiscal.</footer>
</div>
<script>window.onload = () => window.print();</script>
</body></html>`;

  ventana.document.open();
  ventana.document.write(html);
  ventana.document.close();
}

export async function imprimirRecibo(resumen, pago) {
  // La ventana se abre de inmediato (dentro del clic) para que el navegador no
  // la bloquee; el contenido se escribe cuando ya se tiene el logo.
  const ventana = window.open('', '_blank');
  if (!ventana) {
    avisarError('El navegador bloqueó la ventana del recibo. Permite las ventanas emergentes para este sitio.');
    return;
  }
  ventana.document.write('<p style="font-family:system-ui;padding:32px;color:#64748b">Generando recibo…</p>');
  const logo = await logoComoDataUrl(resumen.empresa);

  // Saldo como quedó justo después de este abono: suma de los abonos aplicados
  // registrados hasta ese momento (los cancelados no cuentan).
  const momento = new Date(pago.createdAt || pago.fecha).getTime();
  const pagadoAlMomento = resumen.pagos
    .filter((p) => p.estatus !== 'Cancelado' && p.estatus !== 'Pendiente' && new Date(p.createdAt || p.fecha).getTime() <= momento)
    .reduce((acc, p) => acc + p.monto, 0);
  const saldoDespues = Math.round((resumen.total - pagadoAlMomento) * 100) / 100;

  const e = resumen.empresa || {};
  // Colores del recibo: los del grupo de la empresa (Rutana si no tiene).
  const paleta = (TEMAS[e.tema] || TEMAS[TEMA_PREDETERMINADO]).colores;
  const contactoEmpresa = [e.direccion, e.colonia && `Col. ${e.colonia}`, e.codigoPostal && `C.P. ${e.codigoPostal}`, e.ciudad, e.estado, e.telefonoPrincipal && `Tel. ${e.telefonoPrincipal}`, e.correo]
    .filter(Boolean)
    .map(escapar)
    .join(' · ');

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Recibo ${escapar(folioDePago(pago))}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1e293b; margin: 0; padding: 32px; }
  .recibo { max-width: 720px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 12px; padding: 32px; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 24px; border-bottom: 2px solid ${paleta.noche}; padding-bottom: 16px; }
  .marca { display: flex; align-items: center; gap: 16px; }
  .logo { max-width: 160px; max-height: 72px; object-fit: contain; }
  h1 { margin: 0; font-size: 20px; color: ${paleta.noche}; }
  .sub { font-size: 12px; color: #64748b; margin-top: 4px; }
  .folio { text-align: right; font-size: 12px; color: #64748b; }
  .folio strong { display: block; font-size: 18px; color: #1e293b; letter-spacing: 1px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin: 24px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  td { padding: 6px 0; vertical-align: top; }
  td:first-child { color: #64748b; width: 40%; }
  .monto { margin-top: 20px; background: ${paleta.arena}; border: 1px solid ${paleta.coral}; border-radius: 10px; padding: 16px; }
  .monto .cifra { font-size: 28px; font-weight: 700; color: ${paleta.noche}; }
  .monto .letra { font-size: 13px; color: #334155; margin-top: 4px; }
  .totales td { border-top: 1px solid #e2e8f0; }
  .saldo { font-weight: 700; }
  footer { margin-top: 48px; display: flex; justify-content: space-between; gap: 24px; font-size: 12px; color: #64748b; }
  .firma { border-top: 1px solid #94a3b8; padding-top: 6px; width: 240px; text-align: center; }
  @media print { body { padding: 0; } .recibo { border: none; } }
</style></head>
<body><div class="recibo">
  <header>
    <div class="marca">
      ${logo ? `<img class="logo" src="${logo}" alt="">` : ''}
      <div>
        <h1>${escapar(e.nombreEmpresa || 'Recibo de pago')}</h1>
        ${e.rfc ? `<div class="sub">RFC ${escapar(e.rfc)}</div>` : ''}
        ${contactoEmpresa ? `<div class="sub">${contactoEmpresa}</div>` : ''}
      </div>
    </div>
    <div class="folio">Recibo de abono<strong>${escapar(folioDePago(pago))}</strong>${escapar(fechaLarga(pago.fecha))}</div>
  </header>

  <div class="monto">
    <div>Recibimos de <strong>${escapar(resumen.cliente)}</strong> la cantidad de:</div>
    <div class="cifra">${dinero(pago.monto)} ${escapar(resumen.moneda || 'MXN')}</div>
    <div class="letra">(${escapar(montoEnLetra(pago.monto, resumen.moneda))})</div>
  </div>

  <h2>Detalle del pago</h2>
  <table>
    <tr><td>Forma de pago</td><td>${escapar(pago.formaPago)}</td></tr>
    ${pago.referencia ? `<tr><td>Autorización / folio</td><td>${escapar(pago.referencia)}</td></tr>` : ''}
    <tr><td>Recibió</td><td>${escapar(pago.agente?.nombre || '—')}</td></tr>
  </table>

  <h2>Concepto</h2>
  <table>
    <tr><td>Viaje</td><td>${escapar(resumen.destino)}</td></tr>
    ${resumen.descripcion ? `<tr><td>Descripción</td><td style="white-space:pre-line">${escapar(resumen.descripcion)}</td></tr>` : ''}
    <tr><td>Fechas</td><td>${escapar(fechaViajeLarga(resumen.fechaEntrada))} al ${escapar(fechaViajeLarga(resumen.fechaSalida))}</td></tr>
  </table>

  <h2>Estado de cuenta</h2>
  <table class="totales">
    <tr><td>Total del viaje</td><td>${dinero(resumen.total)} ${escapar(resumen.moneda || 'MXN')}</td></tr>
    <tr><td>Abonado a la fecha de este recibo</td><td>${dinero(pagadoAlMomento)} ${escapar(resumen.moneda || 'MXN')}</td></tr>
    <tr><td>Saldo pendiente</td><td class="saldo">${saldoDespues <= 0 ? 'Liquidado' : `${dinero(saldoDespues)} ${escapar(resumen.moneda || 'MXN')}`}</td></tr>
  </table>

  <footer>
    <div>Este recibo ampara únicamente el abono indicado.</div>
    <div class="firma">Firma de quien recibe</div>
  </footer>
</div>
<script>window.onload = () => window.print();</script>
</body></html>`;

  ventana.document.open();
  ventana.document.write(html);
  ventana.document.close();
}
