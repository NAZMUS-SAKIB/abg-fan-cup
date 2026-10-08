import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AdminSessionService } from '../../core/admin-session.service';
import { ApiService, ResultsPayload } from '../../core/api.service';

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-page.component.html',
  styleUrl: './admin-page.component.scss',
})
export class AdminPageComponent implements OnInit, OnDestroy {
  username = 'admin';
  password = '';
  token: string | null = null;
  /** false until summary succeeds — prevents stale-token flash of manage UI */
  authReady = false;
  verifying = false;
  summary: ResultsPayload | null = null;
  error = '';
  success = '';
  loading = false;
  endLocal = '';
  newUniName = '';
  editingId: number | null = null;
  editingName = '';
  private sub?: Subscription;

  constructor(
    private readonly api: ApiService,
    private readonly adminSession: AdminSessionService,
  ) {}

  ngOnInit(): void {
    this.sub = this.adminSession.token$.subscribe((t) => {
      if (!t) {
        this.token = null;
        this.authReady = false;
        this.verifying = false;
        this.summary = null;
        return;
      }
      if (t !== this.token) {
        this.token = t;
        this.verifying = true;
        this.loadSummary(true);
      }
    });
    const existing = this.adminSession.getToken();
    if (existing) {
      this.token = existing;
      this.verifying = true;
      this.loadSummary(true);
    } else {
      this.authReady = false;
      this.token = null;
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  login() {
    this.loading = true;
    this.error = '';
    this.api.adminLogin(this.username.trim(), this.password).subscribe({
      next: (res) => {
        this.token = res.accessToken;
        this.adminSession.setToken(res.accessToken);
        this.password = '';
        this.loading = false;
        this.verifying = true;
        this.loadSummary(true);
      },
      error: () => {
        this.loading = false;
        this.error = 'Invalid username or password.';
      },
    });
  }

  logout() {
    this.token = null;
    this.authReady = false;
    this.verifying = false;
    this.summary = null;
    this.endLocal = '';
    this.cancelEdit();
    this.adminSession.clear();
  }

  loadSummary(asAuthCheck = false) {
    if (!this.token) return;
    this.api.adminSummary(this.token).subscribe({
      next: (data) => {
        this.summary = data;
        this.endLocal = this.toLocalInput(data.votingEndsAt);
        this.authReady = true;
        this.verifying = false;
        this.error = '';
      },
      error: () => {
        this.verifying = false;
        this.authReady = false;
        if (asAuthCheck) {
          this.error = 'Session expired. Please sign in again.';
        } else {
          this.error = 'Session expired. Please login again.';
        }
        this.logout();
      },
    });
  }

  saveEndDate() {
    if (!this.token || !this.endLocal) return;
    this.error = '';
    this.success = '';
    const iso = new Date(this.endLocal).toISOString();
    this.api.updateVotingEnd(this.token, iso).subscribe({
      next: (res) => {
        this.success = 'Voting end date updated.';
        if (this.summary) {
          this.summary = {
            ...this.summary,
            votingEndsAt: res.votingEndsAt,
            votingOpen: res.votingOpen,
          };
        }
      },
      error: () => (this.error = 'Could not update voting end date.'),
    });
  }

  downloadExcel() {
    if (!this.token) return;
    this.api.downloadExcel(this.token).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `abg-fan-cup-votes-${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => (this.error = 'Excel download failed.'),
    });
  }

  addUniversity() {
    if (!this.token || !this.newUniName.trim()) return;
    this.error = '';
    this.success = '';
    this.api.createUniversity(this.token, this.newUniName.trim()).subscribe({
      next: () => {
        this.newUniName = '';
        this.success = 'University added.';
        this.loadSummary();
      },
      error: (err) => {
        this.error = this.formatHttpError(
          err,
          'Could not add university. Name may already exist.',
        );
      },
    });
  }

  startEdit(id: number, name: string) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      this.error = 'Invalid university id. Refresh and try again.';
      return;
    }
    this.editingId = numericId;
    this.editingName = name;
    this.error = '';
    this.success = '';
  }

  cancelEdit() {
    this.editingId = null;
    this.editingName = '';
  }

  saveEdit() {
    const token = this.token || this.adminSession.getToken();
    const id = Number(this.editingId);
    const name = (this.editingName || '').trim();
    if (!token || !Number.isFinite(id) || id <= 0 || !name) {
      this.error = 'Invalid edit state. Click Rename again, then Save.';
      return;
    }
    this.token = token;
    this.error = '';
    this.success = '';
    this.api.renameUniversity(token, id, name).subscribe({
      next: () => {
        this.success = 'University renamed.';
        this.cancelEdit();
        this.loadSummary();
      },
      error: (err) => {
        this.error = this.formatHttpError(err, 'Could not rename university.');
      },
    });
  }

  private formatHttpError(err: any, fallback: string): string {
    const raw = err?.error?.message;
    if (Array.isArray(raw)) return raw.filter(Boolean).join(' ') || fallback;
    if (typeof raw === 'string' && raw.trim()) return raw;
    if (typeof err?.message === 'string' && err.message.trim()) {
      const status = err?.status;
      return status ? `${err.message} (${status})` : err.message;
    }
    return fallback;
  }

  deleteUniversity(id: number, name: string, votes: number) {
    if (!this.token) return;
    if (votes > 0) {
      this.error = `"${name}" has votes and cannot be deleted.`;
      return;
    }
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    this.error = '';
    this.success = '';
    this.api.deleteUniversity(this.token, id).subscribe({
      next: () => {
        this.success = 'University deleted.';
        this.loadSummary();
      },
      error: (err) => {
        this.error = this.formatHttpError(err, 'Could not delete university.');
      },
    });
  }

  private toLocalInput(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
