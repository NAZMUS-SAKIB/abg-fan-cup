import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { Subscription, interval, startWith, switchMap } from 'rxjs';
import {
  ApiService,
  ResultsPayload,
  University,
} from '../../core/api.service';
import { GoogleAuthService } from '../../core/google-auth.service';

@Component({
  selector: 'app-vote-page',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  templateUrl: './vote-page.component.html',
  styleUrl: './vote-page.component.scss',
})
export class VotePageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('googleBtn', { static: true }) googleBtn!: ElementRef<HTMLDivElement>;

  universities: University[] = [];
  results: ResultsPayload | null = null;
  selectedId: number | null = null;
  googleToken: string | null = null;
  alreadyVoted = false;
  votedUniversityName = '';
  loading = false;
  message = '';
  error = '';
  livePulse = false;
  isDemoMode = false;
  countdown = { days: '00', hours: '00', minutes: '00', seconds: '00' };
  votingOpen = true;

  pieData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };
  pieOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: '#334155', boxWidth: 12, font: { size: 11 } },
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
  private googleSub?: Subscription;
  private countdownSub?: Subscription;
  private endsAtMs = 0;
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
    private readonly googleAuth: GoogleAuthService,
  ) {}

  ngOnInit(): void {
    this.api.getUniversities().subscribe({
      next: (list) => (this.universities = list),
      error: () => (this.error = 'Could not load universities. Is the API running?'),
    });

    this.pollSub = interval(2000)
      .pipe(
        startWith(0),
        switchMap(() => this.api.getResults()),
      )
      .subscribe({
        next: (data) => this.applyResults(data),
        error: () => {},
      });

    this.countdownSub = interval(1000).subscribe(() => this.tickCountdown());

    this.googleSub = this.googleAuth.idToken$.subscribe((token) => {
      this.googleToken = token;
      if (token) {
        this.api.voteStatus(token).subscribe({
          next: (status) => {
            if (status.voted) {
              this.alreadyVoted = true;
              this.votedUniversityName = status.universityName;
              this.message = `You already voted for ${status.universityName}.`;
            }
          },
        });
      }
    });
  }

  ngAfterViewInit(): void {
    this.isDemoMode = this.googleAuth.isDemoMode;
    if (this.isDemoMode) return;
    this.googleAuth.renderButton(this.googleBtn.nativeElement).catch(() => {
      this.error =
        'Google Sign-In failed to load. Set a valid GOOGLE_CLIENT_ID in environment.';
    });
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
    this.googleSub?.unsubscribe();
    this.countdownSub?.unsubscribe();
  }

  continueDemo() {
    this.googleAuth.continueAsDemoVoter();
    this.error = '';
  }

  select(id: number) {
    if (this.alreadyVoted || this.loading || !this.votingOpen) return;
    this.selectedId = id;
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
    if (!this.googleToken) {
      this.error = 'Sign in before voting.';
      return;
    }
    this.loading = true;
    this.error = '';
    this.api.castVote(this.selectedId, this.googleToken).subscribe({
      next: (res) => {
        this.loading = false;
        this.alreadyVoted = true;
        this.votedUniversityName = res.universityName;
        this.message = res.message;
        this.api.getResults().subscribe((data) => this.applyResults(data));
      },
      error: (err) => {
        this.loading = false;
        this.error =
          err?.error?.message ||
          (Array.isArray(err?.error?.message)
            ? err.error.message.join(', ')
            : 'Vote failed. Try again.');
        if (err?.status === 409) this.alreadyVoted = true;
        if (err?.status === 403) this.votingOpen = false;
      },
    });
  }

  maxVotes(): number {
    if (!this.results?.universities.length) return 1;
    return Math.max(1, ...this.results.universities.map((u) => u.votes));
  }

  private applyResults(data: ResultsPayload) {
    this.results = data;
    this.votingOpen = data.votingOpen;
    this.endsAtMs = new Date(data.votingEndsAt).getTime();
    this.tickCountdown();
    this.livePulse = true;
    setTimeout(() => (this.livePulse = false), 400);
    this.pieData = {
      labels: data.universities.map((u) => u.name),
      datasets: [
        {
          data: data.universities.map((u) => u.votes),
          backgroundColor: this.colors,
          borderWidth: 0,
        },
      ],
    };

    const daily = data.dailyVotes ?? [];
    this.areaData = {
      labels: daily.map((d) => this.formatDayLabel(d.date)),
      datasets: [
        {
          data: daily.map((d) => d.votes),
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

  private formatDayLabel(yyyyMmDd: string): string {
    const [y, m, d] = yyyyMmDd.split('-').map(Number);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d} ${months[m - 1]}`;
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