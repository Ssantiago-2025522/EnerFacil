import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, AuthData, LoginRequest, RegisterRequest, Usuario } from '../models/auth.models';

const TOKEN_KEY = 'enerfacil.token';
const USER_KEY = 'enerfacil.user';

/** Servicio centralizado de autenticación: login, registro, JWT y usuario actual. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly baseUrl = `${environment.apiUrl}/auth`;

  private readonly tokenState = signal<string | null>(null);
  private readonly userState = signal<Usuario | null>(null);

  /** Usuario autenticado (o null). */
  readonly user = this.userState.asReadonly();

  constructor() {
    // Restaurar la sesión guardada; si el token ya venció se descarta.
    const token = this.read(TOKEN_KEY);
    if (token && !this.isExpired(token)) {
      this.tokenState.set(token);
      this.userState.set(this.readUser());
    } else {
      this.clearStorage();
    }
  }

  login(credentials: LoginRequest): Observable<AuthData> {
    return this.http
      .post<ApiResponse<AuthData>>(`${this.baseUrl}/login`, credentials)
      .pipe(map((res) => res.data), tap((data) => this.saveSession(data)));
  }

  register(payload: RegisterRequest): Observable<AuthData> {
    return this.http
      .post<ApiResponse<AuthData>>(`${this.baseUrl}/register`, payload)
      .pipe(map((res) => res.data), tap((data) => this.saveSession(data)));
  }

  /** Consulta GET /auth/me (el interceptor agrega el token) y actualiza el usuario en memoria. */
  me(): Observable<Usuario> {
    return this.http.get<ApiResponse<Usuario>>(`${this.baseUrl}/me`).pipe(
      map((res) => res.data),
      tap((usuario) => {
        this.userState.set(usuario);
        this.write(USER_KEY, JSON.stringify(usuario));
      }),
    );
  }

  getToken(): string | null {
    return this.tokenState();
  }

  /** true si hay un token guardado y no ha vencido. */
  isAuthenticated(): boolean {
    const token = this.tokenState();
    if (!token) return false;
    if (this.isExpired(token)) {
      this.clearSession();
      return false;
    }
    return true;
  }

  /** Cierra la sesión local y vuelve a /login. */
  logout(): void {
    this.clearSession();
    void this.router.navigateByUrl('/login');
  }

  // ---- internos ----

  private saveSession(data: AuthData): void {
    if (!data?.token || !data.usuario) {
      throw new Error('Respuesta de autenticación inválida: falta data.token o data.usuario');
    }
    this.tokenState.set(data.token);
    this.userState.set(data.usuario);
    this.write(TOKEN_KEY, data.token);
    this.write(USER_KEY, JSON.stringify(data.usuario));
  }

  private clearSession(): void {
    this.tokenState.set(null);
    this.userState.set(null);
    this.clearStorage();
  }

  /** Lee el campo `exp` del JWT (solo para evitar usar tokens vencidos; el backend sigue siendo la autoridad). */
  private isExpired(token: string): boolean {
    try {
      const payload = token.split('.')[1];
      const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      return typeof json.exp === 'number' && json.exp * 1000 <= Date.now();
    } catch {
      return true; // token malformado
    }
  }

  private readUser(): Usuario | null {
    try {
      const raw = this.read(USER_KEY);
      return raw ? (JSON.parse(raw) as Usuario) : null;
    } catch {
      return null;
    }
  }

  private read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      console.error('[auth] No se pudo guardar la sesión en localStorage', err);
    }
  }

  private clearStorage(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      /* almacenamiento no disponible */
    }
  }
}
