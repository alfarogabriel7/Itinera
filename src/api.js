const BASE = '/api';

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (res.status === 401 && path !== '/auth/login') {
    onUnauthorized();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Variante de request() para archivos: manda/recibe bytes en vez de JSON.
async function requestArchivo(path, { method = 'GET', archivo } = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(archivo
        ? { 'Content-Type': 'application/octet-stream', 'X-Nombre-Archivo': encodeURIComponent(archivo.name) }
        : {}),
    },
    body: archivo,
  });
  if (res.status === 401) onUnauthorized();
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }
  return archivo ? res.json() : res.blob();
}

export const authApi = {
  login: (userId, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ userId, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
};

// Los listados están paginados en el servidor: reciben { pagina, porPagina, q, ...filtros }
// y regresan { datos, total, pagina, porPagina, totalPaginas }.
function conParametros(path, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false)
      .map(([k, v]) => [k, v === true ? '1' : String(v)])
  ).toString();
  return qs ? `${path}?${qs}` : path;
}

export const clientesApi = {
  list: (params) => request(conParametros('/clientes', params)),
  get: (id) => request(`/clientes/${id}`),
  create: (data) => request('/clientes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  acciones: (params) => request(conParametros('/clientes/acciones', params)),
  cambiarEstatusAccion: (idCliente, idNota, idAccion, estatus) =>
    request(`/clientes/${idCliente}/notas/${idNota}/acciones/${idAccion}`, { method: 'PATCH', body: JSON.stringify({ estatus }) }),
};

export const proveedoresApi = {
  list: (params) => request(conParametros('/proveedores', params)),
  create: (data) => request('/proveedores', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/proveedores/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

export const reservacionesApi = {
  list: (params) => request(conParametros('/reservaciones', params)),
  get: (id) => request(`/reservaciones/${id}`),
  create: (data) => request('/reservaciones', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/reservaciones/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  cancelar: (id, motivo) => request(`/reservaciones/${id}/cancelar`, { method: 'PATCH', body: JSON.stringify({ motivo }) }),
  proximas: (params) => request(conParametros('/reservaciones/proximas', params)),
};

export const pagosApi = {
  list: (params) => request(conParametros('/pagos', params)),
  resumen: (idReservacion) => request(`/pagos/resumen/${idReservacion}`),
  create: (data) => request('/pagos', { method: 'POST', body: JSON.stringify(data) }),
  cancelar: (id, motivo) => request(`/pagos/${id}/cancelar`, { method: 'PATCH', body: JSON.stringify({ motivo }) }),
  // params: { q, urgencia, orden, agente, mios, incluirLiquidadas, pagina, porPagina, exportar }
  cobranza: (params) => request(conParametros('/pagos/cobranza', params)),
  subirComprobante: (id, archivo) => requestArchivo(`/pagos/${id}/comprobante`, { method: 'PUT', archivo }),
  descargarComprobante: (id) => requestArchivo(`/pagos/${id}/comprobante`),
};

// Pagos de la agencia a sus proveedores, por servicio de cada reservación.
export const pagosProveedorApi = {
  estadoReservacion: (idReservacion) => request(`/pagos-proveedor/reservacion/${idReservacion}`),
  pendientes: (params) => request(conParametros('/pagos-proveedor/pendientes', params)),
  list: (params) => request(conParametros('/pagos-proveedor', params)),
  create: (data) => request('/pagos-proveedor', { method: 'POST', body: JSON.stringify(data) }),
  cancelar: (id, motivo) => request(`/pagos-proveedor/${id}/cancelar`, { method: 'PATCH', body: JSON.stringify({ motivo }) }),
  subirComprobante: (id, archivo) => requestArchivo(`/pagos-proveedor/${id}/comprobante`, { method: 'PUT', archivo }),
  descargarComprobante: (id) => requestArchivo(`/pagos-proveedor/${id}/comprobante`),
};

export const empresasApi = {
  list: (params) => request(conParametros('/empresas', params)),
  create: (data) => request('/empresas', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/empresas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  subirLogo: (id, archivo) => requestArchivo(`/empresas/${id}/logo`, { method: 'PUT', archivo }),
  descargarLogo: (id) => requestArchivo(`/empresas/${id}/logo`),
  quitarLogo: (id) => request(`/empresas/${id}/logo`, { method: 'DELETE' }),
};

export const dashboardApi = {
  admin: (periodo, moneda = 'MXN') => request(`/dashboard/admin?periodo=${periodo}&moneda=${moneda}`),
  proveedores: (desde, hasta, moneda = 'MXN') => request(`/dashboard/proveedores?desde=${desde}&hasta=${hasta}&moneda=${moneda}`),
  agente: () => request('/dashboard/agente'),
  resumen: () => request('/dashboard/resumen'),
};

export const prospectosApi = {
  list: (params) => request(conParametros('/prospectos', params)),
  get: (id) => request(`/prospectos/${id}`),
  create: (data) => request('/prospectos', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/prospectos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  convertir: (id) => request(`/prospectos/${id}/convertir`, { method: 'POST' }),
  estadisticas: () => request('/prospectos/estadisticas'),
  acciones: (params) => request(conParametros('/prospectos/acciones', params)),
  cambiarEstatusAccion: (idProspecto, idNota, idAccion, estatus) =>
    request(`/prospectos/${idProspecto}/notas/${idNota}/acciones/${idAccion}`, { method: 'PATCH', body: JSON.stringify({ estatus }) }),
};

export const agentesApi = {
  list: (params) => request(conParametros('/agentes', params)),
  create: (data) => request('/agentes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/agentes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => request(`/agentes/${id}`, { method: 'DELETE' }),
};
