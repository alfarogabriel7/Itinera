// Al dar clic en "Editar" en un listado: sube la pantalla hasta el formulario
// y deja el cursor en su primer campo editable. Se espera un cuadro para que
// React ya haya pintado los datos del registro elegido.
export function irAlFormulario(form) {
  if (!form) return;
  requestAnimationFrame(() => {
    // La tarjeta que contiene el formulario (incluye su título). Su clase
    // scroll-mt-* deja espacio para el encabezado fijo de arriba.
    const tarjeta = form.closest('[data-tarjeta-formulario]') || form;
    tarjeta.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const primero = form.querySelector('input:not([type=hidden]):not([type=file]):not(:disabled), select:not(:disabled), textarea:not(:disabled)');
    primero?.focus({ preventScroll: true });
  });
}
