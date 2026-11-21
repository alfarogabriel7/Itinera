// Confirmaciones con el look de la app (en lugar de window.confirm / prompt).
// El componente <Confirmaciones /> (montado en App) es quien las dibuja.
//
//   if (!(await confirmar({ titulo: '¿Dar de baja a Juan?', textoAceptar: 'Dar de baja', tono: 'peligro' }))) return;
//   const motivo = await pedirTexto({ titulo: 'Cancelar abono', etiqueta: 'Motivo', requerido: true });
//   if (motivo === null) return; // canceló
//
// Opciones: titulo, mensaje, detalles: [{ etiqueta, valor, destacado?, completo? }],
// nota, textoAceptar, textoCancelar, tono: 'normal' | 'peligro'.
// pedirTexto además: etiqueta, placeholder, requerido, maxLength.

let mostrar = null;

export function registrarConfirmaciones(fn) {
  mostrar = fn;
  return () => { if (mostrar === fn) mostrar = null; };
}

// true (Aceptar) o false (Cancelar / Esc / clic afuera).
export function confirmar(opciones) {
  // Sin el componente montado (no debería pasar), se usa la del navegador.
  if (!mostrar) return Promise.resolve(window.confirm([opciones.titulo, opciones.mensaje].filter(Boolean).join('\n\n')));
  return new Promise((resolve) => mostrar({ ...opciones, resolve }));
}

// El texto capturado (sin espacios a los lados) o null si se canceló.
export function pedirTexto(opciones) {
  if (!mostrar) {
    const t = window.prompt([opciones.titulo, opciones.mensaje].filter(Boolean).join('\n\n'));
    return Promise.resolve(t === null ? null : t.trim());
  }
  return new Promise((resolve) => mostrar({ ...opciones, conTexto: true, resolve }));
}
