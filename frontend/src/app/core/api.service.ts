import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

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
};

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  getUniversities(): Observable<University[]> {
    return this.http.get<University[]>(`${this.base}/api/universities`);
  }

  getResults(): Observable<ResultsPayload> {
    return this.http.get<ResultsPayload>(`${this.base}/api/results`);
  }

  castVote(universityId: number, googleIdToken: string) {
    return this.http.post<{
      ok: boolean;
      universityName: string;
      message: string;
    }>(`${this.base}/api/votes`, { universityId, googleIdToken });
  }

  voteStatus(googleIdToken: string) {
    return this.http.post<
      | { voted: false }
      | { voted: true; universityId: number; universityName: string }
    >(`${this.base}/api/votes/status`, { googleIdToken });
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