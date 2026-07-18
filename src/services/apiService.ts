import { GolfEvent } from '../types/event';

// Production API URL - always use this for built apps
const API_URL = 'https://api.myclubgolf.com/api';

/**
 * Search events by name or course name via the API server
 */
export const searchEvents = async (query: string): Promise<GolfEvent[]> => {
  try {
    const url = query.trim() ? `${API_URL}/events?q=${encodeURIComponent(query)}` : `${API_URL}/events`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch events');
    const data = await response.json() as GolfEvent[] | { value: GolfEvent[] };
    return (Array.isArray(data) ? data : (data.value || [])) as GolfEvent[];
  } catch (error) {
    console.error('Error fetching events:', error);
    return [];
  }
};

/**
 * Get a single event by ID via the API server
 */
export const getEventById = async (id: number): Promise<GolfEvent | undefined> => {
  try {
    const response = await fetch(`${API_URL}/events/${id}`);
    if (!response.ok) return undefined;
    return (await response.json()) as GolfEvent;
  } catch (error) {
    console.error('Error fetching event:', error);
    return undefined;
  }
};

export interface Course {
  id: number;
  name: string;
}

export interface Player {
  id: number;
  lastName: string;
  firstName: string;
  displayName: string;
}

/**
 * Get all courses from the database via the API server
 */
export const getCourseList = async (): Promise<Course[]> => {
  try {
    const response = await fetch(`${API_URL}/courses`);
    if (!response.ok) return [];
    const data = await response.json();
    return (Array.isArray(data) ? data : []) as Course[];
  } catch (error) {
    console.error('Error fetching courses:', error);
    return [];
  }
};

/**
 * Get players registered for an event via the API server
 */
export const getEventPlayers = async (eventId: number): Promise<Player[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/players`);
    if (!response.ok) return [];
    const rows = (await response.json()) as any[];
    // Build display names matching PHP logic: "LastName, FirstName" or just "FirstName"
    return rows.map((r: any) => ({
      id: r.id,
      lastName: r.LastName?.trim() || '',
      firstName: r.FirstName?.trim() || '',
      displayName: (r.LastName && r.LastName.trim()) ? `${r.LastName.trim()}, ${r.FirstName.trim()}` : r.FirstName?.trim() || `Player #${r.id}`,
    })).filter((p: { displayName: string }) => p.displayName && p.displayName !== '' && p.displayName !== ', ');
  } catch (error) {
    console.error('Error fetching event players:', error);
    return [];
  }
};

/**
 * Get latest handicap for a player via the API server
 */
export const getPlayerHandicap = async (playerId: number): Promise<string> => {
  try {
    const response = await fetch(`${API_URL}/players/${playerId}/handicap`);
    if (!response.ok) return '';
    const data = (await response.json()) as any;
    return String(data.handicap ?? '');
  } catch (error) {
    console.error('Error fetching handicap:', error);
    return '';
  }
};

/**
 * Get all courses via the API server
 */
export const getCourses = async (): Promise<Course[]> => {
  try {
    const response = await fetch(`${API_URL}/courses`);
    if (!response.ok) return [];
    return (await response.json()) as Course[];
  } catch (error) {
    console.error('Error fetching courses:', error);
    return [];
  }
};

/**
 * Tee time row from the database
 */
export interface TeeTimeRow {
  TeeDate: string;
  Time1: string;
  Time2: string;
  Time3: string;
  Time4: string;
  Time5: string;
}

/**
 * Player status for a tee date
 */
export interface PlayerStatus {
  LastName: string;
  FirstName: string;
  Status: 'I' | 'E' | 'L' | 'X' | 'O';
}

/**
 * Get tee times for an event via the API server
 */
export const getTeeTimes = async (eventId: number): Promise<TeeTimeRow[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/teetimes`);
    if (!response.ok) return [];
    return (await response.json()) as TeeTimeRow[];
  } catch (error) {
    console.error('Error fetching tee times:', error);
    return [];
  }
};

/**
 * Get player status for a specific date via the API server
 */
export const getPlayerStatus = async (eventId: number, teeDate: string): Promise<PlayerStatus[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/status?teeDate=${encodeURIComponent(teeDate)}`);
    if (!response.ok) return [];
    return (await response.json()) as PlayerStatus[];
  } catch (error) {
    console.error('Error fetching player status:', error);
    return [];
  }
};

/**
 * Save player In/Out status via the API server
 */
export const savePlayerStatus = async (
  eventId: number,
  playerId: number,
  teeDate: string,
  status: 'I' | 'E' | 'L' | 'X' | 'O'
): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, teeDate, status }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error saving player status:', error);
    return false;
  }
};

/**
 * Create a new event via the API server
 */
export const createEvent = async (event: Omit<GolfEvent, 'id'>): Promise<GolfEvent | null> => {
  try {
    const response = await fetch(`${API_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!response.ok) throw new Error('Failed to create event');
    return (await response.json()) as GolfEvent;
  } catch (error) {
    console.error('Error creating event:', error);
    return null;
  }
};

/**
 * Latest game info for an event
 */
export interface LatestGameInfo {
  gameId: number;
  courseName: string;
  gameDate: string;
}

/**
 * Leaderboard row
 */
export interface LeaderboardRow {
  name: string;
  thru: number;
  score: string; // "Even", "+3", "-2"
}

/**
 * Get the latest game for an event via the API server
 */
export const getLatestGame = async (eventId: number): Promise<LatestGameInfo | undefined> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/latest-game`);
    if (!response.ok) return undefined;
    return (await response.json()) as LatestGameInfo;
  } catch (error) {
    console.error('Error fetching latest game:', error);
    return undefined;
  }
};

/**
 * Get leaderboard data for a game via the API server
 */
export const getLeaderboard = async (gameId: number, scoreType: 'G' | 'N'): Promise<LeaderboardRow[]> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/leaderboard?scoreType=${scoreType}`);
    if (!response.ok) return [];
    return (await response.json()) as LeaderboardRow[];
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }
};
