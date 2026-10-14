import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

// Mínimo 8 caracteres, al menos una mayúscula, un número y un carácter especial.
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const AgenteSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true, maxlength: 100 },
    // Usuario para iniciar sesión: único en toda la BD.
    userId: {
      type: String,
      required: [true, 'El usuario (userId) es obligatorio'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 40,
      match: [/^[a-z0-9._-]+$/, 'El usuario solo puede contener letras, números, puntos, guiones y guiones bajos'],
    },
    rol: { type: String, enum: ['superAdmin', 'Administrador', 'Agente'], required: true, default: 'Agente' },
    // Empresa a la que pertenece el agente. Solo el rol superAdmin no está
    // ligado a ninguna empresa (opera a nivel de toda la plataforma).
    empresa: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Empresa',
      required: function () { return this.rol !== 'superAdmin'; },
    },
    estatus: { type: String, enum: ['Activo', 'Inactivo'], default: 'Activo' },
    // select: false -> nunca se incluye en find()/findById() salvo que se pida explícitamente con .select('+password')
    password: {
      type: String,
      required: [true, 'La contraseña es obligatoria'],
      select: false,
      validate: {
        validator: (v) => PASSWORD_REGEX.test(v),
        message: 'La contraseña debe tener al menos 8 caracteres, una mayúscula, un número y un carácter especial',
      },
    },
  },
  { timestamps: true }
);

AgenteSchema.index({ nombre: 'text' });

// Regla de negocio: solo puede existir un Administrador por empresa.
// partialFilterExpression hace que el índice único solo aplique a los
// documentos con rol 'Administrador'; los Agente de la misma empresa no chocan.
AgenteSchema.index(
  { empresa: 1 },
  { unique: true, partialFilterExpression: { rol: 'Administrador' } }
);

// Hashea la contraseña solo cuando se crea el agente o cuando se le asigna una nueva.
// Corre después de la validación (pre-save, no pre-validate), así el validador de arriba
// siempre evalúa la contraseña en texto plano, nunca el hash.
AgenteSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
});

AgenteSchema.methods.compararPassword = function (passwordPlano) {
  return bcrypt.compare(passwordPlano, this.password);
};

// Defensa en profundidad: aunque password ya viene excluido por select:false,
// nos aseguramos de que nunca se filtre si algún día se selecciona explícitamente.
AgenteSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    return ret;
  },
});

export default mongoose.model('Agente', AgenteSchema);
