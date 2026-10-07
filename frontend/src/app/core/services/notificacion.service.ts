import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/auth.models';
import { Notificacion } from '../models/notificacion.models';

/**
 * Acceso HTTP a /api/notificaciones. El backend filtra siempre por el usuario del JWT
 * (que agrega el interceptor) y valida que la vivienda le pertenezca.
 */
@Injectable({ providedIn: 'root' })
export class NotificacionService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/notificaciones`;

  /** Notificaciones de una vivienda, de la más reciente a la más antigua. */
  listar(idVivienda: number): Observable<Notificacion[]> {
    return this.http
      .get<ApiResponse<Notificacion[]>>(this.baseUrl, { params: { id_vivienda: idVivienda } })
      .pipe(map((res) => res.data));
  }

  /** PUT /api/notificaciones/:id/leida (idempotente); devuelve la notificación actualizada. */
  marcarLeida(id: number): Observable<Notificacion> {
    return this.http.put<ApiResponse<Notificacion>>(`${this.baseUrl}/${id}/leida`, {}).pipe(map((res) => res.data));
  }
}
