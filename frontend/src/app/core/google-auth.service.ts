import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (
            parent: HTMLElement,
            config: Record<string, unknown>,
          ) => void;
        };
      };
    };
  }
}

@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private readonly token$ = new BehaviorSubject<string | null>(null);
  private ready = false;

  readonly idToken$ = this.token$.asObservable();

  get idToken(): string | null {
    return this.token$.value;
  }

  get isDemoMode(): boolean {
    return environment.googleClientId.startsWith('REPLACE_');
  }

  continueAsDemoVoter() {
    const key = localStorage.getItem('abg_demo_voter') || `voter-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('abg_demo_voter', key);
    this.token$.next(`dev:${key}`);
  }

  async ensureLoaded(): Promise<void> {
    if (this.isDemoMode) {
      this.ready = true;
      return;
    }
    if (this.ready && window.google?.accounts?.id) return;
    await new Promise<void>((resolve, reject) => {
      if (window.google?.accounts?.id) {
        this.ready = true;
        resolve();
        return;
      }
      const existing = document.querySelector(
        'script[data-google-gsi]',
      ) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => {
          this.ready = true;
          resolve();
        });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset['googleGsi'] = '1';
      script.onload = () => {
        this.ready = true;
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load Google Sign-In'));
      document.head.appendChild(script);
    });
  }

  async renderButton(host: HTMLElement): Promise<void> {
    await this.ensureLoaded();
    if (this.isDemoMode) {
      host.innerHTML = '';
      return;
    }
    window.google!.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (response: { credential: string }) => {
        this.token$.next(response.credential);
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    host.innerHTML = '';
    window.google!.accounts.id.renderButton(host, {
      theme: 'outline',
      size: 'large',
      shape: 'rectangular',
      text: 'signin_with',
      width: 280,
    });
  }

  clear() {
    this.token$.next(null);
  }
}