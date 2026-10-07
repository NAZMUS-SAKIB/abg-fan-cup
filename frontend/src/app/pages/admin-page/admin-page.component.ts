import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, ResultsPayload } from '../../core/api.service';

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-page.component.html',
  styleUrl: './admin-page.component.scss',
})
export class AdminPageComponent {
  username = 'admin';
  password = '';
  token: string | null = localStorage.getItem('abg_admin_token');
  summary: ResultsPayload | null = null;
  error = '';
  success = '';
  loading = false;
  endLocal = '';
  newUniName = '';
  editingId: number | null = null;
  editingName = '';

  constructor(private readonly api: ApiService) {
    if (this.token) this.loadSummary();
  }

  login() {
    this.loading = true;
    this.error = '';
    this.api.adminLogin(this.username.trim(), this.password).subscribe({
      next: (res) => {
        this.token = res.accessToken;
        localStorage.setItem('abg_admin_token', res.accessToken);
        this.password = '';
        this.loading = false;
        this.loadSummary();
      },
      error: () => {
        this.loading = false;
        this.error = 'Invalid username or password.';
      },
    });
  }

  logout() {
    this.token = null;
    this.summary = null;
    this.endLocal = '';
    this.cancelEdit();
    localStorage.removeItem('abg_admin_token');
  }

  loadSummary() {
    if (!this.token) return;
    this.api.adminSummary(this.token).subscribe({
      next: (data) => {
        this.summary = data;
        this.endLocal = this.toLocalInput(data.votingEndsAt);
      },
      error: () => {
        this.error = 'Session expired. Please login again.';
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
        this.error =
          err.error?.message || 'Could not add university. Name may already exist.';
      },
    });
  }

  startEdit(id: number, name: string) {
    this.editingId = id;
    this.editingName = name;
    this.error = '';
    this.success = '';
  }

  cancelEdit() {
    this.editingId = null;
    this.editingName = '';
  }

  saveEdit() {
    if (!this.token || this.editingId === null || !this.editingName.trim()) return;
    this.error = '';
    this.success = '';
    this.api
      .renameUniversity(this.token, this.editingId, this.editingName.trim())
      .subscribe({
        next: () => {
          this.success = 'University renamed.';
          this.cancelEdit();
          this.loadSummary();
        },
        error: (err) => {
          this.error =
            err.error?.message || 'Could not rename university.';
        },
      });
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
        this.error =
          err.error?.message || 'Could not delete university.';
      },
    });
  }

  private toLocalInput(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
