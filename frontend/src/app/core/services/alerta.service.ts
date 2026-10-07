import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AlertaConfig,
  AlertaConfigActualizarPayload,
  AlertaConfigCrearPayload,
} from '../models/alerta.models';
import { ApiResponse } from '../models/auth.models';
import { EstadoPresupuesto } from '../models/presupuesto.models';
import { PresupuestoService } from './presupuesto.service';

/**
 * Acceso HTTP a /api/alertas. El JWT lo agrega el interceptor existente; el backend deduce el usuario
 * y verifica que la vivienda sea suya. El semáforo se pide con el mismo método que ya usa Presupuesto.
 */
@Injectable({ providedIn: 'root' })
export class AlertaService {
  private readonly http = inject(HttpClient);
  private readonly presupuestos = inject(PresupuestoService);
  private readonly baseUrl = `${environment.apiUrl}/alertas`;

  /** GET /api/alertas/estado?id_vivienda=…: semáforo del ciclo en curso (calculado por el backend). */
  estado(idVivienda: number): Observable<EstadoPresupuesto> {
    return this.presupuestos.estado(idVivienda);
  }

  /** GET /api/alertas/config?id_vivienda=…: avisos configurados de la vivienda. */
  listarConfig(idVivienda: number): Observable<AlertaConfig[]> {
    const params = new HttpParams().set('id_vivienda', idVivienda);
    return this.http.get<ApiResponse<AlertaConfig[]>>(`${this.baseUrl}/config`, { params }).pipe(map((r) => r.data));
  }

  /** POST /api/alertas/config: crea un aviso (409 si ya existe ese tipo y canal; 400 si los umbrales no son coherentes). */
  crearConfig(payload: AlertaConfigCrearPayload): Observable<AlertaConfig> {
    return this.http.post<ApiResponse<AlertaConfig>>(`${this.baseUrl}/config`, payload).pipe(map((r) => r.data));
  }

  /** PUT /api/alertas/config/:id: cambia umbral, canal o si está activa. */
  actualizarConfig(id: number, payload: AlertaConfigActualizarPayload): Observable<AlertaConfig> {
    return this.http.put<ApiResponse<AlertaConfig>>(`${this.baseUrl}/config/${id}`, payload).pipe(map((r) => r.data));
  }
}
