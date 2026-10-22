import { Router } from 'express';
import { Agente, Empresa, IntentoLogin } from '../../database/index.js';
import { signToken, revokeToken } from '../middleware/auth.js';
import { TEMA_PREDETERMINADO } from '../../database/catalogos/temas.js';

const router = Router();

// Límite de intentos fallidos (fuerza bruta), en una ventana de 15 minutos:
//  - por usuario + IP: 5 intentos (frena adivinar la contraseña de una cuenta
//    sin bloquear a ese usuario desde otros equipos);
//  - por IP: 30 intentos con cualquier usuario (frena probar muchas cuentas).
const VENTANA_MS = 15 * 60 * 1000;
const LIMITES = { usuario: 5, ip: 30 };

const clavesDe = (userId, ip) => ({ usuario: `usuario:${userId}|${ip}`, ip: `ip:${ip}` });

async function minutosDeBloqueo(claves) {
  const registros = await IntentoLogin.find({ clave: { $in: [claves.usuario, claves.ip] } }).lean();
  const bloqueado = registros.find((r) =>
    (r.clave === claves.usuario && r.intentos >= LIMITES.usuario) || (r.clave === claves.ip && r.intentos >= LIMITES.ip));
  return bloqueado ? Math.max(1, Math.ceil((bloqueado.expiraEn - Date.now()) / 60000)) : 0;
}

async function registrarFallo(claves) {
  const expiraEn = new Date(Date.now() + VENTANA_MS);
  await Promise.all([claves.usuario, claves.ip].map((clave) =>
    IntentoLogin.updateOne({ clave }, { $inc: { intentos: 1 }, $setOnInsert: { expiraEn } }, { upsert: true })));
}

router.post('/login', async (req, res, next) => {
  try {
    const { userId, password } = req.body;
    if (typeof userId !== 'string' || typeof password !== 'string' || !userId || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
    }

    const usuario = userId.trim().toLowerCase();
    const claves = clavesDe(usuario, req.ip);
    const minutos = await minutosDeBloqueo(claves);
    if (minutos) {
      res.set('Retry-After', String(minutos * 60));
      return res.status(429).json({ error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutos} minuto(s).` });
    }

    const agente = await Agente.findOne({ userId: usuario }).select('+password');

    // Mismo mensaje genérico si el usuario no existe o si la contraseña es incorrecta,
    // para no revelar cuáles usuarios existen en el sistema.
    if (!agente || !(await agente.compararPassword(password))) {
      await registrarFallo(claves);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    if (agente.estatus !== 'Activo') {
      return res.status(403).json({ error: 'Este usuario está dado de baja. Contacta a un administrador.' });
    }
    // Tema de colores de la app: el del grupo de su empresa. El superAdmin no
    // pertenece a ninguna empresa y siempre ve Itinera.
    let tema = TEMA_PREDETERMINADO;
    if (agente.rol !== 'superAdmin') {
      const empresa = await Empresa.findById(agente.empresa).select('estatus tema');
      if (!empresa || empresa.estatus !== 'Activo') {
        return res.status(403).json({ error: 'La empresa de este usuario no está activa. Contacta al administrador de la plataforma.' });
      }
      tema = empresa.tema || TEMA_PREDETERMINADO;
    }

    // Inicio de sesión correcto: se limpian los intentos de este usuario en este equipo.
    await IntentoLogin.deleteOne({ clave: claves.usuario });

    const token = signToken(agente);
    res.json({
      token,
      agente: {
        id: agente._id,
        nombre: agente.nombre,
        userId: agente.userId,
        rol: agente.rol,
        estatus: agente.estatus,
        empresa: agente.empresa || null,
        tema,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Revoca el token actual: aunque no haya expirado, requireAuth lo rechazará
// desde este momento (queda registrado en TokenRevocado).
router.post('/logout', async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) {
      await revokeToken(token);
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
