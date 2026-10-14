import jwt from 'jsonwebtoken';
import { TokenRevocado, Agente, Empresa } from '../../database/index.js';

// En producción la clave es obligatoria: con la de desarrollo cualquiera podría
// firmar un token de superAdmin.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('Falta la variable de entorno JWT_SECRET.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = '8h';

export function signToken(agente) {
  return jwt.sign(
    {
      id: agente._id,
      userId: agente.userId,
      nombre: agente.nombre,
      rol: agente.rol,
      // Solo Administrador/Agente tienen empresa; superAdmin no.
      empresa: agente.empresa || null,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Marca un token como inválido antes de su expiración natural (logout real).
// Se guarda el token junto con su fecha de expiración original para poder
// limpiarlo automáticamente vía TTL index una vez que hubiera expirado igual.
export async function revokeToken(token) {
  const decoded = jwt.decode(token);
  if (!decoded?.exp) return;
  const expiraEn = new Date(decoded.exp * 1000);
  await TokenRevocado.updateOne({ token }, { token, expiraEn }, { upsert: true });
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }

  try {
    // El rol, la empresa y el estatus se leen de la base en cada petición, no
    // del token: si un agente se desactiva, cambia de empresa o la empresa se
    // da de baja, el cambio aplica de inmediato (no hasta que el token expire).
    const [revocado, agente] = await Promise.all([
      TokenRevocado.exists({ token }),
      Agente.findById(payload.id).select('nombre userId rol empresa estatus').lean(),
    ]);
    if (revocado) return res.status(401).json({ error: 'Sesión cerrada' });
    if (!agente || agente.estatus !== 'Activo') {
      return res.status(401).json({ error: 'Tu usuario está inactivo. Contacta a un administrador.' });
    }
    if (agente.rol !== 'superAdmin') {
      const empresa = agente.empresa && (await Empresa.findById(agente.empresa).select('estatus').lean());
      if (!empresa || empresa.estatus !== 'Activo') {
        return res.status(401).json({ error: 'La empresa de este usuario no está activa.' });
      }
    }

    req.agente = {
      id: String(agente._id),
      userId: agente.userId,
      nombre: agente.nombre,
      rol: agente.rol,
      empresa: agente.empresa ? String(agente.empresa) : null,
    };
    req.token = token;
    next();
  } catch (err) {
    next(err);
  }
}
