import React, { useEffect, useRef, useState } from 'react';
import Clientes from './components/Clientes';
import Proveedores from './components/Proveedores';
import Reservaciones from './components/Reservaciones';
import Pagos from './components/Pagos';
import Cobranza from './components/Cobranza';
import Agentes from './components/Agentes';
import Empresas from './components/Empresas';
import Prospectos from './components/Prospectos';
import Dashboard from './components/Dashboard';
import MiPanel from './components/MiPanel';
import Login from './components/Login';
import { authApi, dashboardApi, empresasApi, setUnauthorizedHandler } from './api';
import { obtenerSesion } from './utils/sesion';
import logoItineraBlanco from './assets/itinera-horizontal-blanco.svg';
import simboloItinera from './assets/itinera-simbolo-color.svg';
import {
  Users, Truck, Compass, DollarSign, Bell, ChevronDown,
  Menu, X, LogOut, Users2, UserCog, Building2, UserPlus, Wallet, LayoutDashboard, Home,
} from 'lucide-react';

const NAV_ITEMS = [
  // Tablero de ventas: solo el Administrador (dueño) de cada empresa.
  { key: 'dashboard', label: 'Tablero de Ventas', icon: LayoutDashboard, visible: (rol) => rol === 'Administrador' },
  // Panel inicial con los pendientes del agente.
  { key: 'inicio', label: 'Mi Panel', icon: Home, visible: (rol) => rol === 'Agente' },
  // Clientes y proveedores son datos de negocio de cada empresa: el superAdmin no los ve.
  { key: 'clientes', label: 'Clientes', icon: Users, visible: (rol) => rol !== 'superAdmin' },
  // superAdmin no consulta ni gestiona prospectos de ninguna empresa.
  { key: 'prospectos', label: 'Prospectos', icon: UserPlus, visible: (rol) => rol !== 'superAdmin' },
  // Empresas solo lo administra el superAdmin.
  { key: 'empresas', label: 'Empresas', icon: Building2, visible: (rol) => rol === 'superAdmin' },
  { key: 'proveedores', label: 'Proveedores', icon: Truck, visible: (rol) => rol !== 'superAdmin' },
  // superAdmin no consulta ni gestiona reservaciones de ninguna empresa.
  { key: 'reservaciones', label: 'Reservaciones', icon: Compass, visible: (rol) => rol !== 'superAdmin' },
  // superAdmin no consulta ni registra pagos de ninguna empresa.
  { key: 'pagos', label: 'Registro de Pagos', icon: DollarSign, visible: (rol) => rol !== 'superAdmin' },
  { key: 'cobranza', label: 'Cobranza', icon: Wallet, visible: (rol) => rol !== 'superAdmin' },
  // Un Agente no puede ver el módulo de Agentes en absoluto.
  { key: 'agentes', label: 'Agentes', icon: UserCog, visible: (rol) => rol !== 'Agente' },
];

// Pantalla con la que arranca cada rol al iniciar sesión.
const TAB_INICIAL = { Administrador: 'dashboard', Agente: 'inicio', superAdmin: 'empresas' };
const tabInicial = (rol) => TAB_INICIAL[rol] || 'inicio';

// Pantallas que ocupan todo el ancho (sin el panel lateral de frase + resumen).
const PANTALLA_COMPLETA = new Set(['dashboard', 'inicio']);

const PAGE_TITLES = {
  dashboard: 'Panel de Control',
  inicio: 'Panel de Control',
  clientes: 'Panel de Control',
  prospectos: 'Panel de Control',
  empresas: 'Panel de Control',
  proveedores: 'Panel de Control',
  reservaciones: 'Panel de Control',
  pagos: 'Panel de Control',
  cobranza: 'Panel de Control',
  agentes: 'Panel de Control',
};

function iniciales(nombre) {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('');
}

const ETIQUETA_ROL = { superAdmin: 'Super Administrador', Administrador: 'Administrador', Agente: 'Agente' };

