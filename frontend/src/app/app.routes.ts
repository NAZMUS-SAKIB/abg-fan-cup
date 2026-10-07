import { Routes } from '@angular/router';
import { VotePageComponent } from './pages/vote-page/vote-page.component';
import { AdminPageComponent } from './pages/admin-page/admin-page.component';

export const routes: Routes = [
  { path: '', component: VotePageComponent },
  { path: 'admin', component: AdminPageComponent },
  { path: '**', redirectTo: '' },
];
