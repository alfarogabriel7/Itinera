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

export const authApi = {
  login: (userId, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ userId, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
};

export const clientesApi = {
  list: () => request('/clientes'),
  create: (data) => request('/clientes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => request(`/clientes/${id}`, { method: 'DELETE' }),
};

export const proveedoresApi = {
  list: () => request('/proveedores'),
  create: (data) => request('/proveedores', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/proveedores/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

export const reservacionesApi = {
  list: () => request('/reservaciones'),
  create: (data) => request('/reservaciones', { method: 'POST', body: JSON.stringify(data) }),
};

export const pagosApi = {
  list: () => request('/pagos'),
  resumen: (idReservacion) => request(`/pagos/resumen/${idReservacion}`),
  create: (data) => request('/pagos', { method: 'POST', body: JSON.stringify(data) }),
};

export const empresasApi = {
  list: () => request('/empresas'),
  create: (data) => request('/empresas', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/empresas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

export const prospectosApi = {
  list: () => request('/prospectos'),
  get: (id) => request(`/prospectos/${id}`),
  create: (data) => request('/prospectos', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/prospectos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  convertir: (id) => request(`/prospectos/${id}/convertir`, { method: 'POST' }),
  estadisticas: () => request('/prospectos/estadisticas'),
};

export const agentesApi = {
  list: () => request('/agentes'),
  create: (data) => request('/agentes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/agentes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => request(`/agentes/${id}`, { method: 'DELETE' }),
};
