import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

const PUBLIC_AUTH_ENDPOINTS = ['/auth/login', '/auth/register'];

/**
 * Agrega `Authorization: Bearer <token>` a las peticiones hacia nuestro backend.
 * Si el backend responde 401 con una sesión activa (token vencido/inválido), cierra la sesión.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();
  const isApiCall = req.url.startsWith(environment.apiUrl);

  const outgoing =
    token && isApiCall && !req.headers.has('Authorization')
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(outgoing).pipe(
    catchError((err: unknown) => {
      const isPublic = PUBLIC_AUTH_ENDPOINTS.some((p) => req.url.endsWith(p));
      if (err instanceof HttpErrorResponse && err.status === 401 && token && isApiCall && !isPublic) {
        auth.logout();
      }
      return throwError(() => err);
    }),
  );
};
