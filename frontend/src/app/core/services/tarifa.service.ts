import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/auth.models';
import { Tarifa, TarifaActual } from '../models/tarifa.models';

/** Solo lectura: tarifas disponibles (GET /api/tarifas) y tarifa de una vivienda (GET /api/tarifas/actual). */
@Injectable({ providedIn: 'root' })
export class TarifaService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/tarifas`;

  listar(): Observable<Tarifa[]> {
    return this.http.get<ApiResponse<Tarifa[]>>(this.baseUrl).pipe(map((res) => res.data));
  }

  /** Tarifa asignada a la vivienda (con tramos), o null si la vivienda no tiene tarifa. */
  actual(idVivienda: number): Observable<TarifaActual | null> {
    return this.http
      .get<ApiResponse<TarifaActual | null>>(`${this.baseUrl}/actual`, { params: { id_vivienda: idVivienda } })
      .pipe(map((res) => res.data));
  }
}
