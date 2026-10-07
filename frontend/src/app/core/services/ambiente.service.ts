import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Ambiente, AmbienteActualizarPayload, AmbienteCrearPayload } from '../models/ambiente.models';
import { ApiResponse } from '../models/auth.models';

/**
 * Acceso HTTP a /api/ambientes. El JWT lo agrega el interceptor y el backend verifica
 * que la vivienda pertenezca al usuario autenticado (no se envía id_usuario).
 */
@Injectable({ providedIn: 'root' })
export class AmbienteService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/ambientes`;

  /** GET /api/ambientes?id_vivienda=… */
  listar(idVivienda: number): Observable<Ambiente[]> {
    const params = new HttpParams().set('id_vivienda', idVivienda);
    return this.http.get<ApiResponse<Ambiente[]>>(this.baseUrl, { params }).pipe(map((res) => res.data));
  }

  crear(payload: AmbienteCrearPayload): Observable<Ambiente> {
    return this.http.post<ApiResponse<Ambiente>>(this.baseUrl, payload).pipe(map((res) => res.data));
  }

  actualizar(id: number, payload: AmbienteActualizarPayload): Observable<Ambiente> {
    return this.http.put<ApiResponse<Ambiente>>(`${this.baseUrl}/${id}`, payload).pipe(map((res) => res.data));
  }

  eliminar(id: number): Observable<void> {
    return this.http.delete<ApiResponse<null>>(`${this.baseUrl}/${id}`).pipe(map(() => undefined));
  }
}
