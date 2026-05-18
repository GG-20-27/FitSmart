import { apiRequest } from './client';

export interface Team {
  id: number;
  name: string;
  sport: string;
  joinCode: string;
  coachToken: string;
  phase: 'assessment' | 'competing';
  weekStart: string | null;
  createdBy: string;
  createdAt: string;
}

export interface TeamMember {
  id: number;
  teamId: number;
  userId: string;
  role: 'owner' | 'coach' | 'member';
  groupName: string | null;
  joinedAt: string;
  displayName: string | null;
  email: string;
}

export interface AssessmentProgress {
  userId: string;
  displayName: string;
  daysLogged: number;
}

export interface AssessmentResponse {
  phase: 'assessment';
  daysRemaining: number;
  weekStart: string;
  progress: AssessmentProgress[];
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  weekAvg: number;
  daysLogged: number;
  cheatUsed: boolean;
  cheatDate: string | null;
  isYou: boolean;
  rank: number;
}

export interface CompetingResponse {
  phase: 'competing';
  groupName: string | null;
  weekStart: string;
  leaderboard: LeaderboardEntry[];
}

export type LeaderboardResponse = AssessmentResponse | CompetingResponse;

export async function createTeam(name: string, sport: string): Promise<{ team: Team; joinCode: string; coachToken: string }> {
  return apiRequest('/api/teams/create', {
    method: 'POST',
    body: JSON.stringify({ name, sport }),
  });
}

export async function joinTeam(joinCode: string): Promise<{ team: Team; member: TeamMember }> {
  return apiRequest('/api/teams/join', {
    method: 'POST',
    body: JSON.stringify({ joinCode }),
  });
}

export async function getMyTeam(): Promise<{ team: Team | null; member: TeamMember | null }> {
  return apiRequest('/api/teams/my-team');
}

export async function getLeaderboard(teamId: number): Promise<LeaderboardResponse> {
  return apiRequest(`/api/teams/${teamId}/leaderboard`);
}

export async function leaveTeam(): Promise<{ ok: boolean }> {
  return apiRequest('/api/teams/leave', { method: 'DELETE' });
}

export interface TeamTrainingPlan {
  id: number;
  teamId: number;
  planDate: string;
  sessionTitle: string;
  type: string;
  durationMinutes: number | null;
  intensity: string | null;
  description: string | null;
  coachNotes: string | null;
  createdAt: string;
}

export async function getTodayTeamTrainingPlan(): Promise<TeamTrainingPlan | null> {
  const data = await apiRequest<{ session: TeamTrainingPlan | null }>('/api/teams/training-plan/today');
  return data.session;
}

export async function getWeekTeamTrainingPlan(date?: string): Promise<{ sessions: TeamTrainingPlan[]; weekStart: string }> {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiRequest(`/api/teams/training-plan/week${query}`);
}
