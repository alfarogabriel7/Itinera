// Utilidades de comprobantes (cobros a clientes y pagos a proveedores).
// Mismo límite y tipos que valida el servidor (allá se revisa el contenido real del archivo).
export const LIMITE_COMPROBANTE = 4 * 1024 * 1024;
export const TIPOS_COMPROBANTE = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';

export function validarComprobante(archivo) {
  if (archivo.size > LIMITE_COMPROBANTE) return 'El comprobante no puede pesar más de 4 MB.';
  if (!/\.(pdf|jpe?g|png|webp)$/i.test(archivo.name)) return 'El comprobante debe ser un PDF o una imagen (JPG, PNG o WEBP).';
  return null;
}

// Abre el comprobante en una pestaña nueva. La ventana se abre antes de la
// descarga (dentro del clic) para que el navegador no la bloquee.
export async function abrirComprobante(descargar) {
  const ventana = window.open('', '_blank');
  try {
    const blob = await descargar();
    const url = URL.createObjectURL(blob);
    if (ventana) ventana.location.href = url;
    else window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    ventana?.close();
    alert(err.message);
  }
}
