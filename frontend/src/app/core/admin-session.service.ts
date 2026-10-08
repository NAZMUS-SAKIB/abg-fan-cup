import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

const TOKEN_KEY = 'abg_admin_token';

@Injectable({ providedIn: 'root' })
export class AdminSessionService {
  private readonly tokenSubject = new BehaviorSubject<string | null>(this.read());
  readonly token$ = this.tokenSubject.asObservable();

  getToken(): string | null {
    return this.tokenSubject.value;
  }

  isLoggedIn(): boolean {
    return !!this.tokenSubject.value;
  }

  setToken(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
    this.tokenSubject.next(token);
  }

  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    this.tokenSubject.next(null);
  }

  private read(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }
}
