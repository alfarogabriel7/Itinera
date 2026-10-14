import jwt from 'jsonwebtoken';
import { TokenRevocado } from '../../database/index.js';

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

  try {
    const revocado = await TokenRevocado.exists({ token });
    if (revocado) return res.status(401).json({ error: 'Sesión cerrada' });

    req.agente = jwt.verify(token, JWT_SECRET);
    req.token = token;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}
