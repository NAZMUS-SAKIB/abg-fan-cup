import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
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
export class AppComponent implements OnInit {
  showDevCredit = false;
  settingsOpen = false;
  themeMode: ThemeMode = 'night';
  motionMode: MotionMode = 'full';
  densityMode: DensityMode = 'comfortable';

  constructor(private readonly router: Router) {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.showDevCredit = e.urlAfterRedirects.startsWith('/admin');
        this.settingsOpen = false;
      });
    this.showDevCredit = this.router.url.startsWith('/admin');
  }

  ngOnInit(): void {
    this.themeMode = this.readTheme();
    this.motionMode = this.readMotion();
    this.densityMode = this.readDensity();
    this.applyAll();
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.settingsOpen = false;
  }

  toggleSettings(): void {
    this.settingsOpen = !this.settingsOpen;
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
