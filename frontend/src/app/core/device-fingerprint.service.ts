import { Injectable } from '@angular/core';

const DEVICE_KEY = 'abg_anon_device';

@Injectable({ providedIn: 'root' })
export class DeviceFingerprintService {
  getDeviceKey(): string {
    try {
      let key = localStorage.getItem(DEVICE_KEY);
      if (!key || key.length < 8) {
        key =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `d_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(DEVICE_KEY, key);
      }
      return key;
    } catch {
      return `d_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }
  }

  async getFingerprintHash(): Promise<string> {
    const parts = [
      navigator.userAgent || '',
      navigator.language || '',
      String(Intl.DateTimeFormat().resolvedOptions().timeZone || ''),
      String(screen.width),
      String(screen.height),
      String(screen.colorDepth),
      String(new Date().getTimezoneOffset()),
      await this.canvasFingerprint(),
    ];
    return this.sha256(parts.join('|'));
  }

  private async canvasFingerprint(): Promise<string> {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      if (!ctx) return 'nocanvas';
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(0, 0, 200, 50);
      ctx.fillStyle = '#069';
      ctx.fillText('ABG Fan Cup', 4, 4);
      return canvas.toDataURL().slice(-64);
    } catch {
      return 'canvas-fail';
    }
  }

  private async sha256(input: string): Promise<string> {
    try {
      const data = new TextEncoder().encode(input);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      let h = 0;
      for (let i = 0; i < input.length; i++) {
        h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
      }
      return `h${Math.abs(h).toString(16).padStart(8, '0')}${input.length}`;
    }
  }
}
