import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { toApiError, ApiError } from '../../../core/utils/api-error';
import { FieldKind, controlError } from '../../../core/utils/form-errors';
import { emailValidator } from '../../../core/validators/auth.validators';
import { AuthShell } from '../shell/auth-shell';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, AuthShell],
  templateUrl: './login.html',
})
export class Login {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  protected readonly form = this.fb.group({
    email: ['', [emailValidator]],
    password: ['', [Validators.required, Validators.maxLength(72)]],
  });

  protected error(field: 'email' | 'password'): string | null {
    const kind: FieldKind = field === 'email' ? 'email' : 'passwordLogin';
    return controlError(this.form.controls[field], kind);
  }

  protected togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  protected submit(): void {
    if (this.submitting()) return;
    this.serverError.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const { email, password } = this.form.getRawValue();
    this.submitting.set(true);
    this.auth.login({ email: email.trim(), password }).subscribe({
      next: () => void this.router.navigateByUrl('/inicio'),
      error: (err: unknown) => {
        this.submitting.set(false);
        this.showError(toApiError(err));
      },
    });
  }

  private showError(error: ApiError): void {
    this.serverError.set(error.message);
    for (const field of ['email', 'password'] as const) {
      const msg = error.fieldErrors[field];
      if (msg) this.form.controls[field].setErrors({ server: msg });
    }
  }
}
