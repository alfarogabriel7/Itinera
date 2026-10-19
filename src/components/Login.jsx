import React, { useState } from 'react';
import { authApi } from '../api';
import logo from '../assets/itinera-horizontal-color.svg';
import simbolo from '../assets/itinera-simbolo-color.svg';
import { AtSign, Eye, EyeOff, LogIn } from 'lucide-react';

export default function Login({ onSuccess }) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const { token, agente } = await authApi.login(userId.trim().toLowerCase(), password);
      onSuccess(token, agente);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-noche to-brand-petroleo p-4 relative overflow-hidden">
      {/* Motivo del símbolo de Itinera (origen → ruta → destino) como fondo. */}
      <img src={simbolo} alt="" aria-hidden="true" className="absolute -bottom-16 -right-16 w-96 opacity-10 pointer-events-none select-none" />

      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-8">
        <div className="flex justify-center mb-6">
          <img src={logo} alt="Itinera" className="h-14 w-auto" />
        </div>

        <h1 className="text-xl font-bold text-brand-noche text-center">Iniciar sesión</h1>
        <p className="text-sm text-slate-500 text-center mb-6">Accede con tu usuario de agente.</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2.5 mb-4">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700">Usuario</label>
            <div className="relative">
              <input type="text" required autoFocus placeholder="Ej. gabriel.alfaro"
                className="mt-1 w-full p-2.5 pr-9 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo focus:border-brand-petroleo"
                value={userId} onChange={e => setUserId(e.target.value)} />
              <AtSign size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">Contraseña</label>
            <div className="relative">
              <input type={verPassword ? 'text' : 'password'} required placeholder="Tu contraseña"
                className="mt-1 w-full p-2.5 pr-9 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-petroleo focus:border-brand-petroleo"
                value={password} onChange={e => setPassword(e.target.value)} />
              <button type="button" onClick={() => setVerPassword(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {verPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={cargando}
            className="w-full inline-flex items-center justify-center gap-2 bg-brand-petroleo hover:bg-brand-noche disabled:opacity-60 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition mt-2">
            <LogIn size={16} /> {cargando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
