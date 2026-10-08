import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { VoterSessionService } from './voter-session.service';

export type University = { id: number; name: string };

export type ResultsPayload = {
  totalVotes: number;
  updatedAt: string;
  votingEndsAt: string;
  votingOpen: boolean;
  universities: Array<{
    id: number;
    name: string;
    votes: number;
    percent: number;
  }>;
  dailyVotes: Array<{ date: string; votes: number }>;
  periodStats?: Array<{
    key: '24h' | '7d' | '15d';
    label: string;
    totalVotes: number;
    leaderName: string | null;
    leaderVotes: number;
  }>;
};

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = environment.apiUrl;

  constructor(
    private readonly http: HttpClient,
    private readonly session: VoterSessionService,
  ) {}

  private voterHeaders(): HttpHeaders {
    const token = this.session.getToken();
    return new HttpHeaders(
      token ? { Authorization: `Bearer ${token}` } : {},
    );
  }

  getUniversities(): Observable<University[]> {
    return this.http.get<University[]>(`${this.base}/api/universities`);
  }

  getResults(): Observable<ResultsPayload> {
    return this.http.get<ResultsPayload>(`${this.base}/api/results`);
  }

  requestMagicLink(email: string, turnstileToken?: string) {
    return this.http.post<{
      ok: boolean;
      message: string;
      emailMasked: string;
      alreadyVoted: boolean;
      expiresInSeconds: number;
      mailDelivered?: boolean;
      magicUrlDev?: string;
      devHint?: string;
    }>(`${this.base}/api/auth/request-link`, {
      email,
      turnstileToken: turnstileToken || undefined,
    });
  }

  consumeMagicLink(token: string) {
    return this.http.post<{
      ok: boolean;
      accessToken: string;
      email: string;
      emailMasked: string;
      voted: boolean;
      universityId: number | null;
      universityName: string | null;
    }>(`${this.base}/api/auth/consume-link`, { token });
  }

  castVote(universityId: number) {
    return this.http.post<{
      ok: boolean;
      universityName: string;
      message: string;
    }>(
      `${this.base}/api/votes`,
      { universityId },
      { headers: this.voterHeaders() },
    );
  }

  voteStatus() {
    return this.http.get<
      | { voted: false; email: string }
      | {
          voted: true;
          email: string;
          universityId: number;
          universityName: string;
        }
    >(`${this.base}/api/votes/status`, { headers: this.voterHeaders() });
  }

  adminLogin(username: string, password: string) {
    return this.http.post<{ accessToken: string; username: string }>(
      `${this.base}/api/admin/login`,
      { username, password },
    );
  }

  adminSummary(token: string) {
    return this.http.get<ResultsPayload>(`${this.base}/api/admin/summary`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
    });
  }

  updateVotingEnd(token: string, votingEndsAt: string) {
    return this.http.patch<{ votingEndsAt: string; votingOpen: boolean }>(
      `${this.base}/api/admin/voting-end`,
      { votingEndsAt },
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) },
    );
  }

  downloadExcel(token: string): Observable<Blob> {
    return this.http.get(`${this.base}/api/admin/export.xlsx`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
      responseType: 'blob',
    });
  }

  createUniversity(token: string, name: string) {
    return this.http.post<University>(
      `${this.base}/api/admin/universities`,
      { name },
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) },
    );
  }

  renameUniversity(token: string, id: number, name: string) {
    return this.http.patch<University>(
      `${this.base}/api/admin/universities/${id}`,
      { name },
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) },
    );
  }

  deleteUniversity(token: string, id: number) {
    return this.http.delete<{ ok: boolean }>(
      `${this.base}/api/admin/universities/${id}`,
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) },
    );
  }
}
