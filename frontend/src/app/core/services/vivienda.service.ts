import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/auth.models';
import { Vivienda, ViviendaPayload } from '../models/vivienda.models';

/**
 * Acceso HTTP a /api/viviendas. No guarda estado ni maneja el token:
 * el interceptor existente agrega `Authorization: Bearer <jwt>` y el backend deduce el usuario del JWT.
 */
@Injectable({ providedIn: 'root' })
export class ViviendaService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/viviendas`;

  listar(): Observable<Vivienda[]> {
    return this.http.get<ApiResponse<Vivienda[]>>(this.baseUrl).pipe(map((res) => res.data));
  }

  obtener(id: number): Observable<Vivienda> {
    return this.http.get<ApiResponse<Vivienda>>(`${this.baseUrl}/${id}`).pipe(map((res) => res.data));
  }

  crear(payload: ViviendaPayload): Observable<Vivienda> {
    return this.http.post<ApiResponse<Vivienda>>(this.baseUrl, payload).pipe(map((res) => res.data));
  }

  /** PUT parcial: basta con enviar los campos que cambian (al menos uno). */
  actualizar(id: number, payload: Partial<ViviendaPayload>): Observable<Vivienda> {
    return this.http.put<ApiResponse<Vivienda>>(`${this.baseUrl}/${id}`, payload).pipe(map((res) => res.data));
  }

  eliminar(id: number): Observable<void> {
    return this.http.delete<ApiResponse<null>>(`${this.baseUrl}/${id}`).pipe(map(() => undefined));
  }
}
