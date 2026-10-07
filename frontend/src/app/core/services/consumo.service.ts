import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/auth.models';
import {
  LecturaMedidor,
  LecturaPayload,
  PeriodoConsumo,
  PeriodoDetalle,
  PeriodoGuardado,
  Proyeccion,
  RegistroUso,
  UsoPayload,
} from '../models/consumo.models';

/** Acceso HTTP a /api/consumo. El JWT lo agrega el interceptor; el backend valida la propiedad. */
@Injectable({ providedIn: 'root' })
export class ConsumoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/consumo`;

  /** GET /api/consumo/proyeccion?id_vivienda=… (ciclo en curso). */
  proyeccion(idVivienda: number): Observable<Proyeccion> {
    const params = new HttpParams().set('id_vivienda', idVivienda);
    return this.http.get<ApiResponse<Proyeccion>>(`${this.baseUrl}/proyeccion`, { params }).pipe(map((r) => r.data));
  }

  /** GET /api/consumo/periodos?id_vivienda=…&limit=… (más recientes primero). */
  periodos(idVivienda: number, limit = 24): Observable<PeriodoConsumo[]> {
    const params = new HttpParams().set('id_vivienda', idVivienda).set('limit', limit);
    return this.http.get<ApiResponse<PeriodoConsumo[]>>(`${this.baseUrl}/periodos`, { params }).pipe(map((r) => r.data));
  }

  /** GET /api/consumo/periodos/:id (incluye el desglose por electrodoméstico). */
  periodo(idPeriodo: number): Observable<PeriodoDetalle> {
    return this.http.get<ApiResponse<PeriodoDetalle>>(`${this.baseUrl}/periodos/${idPeriodo}`).pipe(map((r) => r.data));
  }

  /** POST /api/consumo/periodos/calcular: recalcula y guarda el ciclo en curso (lo mismo que hace el cron). */
  calcularPeriodo(idVivienda: number): Observable<PeriodoGuardado> {
    return this.http
      .post<ApiResponse<PeriodoGuardado>>(`${this.baseUrl}/periodos/calcular`, { id_vivienda: idVivienda })
      .pipe(map((r) => r.data));
  }

  /* ----- Lecturas del medidor ----- */

  lecturas(idVivienda: number, limit = 100): Observable<LecturaMedidor[]> {
    const params = new HttpParams().set('id_vivienda', idVivienda).set('limit', limit);
    return this.http.get<ApiResponse<LecturaMedidor[]>>(`${this.baseUrl}/lecturas`, { params }).pipe(map((r) => r.data));
  }

  crearLectura(payload: LecturaPayload): Observable<LecturaMedidor> {
    return this.http.post<ApiResponse<LecturaMedidor>>(`${this.baseUrl}/lecturas`, payload).pipe(map((r) => r.data));
  }

  eliminarLectura(id: number): Observable<void> {
    return this.http.delete<ApiResponse<null>>(`${this.baseUrl}/lecturas/${id}`).pipe(map(() => undefined));
  }

  /* ----- Horas de uso por electrodoméstico ----- */

  usos(idVivienda: number, limit = 100): Observable<RegistroUso[]> {
    const params = new HttpParams().set('id_vivienda', idVivienda).set('limit', limit);
    return this.http.get<ApiResponse<RegistroUso[]>>(`${this.baseUrl}/usos`, { params }).pipe(map((r) => r.data));
  }

  crearUso(payload: UsoPayload): Observable<RegistroUso> {
    return this.http.post<ApiResponse<RegistroUso>>(`${this.baseUrl}/usos`, payload).pipe(map((r) => r.data));
  }

  /** PUT /api/consumo/usos/:id: solo se puede corregir `horas_uso` (el trigger recalcula los kWh). */
  actualizarUso(id: number, horasUso: number): Observable<RegistroUso> {
    return this.http.put<ApiResponse<RegistroUso>>(`${this.baseUrl}/usos/${id}`, { horas_uso: horasUso }).pipe(map((r) => r.data));
  }

  eliminarUso(id: number): Observable<void> {
    return this.http.delete<ApiResponse<null>>(`${this.baseUrl}/usos/${id}`).pipe(map(() => undefined));
  }
}
