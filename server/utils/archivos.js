import express from 'express';

// Utilidades para recibir archivos (comprobantes de pago, logos de empresa)
// como cuerpo binario de la petición, sin librerías de multipart.

export const PDF = 'application/pdf';
export const JPEG = 'image/jpeg';
export const PNG = 'image/png';
export const WEBP = 'image/webp';

// El tipo se deduce de los primeros bytes del archivo, no de lo que diga el
// navegador, para no aceptar (ni servir después) algo disfrazado de PDF/imagen.
export function detectarTipo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf.subarray(0, 4).toString('latin1') === '%PDF') return PDF;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return JPEG;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return PNG;
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return WEBP;
  return null;
}

// Nombre original del archivo (viaja en la cabecera X-Nombre-Archivo, codificado).
export function nombreSeguro(cabecera, porDefecto = 'archivo') {
  let nombre = porDefecto;
  try {
    nombre = decodeURIComponent(cabecera || '') || porDefecto;
  } catch {
    /* nombre mal codificado: se usa el genérico */
  }
  return nombre.replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 200);
}

// Middleware que lee el cuerpo crudo hasta `limite` bytes y responde 413 con
// un mensaje en español si el archivo es más grande.
export function leerArchivo(limite, mensajeLimite) {
  const parser = express.raw({ type: () => true, limit: limite });
  return (req, res, next) =>
    parser(req, res, (err) => {
      if (err?.type === 'entity.too.large') return res.status(413).json({ error: mensajeLimite });
      next(err);
    });
}

// Envía un archivo guardado en Mongo con cabeceras seguras (sin "sniffing" de tipo).
export function enviarArchivo(res, { tipo, nombreArchivo, datos }) {
  res.set({
    'Content-Type': tipo,
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(nombreArchivo || 'archivo')}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  res.send(datos);
}
