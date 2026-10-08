import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { Subscription, interval, startWith, switchMap, retry, timer } from 'rxjs';
import {
  ApiService,
  ResultsPayload,
  University,
} from '../../core/api.service';
import { DeviceFingerprintService } from '../../core/device-fingerprint.service';
import { VoterSessionService } from '../../core/voter-session.service';
import { environment } from '../../../environments/environment';

type AuthStep = 'email' | 'waiting' | 'consuming' | 'ready';

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          theme?: string;
        },
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

@Component({
  selector: 'app-vote-page',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  templateUrl: './vote-page.component.html',
  styleUrl: './vote-page.component.scss',
})
export class VotePageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('turnstileHost') turnstileHost?: ElementRef<HTMLDivElement>;
  @ViewChild('modalTurnstileHost') modalTurnstileHost?: ElementRef<HTMLDivElement>;

  universities: University[] = [];
  results: ResultsPayload | null = null;
  selectedId: number | null = null;
  email = '';
  emailMasked = '';
  authStep: AuthStep = 'email';
  turnstileToken = '';
  turnstileEnabled = !!environment.turnstileSiteKey;
  magicLinkRequired = true;
  robotChecked = false;
  humanVerified = false;
  verifyModalOpen = false;
  modalTurnstileToken = '';
  alreadyVoted = false;
  votedUniversityName = '';
  loading = false;
  message = '';
  error = '';
  livePulse = false;
  countdown = { days: '00', hours: '00', minutes: '00', seconds: '00' };
  votingOpen = true;
  showCelebration = false;
  shareHint = '';
  devHint = '';
  magicUrlDev = '';
  mailDelivered = false;
  resendCooldown = 0;

  pieData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };
  pieOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
  };

  areaData: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  areaOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.parsed.y ?? 0} votes`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: '#64748b',
          precision: 0,
          stepSize: 1,
        },
        grid: { color: 'rgba(11, 39, 72, 0.08)' },
      },
    },
  };

  private pollSub?: Subscription;
  private countdownSub?: Subscription;
  private resendSub?: Subscription;
  private endsAtMs = 0;
  private pieHovered = false;
  private areaHovered = false;
  private pendingResults: ResultsPayload | null = null;
  private turnstileWidgetId: string | null = null;
  private modalTurnstileWidgetId: string | null = null;
  private readonly motionListener = () => this.onMotionPreferenceChange();
  private readonly magicModeListener = (e: Event) => {
    const detail = (e as CustomEvent).detail as { magicLinkRequired?: boolean };
    if (typeof detail?.magicLinkRequired === 'boolean') {
      this.onMagicModeChange(detail.magicLinkRequired);
    }
  };
  private readonly colors = [
    '#ff9f1c',
    '#ff5a1f',
    '#0b2748',
    '#38bdf8',
    '#14b8a6',
    '#a78bfa',
    '#f472b6',
    '#fbbf24',
    '#60a5fa',
    '#34d399',
  ];

  constructor(
    private readonly api: ApiService,
    private readonly session: VoterSessionService,
    private readonly deviceFp: DeviceFingerprintService,
  ) {}

  get canSelectUniversity(): boolean {
    if (this.alreadyVoted || this.loading || !this.votingOpen) return false;
    return this.magicLinkRequired ? this.authStep === 'ready' : true;
  }

  get canCast(): boolean {
    if (this.alreadyVoted || this.loading || !this.selectedId || !this.votingOpen) {
      return false;
    }
    if (this.magicLinkRequired) return this.authStep === 'ready';
    return this.humanVerified;
  }

  ngOnInit(): void {
    this.error = 'Connecting to server… (first load may take up to a minute)';
    this.api
      .getUniversities()
      .pipe(
        retry({
          count: 8,
          delay: (_err, retryIndex) => timer(Math.min(15000, 2000 * retryIndex)),
        }),
      )
      .subscribe({
        next: (list) => {
          this.universities = list;
          this.error = '';
        },
        error: () =>
          (this.error =
            'Could not reach the voting server. Wait 30 seconds and refresh the page.'),
      });

    this.startResultsPolling();
    document.addEventListener('visibilitychange', this.visibilityListener);

    this.countdownSub = interval(1000).subscribe(() => this.tickCountdown());

    this.syncChartMotion();
    window.addEventListener('abg-motion-change', this.motionListener);
    window.addEventListener('abg-magic-mode', this.magicModeListener);
    window.addEventListener('keydown', this.escapeListener);

    const magic = this.readMagicFromUrl();
    if (magic) {
      this.consumeMagic(magic);
    } else if (this.session.getToken()) {
      this.restoreSession();
    }
  }

  ngAfterViewInit(): void {
    if (this.turnstileEnabled) {
      this.loadTurnstile().catch(() => {
        this.error = 'Verification widget failed to load. Refresh and try again.';
      });
    }
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
    this.countdownSub?.unsubscribe();
    this.resendSub?.unsubscribe();
    window.removeEventListener('abg-motion-change', this.motionListener);
    window.removeEventListener('abg-magic-mode', this.magicModeListener);
    window.removeEventListener('keydown', this.escapeListener);
    document.removeEventListener('visibilitychange', this.visibilityListener);
  }

  private readonly visibilityListener = () => {
    if (document.hidden) {
      this.pollSub?.unsubscribe();
      this.pollSub = undefined;
    } else {
      this.startResultsPolling();
    }
  };

  private readonly escapeListener = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.verifyModalOpen) this.closeVerifyModal();
  };

  private startResultsPolling() {
    this.pollSub?.unsubscribe();
    this.pollSub = interval(5000)
      .pipe(
        startWith(0),
        switchMap(() => this.api.getResults()),
      )
      .subscribe({
        next: (data) => this.applyResults(data),
        error: () => {},
      });
  }

  sendMagicLink() {
    if (!this.votingOpen) {
      this.error = 'Voting is closed.';
      return;
    }
    const email = this.email.trim();
    if (!email || !email.includes('@')) {
      this.error = 'Enter a valid email address.';
      return;
    }
    if (this.turnstileEnabled && !this.turnstileToken) {
      this.error = 'Complete the verification challenge.';
      return;
    }

    this.loading = true;
    this.error = '';
    this.devHint = '';
    this.magicUrlDev = '';
    this.mailDelivered = false;
    this.api.requestMagicLink(email, this.turnstileToken || undefined).subscribe({
      next: (res) => {
        this.loading = false;
        this.emailMasked = res.emailMasked;
        this.authStep = 'waiting';
        this.message = res.message;
        this.devHint = res.devHint || '';
        this.magicUrlDev = res.magicUrlDev || '';
        this.mailDelivered = !!res.mailDelivered;
        this.startResendCooldown(30);
        this.resetTurnstile();
      },
      error: (err) => {
        this.loading = false;
        this.error = this.errMsg(err, 'Could not send magic link.');
        this.resetTurnstile();
      },
    });
  }

  resetAuthForm() {
    this.authStep = 'email';
    this.message = '';
    this.devHint = '';
    this.magicUrlDev = '';
    this.mailDelivered = false;
    this.error = '';
    this.turnstileToken = '';
    setTimeout(() => this.renderTurnstile(), 0);
  }

  openDevMagicLink() {
    if (!this.magicUrlDev) return;
    window.location.href = this.magicUrlDev;
  }

  signOut() {
    this.session.clear();
    this.authStep = 'email';
    this.emailMasked = '';
    this.alreadyVoted = false;
    this.votedUniversityName = '';
    this.selectedId = null;
    this.message = '';
    this.error = '';
    setTimeout(() => this.renderTurnstile(), 0);
  }

  select(id: number) {
    if (!this.canSelectUniversity) return;
    this.selectedId = id;
    this.error = '';
  }

  onRobotCheck(ev: Event) {
    const checked = !!(ev.target as HTMLInputElement).checked;
    this.robotChecked = checked;
    if (!checked) {
      this.humanVerified = false;
      this.modalTurnstileToken = '';
      this.verifyModalOpen = false;
      return;
    }
    this.verifyModalOpen = true;
    this.humanVerified = false;
    setTimeout(() => this.renderModalTurnstile(), 0);
  }

  closeVerifyModal() {
    this.verifyModalOpen = false;
    if (!this.humanVerified) {
      this.robotChecked = false;
      this.modalTurnstileToken = '';
    }
  }

  confirmHumanVerify() {
    if (this.turnstileEnabled && !this.modalTurnstileToken) {
      this.error = 'Complete the verification challenge.';
      return;
    }
    this.humanVerified = true;
    this.verifyModalOpen = false;
    this.error = '';
  }

  castVote() {
    if (!this.votingOpen) {
      this.error = 'Voting is closed.';
      return;
    }
    if (!this.selectedId) {
      this.error = 'Select a university first.';
      return;
    }
    if (this.magicLinkRequired) {
      if (this.authStep !== 'ready' || !this.session.getToken()) {
        this.error = 'Confirm your email before voting.';
        return;
      }
      this.loading = true;
      this.error = '';
      this.api.castVote(this.selectedId).subscribe({
        next: (res) => this.onCastSuccess(res),
        error: (err) => this.onCastError(err, true),
      });
      return;
    }

    if (!this.humanVerified) {
      this.error = 'Confirm you are not a robot first.';
      return;
    }
    this.loading = true;
    this.error = '';
    const deviceKey = this.deviceFp.getDeviceKey();
    this.deviceFp.getFingerprintHash().then((fingerprintHash) => {
      this.api
        .castOpenVote({
          universityId: this.selectedId!,
          deviceKey,
          fingerprintHash,
          turnstileToken: this.modalTurnstileToken || undefined,
        })
        .subscribe({
          next: (res) => this.onCastSuccess(res),
          error: (err) => this.onCastError(err, false),
        });
    });
  }

  private onCastSuccess(res: { universityName: string; message: string }) {
    this.loading = false;
    this.alreadyVoted = true;
    this.votedUniversityName = res.universityName || '';
    this.message = res.message || 'Your vote was recorded.';
    this.showCelebration = true;
    this.shareHint = '';
    this.api.getResults().subscribe({
      next: (data) => this.applyResults(data),
      error: () => {},
    });
  }

  private onCastError(err: unknown, magicPath: boolean) {
    this.loading = false;
    this.error = this.errMsg(err, 'Vote failed. Try again.');
    const status = (err as { status?: number })?.status;
    if (status === 409) {
      this.alreadyVoted = true;
      this.showCelebration = true;
    }
    if (status === 403) this.votingOpen = false;
    if (magicPath && status === 401) {
      this.session.clear();
      this.authStep = 'email';
    }
  }

  private onMagicModeChange(required: boolean) {
    this.magicLinkRequired = required;
    if (!required) {
      this.checkOpenVoteStatus();
    }
  }

  private checkOpenVoteStatus() {
    const deviceKey = this.deviceFp.getDeviceKey();
    this.deviceFp.getFingerprintHash().then((fingerprintHash) => {
      this.api.openVoteStatus(deviceKey, fingerprintHash).subscribe({
        next: (status) => {
          if (status.voted) {
            this.alreadyVoted = true;
            this.votedUniversityName = status.universityName;
            this.message = `You already voted for ${status.universityName}.`;
          }
        },
        error: () => {},
      });
    });
  }

  dismissCelebration() {
    this.showCelebration = false;
  }

  async shareVote() {
    const uni = this.votedUniversityName || 'my university';
    const url = typeof window !== 'undefined' ? window.location.origin + '/' : '';
    const text =
      'I voted for ' + uni + ' in ABG University Cup 2026 Fan Cup! Cast yours: ' + url;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: 'ABG Fan Cup', text, url });
        this.shareHint = 'Shared — thanks!';
        return;
      }
    } catch {
      /* cancelled */
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        this.shareHint = 'Share text copied to clipboard.';
        return;
      }
    } catch {
      /* ignore */
    }
    this.shareHint = text;
  }

  maxVotes(): number {
    if (!this.results?.universities.length) return 1;
    return Math.max(1, ...this.results.universities.map((u) => u.votes));
  }

  pauseChart(kind: 'pie' | 'area') {
    if (kind === 'pie') this.pieHovered = true;
    else this.areaHovered = true;
  }

  resumeChart(kind: 'pie' | 'area') {
    if (kind === 'pie') this.pieHovered = false;
    else this.areaHovered = false;
    if (this.pendingResults) this.applyResults(this.pendingResults);
  }

  private consumeMagic(token: string) {
    this.authStep = 'consuming';
    this.loading = true;
    this.error = '';
    this.api.consumeMagicLink(token).subscribe({
      next: (res) => {
        this.loading = false;
        this.session.setToken(res.accessToken);
        this.email = res.email;
        this.emailMasked = res.emailMasked;
        this.authStep = 'ready';
        this.clearMagicFromUrl();
        if (res.voted) {
          this.alreadyVoted = true;
          this.votedUniversityName = res.universityName || '';
          this.message = res.universityName
            ? `You already voted for ${res.universityName}.`
            : 'You already cast your vote.';
        } else {
          this.message = 'Email confirmed — select a university and cast your vote.';
        }
      },
      error: (err) => {
        this.loading = false;
        this.authStep = 'email';
        this.clearMagicFromUrl();
        this.error = this.errMsg(err, 'Magic link invalid or expired.');
      },
    });
  }

  private restoreSession() {
    this.api.voteStatus().subscribe({
      next: (status) => {
        this.authStep = 'ready';
        this.email = status.email;
        this.emailMasked = this.maskEmail(status.email);
        if (status.voted) {
          this.alreadyVoted = true;
          this.votedUniversityName = status.universityName;
          this.message = `You already voted for ${status.universityName}.`;
        }
      },
      error: () => {
        this.session.clear();
        this.authStep = 'email';
      },
    });
  }

  private readMagicFromUrl(): string | null {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('magic');
    } catch {
      return null;
    }
  }

  private clearMagicFromUrl() {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('magic')) return;
      url.searchParams.delete('magic');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch {
      /* ignore */
    }
  }

  private startResendCooldown(seconds: number) {
    this.resendSub?.unsubscribe();
    this.resendCooldown = seconds;
    this.resendSub = interval(1000).subscribe(() => {
      this.resendCooldown = Math.max(0, this.resendCooldown - 1);
      if (this.resendCooldown === 0) this.resendSub?.unsubscribe();
    });
  }

  private async loadTurnstile() {
    if (!this.turnstileEnabled) return;
    if (window.turnstile) {
      this.renderTurnstile();
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector('script[data-abg-turnstile]');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject());
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.dataset['abgTurnstile'] = '1';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('turnstile load failed'));
      document.head.appendChild(script);
    });
    this.renderTurnstile();
  }

  private renderTurnstile() {
    if (!this.turnstileEnabled || !window.turnstile || !this.turnstileHost?.nativeElement) {
      return;
    }
    const host = this.turnstileHost.nativeElement;
    host.innerHTML = '';
    this.turnstileWidgetId = window.turnstile.render(host, {
      sitekey: environment.turnstileSiteKey,
      callback: (token: string) => {
        this.turnstileToken = token;
      },
      'expired-callback': () => {
        this.turnstileToken = '';
      },
      theme: 'light',
    });
  }

  private renderModalTurnstile() {
    if (!this.turnstileEnabled) return;
    if (!window.turnstile) {
      this.loadTurnstile()
        .then(() => this.renderModalTurnstile())
        .catch(() => {});
      return;
    }
    if (!this.modalTurnstileHost?.nativeElement) return;
    const host = this.modalTurnstileHost.nativeElement;
    host.innerHTML = '';
    this.modalTurnstileToken = '';
    this.modalTurnstileWidgetId = window.turnstile.render(host, {
      sitekey: environment.turnstileSiteKey,
      callback: (token: string) => {
        this.modalTurnstileToken = token;
      },
      'expired-callback': () => {
        this.modalTurnstileToken = '';
      },
      theme: 'light',
    });
  }

  private resetTurnstile() {
    this.turnstileToken = '';
    if (this.turnstileWidgetId && window.turnstile) {
      try {
        window.turnstile.reset(this.turnstileWidgetId);
      } catch {
        this.renderTurnstile();
      }
    }
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    return `${(local || '*').slice(0, 1)}***@${domain}`;
  }

  private errMsg(err: unknown, fallback: string): string {
    const raw = (err as { error?: { message?: string | string[] } })?.error?.message;
    if (typeof raw === 'string' && raw) return raw;
    if (Array.isArray(raw)) return raw.filter(Boolean).join(', ') || fallback;
    return fallback;
  }

  private onMotionPreferenceChange() {
    this.syncChartMotion();
    if (this.pendingResults) this.applyResults(this.pendingResults);
  }

  private isMotionReduced(): boolean {
    try {
      if (document.documentElement.classList.contains('motion-reduce')) return true;
      if (localStorage.getItem('abg_motion') === 'reduce') return true;
    } catch {
      /* ignore */
    }
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  private syncChartMotion() {
    const reduce = this.isMotionReduced();
    this.pieOptions = {
      ...this.pieOptions,
      animation: reduce ? false : { duration: 800 },
    };
    this.areaOptions = {
      ...this.areaOptions,
      animation: reduce ? false : { duration: 800 },
    };
  }

  private applyResults(data: ResultsPayload | null | undefined) {
    if (!data || typeof data !== 'object') return;

    // Skip redundant chart rebuilds when payload unchanged
    if (
      this.results?.updatedAt === data.updatedAt &&
      this.results?.totalVotes === data.totalVotes &&
      this.results?.magicLinkRequired === data.magicLinkRequired &&
      this.results?.votingOpen === data.votingOpen
    ) {
      return;
    }

    const universities = Array.isArray(data.universities) ? data.universities : [];
    const dailyVotes = Array.isArray(data.dailyVotes) ? data.dailyVotes : [];
    const periodStats = this.normalizePeriodStats(data.periodStats);
    const endsMs = Date.parse(String(data.votingEndsAt ?? ''));
    const votingOpen =
      typeof data.votingOpen === 'boolean'
        ? data.votingOpen
        : Number.isFinite(endsMs)
          ? Date.now() < endsMs
          : false;

    const normalized: ResultsPayload = {
      totalVotes: Number.isFinite(Number(data.totalVotes)) ? Math.max(0, Number(data.totalVotes)) : 0,
      updatedAt: data.updatedAt || new Date().toISOString(),
      votingEndsAt: Number.isFinite(endsMs) ? new Date(endsMs).toISOString() : String(data.votingEndsAt || ''),
      votingOpen,
      universities,
      dailyVotes,
      periodStats,
    };

    const prevMagic = this.magicLinkRequired;
    const magicLinkRequired = data.magicLinkRequired !== false;

    this.pendingResults = normalized;
    this.results = { ...normalized, magicLinkRequired };
    this.votingOpen = votingOpen;
    this.magicLinkRequired = magicLinkRequired;
    if (prevMagic && !magicLinkRequired) {
      this.checkOpenVoteStatus();
    }
    this.endsAtMs = Number.isFinite(endsMs) ? endsMs : 0;
    this.tickCountdown();
    this.syncChartMotion();
    this.livePulse = !this.isMotionReduced();
    if (this.livePulse) {
      setTimeout(() => (this.livePulse = false), 400);
    }

    if (!this.pieHovered) {
      const labels = universities.map((u) => (u && u.name ? u.name : 'Unknown'));
      const values = universities.map((u) => {
        const n = Number(u?.votes);
        return Number.isFinite(n) && n >= 0 ? n : 0;
      });
      this.pieData = {
        labels,
        datasets: [
          {
            data: values.length ? values : [0],
            backgroundColor: this.colors,
            borderWidth: 0,
          },
        ],
      };
    }

    if (!this.areaHovered) {
      const daily = dailyVotes.filter(
        (d) => d && typeof d.date === 'string' && Number.isFinite(Number(d.votes)),
      );
      this.areaData = {
        labels: daily.map((d) => this.formatDayLabel(d.date)),
        datasets: [
          {
            data: daily.length ? daily.map((d) => Math.max(0, Number(d.votes))) : [0],
            fill: true,
            tension: 0.35,
            borderColor: '#0b2748',
            backgroundColor: 'rgba(255, 159, 28, 0.35)',
            pointBackgroundColor: '#ff9f1c',
            pointBorderColor: '#fff',
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 2,
          },
        ],
      };
    }
  }

  private normalizePeriodStats(
    raw: ResultsPayload['periodStats'],
  ): NonNullable<ResultsPayload['periodStats']> {
    const defaults: NonNullable<ResultsPayload['periodStats']> = [
      { key: '24h', label: 'Last 24 hours', totalVotes: 0, leaderName: null, leaderVotes: 0 },
      { key: '7d', label: 'Last 7 days', totalVotes: 0, leaderName: null, leaderVotes: 0 },
      { key: '15d', label: 'Last 15 days', totalVotes: 0, leaderName: null, leaderVotes: 0 },
    ];
    if (!Array.isArray(raw) || raw.length === 0) return defaults;
    return defaults.map((fallback) => {
      const found =
        raw.find((p) => p && p.key === fallback.key) ||
        raw.find((p) => p && p.label === fallback.label);
      if (!found) return fallback;
      const totalVotes = Number.isFinite(Number(found.totalVotes))
        ? Math.max(0, Number(found.totalVotes))
        : 0;
      const leaderVotes = Number.isFinite(Number(found.leaderVotes))
        ? Math.max(0, Number(found.leaderVotes))
        : 0;
      const leaderName =
        typeof found.leaderName === 'string' && found.leaderName.trim()
          ? found.leaderName.trim()
          : null;
      return {
        key: fallback.key,
        label:
          typeof found.label === 'string' && found.label.trim()
            ? found.label.trim()
            : fallback.label,
        totalVotes,
        leaderName: totalVotes === 0 ? null : leaderName,
        leaderVotes: totalVotes === 0 ? 0 : leaderVotes,
      };
    });
  }

  private formatDayLabel(yyyyMmDd: string): string {
    if (!yyyyMmDd || typeof yyyyMmDd !== 'string') return '—';
    const parts = yyyyMmDd.split('-').map(Number);
    const m = parts[1];
    const d = parts[2];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (!Number.isFinite(m) || !Number.isFinite(d) || m < 1 || m > 12) return yyyyMmDd;
    return d + ' ' + months[m - 1];
  }

  private tickCountdown() {
    if (!this.endsAtMs) return;
    let diff = Math.max(0, this.endsAtMs - Date.now());
    if (diff === 0) this.votingOpen = false;
    const days = Math.floor(diff / 86400000);
    diff %= 86400000;
    const hours = Math.floor(diff / 3600000);
    diff %= 3600000;
    const minutes = Math.floor(diff / 60000);
    diff %= 60000;
    const seconds = Math.floor(diff / 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    this.countdown = {
      days: pad(days),
      hours: pad(hours),
      minutes: pad(minutes),
      seconds: pad(seconds),
    };
  }
}
