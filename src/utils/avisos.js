// Avisos breves que aparecen en una esquina y se ocultan solos (en lugar de
// window.alert, que bloquea la pantalla y obliga a dar clic en "Aceptar").
// Cualquier pantalla llama avisar(...); el componente <Avisos /> los muestra.

const oyentes = new Set();
let siguienteId = 1;

const DURACION = { exito: 4000, advertencia: 8000, error: 7000 };

export function avisar(mensaje, tipo = 'exito') {
  const aviso = { id: siguienteId++, mensaje, tipo, duracion: DURACION[tipo] || DURACION.exito };
  oyentes.forEach(fn => fn(aviso));
}

export const avisarExito = (mensaje) => avisar(mensaje, 'exito');
// Para "se guardó, pero algo secundario falló" (p.ej. no se subió el comprobante).
export const avisarAdvertencia = (mensaje) => avisar(mensaje, 'advertencia');
// Errores del servidor y validaciones ("Las contraseñas no coinciden.", etc.).
export const avisarError = (mensaje) => avisar(mensaje, 'error');

export function suscribirAvisos(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
