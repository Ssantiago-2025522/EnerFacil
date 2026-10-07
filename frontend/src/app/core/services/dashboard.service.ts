import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/auth.models';
import { DashboardData } from '../models/dashboard.models';

/** Acceso HTTP a /api/dashboard. El JWT lo agrega el interceptor; el backend valida que la vivienda sea del usuario. */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/dashboard`;

  /** GET /api/dashboard?id_vivienda=…: estado energético de la vivienda (ciclo en curso). */
  obtener(idVivienda: number): Observable<DashboardData> {
    const params = new HttpParams().set('id_vivienda', idVivienda);
    return this.http.get<ApiResponse<DashboardData>>(this.baseUrl, { params }).pipe(map((r) => r.data));
  }
}
