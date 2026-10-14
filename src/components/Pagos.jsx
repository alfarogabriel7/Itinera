import React, { useEffect, useState } from 'react';
import { pagosApi, reservacionesApi } from '../api';
import PageHeader from './common/PageHeader';
import { DollarSign, CreditCard } from 'lucide-react';

export default function Pagos() {
  const [reservaciones, setReservaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedReservaId, setSelectedReservaId] = useState('');
  const [resumen, setResumen] = useState(null);
  const [montoPago, setMontoPago] = useState('');
  const [formaPago, setFormmaPago] = useState('Efectivo');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setReservaciones(await reservacionesApi.list());
        setError('');
      } catch (err) {
        setError('No se pudo conectar con el servidor. ¿Está corriendo "npm run server"?');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSelectReserva = async (id) => {
    setSelectedReservaId(id);
    if (!id) { setResumen(null); return; }
    try {
      setResumen(await pagosApi.resumen(id));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLiquidacion = async (e) => {
    e.preventDefault();
    const monto = parseFloat(montoPago);
    if (monto > resumen.saldo) {
      alert(`El monto capturado ($${monto}) excede el saldo pendiente ($${resumen.saldo.toFixed(2)}) de la reservación.`);
      return;
    }
    setGuardando(true);
    try {
      await pagosApi.create({ idReservacion: selectedReservaId, monto, formaPago });
      alert('Pago registrado correctamente.');
      setMontoPago('');
      setSelectedReservaId('');
      setResumen(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={DollarSign} title="Registro de Pagos" subtitle="Vincula una reservación activa y registra los abonos del cliente." />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <label className="block text-sm font-semibold text-slate-700 mb-2">Buscar y Vincular Reservación Activa</label>
        <select disabled={loading} className="w-full p-2.5 border border-slate-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" value={selectedReservaId} onChange={e => handleSelectReserva(e.target.value)}>
          <option value="">-- Buscar por Destino --</option>
          {reservaciones.map(r => (
            <option key={r._id} value={r._id}>
              {r.destino} — {new Date(r.fechaSalida).toLocaleDateString('es-MX')} ({r.idCliente?.nombreCompleto})
            </option>
          ))}
        </select>

        {resumen && (
          <div className="space-y-6 animate-fadeIn mt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-amber-50 border border-amber-200 p-4 rounded-xl text-sm">
              <div><span className="text-slate-500">Cliente Asociado:</span> <div className="font-bold text-slate-800">{resumen.cliente}</div></div>
              <div><span className="text-slate-500">Destino del Viaje:</span> <div className="font-bold text-slate-800">{resumen.destino}</div></div>
              <div><span className="text-slate-500">Costo Total:</span> <div className="font-bold text-slate-800">${resumen.total.toLocaleString()} MXN</div></div>
              <div className="md:col-span-3 border-t border-amber-200 my-1 pt-3 grid grid-cols-2 gap-4">
                <div><span className="text-slate-500">Abonado a la Fecha:</span> <div className="font-semibold text-emerald-700">${resumen.pagado.toLocaleString()}</div></div>
                <div><span className="text-slate-500">Saldo Neto Pendiente:</span> <div className="font-bold text-red-600 text-lg">${resumen.saldo.toLocaleString()}</div></div>
              </div>
            </div>

            <form onSubmit={handleLiquidacion} className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 border border-slate-100 rounded-xl">
              <div className="md:col-span-2 font-semibold text-slate-700 text-xs uppercase tracking-wider">Captura de Pago</div>
              <div>
                <label className="block text-xs font-bold text-slate-600">Monto a Abonar ($) *</label>
                <input type="number" step="0.01" required className="mt-1 w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white font-mono focus:outline-none focus:ring-2 focus:ring-brand-teal" placeholder="0.00" value={montoPago} onChange={e => setMontoPago(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600">Método de Cobro *</label>
                <select className="mt-1 w-full p-2.5 border border-slate-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" value={formaPago} onChange={e => setFormmaPago(e.target.value)}>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                  <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                  <option value="Transferencia">Transferencia SPEI</option>
                </select>
              </div>
              <div className="md:col-span-2 flex justify-end mt-2">
                <button type="submit" disabled={guardando} className="inline-flex items-center gap-2 bg-brand-purple text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:brightness-90 disabled:opacity-60 shadow-sm">
                  <CreditCard size={16} /> {guardando ? 'Procesando...' : 'Aplicar Pago'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
