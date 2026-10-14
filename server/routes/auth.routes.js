import { Router } from 'express';
import { Agente } from '../../database/index.js';
import { signToken, revokeToken } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { userId, password } = req.body;
    if (!userId || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
    }

    const agente = await Agente.findOne({ userId: userId.trim().toLowerCase() }).select('+password');

    // Mismo mensaje genérico si el usuario no existe o si la contraseña es incorrecta,
    // para no revelar cuáles usuarios existen en el sistema.
    if (!agente || !(await agente.compararPassword(password))) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    if (agente.estatus !== 'Activo') {
      return res.status(403).json({ error: 'Este usuario está inactivo. Contacta a un administrador.' });
    }

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
