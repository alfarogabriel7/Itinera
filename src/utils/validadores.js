// Filtros de validación de campos: se aplican al escribir para que no se puedan
// capturar caracteres no permitidos (cubre también texto pegado con Ctrl+V).
export const soloLetras = (v) => v.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü\s]/g, '');
export const soloTelefono = (v) => v.replace(/[^0-9]/g, '');
// Solo dígitos (cuentas bancarias, CLABE).
export const soloNumeros = (v) => v.replace(/[^0-9]/g, '');
export const soloCorreo = (v) => v.replace(/[^A-Za-z0-9@.]/g, '');
// Dirección: letras (con acentos), números, espacios, punto y "#" (p.ej. "Av. Juárez #123").
export const soloDireccion = (v) => v.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9\s.#]/g, '');
// Código postal de México: solo números, máximo 5 dígitos.
export const soloCodigoPostal = (v) => v.replace(/[^0-9]/g, '').slice(0, 5);
export const soloLetrasYNumeros = (v) => v.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9\s]/g, '');
// RFC: solo letras y números, en mayúsculas.
export const soloRFC = (v) => v.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
