import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AdminSessionService } from './core/admin-session.service';
import { ApiService } from './core/api.service';
import { SiteFooterComponent } from './shared/site-footer/site-footer.component';

const THEME_KEY = 'abg_theme';
const MOTION_KEY = 'abg_motion';
const DENSITY_KEY = 'abg_density';

type ThemeMode = 'night' | 'day';
type MotionMode = 'full' | 'reduce';
type DensityMode = 'comfortable' | 'compact';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, SiteFooterComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit, OnDestroy {
  showDevCredit = false;
  settingsOpen = false;
  themeMode: ThemeMode = 'night';
  motionMode: MotionMode = 'full';
  densityMode: DensityMode = 'comfortable';
  adminLoggedIn = false;
  magicLinkRequired = true;
  magicToggleBusy = false;
  magicToggleError = '';

  private subs = new Subscription();

  constructor(
    private readonly router: Router,
    private readonly adminSession: AdminSessionService,
    private readonly api: ApiService,
  ) {
    this.subs.add(
      this.router.events
        .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
        .subscribe((e) => {
          this.showDevCredit = e.urlAfterRedirects.startsWith('/admin');
          this.settingsOpen = false;
        }),
    );
    this.showDevCredit = this.router.url.startsWith('/admin');
  }

  ngOnInit(): void {
    this.themeMode = this.readTheme();
    this.motionMode = this.readMotion();
    this.densityMode = this.readDensity();
    this.applyAll();

    this.subs.add(
      this.adminSession.token$.subscribe((token) => {
        this.adminLoggedIn = !!token;
        if (token) this.refreshMagicFlag();
      }),
    );

    this.refreshMagicFlag();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.settingsOpen = false;
  }

  toggleSettings(): void {
    this.settingsOpen = !this.settingsOpen;
    if (this.settingsOpen && this.adminLoggedIn) this.refreshMagicFlag();
  }

  logoutAdmin(): void {
    this.adminSession.clear();
    this.settingsOpen = false;
    if (this.router.url.startsWith('/admin')) {
      this.router.navigateByUrl('/admin');
    }
  }

  toggleMagicLink(): void {
    this.setMagicLinkRequired(!this.magicLinkRequired);
  }

  setMagicLinkRequired(required: boolean): void {
    const token = this.adminSession.getToken();
    if (!token || this.magicToggleBusy) return;
    if (required === this.magicLinkRequired) return;
    this.magicToggleBusy = true;
    this.magicToggleError = '';
    this.api.updateMagicLinkRequired(token, required).subscribe({
      next: (res) => {
        this.magicLinkRequired = res.magicLinkRequired;
        this.magicToggleBusy = false;
        try {
          window.dispatchEvent(
            new CustomEvent('abg-magic-mode', {
              detail: { magicLinkRequired: res.magicLinkRequired },
            }),
          );
        } catch {
          /* ignore */
        }
      },
      error: (err) => {
        this.magicToggleBusy = false;
        const raw = err?.error?.message;
        if (Array.isArray(raw) && raw.length) this.magicToggleError = raw.join(' ');
        else if (typeof raw === 'string' && raw.trim()) this.magicToggleError = raw;
        else if (err?.status === 401) this.magicToggleError = 'Session expired. Sign in again.';
        else this.magicToggleError = err?.message || 'Could not update magic link setting.';
      },
    });
  }

  setTheme(mode: ThemeMode): void {
    this.themeMode = mode;
    this.write(THEME_KEY, mode);
    this.applyTheme();
  }

  setMotion(mode: MotionMode): void {
    this.motionMode = mode;
    this.write(MOTION_KEY, mode);
    this.applyMotion();
  }

  setDensity(mode: DensityMode): void {
    this.densityMode = mode;
    this.write(DENSITY_KEY, mode);
    this.applyDensity();
  }

  private refreshMagicFlag(): void {
    this.api.getResults().subscribe({
      next: (data) => {
        this.magicLinkRequired = data.magicLinkRequired !== false;
      },
      error: () => {},
    });
  }

  private readTheme(): ThemeMode {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'day') return 'day';
      if (saved === 'night') return 'night';
    } catch {
      /* ignore */
    }
    return 'night';
  }

  private readMotion(): MotionMode {
    try {
      return localStorage.getItem(MOTION_KEY) === 'reduce' ? 'reduce' : 'full';
    } catch {
      return 'full';
    }
  }

  private readDensity(): DensityMode {
    try {
      return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable';
    } catch {
      return 'comfortable';
    }
  }

  private write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }

  private applyAll(): void {
    this.applyTheme();
    this.applyMotion();
    this.applyDensity();
  }

  private applyTheme(): void {
    const root = document.documentElement;
    if (this.themeMode === 'night') root.classList.add('theme-night');
    else root.classList.remove('theme-night');
  }

  private applyMotion(): void {
    const root = document.documentElement;
    if (this.motionMode === 'reduce') root.classList.add('motion-reduce');
    else root.classList.remove('motion-reduce');
    try {
      window.dispatchEvent(
        new CustomEvent('abg-motion-change', { detail: this.motionMode }),
      );
    } catch {
      /* ignore */
    }
  }

  private applyDensity(): void {
    const root = document.documentElement;
    if (this.densityMode === 'compact') root.classList.add('density-compact');
    else root.classList.remove('density-compact');
  }
}