// Nombre del usuario en la cabecera; al hacer clic despliega el menú con "Cerrar sesión".
function MenuUsuario({ auth, onLogout }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const alClicFuera = (e) => { if (!ref.current?.contains(e.target)) setAbierto(false); };
    const alEscape = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', alClicFuera);
    document.addEventListener('keydown', alEscape);
    return () => {
      document.removeEventListener('mousedown', alClicFuera);
      document.removeEventListener('keydown', alEscape);
    };
  }, [abierto]);

  return (
    <div ref={ref} className="relative pl-4 border-l border-slate-200">
      <button
        onClick={() => setAbierto(a => !a)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-slate-50"
      >
        <div className="w-9 h-9 rounded-full bg-brand-petroleo text-white flex items-center justify-center text-xs font-bold">
          {iniciales(auth.nombre)}
        </div>
        <span className="hidden sm:block text-sm font-medium text-slate-700">{auth.nombre}</span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div role="menu" className="absolute right-0 mt-2 w-56 rounded-xl bg-white shadow-lg border border-slate-100 py-2 z-30">
          <div className="px-4 py-2 border-b border-slate-100">
            <div className="text-sm font-semibold text-slate-700 truncate">{auth.nombre}</div>
            <div className="text-xs text-slate-500">{ETIQUETA_ROL[auth.rol] || auth.rol}</div>
          </div>
          <button
            role="menuitem"
            onClick={() => { setAbierto(false); onLogout(); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState(obtenerSesion);
  const [activeTab, setActiveTab] = useState(() => tabInicial(obtenerSesion()?.rol));
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [resumen, setResumen] = useState({ clientesRegistrados: 0, reservacionesActivas: 0, pagosDelMes: 0 });

  // Destruye la sesión por completo: revoca el token en el servidor (así ya no
  // sirve aunque alguien lo hubiera copiado), borra lo guardado en el navegador
  // y limpia el estado en memoria, para que el siguiente login (de otro usuario
  // u otro rol) arranque limpio y no arrastre datos del usuario anterior.
  const handleLogout = () => {
    authApi.logout().catch(() => {}); // best-effort: el logout local sigue aunque falle la red
    localStorage.clear();
    sessionStorage.clear();
    setAuth(null);
    setActiveTab('clientes');
    setSidebarOpen(false);
    setResumen({ clientesRegistrados: 0, reservacionesActivas: 0, pagosDelMes: 0 });
  };

  const handleLoginSuccess = (token, agente) => {
    localStorage.setItem('token', token);
    localStorage.setItem('agente', JSON.stringify(agente));
    setAuth(agente);
    setActiveTab(tabInicial(agente.rol));
  };

  useEffect(() => {
    setUnauthorizedHandler(handleLogout);
  }, []);

  useEffect(() => {
    // superAdmin no tiene acceso a los datos de negocio de las empresas (el backend responde 403).
    if (!auth || auth.rol === 'superAdmin') return;
    let cancelado = false;
    (async () => {
      try {
        // Contadores calculados en el servidor (antes se descargaban listas completas).
        const r = await dashboardApi.resumen();
        if (!cancelado) setResumen(r);
      } catch (err) {
        console.error('No se pudo cargar el resumen:', err.message);
      }
    })();
    return () => { cancelado = true; };
  }, [activeTab, auth]);

  // Logo de la empresa del usuario para la barra lateral. El superAdmin y las
  // empresas sin logo ven el de la plataforma (Itinera). Los colores no cambian
  // por empresa: son siempre los de Itinera.
  // undefined = descargando (no se muestra nada para que no parpadee el de Itinera).
  const [logoEmpresa, setLogoEmpresa] = useState(undefined);
  useEffect(() => {
    if (!auth?.empresa) { setLogoEmpresa(null); return undefined; }
    setLogoEmpresa(undefined);
    let url = null;
    let cancelado = false;
    empresasApi.descargarLogo(auth.empresa)
      .then(blob => {
        if (cancelado) return;
        url = URL.createObjectURL(blob);
        setLogoEmpresa(url);
      })
      .catch(() => { if (!cancelado) setLogoEmpresa(null); }); // 404 = la empresa no tiene logo
    return () => {
      cancelado = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [auth?.empresa]);

  // Reservación que Cobranza manda preseleccionada al abrir Registro de Pagos.
  const [reservaParaAbonar, setReservaParaAbonar] = useState('');

  const goTo = (key) => {
    setActiveTab(key);
    setReservaParaAbonar('');
    setSidebarOpen(false);
  };

  const abonarDesdeCobranza = (idReservacion) => {
    setReservaParaAbonar(idReservacion);
    setActiveTab('pagos');
  };

  if (!auth) {
    return <Login onSuccess={handleLoginSuccess} />;
  }

  const navItemsVisibles = NAV_ITEMS.filter(item => !item.visible || item.visible(auth.rol));

  return (
    <div className="min-h-screen bg-brand-arena md:flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed md:static inset-y-0 left-0 z-40 w-64 shrink-0 flex flex-col text-white bg-gradient-to-b from-brand-noche to-brand-petroleo transition-transform duration-200 overflow-y-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="flex items-center justify-between gap-3 px-6 py-6">
          {logoEmpresa === undefined ? (
            <div className="flex-1 h-24" />
          ) : logoEmpresa ? (
            // Los logos de empresa suelen ser horizontales: recuadro en vez de círculo para no recortarlos.
            <div className="flex-1 min-w-0 h-24 rounded-2xl bg-white shadow-sm flex items-center justify-center overflow-hidden p-2">
              <img src={logoEmpresa} alt="Logo de la empresa" className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="flex-1 min-w-0 h-24 flex items-center">
              <img src={logoItineraBlanco} alt="Itinera" className="h-10 w-auto" />
            </div>
          )}
          <button className="md:hidden text-white/80" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-4 py-2 space-y-1">
          {navItemsVisibles.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => goTo(key)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${
                activeTab === key
                  ? 'bg-white text-brand-noche shadow-sm'
                  : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon size={18} className={activeTab === key ? 'text-brand-coral' : ''} />
              {label}
            </button>
          ))}
        </nav>

        {/* Con el logo de la empresa arriba, la marca de la plataforma queda como firma. */}
        <div className="px-6 py-5 min-h-[64px] shrink-0 flex items-end">
          {logoEmpresa && (
            <div className="flex items-center gap-2 text-2xs uppercase tracking-wider text-white/50">
              con tecnología de <img src={logoItineraBlanco} alt="Itinera" className="h-4 w-auto opacity-80" />
            </div>
          )}
        </div>

        <button onClick={handleLogout} className="shrink-0 flex items-center gap-3 px-6 py-5 text-sm font-medium text-white/75 hover:text-white hover:bg-white/10 border-t border-white/10">
          <LogOut size={18} />
          Cerrar sesión
        </button>
      </aside>

      {/* Right column: header + content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 bg-white px-4 md:px-8 py-4 shadow-sm border-b border-slate-200">
          <div className="flex items-center gap-3">
            <button className="md:hidden text-slate-500" onClick={() => setSidebarOpen(true)}>
              <Menu size={22} />
            </button>
            <Menu className="hidden md:block text-slate-400" size={20} />
            <h2 className="text-lg font-semibold text-slate-700">{PAGE_TITLES[activeTab]}</h2>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative text-slate-400 hover:text-slate-600">
              <Bell size={20} />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500" />
            </button>
            <MenuUsuario auth={auth} onLogout={handleLogout} />
          </div>
        </header>

        <div className="flex-1 flex flex-col xl:flex-row gap-6 p-4 md:p-8">
          <main className="flex-1 min-w-0">
            {activeTab === 'dashboard' && auth.rol === 'Administrador' && <Dashboard />}
            {activeTab === 'inicio' && auth.rol === 'Agente' && <MiPanel nombre={auth.nombre} onAbonar={abonarDesdeCobranza} onIr={goTo} />}
            {activeTab === 'clientes' && auth.rol !== 'superAdmin' && <Clientes />}
            {activeTab === 'prospectos' && auth.rol !== 'superAdmin' && <Prospectos />}
            {activeTab === 'empresas' && auth.rol === 'superAdmin' && <Empresas />}
            {activeTab === 'proveedores' && auth.rol !== 'superAdmin' && <Proveedores />}
            {activeTab === 'reservaciones' && auth.rol !== 'superAdmin' && <Reservaciones />}
            {activeTab === 'pagos' && auth.rol !== 'superAdmin' && <Pagos reservaInicial={reservaParaAbonar} />}
            {activeTab === 'cobranza' && auth.rol !== 'superAdmin' && <Cobranza onAbonar={abonarDesdeCobranza} />}
            {activeTab === 'agentes' && auth.rol !== 'Agente' && <Agentes />}
          </main>

          {/* Right panel: promo + resumen */}
          <aside className={`w-full xl:w-72 shrink-0 flex-col gap-6 ${PANTALLA_COMPLETA.has(activeTab) ? 'hidden' : 'flex'}`}>
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-brand-noche to-brand-petroleo p-6 min-h-[220px] flex flex-col justify-between shadow-sm">
              <img src={simboloItinera} alt="" aria-hidden="true" className="absolute -bottom-6 -left-6 w-36 opacity-20 pointer-events-none select-none" />
              <div />
              <p className="relative text-white text-center italic font-medium leading-snug">
                "Viajar es la única cosa que compras y te hace más rico."
              </p>
            </div>

            <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 p-5 ${auth.rol === 'superAdmin' ? 'hidden' : ''}`}>
              <h3 className="text-sm font-bold text-slate-700 mb-4">Resumen</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-petroleo text-white flex items-center justify-center shrink-0">
                    <Users2 size={18} />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Clientes registrados</div>
                    <div className="text-lg font-bold text-slate-800">{resumen.clientesRegistrados}</div>
                  </div>
                </div>
                {auth.rol !== 'superAdmin' && (<>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-coral text-white flex items-center justify-center shrink-0">
                    <Compass size={18} />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Reservaciones activas</div>
                    <div className="text-lg font-bold text-slate-800">{resumen.reservacionesActivas}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-coralClaro text-brand-noche flex items-center justify-center shrink-0">
                    <DollarSign size={18} />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Pagos este mes</div>
                    <div className="text-lg font-bold text-slate-800">
                      ${resumen.pagosDelMes.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN
                    </div>
                  </div>
                </div>
                </>)}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
