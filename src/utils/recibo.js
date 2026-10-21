// Recibo de abono imprimible: se arma como HTML en una ventana nueva y se
// manda a imprimir (desde ahí también se puede "Guardar como PDF").

import { dinero, fechaViajeLarga } from './formato';
import { empresasApi } from '../api';

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
export function montoEnLetra(monto) {
  const centavos = Math.round(Number(monto) * 100);
  const enteros = Math.floor(centavos / 100);
  const texto = apocopar(enteroALetras(enteros));
  // Millones exactos llevan "de": "un millón de pesos", pero "un millón cien pesos".
  const de = enteros >= 1_000_000 && enteros % 1_000_000 === 0 ? 'de ' : '';
  const frase = `${texto} ${de}${enteros === 1 ? 'peso' : 'pesos'} ${String(centavos % 100).padStart(2, '0')}/100 M.N.`;
  return frase.charAt(0).toUpperCase() + frase.slice(1);
}

export function folioDePago(pago) {
  return String(pago._id).slice(-8).toUpperCase();
}

export async function imprimirRecibo(resumen, pago) {
  // La ventana se abre de inmediato (dentro del clic) para que el navegador no
  // la bloquee; el contenido se escribe cuando ya se tiene el logo.
  const ventana = window.open('', '_blank');
  if (!ventana) {
    alert('El navegador bloqueó la ventana del recibo. Permite las ventanas emergentes para este sitio.');
    return;
  }
  ventana.document.write('<p style="font-family:system-ui;padding:32px;color:#64748b">Generando recibo…</p>');
  const logo = await logoComoDataUrl(resumen.empresa);

  // Saldo como quedó justo después de este abono: suma de los abonos aplicados
  // registrados hasta ese momento (los cancelados no cuentan).
  const momento = new Date(pago.createdAt || pago.fecha).getTime();
  const pagadoAlMomento = resumen.pagos
    .filter((p) => p.estatus !== 'Cancelado' && new Date(p.createdAt || p.fecha).getTime() <= momento)
    .reduce((acc, p) => acc + p.monto, 0);
  const saldoDespues = Math.round((resumen.total - pagadoAlMomento) * 100) / 100;

  const e = resumen.empresa || {};
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
  header { display: flex; justify-content: space-between; align-items: center; gap: 24px; border-bottom: 2px solid #0F4C5C; padding-bottom: 16px; }
  .marca { display: flex; align-items: center; gap: 16px; }
  .logo { max-width: 160px; max-height: 72px; object-fit: contain; }
  h1 { margin: 0; font-size: 20px; color: #0F4C5C; }
  .sub { font-size: 12px; color: #64748b; margin-top: 4px; }
  .folio { text-align: right; font-size: 12px; color: #64748b; }
  .folio strong { display: block; font-size: 18px; color: #1e293b; letter-spacing: 1px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin: 24px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  td { padding: 6px 0; vertical-align: top; }
  td:first-child { color: #64748b; width: 40%; }
  .monto { margin-top: 20px; background: #F4F1EA; border: 1px solid #E36414; border-radius: 10px; padding: 16px; }
  .monto .cifra { font-size: 28px; font-weight: 700; color: #0F4C5C; }
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
    <div class="cifra">${dinero(pago.monto)} MXN</div>
    <div class="letra">(${escapar(montoEnLetra(pago.monto))})</div>
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
    <tr><td>Fechas</td><td>${escapar(fechaViajeLarga(resumen.fechaEntrada))} al ${escapar(fechaViajeLarga(resumen.fechaSalida))}</td></tr>
  </table>

  <h2>Estado de cuenta</h2>
  <table class="totales">
    <tr><td>Total del viaje</td><td>${dinero(resumen.total)}</td></tr>
    <tr><td>Abonado a la fecha de este recibo</td><td>${dinero(pagadoAlMomento)}</td></tr>
    <tr><td>Saldo pendiente</td><td class="saldo">${saldoDespues <= 0 ? 'Liquidado' : dinero(saldoDespues)}</td></tr>
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
