import { Injectable } from '@angular/core';

const STORAGE_KEY = 'abg_voter_jwt';

@Injectable({ providedIn: 'root' })
export class VoterSessionService {
  getToken(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  setToken(token: string) {
    try {
      localStorage.setItem(STORAGE_KEY, token);
    } catch {
      /* ignore */
    }
  }

  clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}
