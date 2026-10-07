import { z } from 'zod';

const email = z.string().trim().toLowerCase().max(150).pipe(z.email('Email inválido'));

export const registerSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre es muy corto').max(100),
  email,
  // bcrypt solo considera los primeros 72 bytes
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(72),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'La contraseña es obligatoria').max(72),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
