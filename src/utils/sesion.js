// Lee los datos del agente en sesión (guardados en localStorage al iniciar sesión).
// Incluye rol y, cuando aplica, la empresa a la que pertenece.
export function obtenerSesion() {
  try {
    const raw = localStorage.getItem('agente');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
