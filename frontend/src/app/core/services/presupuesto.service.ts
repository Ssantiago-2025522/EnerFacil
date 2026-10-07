import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/auth.models';
import { EstadoPresupuesto, Presupuesto, PresupuestoCrearPayload } from '../models/presupuesto.models';

/**
 * Acceso HTTP a /api/presupuesto y al semáforo /api/alertas/estado.
 * El JWT lo agrega el interceptor existente; el backend deduce el usuario y verifica que la vivienda sea suya.
 */
@Injectable({ providedIn: 'root' })
export class PresupuestoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/presupuesto`;

  /** GET /api/presupuesto?id_vivienda=…: todos los presupuestos de la vivienda (con el flag `vigente`). */
  listar(idVivienda: number): Observable<Presupuesto[]> {
    const params = new HttpParams().set('id_vivienda', idVivienda);
    return this.http.get<ApiResponse<Presupuesto[]>>(this.baseUrl, { params }).pipe(map((r) => r.data));
  }

  /** POST /api/presupuesto: crea el presupuesto mensual vigente desde hoy (cierra el anterior abierto, si lo hay). */
  crear(payload: PresupuestoCrearPayload): Observable<Presupuesto> {
    return this.http.post<ApiResponse<Presupuesto>>(this.baseUrl, payload).pipe(map((r) => r.data));
  }

  /** PUT /api/presupuesto/:id: corrige el monto mensual de un presupuesto existente. */
  actualizarMonto(id: number, montoMensual: number): Observable<Presupuesto> {
    return this.http
      .put<ApiResponse<Presupuesto>>(`${this.baseUrl}/${id}`, { monto_mensual: montoMensual })
      .pipe(map((r) => r.data));
  }

  /**
   * GET /api/alertas/estado?id_vivienda=…: monto acumulado/proyectado del ciclo en curso, presupuesto vigente,
   * porcentaje proyectado, umbrales y semáforo, todo calculado por el backend.
   */
  estado(idVivienda: number): Observable<EstadoPresupuesto> {
    const params = new HttpParams().set('id_vivienda', idVivienda);
    return this.http
      .get<ApiResponse<EstadoPresupuesto>>(`${environment.apiUrl}/alertas/estado`, { params })
      .pipe(map((r) => r.data));
  }
}
