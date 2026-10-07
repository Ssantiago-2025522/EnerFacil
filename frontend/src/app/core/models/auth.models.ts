/** Usuario público que devuelve el backend. */
export interface Usuario {
  id_usuario: number;
  nombre: string;
  email: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest extends LoginRequest {
  nombre: string;
}

/** Payload de `data` en login y registro. */
export interface AuthData {
  usuario: Usuario;
  token: string;
}

/** Envoltorio estándar de las respuestas exitosas del backend. */
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}
