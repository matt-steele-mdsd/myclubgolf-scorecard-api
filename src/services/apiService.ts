import { GolfEvent } from '../types/event';

// Production API URL - always use this for built apps. EXPO_PUBLIC_API_URL (inlined at build
// time by Expo, per https://docs.expo.dev/versions/v56.0.0/guides/environment-variables/) lets
// local dev/E2E runs point at a local backend instead, without ever touching this default —
// unset, behavior is identical to before.
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.myclubgolf.com/api';

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

/** Search every event including hidden/master ones — Master Tools only */
export const searchAllEventsForMaster = async (query: string): Promise<GolfEvent[]> => {
  try {
    const url = query.trim() ? `${API_URL}/master-events?q=${encodeURIComponent(query)}` : `${API_URL}/master-events`;
    const response = await fetch(url);
    if (!response.ok) return [];
    return (await response.json()) as GolfEvent[];
  } catch (error) {
    console.error('Error searching all events:', error);
    return [];
  }
};

export interface EventWithCounts {
  id: number;
  eventName: string;
  courseName: string;
  linkedPlayers: number;
  scoreCount: number;
  isMasterEvent: boolean;
}

/** Get every event with linked-player/score counts via the API server — Master Tools -> Manage Events. */
export const getAllEventsWithCounts = async (): Promise<EventWithCounts[]> => {
  try {
    const response = await fetch(`${API_URL}/events/all-with-counts`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as EventWithCounts[];
  } catch (error) {
    console.error('Error fetching events with counts:', error);
    return [];
  }
};

/** Permanently delete an event and every row of data it owns via the API server. */
export const deleteEvent = async (eventId: number): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}`, { method: 'DELETE' });
    return response.ok;
  } catch (error) {
    console.error('Error deleting event:', error);
    return false;
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

/** Rename an event's display name (Admin hub's pencil-edit). */
export const renameEvent = async (eventId: number, eventName: string): Promise<{ ok: true } | { ok: false; error: string }> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName }),
    });
    if (response.ok) return { ok: true };
    const data = (await response.json()) as { error?: string };
    return { ok: false, error: data.error ?? 'Failed to rename event.' };
  } catch (error) {
    console.error('Error renaming event:', error);
    return { ok: false, error: 'Failed to rename event.' };
  }
};

/** Rename an event's default course label (Admin hub's pencil-edit). */
export const renameEventCourse = async (eventId: number, courseName: string): Promise<{ ok: true } | { ok: false; error: string }> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseName }),
    });
    if (response.ok) return { ok: true };
    const data = (await response.json()) as { error?: string };
    return { ok: false, error: data.error ?? 'Failed to rename course.' };
  } catch (error) {
    console.error('Error renaming event course:', error);
    return { ok: false, error: 'Failed to rename course.' };
  }
};

export interface Course {
  id: number;
  name: string;
}

/** GHIN's own identifying info for a course, attached when it was found via GHIN search rather
 * than scanned/entered manually. */
export interface GhinInfo {
  city?: string | null;
  state?: string | null;
  ghinClubName?: string | null;
  ghinCourseId: number | string;
}

export interface GhinTeeHole {
  holeNum: number;
  par: number;
  hdcp: number;
  yards: number;
}

export interface GhinTeeSet {
  teeSetId: number;
  teeName: string;
  gender: string;
  courseRating: number | null;
  slopeRating: number | null;
  totalPar: number;
  totalYardage: number;
  holes: GhinTeeHole[];
}

/** One hole's par/handicap/yardage, as saved for a new course (from GHIN search or manual entry). */
export interface CourseHoleInput {
  holeNum: number;
  par: number;
  hdcp: number;
  yards?: number;
}

/**
 * Create a new course with its hole-by-hole par/handicap/yardage layout via the API server.
 * `ghinInfo`/`ghinTeeSets` are only passed when the course came from GHIN's "Search GHIN Course
 * Database" flow — `ghinTeeSets` caches every tee GHIN has on file (not just the one used for
 * `holes`) so Start Game's tee picker doesn't need a second live GHIN fetch.
 */
export const createCourse = async (
  courseName: string,
  holes: CourseHoleInput[],
  ghinInfo?: GhinInfo,
  ghinTeeSets?: GhinTeeSet[]
): Promise<number | null> => {
  try {
    const response = await fetch(`${API_URL}/courses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseName, holes, ghinInfo, ghinTeeSets }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { id: number };
    return data.id;
  } catch (error) {
    console.error('Error creating course:', error);
    return null;
  }
};

/** One course match from a GHIN course-database (CRDB) name search. */
export interface GhinCourseSearchResult {
  courseId: number;
  courseName: string;
  facilityName: string;
  city: string | null;
  state: string | null;
}

/**
 * Search GHIN's own course database by name, optionally narrowed to a 2-letter state — powers
 * Add Course's "Search GHIN Course Database" flow, so par/handicap/yardage come from GHIN's own
 * numbers instead of an OCR scan or manual entry.
 */
export const searchGhinCourses = async (name: string, state: string): Promise<GhinCourseSearchResult[]> => {
  try {
    const params = new URLSearchParams({ name });
    if (state) params.set('state', state);
    const response = await fetch(`${API_URL}/ghin/course-search?${params.toString()}`);
    if (!response.ok) return [];
    const data = await response.json();
    return (Array.isArray(data) ? data : []) as GhinCourseSearchResult[];
  } catch (error) {
    console.error('Error searching GHIN courses:', error);
    return [];
  }
};

/** Full tee-set detail for one GHIN course search result. */
export interface GhinCourseDetail {
  courseId: number;
  courseName: string;
  facilityName: string;
  city: string | null;
  state: string | null;
  teeSets: GhinTeeSet[];
}

/** Fetch a GHIN course search result's full tee-set detail (par/handicap/yardage per tee). */
export const getGhinCourseDetail = async (courseId: number): Promise<GhinCourseDetail | null> => {
  try {
    const response = await fetch(`${API_URL}/ghin/course-detail?courseId=${courseId}`);
    if (!response.ok) return null;
    return (await response.json()) as GhinCourseDetail;
  } catch (error) {
    console.error('Error fetching GHIN course detail:', error);
    return null;
  }
};

export interface Player {
  id: number;
  lastName: string;
  firstName: string;
  displayName: string;
  /** Which stroke-index ranking applies to this player's own net-score strokes -- see
   * gameService.ts's hdcpForPlayer. Defaults 'M' for a guest (no real Player row on file). */
  gender: 'M' | 'F';
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

// Build display names matching PHP logic: "LastName, FirstName" or just "FirstName" -- shared by
// getEventPlayers and getTeeTimesPlayers below, same raw row shape from either endpoint.
function mapPlayerRows(rows: any[]): Player[] {
  return rows.map((r: any) => ({
    id: r.id,
    lastName: r.LastName?.trim() || '',
    firstName: r.FirstName?.trim() || '',
    displayName: (r.LastName && r.LastName.trim()) ? `${r.LastName.trim()}, ${r.FirstName.trim()}` : r.FirstName?.trim() || `Player #${r.id}`,
    gender: (r.Gender === 'F' ? 'F' : 'M') as 'M' | 'F',
  })).filter((p: { displayName: string }) => p.displayName && p.displayName !== '' && p.displayName !== ', ');
}

/**
 * Get players registered for an event via the API server
 */
export const getEventPlayers = async (eventId: number): Promise<Player[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/players`);
    if (!response.ok) return [];
    return mapPlayerRows((await response.json()) as any[]);
  } catch (error) {
    console.error('Error fetching event players:', error);
    return [];
  }
};

/**
 * Get players eligible to sign up on Tee Times -- this event's own roster, plus a linked event's
 * roster too if Link Tee Times is on. Deliberately separate from getEventPlayers (used by Start
 * Game, UPS Cup, etc.) -- a linked event's players should be selectable for tee-time sign-up, but
 * NOT show up as scoring-eligible in the wrong event.
 */
export const getTeeTimesPlayers = async (eventId: number): Promise<Player[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/teetimes-players`);
    if (!response.ok) return [];
    return mapPlayerRows((await response.json()) as any[]);
  } catch (error) {
    console.error('Error fetching tee times players:', error);
    return [];
  }
};

/**
 * Add a player to an event via the API server (mirrors addplayer.php, minus Handicap)
 */
export const addPlayer = async (
  eventId: number,
  player: { firstName: string; lastName: string; email: string; phone: string }
): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(player),
    });
    return response.ok;
  } catch (error) {
    console.error('Error adding player:', error);
    return false;
  }
};

export interface GuestAssignment {
  id: number;
  displayName: string;
}

/**
 * Assign a guest player for a round (Start Game -> + Add Guest) — reuses an existing "Guest N"
 * at this course not already in today's game (or in `excludePlayerIds`, the other slots already
 * picked in this same foursome), only minting a new one if every existing slot is taken.
 */
export const assignGuestPlayer = async (
  eventId: number,
  courseId: number,
  excludePlayerIds: number[]
): Promise<GuestAssignment | null> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/assign-guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, excludePlayerIds }),
    });
    if (!response.ok) return null;
    return (await response.json()) as GuestAssignment;
  } catch (error) {
    console.error('Error assigning guest player:', error);
    return null;
  }
};

/**
 * A player eligible to be linked to an event
 */
export interface UnlinkedPlayer {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
}

/**
 * Get players not yet linked to an event via the API server (mirrors linkplayers.php)
 */
export const getUnlinkedPlayers = async (eventId: number): Promise<UnlinkedPlayer[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/unlinked-players`);
    if (!response.ok) return [];
    return (await response.json()) as UnlinkedPlayer[];
  } catch (error) {
    console.error('Error fetching unlinked players:', error);
    return [];
  }
};

/**
 * Link a batch of existing players to an event via the API server (mirrors savelinked.php)
 */
export const linkPlayers = async (eventId: number, playerIds: number[]): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/link-players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerIds }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error linking players:', error);
    return false;
  }
};

/**
 * A player linked to an event, with contact info
 */
export interface EventPlayerContact {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

/**
 * Get players linked to an event, with contact info, via the API server (mirrors playerlist.php)
 */
export const getPlayerListForEvent = async (eventId: number): Promise<EventPlayerContact[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/player-list`);
    if (!response.ok) return [];
    return (await response.json()) as EventPlayerContact[];
  } catch (error) {
    console.error('Error fetching player list:', error);
    return [];
  }
};

/** Rename a player (Admin -> Player List's pencil-edit) — keeps the same PlayerID, so scores
 * and history stay linked; rejected if the new name collides with any other player. */
export const renamePlayer = async (
  playerId: number, firstName: string, lastName: string
): Promise<{ ok: true } | { ok: false; error: string }> => {
  try {
    const response = await fetch(`${API_URL}/players/${playerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName }),
    });
    if (response.ok) return { ok: true };
    const data = (await response.json()) as { error?: string };
    return { ok: false, error: data.error ?? 'Failed to rename player.' };
  } catch (error) {
    console.error('Error renaming player:', error);
    return { ok: false, error: 'Failed to rename player.' };
  }
};

/** One player match from a global (all-events) player search — Master Tools -> Merge Players */
export interface PlayerSearchRow {
  playerId: number;
  name: string;
  course: string;
  ghin: number | null;
  events: string;
}

/** Search every player in the system by name, not scoped to one event's roster */
export const searchAllPlayers = async (query: string): Promise<PlayerSearchRow[]> => {
  try {
    const response = await fetch(`${API_URL}/players/search?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as PlayerSearchRow[];
  } catch (error) {
    console.error('Error searching players:', error);
    return [];
  }
};

/** Search players within one event's roster — Admin -> Players -> Swap Players' "Correct
 * Player" picker, unlike Merge Players' system-wide search */
export const searchPlayersInEvent = async (eventId: number, query: string): Promise<PlayerSearchRow[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/players/search?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as PlayerSearchRow[];
  } catch (error) {
    console.error('Error searching players in event:', error);
    return [];
  }
};

export interface MergePreviewRow {
  table: string;
  duplicateCount: number;
  targetCount: number;
}

export interface MergePreview {
  duplicate: PlayerSearchRow | null;
  target: PlayerSearchRow | null;
  rows: MergePreviewRow[];
}

/** Preview a player merge's affected row counts before committing to it */
export const getMergePreview = async (duplicateId: number, targetId: number): Promise<MergePreview | null> => {
  try {
    const response = await fetch(`${API_URL}/players/merge-preview?duplicateId=${duplicateId}&targetId=${targetId}`);
    if (!response.ok) return null;
    return (await response.json()) as MergePreview;
  } catch (error) {
    console.error('Error previewing player merge:', error);
    return null;
  }
};

/** Merge a duplicate player into the correct player, moving all their data over */
export const mergePlayers = async (duplicateId: number, targetId: number): Promise<{ ok: true } | { ok: false; error: string }> => {
  try {
    const response = await fetch(`${API_URL}/players/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duplicateId, targetId }),
    });
    const data = (await response.json()) as { success?: boolean; error?: string };
    if (response.ok) return { ok: true };
    return { ok: false, error: data.error ?? 'Failed to merge players.' };
  } catch (error) {
    console.error('Error merging players:', error);
    return { ok: false, error: 'Failed to merge players.' };
  }
};

/** A likely duplicate-identity pair — Master Tools -> Find Players to Merge */
export interface MergeSuggestion {
  key: string;
  player1Id: number;
  player1Name: string;
  player1Meta: string;
  player2Id: number;
  player2Name: string;
  player2Meta: string;
  reason: string;
}

/** Scan every player for likely duplicate identities via the API server. */
export const getMergeSuggestions = async (): Promise<MergeSuggestion[]> => {
  try {
    const response = await fetch(`${API_URL}/merge-suggestions`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as MergeSuggestion[];
  } catch (error) {
    console.error('Error fetching merge suggestions:', error);
    return [];
  }
};

/** Mark a suggested pair as reviewed and not the same person via the API server. */
export const ignoreMergeSuggestion = async (playerId1: number, playerId2: number): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/merge-suggestions/ignore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId1, playerId2 }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error ignoring merge suggestion:', error);
    return false;
  }
};

/** A player with no EventPlayers link at all — Master Tools -> Cleanup Data special case */
export interface OrphanedPlayerCandidate {
  key: string;
  playerId: number;
  description: string;
  reason: string;
}

/** Every player not linked to any event */
export const getOrphanedPlayers = async (): Promise<OrphanedPlayerCandidate[]> => {
  try {
    const response = await fetch(`${API_URL}/players/orphaned`);
    if (!response.ok) return [];
    return (await response.json()) as OrphanedPlayerCandidate[];
  } catch (error) {
    console.error('Error fetching orphaned players:', error);
    return [];
  }
};

/** Every player with an invalid name — the first check is blank first+last name */
export const getInvalidNamePlayers = async (): Promise<OrphanedPlayerCandidate[]> => {
  try {
    const response = await fetch(`${API_URL}/players/invalid-names`);
    if (!response.ok) return [];
    return (await response.json()) as OrphanedPlayerCandidate[];
  } catch (error) {
    console.error('Error fetching invalid-name players:', error);
    return [];
  }
};

/** Delete orphaned players entirely, including any leftover data they still have */
export const deleteOrphanedPlayers = async (playerIds: number[]): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/players/orphaned/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerIds }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error deleting orphaned players:', error);
    return false;
  }
};

/** An EventID still referenced by EventPlayers/EventOptions/etc. but with no Events row */
export interface OrphanedEventLinkCandidate {
  key: string;
  eventId: number;
  description: string;
  reason: string;
}

/** Every phantom EventID still referenced somewhere but with no Events row */
export const getOrphanedEventLinks = async (): Promise<OrphanedEventLinkCandidate[]> => {
  try {
    const response = await fetch(`${API_URL}/events/orphaned`);
    if (!response.ok) return [];
    return (await response.json()) as OrphanedEventLinkCandidate[];
  } catch (error) {
    console.error('Error fetching orphaned event links:', error);
    return [];
  }
};

/** Delete the leftover EventPlayers/EventOptions/EventCalendar/TeeTimes rows for phantom EventIDs */
export const deleteOrphanedEventLinks = async (eventIds: number[]): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/orphaned/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventIds }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error deleting orphaned event links:', error);
    return false;
  }
};

/** One FK-shaped relationship in the schema (e.g. "Score.GameID") with at least one dangling row. */
export interface OrphanRowCandidate {
  key: string;
  description: string;
  reason: string;
}

/** Scan every known relationship in the schema for dangling rows via the API server. */
export const getOrphanedRows = async (): Promise<OrphanRowCandidate[]> => {
  try {
    const response = await fetch(`${API_URL}/orphaned-rows`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as OrphanRowCandidate[];
  } catch (error) {
    console.error('Error fetching orphaned rows:', error);
    return [];
  }
};

/** Delete every dangling row for the selected relationships via the API server. */
export const deleteOrphanedRows = async (keys: string[]): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/orphaned-rows/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error deleting orphaned rows:', error);
    return false;
  }
};

/** A Game row with zero Score rows — abandoned before anyone entered a score */
export interface EmptyGameCandidate {
  key: string;
  gameId: number;
  description: string;
  reason: string;
}

/** Every game with zero Score rows, across every event */
export const getEmptyGames = async (): Promise<EmptyGameCandidate[]> => {
  try {
    const response = await fetch(`${API_URL}/games/orphaned`);
    if (!response.ok) return [];
    return (await response.json()) as EmptyGameCandidate[];
  } catch (error) {
    console.error('Error fetching empty games:', error);
    return [];
  }
};

/** Delete empty games entirely */
export const deleteEmptyGames = async (gameIds: number[]): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/games/orphaned/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameIds }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error deleting empty games:', error);
    return false;
  }
};

/** A player who has ever recorded a score anywhere — mirrors phistory.php's player list */
export interface HistoryPlayer {
  id: number;
  lastName: string;
  firstName: string;
}

/**
 * Get every player who has ever recorded a score, across all events, via the API server
 */
export const getAllPlayersWithHistory = async (): Promise<HistoryPlayer[]> => {
  try {
    const response = await fetch(`${API_URL}/players/history-list`);
    if (!response.ok) return [];
    return (await response.json()) as HistoryPlayer[];
  } catch (error) {
    console.error('Error fetching player history list:', error);
    return [];
  }
};

/** A player's all-time gross/net stats across every full 18-hole round they've played */
export interface PlayerStats {
  avgScore: string;
  minScore: number;
  maxScore: number;
  avgNet: string;
  minNet: number;
  maxNet: number;
}

/**
 * Get a player's all-time gross/net average/min/max via the API server
 */
export const getPlayerStats = async (playerId: number): Promise<PlayerStats | null> => {
  try {
    const response = await fetch(`${API_URL}/players/${playerId}/stats`);
    if (!response.ok) return null;
    return (await response.json()) as PlayerStats | null;
  } catch (error) {
    console.error('Error fetching player stats:', error);
    return null;
  }
};

/** One full 18-hole round in a player's recent history */
export interface PlayerRound {
  gameId: number;
  gameDate: string;
  score: number;
  net: number;
}

/**
 * Get a player's 20 most recent full 18-hole rounds via the API server
 */
export const getPlayerRounds = async (playerId: number): Promise<PlayerRound[]> => {
  try {
    const response = await fetch(`${API_URL}/players/${playerId}/rounds`);
    if (!response.ok) return [];
    return (await response.json()) as PlayerRound[];
  } catch (error) {
    console.error('Error fetching player rounds:', error);
    return [];
  }
};

/** A player's all-time skins totals */
export interface PlayerSkinsStats {
  totalValidated: number;
  totalUnvalidated: number;
}

/**
 * Get a player's all-time validated/unvalidated skins counts via the API server
 */
export const getPlayerSkinsStats = async (playerId: number): Promise<PlayerSkinsStats> => {
  try {
    const response = await fetch(`${API_URL}/players/${playerId}/skins-stats`);
    if (!response.ok) return { totalValidated: 0, totalUnvalidated: 0 };
    return (await response.json()) as PlayerSkinsStats;
  } catch (error) {
    console.error('Error fetching player skins stats:', error);
    return { totalValidated: 0, totalUnvalidated: 0 };
  }
};

/** One skin a player won (or narrowly missed validating) */
export interface PlayerSkinRound {
  gameId: number;
  gameDate: string;
  holeId: number;
  validated: boolean;
}

/**
 * Get a player's 20 most recent skins via the API server
 */
export const getPlayerRecentSkins = async (playerId: number): Promise<PlayerSkinRound[]> => {
  try {
    const response = await fetch(`${API_URL}/players/${playerId}/recent-skins`);
    if (!response.ok) return [];
    return (await response.json()) as PlayerSkinRound[];
  } catch (error) {
    console.error('Error fetching player recent skins:', error);
    return [];
  }
};

/**
 * Get latest handicap for a player via the API server
 */
export const getPlayerHandicap = async (playerId: number): Promise<string> => {
  try {
    // no-store: this is live data (their handicap can change between games) and repeat lookups
    // of the same URL in one browser session were getting served a 304 Not Modified from the
    // browser's HTTP cache — outside fetch's 200-299 "ok" range, so a perfectly valid response
    // was being treated as a failure (confirmed real case 2026-07-07: worked the first time,
    // silently failed on every repeat click of the same player).
    const response = await fetch(`${API_URL}/players/${playerId}/handicap`, { cache: 'no-store' });
    if (!response.ok) return '';
    const data = (await response.json()) as any;
    return String(data.handicap ?? '');
  } catch (error) {
    console.error('Error fetching handicap:', error);
    return '';
  }
};

/** A player's handicap already saved for THIS specific game -- null if they've never had one
 * saved for this exact round. Used by Start Game to skip the tee/handicap prompt entirely when
 * re-adding someone who already went through it earlier today (resuming after a crash, or being
 * re-picked after Resume Group), instead of re-asking every time. */
export const getGamePlayerHandicap = async (gameId: number, playerId: number): Promise<number | null> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/handicap/${playerId}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as { hdcp: number | null };
    return data.hdcp ?? null;
  } catch (error) {
    console.error('Error fetching game player handicap:', error);
    return null;
  }
};

/** One tee's computed Course Handicap for a player, for Start Game's tee picker */
export interface CourseHandicapOption {
  teeSetId: number;
  teeName: string;
  courseHandicap: number;
}

/** A player's live GHIN index plus every tee option (their gender only), high to low */
export interface CourseHandicapResult {
  index: number;
  options: CourseHandicapOption[];
}

/**
 * Get a GHIN-linked player's live index + Course Handicap per tee via the API server. Returns
 * null if the player has no GHIN on file or this course has no known GHIN course id — caller
 * should fall back to manual handicap entry (getPlayerHandicap) either way.
 */
export const getPlayerCourseHandicaps = async (playerId: number, courseId: number): Promise<CourseHandicapResult | null> => {
  try {
    // no-store: see getPlayerHandicap's comment — same 304-from-browser-cache issue applies here.
    const response = await fetch(`${API_URL}/players/${playerId}/course-handicaps?courseId=${courseId}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as CourseHandicapResult | null;
    return data && data.options ? data : null;
  } catch (error) {
    console.error('Error fetching course handicaps:', error);
    return null;
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

/** One player registered for a tee date, and whether they've paid — Admin -> Paid Tracker. */
export interface PaidTrackerRow {
  playerId: number;
  name: string;
  status: string;
  paid: boolean;
}

/**
 * Get everyone registered for a tee date, with paid status, via the API server.
 */
export const getPaidTrackerList = async (eventId: number, teeDate: string): Promise<PaidTrackerRow[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/paid-tracker?teeDate=${teeDate}`);
    if (!response.ok) return [];
    return (await response.json()) as PaidTrackerRow[];
  } catch (error) {
    console.error('Error fetching paid tracker list:', error);
    return [];
  }
};

/**
 * Mark a player paid/unpaid for a tee date via the API server.
 */
export const setPaidTracker = async (
  eventId: number, teeDate: string, playerId: number, paid: boolean
): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/paid-tracker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, teeDate, paid }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error setting paid tracker status:', error);
    return false;
  }
};

/** One player who paid for a tee date but has since switched to Out — flagged so the admin
 * notices to refund them. See paidTrackerService.ts's getRefundNeededList doc comment. */
export interface RefundNeededRow {
  playerId: number;
  name: string;
}

/** Get everyone marked Out for a tee date who still shows paid, via the API server. */
export const getRefundNeededList = async (eventId: number, teeDate: string): Promise<RefundNeededRow[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/refund-needed?teeDate=${teeDate}`);
    if (!response.ok) return [];
    return (await response.json()) as RefundNeededRow[];
  } catch (error) {
    console.error('Error fetching refund-needed list:', error);
    return [];
  }
};

/** One player registered for a tee date, and whether they've paid for Gross Skins — a separate
 * paid list from the regular Paid Tracker (Admin -> Gross Skins Tracker). */
export interface GrossSkinsPaidRow {
  playerId: number;
  name: string;
  status: string;
  paid: boolean;
}

export interface GrossSkinsTrackerDates {
  dates: string[];
  defaultDate: string | null;
}

/**
 * Date list for Gross Skins Tracker's date picker -- last month through the future (unlike Paid
 * Tracker's future-only date list), with a suggested default sourced from the Setup Calendar's
 * next 'event'/'major' day.
 */
export const getGrossSkinsTrackerDates = async (eventId: number): Promise<GrossSkinsTrackerDates> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/gross-skins-tracker-dates`);
    if (!response.ok) return { dates: [], defaultDate: null };
    return (await response.json()) as GrossSkinsTrackerDates;
  } catch (error) {
    console.error('Error fetching gross skins tracker dates:', error);
    return { dates: [], defaultDate: null };
  }
};

/**
 * Get everyone registered for a tee date, with Gross Skins paid status, via the API server.
 */
export const getGrossSkinsPaidList = async (eventId: number, teeDate: string): Promise<GrossSkinsPaidRow[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/gross-skins-tracker?teeDate=${teeDate}`);
    if (!response.ok) return [];
    return (await response.json()) as GrossSkinsPaidRow[];
  } catch (error) {
    console.error('Error fetching gross skins paid list:', error);
    return [];
  }
};

/**
 * Mark a player paid/unpaid for Gross Skins for a tee date via the API server.
 */
export const setGrossSkinsPaid = async (
  eventId: number, teeDate: string, playerId: number, paid: boolean
): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/gross-skins-tracker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, teeDate, paid }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error setting gross skins paid status:', error);
    return false;
  }
};

/**
 * Add tee times for an event/date via the API server (mirrors addtimes.php)
 */
export const addTeeTime = async (
  eventId: number,
  teeTime: { teeDate: string; time1?: string; time2?: string; time3?: string; time4?: string; time5?: string }
): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/teetimes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(teeTime),
    });
    return response.ok;
  } catch (error) {
    console.error('Error adding tee time:', error);
    return false;
  }
};

/**
 * One player's GHIN posting-compliance row for a game
 */
export interface NaughtyListRow {
  playerId: number;
  name: string;
  ghin: number;
  gross: number;
  net: number;
  postedScore: number;
  postedId: number;
}

/**
 * Get GHIN posting compliance for a game via the API server (mirrors posted_scores.php)
 */
export const getNaughtyList = async (gameId: number): Promise<NaughtyListRow[]> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/naughty-list`);
    if (!response.ok) return [];
    return (await response.json()) as NaughtyListRow[];
  } catch (error) {
    console.error('Error fetching naughty list:', error);
    return [];
  }
};

/**
 * Manually re-check GHIN for one "not posted" Naughty List row, widening the search to the next
 * 7 days and matching on exact gross score, via the API server.
 */
export const recheckNaughtyPosting = async (
  gameId: number,
  playerId: number
): Promise<{ found: boolean; postedScore?: number }> => {
  const response = await fetch(`${API_URL}/games/${gameId}/players/${playerId}/naughty-recheck`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Failed to re-check GHIN posting');
  return (await response.json()) as { found: boolean; postedScore?: number };
};

/**
 * One player's GHIN-linking row
 */
export interface GhinPlayerRow {
  playerId: number;
  name: string;
  ghin: number | null;
  skipped: boolean;
}

/**
 * Get the GHIN-linking player list for an event via the API server (mirrors ghin_playerlist.php)
 */
export const getGhinPlayerList = async (eventId: number): Promise<GhinPlayerRow[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/ghin-players`);
    if (!response.ok) return [];
    return (await response.json()) as GhinPlayerRow[];
  } catch (error) {
    console.error('Error fetching GHIN player list:', error);
    return [];
  }
};

/**
 * Skip (or un-skip) a player from the GHIN-linking flow — e.g. someone who will never have a
 * GHIN (a minor), so they stop showing up in the default missing-GHIN view and in Check Easy
 * Links, without losing the ability to un-skip and look again later.
 */
export const setPlayerGhinSkip = async (playerId: number, skip: boolean): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/players/${playerId}/ghin-skip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skip }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error setting GHIN skip:', error);
    return false;
  }
};

/** One candidate match from a GHIN Network name search */
export interface GhinSearchResult {
  name: string;
  club: string;
  state: string;
  handicapIndex: string;
  status: string;
  ghin: number;
  // True for a nationwide fallback match: club affiliation didn't match, but this GHIN has
  // actually posted a round at our course before.
  postedAtCourse?: boolean;
}

/**
 * Search the real GHIN Network for a golfer by name/state, to find their real GHIN number.
 * Passing `course` also runs a nationwide "posted at our course" fallback check for anyone the
 * name/state search alone misses (e.g. a stale/blank club affiliation on GHIN's end).
 */
export const searchGhin = async (
  firstName: string,
  lastName: string,
  state: string,
  course: string = ''
): Promise<GhinSearchResult[]> => {
  try {
    const response = await fetch(
      `${API_URL}/ghin/search?fname=${encodeURIComponent(firstName)}&lname=${encodeURIComponent(lastName)}&state=${encodeURIComponent(state)}&course=${encodeURIComponent(course)}`
    );
    if (!response.ok) return [];
    return (await response.json()) as GhinSearchResult[];
  } catch (error) {
    console.error('Error searching GHIN:', error);
    return [];
  }
};

/**
 * Link a player to a real GHIN number found via `searchGhin`
 */
export const linkPlayerGhin = async (playerId: number, ghin: number): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/players/${playerId}/ghin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ghin }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error linking GHIN:', error);
    return false;
  }
};

/** One unambiguous GHIN Network match found for a player with no GHIN on file */
export interface EasyLinkCandidate {
  playerId: number;
  name: string;
  ghin: number;
  club: string;
  state: string;
  handicapIndex: string;
  status: string;
  // 'club' = GHIN's own club affiliation matched our course. 'history' = club didn't match, but
  // this GHIN has actually posted a round at our course before. 'score' = multiple candidates
  // had posted here, narrowed down by an exact date+score match against our own records.
  matchedVia: 'club' | 'history' | 'score';
}

/**
 * Find unambiguous GHIN Network matches for every non-guest player linked to this event who
 * has no GHIN on file yet. This searches the real GHIN Network once per unlinked player (after a
 * single login), so a roster with many missing GHINs can take upwards of 15-20 seconds — unlike
 * the rest of this file, failures are rethrown rather than swallowed to `[]`, so a slow/dropped
 * request surfaces as a visible error instead of silently looking identical to "found nothing."
 */
export const getEasyGhinLinks = async (eventId: number): Promise<EasyLinkCandidate[]> => {
  const response = await fetch(`${API_URL}/events/${eventId}/ghin-easy-links`);
  if (!response.ok) throw new Error(`Server returned ${response.status}`);
  return (await response.json()) as EasyLinkCandidate[];
};

/**
 * One player's GHIN posting record for a year
 */
export interface GhinSummaryRow {
  playerId: number;
  name: string;
  match: number;
  dnp: number;
  higher: number;
  lower: number;
  perfect: boolean;
}

/**
 * Get GHIN posting record per player for a year via the API server (mirrors ghin_summary.php)
 */
export const getGhinSummary = async (eventId: number, year: number): Promise<GhinSummaryRow[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/ghin-summary?year=${year}`);
    if (!response.ok) return [];
    return (await response.json()) as GhinSummaryRow[];
  } catch (error) {
    console.error('Error fetching GHIN summary:', error);
    return [];
  }
};

/**
 * Get the years with GHIN posting data for an event via the API server
 */
export const getGhinYears = async (eventId: number): Promise<number[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/ghin-years`);
    if (!response.ok) return [];
    return (await response.json()) as number[];
  } catch (error) {
    console.error('Error fetching GHIN years:', error);
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
 * An event's per-event game/team/skins settings
 */
export interface EventOptions {
  game_grossdblbogey: boolean;
  game_netdblbogey: boolean;
  game_maxhdcp: string;
  game_defaultholes: string;
  game_netpayin: string;
  game_netplaces: string;
  game_netpct1: string;
  game_netpct2: string;
  game_netpct3: string;
  game_netpct4: string;
  teams_netcut: string;
  teams_netcut9: string;
  teams_payin: string;
  teams_places: string;
  teams_pct1: string;
  teams_pct2: string;
  teams_pct3: string;
  teams_pct4: string;
  teams_teamsize: string;
  teams_keepcount: string;
  teams_lastholeall: boolean;
  teams_blinddraw: boolean;
  teams_partnerteams: boolean;
  // 'custom' (manual Team Size/Keep Count, all fields editable) or '36/48' -- the latter has no
  // fixed Team Size at all (it's whatever headcount actually shows up) and replaces the static
  // Keep Count with a live per-hole team choice during play, so those two fields are hidden
  // whenever format isn't 'custom'.
  teams_format: string;
  teams_extra_count: string;
  teams2_netcut: string;
  teams2_netcut9: string;
  teams2_payin: string;
  teams2_places: string;
  teams2_pct1: string;
  teams2_pct2: string;
  teams2_pct3: string;
  teams2_pct4: string;
  teams2_teamsize: string;
  teams2_keepcount: string;
  teams2_lastholeall: boolean;
  teams2_blinddraw: boolean;
  teams2_partnerteams: boolean;
  teams2_format: string;
  teams3_netcut: string;
  teams3_netcut9: string;
  teams3_payin: string;
  teams3_places: string;
  teams3_pct1: string;
  teams3_pct2: string;
  teams3_pct3: string;
  teams3_pct4: string;
  teams3_teamsize: string;
  teams3_keepcount: string;
  teams3_lastholeall: boolean;
  teams3_blinddraw: boolean;
  teams3_partnerteams: boolean;
  teams3_format: string;
  teams4_netcut: string;
  teams4_netcut9: string;
  teams4_payin: string;
  teams4_places: string;
  teams4_pct1: string;
  teams4_pct2: string;
  teams4_pct3: string;
  teams4_pct4: string;
  teams4_teamsize: string;
  teams4_keepcount: string;
  teams4_lastholeall: boolean;
  teams4_blinddraw: boolean;
  teams4_partnerteams: boolean;
  teams4_format: string;
  skins_maxonestroke: boolean;
  skins_payin: string;
  skins_validation_score: boolean;
  skins_validation_par: boolean;
  skins_halfpar3: boolean;
  skins_nonepar3: boolean;
  skins_halfall: boolean;
  skins_maxone: boolean;
  gross_skins_enabled: boolean;
  gross_skins_payin: string;
  ups_enabled: boolean;
  ups_minevents: string;
  ups_numscores: string;
  ups_numplayers: string;
  ups_includeprioryears: boolean;
  ups_yearsexemption: string;
  ups_majorsauto: boolean;
  checkpaid: boolean;
  hidden_from_search: boolean;
  /** Whether women stroke on their own (women's) handicap holes. On by default; when off everyone
   * strokes on the men's handicap holes. See utils/handicap.ts's hdcpForPlayer. */
  women_hdcp_holes: boolean;
  /** Whether marking yourself "In" for a tee time offers to pay the admin via Venmo right then.
   * Off by default; also requires the admin to have a Venmo username saved (see
   * getVenmoUsername/saveVenmoUsername -- stored separately, not part of this options object,
   * same pattern as the admin password). */
  venmo_autopay_enabled: boolean;
  /** Whether this event's Tee Times screen also shows/merges other events' tee times and
   * sign-ups. One-directional -- only this event's own screen shows the merge, the linked-to
   * events are unaffected. See optionsService.ts's doc comment. */
  link_teetimes_enabled: boolean;
  /** Comma-separated list of other events' EventIDs this event links to, when
   * link_teetimes_enabled is on -- multiple partners supported. */
  link_teetimes_eventid: string;
}

/** Places-to-pay (up to 10) and split-percentage fields, for Net and each of the 4 Teams cards --
 * the subset of EventOptions a single week's game can override without affecting other weeks.
 * More places than the event-level Options screen's own max of 4 -- a per-game override can pay
 * more places than the event's default ever could (e.g. an unusually large field one week). */
type PctIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type PayoutOverrideKey =
  | 'game_netplaces' | `game_netpct${PctIndex}`
  | 'teams_places' | `teams_pct${PctIndex}`
  | 'teams2_places' | `teams2_pct${PctIndex}`
  | 'teams3_places' | `teams3_pct${PctIndex}`
  | 'teams4_places' | `teams4_pct${PctIndex}`;

export type GamePayoutOverrides = Partial<Record<PayoutOverrideKey, string>>;

export interface EffectiveGamePayoutOptions {
  values: Record<PayoutOverrideKey, string>;
  /** Exactly which keys this week has overridden, vs. falling back to the event default. */
  overriddenKeys: PayoutOverrideKey[];
}

/**
 * Get an event's options via the API server (mirrors options.php)
 */
export const getEventOptions = async (eventId: number): Promise<EventOptions | undefined> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/options`);
    if (!response.ok) return undefined;
    return (await response.json()) as EventOptions;
  } catch (error) {
    console.error('Error fetching event options:', error);
    return undefined;
  }
};

/**
 * Save an event's options via the API server (mirrors saveoptions.php)
 */
export const saveEventOptions = async (eventId: number, options: EventOptions): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    return response.ok;
  } catch (error) {
    console.error('Error saving event options:', error);
    return false;
  }
};

/**
 * Get a single week's effective payout settings (event defaults merged with any override
 * saved just for that game) -- lets Week Results adjust one week's payout split inline without
 * ever touching the event-wide Options screen.
 */
export const getGamePayoutOptions = async (
  gameId: number,
  eventId: number
): Promise<EffectiveGamePayoutOptions | undefined> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/payout-options?eventId=${eventId}`);
    if (!response.ok) return undefined;
    return (await response.json()) as EffectiveGamePayoutOptions;
  } catch (error) {
    console.error('Error fetching game payout options:', error);
    return undefined;
  }
};

/** Save a payout override for one specific week's game -- other weeks are unaffected. */
export const saveGamePayoutOptions = async (
  gameId: number,
  overrides: GamePayoutOverrides
): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/payout-options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(overrides),
    });
    return response.ok;
  } catch (error) {
    console.error('Error saving game payout options:', error);
    return false;
  }
};

/** Clear specific payout override keys for a week (e.g. just Net, or just one Teams slot),
 * reverting that section back to the event's default -- other overridden sections are untouched. */
export const resetGamePayoutOptions = async (gameId: number, keys: PayoutOverrideKey[]): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/payout-options`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error resetting game payout options:', error);
    return false;
  }
};

export type DblBogeyMode = 'off' | 'gross' | 'net';

/** This week's Double Bogey Max override, if any -- null means "no override, follow the event
 * default" (see EventOptions.game_grossdblbogey/game_netdblbogey). Set on the Team Games screen,
 * up front, so it actually applies before/during live scoring -- not something Week Results
 * adjusts after the fact like the payout overrides above. */
export const getGameDblBogeyOverride = async (gameId: number): Promise<DblBogeyMode | null> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/dblbogey-override`);
    if (!response.ok) return null;
    const data = (await response.json()) as { mode: DblBogeyMode | null };
    return data.mode;
  } catch (error) {
    console.error('Error fetching game double bogey override:', error);
    return null;
  }
};

/** Set (mode: 'off'|'gross'|'net') or clear (mode: null) this week's Double Bogey Max override. */
export const saveGameDblBogeyOverride = async (gameId: number, mode: DblBogeyMode | null): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/dblbogey-override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error saving game double bogey override:', error);
    return false;
  }
};

/** Recompute and persist this game's Net/Teams/Skins payout ledger rows -- call whenever a
 * week's payouts are displayed (Week Results does this on load and after an Adjust Payout save)
 * so the season summary always reflects current settings without a separate "finalize" step. */
export const syncGamePayouts = async (gameId: number): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/sync-payouts`, { method: 'POST' });
    return response.ok;
  } catch (error) {
    console.error('Error syncing game payouts:', error);
    return false;
  }
};

export type PurseGameType = 'net' | 'teams' | 'teams2' | 'teams3' | 'teams4' | 'skins' | 'grossskins' | 'holeinone';

export interface PurseGameTypeAmount {
  gameType: PurseGameType;
  amount: number;
}

export interface PurseRow {
  playerId: number;
  name: string;
  total: number;
  breakdown: PurseGameTypeAmount[];
}

/** Everyone's total winnings for a week across every payout type at once (Net, every Teams slot,
 * Skins, Gross Skins, Hole-in-One) -- what to Venmo each player, in one place. */
export const getWeekPurse = async (gameId: number): Promise<PurseRow[]> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/purse`);
    if (!response.ok) return [];
    return (await response.json()) as PurseRow[];
  } catch (error) {
    console.error('Error fetching week purse:', error);
    return [];
  }
};

/** A player who holed out in one stroke -- by house rule, wins the entire day's pot (Net + every
 * Teams slot + Skins combined), overriding every normal payout split. */
export interface HoleInOneWinner {
  playerId: number;
  name: string;
  holeId: number;
}

export interface HoleInOneCelebration {
  winners: HoleInOneWinner[];
  totalPot: number;
}

/** Hole-in-one celebration info for a game, or null if this game had no hole-in-one -- Week
 * Results checks this whenever a week is opened, to show the celebration screen. */
export const getHoleInOneCelebration = async (gameId: number): Promise<HoleInOneCelebration | null> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/hole-in-one`, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as HoleInOneCelebration | null;
  } catch (error) {
    console.error('Error fetching hole-in-one celebration:', error);
    return null;
  }
};

export interface SeasonPayoutRow {
  playerId: number;
  name: string;
  paid: number;
  won: number;
  balance: number;
}

/** Season-long payout summary for an event: per player, total paid in vs. total won. */
export const getSeasonPayoutSummary = async (eventId: number): Promise<SeasonPayoutRow[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/payout-summary`);
    if (!response.ok) return [];
    return (await response.json()) as SeasonPayoutRow[];
  } catch (error) {
    console.error('Error fetching season payout summary:', error);
    return [];
  }
};

export interface PayoutReviewWeek {
  gameId: number;
  date: string;
  netTotal: number;
  netOverridden: boolean;
  teamsTotal: number;
  teamsOverridden: boolean;
}

/** Net + Teams payout totals for every calendar week of an event (Skins excluded -- flat rate
 * all year), for the Payout Review screen. Read-only. */
export const getPayoutReview = async (eventId: number): Promise<PayoutReviewWeek[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/payout-review`);
    if (!response.ok) return [];
    return (await response.json()) as PayoutReviewWeek[];
  } catch (error) {
    console.error('Error fetching payout review:', error);
    return [];
  }
};

/**
 * Whether an event currently has an Admin password set (new events default to none)
 */
export const getAdminPasswordStatus = async (eventId: number): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/admin-password-status`);
    if (!response.ok) return false;
    const data = (await response.json()) as { hasPassword: boolean };
    return !!data.hasPassword;
  } catch (error) {
    console.error('Error checking admin password status:', error);
    return false;
  }
};

/**
 * Verify a candidate Admin password for an event
 */
export const verifyAdminPassword = async (eventId: number, password: string): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/verify-admin-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { valid: boolean };
    return !!data.valid;
  } catch (error) {
    console.error('Error verifying admin password:', error);
    return false;
  }
};

/**
 * Set (or clear, if blank) an event's Admin password
 */
export const setAdminPassword = async (eventId: number, password: string): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/admin-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error setting admin password:', error);
    return false;
  }
};

/**
 * The admin's saved Venmo username for this event -- '' if none is set yet. Used as the
 * recipient for Tee Times' "pay now" prompt.
 */
export const getVenmoUsername = async (eventId: number): Promise<string> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/venmo-username`);
    if (!response.ok) return '';
    const data = (await response.json()) as { username: string };
    return data.username;
  } catch (error) {
    console.error('Error fetching Venmo username:', error);
    return '';
  }
};

/**
 * Set (or clear, if blank) the admin's Venmo username. Returns false (without throwing) if the
 * server rejects the format -- see optionsService.ts's VENMO_USERNAME_PATTERN.
 */
export const saveVenmoUsername = async (eventId: number, username: string): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/venmo-username`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error setting Venmo username:', error);
    return false;
  }
};

/**
 * A recorded UPS Cup winner for a given year
 */
export interface UpsCupWinner {
  year: number;
  playerId: number;
  playerName: string;
}

/**
 * Who automatically qualified for the UPS Cup by winning a Major that year, and on which date
 */
export interface MajorWinner {
  date: string; // yyyy-mm-dd
  playerId: number | null;
  playerName: string; // 'TBD' if the Major hasn't been played yet
  metMinimum: boolean | null; // null for a TBD row
}

/**
 * Get each Major's automatic UPS Cup qualifier for a given year
 */
export const getMajorWinners = async (eventId: number, year: number): Promise<MajorWinner[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/major-winners?year=${year}`);
    if (!response.ok) return [];
    return (await response.json()) as MajorWinner[];
  } catch (error) {
    console.error('Error fetching major winners:', error);
    return [];
  }
};

/**
 * One player's UPS Cup points for a single event (game)
 */
export interface UpsPointsRow {
  playerId: number;
  name: string;
  net: number;
  points: number;
}

/**
 * Get a game's UPS Cup points (standard competition ranking by net score)
 */
export const getUpsPoints = async (gameId: number): Promise<UpsPointsRow[]> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/ups-points`);
    if (!response.ok) return [];
    return (await response.json()) as UpsPointsRow[];
  } catch (error) {
    console.error('Error fetching UPS points:', error);
    return [];
  }
};

/**
 * A player who's mathematically eliminated from UPS Cup qualification, and why
 */
export interface IneligiblePlayer {
  playerId: number;
  name: string;
  played: number;
  remaining: number;
  reason: string;
}

/**
 * Get players mathematically eliminated from UPS Cup qualification for a given year
 */
export const getIneligiblePlayers = async (eventId: number, year: number): Promise<IneligiblePlayer[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/ineligible-players?year=${year}`);
    if (!response.ok) return [];
    return (await response.json()) as IneligiblePlayer[];
  } catch (error) {
    console.error('Error fetching ineligible players:', error);
    return [];
  }
};

/**
 * A player's current UPS Cup standing
 */
export interface StandingsRow {
  playerId: number;
  name: string;
  played: number;
  average: number;
  metRequirement: boolean;
  qualifies: boolean;
  paid: boolean;
}

/**
 * Get current UPS Cup standings for a given year
 */
export const getCurrentStandings = async (eventId: number, year: number): Promise<StandingsRow[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/ups-standings?year=${year}`);
    if (!response.ok) return [];
    return (await response.json()) as StandingsRow[];
  } catch (error) {
    console.error('Error fetching UPS Cup standings:', error);
    return [];
  }
};

/**
 * A player who's paid their UPS Cup entry for a given year
 */
export interface PaidPlayer {
  playerId: number;
  name: string;
}

/**
 * Get players who've paid their UPS Cup entry for a given year
 */
export const getPaidPlayers = async (eventId: number, year: number): Promise<PaidPlayer[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/ups-paid-players?year=${year}`);
    if (!response.ok) return [];
    return (await response.json()) as PaidPlayer[];
  } catch (error) {
    console.error('Error fetching paid players:', error);
    return [];
  }
};

/**
 * Mark a player as having paid their UPS Cup entry for a given year
 */
export const setPlayerPaid = async (eventId: number, year: number, playerId: number): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/ups-paid-players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, playerId }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error marking player paid:', error);
    return false;
  }
};

/**
 * Remove a player's paid UPS Cup entry for a given year
 */
export const removePlayerPaid = async (eventId: number, year: number, playerId: number): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/ups-paid-players/${year}/${playerId}`, { method: 'DELETE' });
    return response.ok;
  } catch (error) {
    console.error('Error removing paid player:', error);
    return false;
  }
};

/**
 * Birdie Race leaderboard row — how many of the course's 18 holes a player has net-birdied
 */
export interface BirdieLeaderboardRow {
  playerId: number;
  name: string;
  front9Birdied: number;
  back9Birdied: number;
  holesBirdied: number;
  completionDate: string | null;
  isWinner: boolean;
}

/**
 * Get the Birdie Race leaderboard for an event
 */
export const getBirdieLeaderboard = async (eventId: number, year: number): Promise<BirdieLeaderboardRow[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/birdie-leaderboard?year=${year}`);
    if (!response.ok) return [];
    return (await response.json()) as BirdieLeaderboardRow[];
  } catch (error) {
    console.error('Error fetching birdie leaderboard:', error);
    return [];
  }
};

/**
 * One hole's Birdie Race status for a single player
 */
export interface PlayerBirdieStatusRow {
  hole: number;
  par: number | null;
  gross: number | null;
  net: number | null;
  birdied: boolean;
  date: string | null;
}

/**
 * Get one player's Birdie Race status (all 18 holes) for an event
 */
export const getPlayerBirdieStatus = async (
  eventId: number,
  year: number,
  playerId: number
): Promise<PlayerBirdieStatusRow[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/birdie-player-status?year=${year}&playerId=${playerId}`);
    if (!response.ok) return [];
    return (await response.json()) as PlayerBirdieStatusRow[];
  } catch (error) {
    console.error('Error fetching player birdie status:', error);
    return [];
  }
};

/**
 * One player's net birdie on a specific hole
 */
export interface HoleBirdieDetailRow {
  playerId: number;
  name: string;
  net: number;
  date: string;
  lowestGross: number;
}

/**
 * Get one hole's Birdie Race detail (every player who has net-birdied it) for an event
 */
export const getHoleBirdieDetail = async (
  eventId: number,
  year: number,
  hole: number
): Promise<HoleBirdieDetailRow[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/birdie-hole-detail?year=${year}&hole=${hole}`);
    if (!response.ok) return [];
    return (await response.json()) as HoleBirdieDetailRow[];
  } catch (error) {
    console.error('Error fetching hole birdie detail:', error);
    return [];
  }
};

/**
 * Get an event's recorded UPS Cup winners
 */
export const getUpsCupWinners = async (eventId: number): Promise<UpsCupWinner[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/ups-cup-winners`);
    if (!response.ok) return [];
    return (await response.json()) as UpsCupWinner[];
  } catch (error) {
    console.error('Error fetching UPS Cup winners:', error);
    return [];
  }
};

/**
 * Set (or replace) an event's UPS Cup winner for a given year
 */
export const setUpsCupWinner = async (eventId: number, year: number, playerId: number): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/ups-cup-winners`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, playerId }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error setting UPS Cup winner:', error);
    return false;
  }
};

/**
 * Remove an event's UPS Cup winner for a given year
 */
export const deleteUpsCupWinner = async (eventId: number, year: number): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/ups-cup-winners/${year}`, { method: 'DELETE' });
    return response.ok;
  } catch (error) {
    console.error('Error deleting UPS Cup winner:', error);
    return false;
  }
};

/**
 * A day's category on an event's year calendar
 */
export type CalendarDayType = 'event' | 'major' | 'upscup' | 'note';

/**
 * One marked day on an event's year calendar
 */
export interface CalendarDay {
  date: string; // yyyy-mm-dd
  dayType: CalendarDayType;
  note: string;
}

/**
 * Get an event's calendar for a given year
 */
export const getEventCalendar = async (eventId: number, year: number): Promise<CalendarDay[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/calendar?year=${year}`);
    if (!response.ok) return [];
    return (await response.json()) as CalendarDay[];
  } catch (error) {
    console.error('Error fetching calendar:', error);
    return [];
  }
};

/**
 * Set (or replace) a single calendar day
 */
export const setCalendarDay = async (
  eventId: number, date: string, dayType: CalendarDayType, note: string
): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/calendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, dayType, note }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error setting calendar day:', error);
    return false;
  }
};

/**
 * Remove a calendar day entirely
 */
export const deleteCalendarDay = async (eventId: number, date: string): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/calendar/${date}`, { method: 'DELETE' });
    return response.ok;
  } catch (error) {
    console.error('Error deleting calendar day:', error);
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
  playerId: number;
  name: string;
  thru: number;
  score: string; // "Even", "+3", "-2"
}

/**
 * Get the latest game for an event via the API server
 */
export const getLatestGame = async (eventId: number): Promise<LatestGameInfo | undefined> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/latest-game`, { cache: 'no-store' });
    if (!response.ok) return undefined;
    return (await response.json()) as LatestGameInfo;
  } catch (error) {
    console.error('Error fetching latest game:', error);
    return undefined;
  }
};

export interface TeamGameWeek {
  date: string;
  gameId: number | null;
  courseId: number;
  courseName: string;
}

/** Every date Team Games can be viewed/managed for (past/current real games + future Setup
 * Calendar dates with no game yet) via the API server. */
export const getTeamGameWeeks = async (eventId: number): Promise<TeamGameWeek[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/team-game-weeks`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as TeamGameWeek[];
  } catch (error) {
    console.error('Error fetching team game weeks:', error);
    return [];
  }
};

/** Lazily find-or-create the Game for a specific (possibly future) date via the API server.
 * Pass `courseId` to override the default (most recently played) course — e.g. a week that's
 * moved to a different course. Returns the GameID, or null on failure. */
export const ensureGameForDate = async (eventId: number, date: string, courseId?: number): Promise<number | null> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/ensure-game`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, courseId }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { gameId: number };
    return data.gameId;
  } catch (error) {
    console.error('Error ensuring game for date:', error);
    return null;
  }
};

/** Change which course an already-created game is played at via the API server. */
export const updateGameCourse = async (gameId: number, courseId: number): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/course`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error updating game course:', error);
    return false;
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

/**
 * Get which side (Front 9 / Back 9) the scorecard grid should default to for a game,
 * based on which side the majority of players actually played.
 */
export const getDefaultScorecardSide = async (gameId: number): Promise<'F' | 'B'> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/default-side`);
    if (!response.ok) return 'F';
    const data = (await response.json()) as { side: 'F' | 'B' };
    return data.side;
  } catch (error) {
    console.error('Error fetching default scorecard side:', error);
    return 'F';
  }
};

/**
 * A past week's game for an event, for the "What If" week picker
 */
export interface GameWeek {
  gameId: number;
  gameDate: string;
}

/**
 * Get all games (weeks) played for an event via the API server
 */
export const getGamesForEvent = async (eventId: number): Promise<GameWeek[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/games`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as GameWeek[];
  } catch (error) {
    console.error('Error fetching games for event:', error);
    return [];
  }
};

/**
 * A player who has scores recorded in a given game
 */
export interface GamePlayer {
  id: number;
  lastName: string;
  firstName: string;
}

/**
 * Get all players who have scores in a given game via the API server
 */
export const getPlayersForGame = async (gameId: number): Promise<GamePlayer[]> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/players`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as GamePlayer[];
  } catch (error) {
    console.error('Error fetching players for game:', error);
    return [];
  }
};

/** One player's actual gross score total and handicap for a single game — used by Swap
 * Players' preview to sanity-check who's who before confirming */
export interface GameSwapPlayerInfo {
  playerId: number;
  name: string;
  grossScore: number | null;
  hdcp: number | null;
}

export interface GameSwapPreview {
  playerA: GameSwapPlayerInfo;
  playerB: GameSwapPlayerInfo;
}

/** Preview what swapping two players' data for one game would move (Admin -> Players -> Swap Players) */
export const getGameSwapPreview = async (
  gameId: number,
  playerAId: number,
  playerBId: number
): Promise<GameSwapPreview | null> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/swap-preview?playerAId=${playerAId}&playerBId=${playerBId}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as GameSwapPreview;
  } catch (error) {
    console.error('Error previewing player swap:', error);
    return null;
  }
};

/** Swap two players' Score/Team/Skins/Hdcp data for one game — for when the wrong same-surname
 * player got picked when entering scores. Only affects this one game, not either player's
 * broader history. `playerBHandicap`, if given, is the correct player's real handicap for this
 * round — used to recompute their NetScore and Skins, since the moved data carries whatever
 * handicap the wrong player was entered under. */
export const swapPlayersInGame = async (
  gameId: number,
  playerAId: number,
  playerBId: number,
  playerBHandicap?: number
): Promise<{ ok: true } | { ok: false; error: string }> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerAId, playerBId, playerBHandicap }),
    });
    const data = (await response.json()) as { success?: boolean; error?: string };
    if (response.ok) return { ok: true };
    return { ok: false, error: data.error ?? 'Failed to swap players.' };
  } catch (error) {
    console.error('Error swapping players:', error);
    return { ok: false, error: 'Failed to swap players.' };
  }
};

/**
 * One row of the "What If" team results table
 */
export interface WhatIfRow {
  name: string;
  front: number;
  back: number;
  total: number;
}

export interface WhatIfTeamGameOption {
  teamGameId: number;
  label: string;
  keepCount: number;
}

/**
 * Get which 2-person Teams N team game(s), if any, this week's What If can run against via the
 * API server. `null` = a legacy week (no new-system team games at all) — What If just works as
 * it always has, no picker needed. An empty array = this week has no eligible 2-person slot.
 */
export const getWhatIfTeamGameOptions = async (gameId: number): Promise<WhatIfTeamGameOption[] | null> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/whatif-team-games`, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as WhatIfTeamGameOption[] | null;
  } catch (error) {
    console.error('Error fetching what-if team game options:', error);
    return null;
  }
};

/**
 * Get "What If" team results for a game/player via the API server. `teamGameId`, when given,
 * resolves that specific Teams N slot's real scoring rule (best-ball vs. combined) server-side.
 */
export const getWhatIfResults = async (gameId: number, playerId: number, teamGameId?: number): Promise<WhatIfRow[]> => {
  try {
    const teamGameParam = teamGameId ? `&teamGameId=${teamGameId}` : '';
    const response = await fetch(`${API_URL}/games/${gameId}/whatif?playerId=${playerId}${teamGameParam}`);
    if (!response.ok) return [];
    return (await response.json()) as WhatIfRow[];
  } catch (error) {
    console.error('Error fetching what-if results:', error);
    return [];
  }
};

/**
 * One row of the Week Results leaderboard: a player's totals for a game
 */
export interface WeekResultRow {
  playerId: number;
  name: string;
  score: number;
  net: number;
}

/**
 * Get individual gross/net totals for a game via the API server
 */
export const getWeekResults = async (gameId: number, scoreType: 'G' | 'N'): Promise<WeekResultRow[]> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/results?scoreType=${scoreType}`);
    if (!response.ok) return [];
    return (await response.json()) as WeekResultRow[];
  } catch (error) {
    console.error('Error fetching week results:', error);
    return [];
  }
};

/**
 * Check whether teams have already been set up for a game via the API server
 */
export const getTeamStatus = async (gameId: number): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/teams/status`);
    if (!response.ok) return false;
    const data = (await response.json()) as { hasTeams: boolean };
    return data.hasTeams;
  } catch (error) {
    console.error('Error checking team status:', error);
    return false;
  }
};

/**
 * A team's best-ball (net) front/back/total, plus its roster
 */
export interface TeamResultRow {
  teamId: number;
  front: number;
  back: number;
  total: number;
  players: string[];
  // +/- to par display strings ('Even' | '+N' | '-N') -- only set for 36/48 and Irish Rumble team
  // games, where a bare net total isn't meaningful to compare across teams. Undefined otherwise,
  // in which case the raw net total above is what should be shown.
  frontPar?: string;
  backPar?: string;
  totalPar?: string;
}

/**
 * Get team results for a game via the API server
 */
export const getTeamResults = async (gameId: number): Promise<TeamResultRow[]> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/teams`);
    if (!response.ok) return [];
    return (await response.json()) as TeamResultRow[];
  } catch (error) {
    console.error('Error fetching team results:', error);
    return [];
  }
};

/** A player who missed the event's Net Score to Make Cut */
export interface MissedCutRow {
  name: string;
  total: number;
}

export interface CutSummary {
  /** The applicable Net Score to Make Cut value, or null if no cut is configured (or not everyone's finished yet). */
  cutLine: number | null;
  /** Players who matched the majority side but shot over the cut, sorted low to high by net total. */
  missedCut: MissedCutRow[];
}

/**
 * Get the Net Score to Make Cut summary for a game's team results via the API server
 */
export const getCutSummary = async (gameId: number): Promise<CutSummary> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/cut-summary`);
    if (!response.ok) return { cutLine: null, missedCut: [] };
    return (await response.json()) as CutSummary;
  } catch (error) {
    console.error('Error fetching cut summary:', error);
    return { cutLine: null, missedCut: [] };
  }
};

/** One likely test/abandoned game or data-quality issue, found via Admin -> Cleanup Scores. */
export interface CleanupCandidate {
  key: string;
  scope: 'game' | 'player' | 'holes' | 'neverplayed';
  /** Null only for scope 'neverplayed' — that candidate isn't tied to any one game. */
  gameId: number | null;
  playerId: number | null;
  /** Only set for scope 'holes' — the specific stray HoleIDs to remove. */
  holeIds: number[] | null;
  gameDate: string;
  courseName: string;
  description: string;
  reason: string;
}

/** A CleanupCandidate tagged with which event it came from — Master Tools -> Cleanup Data -> All Events */
export interface CleanupCandidateWithEvent extends CleanupCandidate {
  eventId: number;
  eventName: string;
}

/**
 * Get likely test/abandoned games and incomplete rounds for an event via the API server.
 */
export const getCleanupCandidates = async (eventId: number): Promise<CleanupCandidate[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/cleanup-candidates`);
    if (!response.ok) return [];
    return (await response.json()) as CleanupCandidate[];
  } catch (error) {
    console.error('Error fetching cleanup candidates:', error);
    return [];
  }
};

/** Get every event's cleanup candidates combined — Master Tools -> Cleanup Data -> All Events */
export const getAllEventsCleanupCandidates = async (): Promise<CleanupCandidateWithEvent[]> => {
  try {
    const response = await fetch(`${API_URL}/events/cleanup-candidates-all`);
    if (!response.ok) return [];
    return (await response.json()) as CleanupCandidateWithEvent[];
  } catch (error) {
    console.error('Error fetching all-events cleanup candidates:', error);
    return [];
  }
};

/**
 * Delete selected cleanup candidates via the API server.
 */
export const deleteCleanupCandidates = async (
  eventId: number,
  items: { scope: 'game' | 'player' | 'holes' | 'neverplayed'; gameId: number | null; playerId: number | null; holeIds: number[] | null }[]
): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/cleanup-candidates/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error deleting cleanup candidates:', error);
    return false;
  }
};

/** An item marked as legit (Admin -> Cleanup Scores' "Skip"), so it stops showing up as a candidate. */
export interface CleanupIgnoredRow {
  key: string;
  description: string;
  reason: string;
}

/**
 * Mark selected cleanup candidates as legit via the API server — no delete, just stops
 * flagging them on future scans.
 */
export const ignoreCleanupCandidates = async (
  eventId: number,
  items: { key: string; description: string; reason: string }[]
): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/cleanup-candidates/ignore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error ignoring cleanup candidates:', error);
    return false;
  }
};

/**
 * Get everything currently marked as legit for this event via the API server.
 */
export const getIgnoredCleanupItems = async (eventId: number): Promise<CleanupIgnoredRow[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/cleanup-ignored`);
    if (!response.ok) return [];
    return (await response.json()) as CleanupIgnoredRow[];
  } catch (error) {
    console.error('Error fetching ignored cleanup items:', error);
    return [];
  }
};

/**
 * Un-ignore a single cleanup item via the API server — it'll show back up as a candidate if
 * it still applies.
 */
export const unignoreCleanupItem = async (eventId: number, key: string): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/cleanup-ignored/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });
    return response.ok;
  } catch (error) {
    console.error('Error un-ignoring cleanup item:', error);
    return false;
  }
};

/** A player removed from a game (Admin -> Remove Player) whose Score for that game is leftover
 * from before opt-outs deleted the Score immediately — a retroactive cleanup target. */
export interface OptedOutCandidate {
  key: string;
  gameId: number;
  playerId: number;
  gameDate: string;
  courseName: string;
  description: string;
}

/** Get every opted-out (Remove Player) record for an event */
export const getOptedOutPlayers = async (eventId: number): Promise<OptedOutCandidate[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/opted-out`);
    if (!response.ok) return [];
    return (await response.json()) as OptedOutCandidate[];
  } catch (error) {
    console.error('Error fetching opted-out players:', error);
    return [];
  }
};


/**
 * Get the current team assignments for a game (by player ID) via the API server, for
 * prefilling the Pick Teams builder when a game already has manually-picked teams to edit.
 */
export const getTeamAssignments = async (gameId: number): Promise<number[][]> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/team-assignments`);
    if (!response.ok) return [];
    return (await response.json()) as number[][];
  } catch (error) {
    console.error('Error fetching team assignments:', error);
    return [];
  }
};

/**
 * Replace all teams for a game via the API server. `teams` is an array of
 * player-ID arrays; each array's position (1-based) becomes the TeamID.
 */
export const saveTeams = async (gameId: number, teams: number[][]): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teams }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error saving teams:', error);
    return false;
  }
};

/**
 * One player's hole-by-hole net scores within a team scorecard drill-down
 */
export interface TeamScorecardRow {
  name: string;
  holes: Record<number, number>;
  total: number;
  // Holes where this player's score was borrowed a second time to pad a short-handed Playing
  // Partner Teams team up to the game's largest roster size — only set for team-game scorecards.
  paddedHoles?: number[];
  // True for a synthetic "Ghost Player" row (a short-handed team's borrowed pad slot, shown as
  // its own row purely for visibility) — not a real TeamGamePlayer roster row, never persisted.
  isGhost?: boolean;
}

/**
 * Get a team's hole-by-hole net scorecard for a side (F/B/T) via the API server
 */
export const getTeamScorecard = async (gameId: number, teamId: number, side: 'F' | 'B' | 'T'): Promise<TeamScorecardRow[]> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/teams/${teamId}/scorecard?side=${side}`);
    if (!response.ok) return [];
    return (await response.json()) as TeamScorecardRow[];
  } catch (error) {
    console.error('Error fetching team scorecard:', error);
    return [];
  }
};

export interface PlayerScorecardHole {
  hole: number;
  gross: number;
  net: number;
}

export interface PlayerScorecard {
  holes: PlayerScorecardHole[];
  totalGross: number;
  totalNet: number;
}

/**
 * Get one player's hole-by-hole gross+net scorecard for a side (F/B/T) via the API server --
 * powers the Leaderboard's tap-a-name drill-down.
 */
export const getPlayerScorecard = async (gameId: number, playerId: number, side: 'F' | 'B' | 'T'): Promise<PlayerScorecard> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/players/${playerId}/scorecard?side=${side}`);
    if (!response.ok) return { holes: [], totalGross: 0, totalNet: 0 };
    return (await response.json()) as PlayerScorecard;
  } catch (error) {
    console.error('Error fetching player scorecard:', error);
    return { holes: [], totalGross: 0, totalNet: 0 };
  }
};

// ── Team Games (multiple concurrent team competitions per round) ──

export type TeamGameAssignMode = 'R' | 'M' | 'G';

export interface TeamGameSummary {
  teamGameId: number;
  gameId: number;
  label: string;
  teamSize: number;
  keepCount: number;
  assignMode: TeamGameAssignMode;
  randomSet: boolean;
  lastHoleAll: boolean;
  skipped: boolean;
  hasPlayers: boolean;
  slot: number | null;
  // 'custom' (the classic keep-best-X-of-N-every-hole rule), '36/48' (a team that picks live,
  // hole by hole, how many net scores to keep, targeting its own actual headcount x 12), or
  // 'irish' (Irish Rumble: a fixed keep count that depends on the hole number itself).
  format: string;
  // Payout/cut config stored directly on this row (see TeamGamePayoutInput) -- null for any
  // field never set, including every team game created before this existed.
  netCut: number | null;
  netCut9: number | null;
  payIn: number | null;
  places: number | null;
  pct1: number | null;
  pct2: number | null;
  pct3: number | null;
  pct4: number | null;
}

/** A one-off team game's own payout/cut config, passed to createTeamGame -- mirrors an Options
 * "Teams N" card's teams_netcut/netcut9/payin/places/pct1-4 fields, but settable independently
 * per one-off game. All fields optional/blank means "no cut" / "no payout" for that field. */
export interface TeamGamePayoutInput {
  netCut?: string;
  netCut9?: string;
  payIn?: string;
  places?: string;
  pct1?: string;
  pct2?: string;
  pct3?: string;
  pct4?: string;
}

/** List every team game set up for a round via the API server. */
export const listTeamGames = async (gameId: number): Promise<TeamGameSummary[]> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/team-games`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as TeamGameSummary[];
  } catch (error) {
    console.error('Error fetching team games:', error);
    return [];
  }
};

/** Create a new team game for a round via the API server. Returns the new TeamGameID, or null on
 * failure. `format` defaults to 'custom' when omitted -- pass '36/48' or 'irish' to create a
 * one-off predefined-format team game (teamSize/keepCount are ignored for those, assignMode must
 * be 'G'), e.g. to run a different format for a single week without touching the event's
 * standard Options setting. */
export const createTeamGame = async (
  gameId: number,
  label: string,
  teamSize: number,
  keepCount: number,
  assignMode: TeamGameAssignMode,
  lastHoleAll: boolean,
  slot?: number,
  format?: string,
  payout?: TeamGamePayoutInput
): Promise<number | null> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/team-games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, teamSize, keepCount, assignMode, lastHoleAll, slot, format, payout }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { teamGameId: number };
    return data.teamGameId;
  } catch (error) {
    console.error('Error creating team game:', error);
    return null;
  }
};

/** Skip a pending Options "Teams N" slot for just this week, via the API server. Returns the new
 * placeholder TeamGameID, or null on failure. */
export const skipTeamGameSlot = async (gameId: number, label: string, slot: number): Promise<number | null> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/team-games/skip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, slot }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { teamGameId: number };
    return data.teamGameId;
  } catch (error) {
    console.error('Error skipping team game slot:', error);
    return null;
  }
};

/** Delete a team game via the API server. Refused (with a reason) once it's already been drawn. */
export const deleteTeamGame = async (teamGameId: number): Promise<{ ok: boolean; error?: string }> => {
  try {
    const response = await fetch(`${API_URL}/team-games/${teamGameId}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error };
    }
    return { ok: true };
  } catch (error) {
    console.error('Error deleting team game:', error);
    return { ok: false, error: 'Network error' };
  }
};

export interface TeamGameStatus {
  teamGameId: number;
  gameId: number;
  label: string;
  teamSize: number;
  keepCount: number;
  assignMode: TeamGameAssignMode;
  alreadySet: boolean;
  stillPlaying: string[];
}

/** Get a team game's config and eligibility status via the API server. */
export const getTeamGameStatus = async (teamGameId: number): Promise<TeamGameStatus | undefined> => {
  try {
    const response = await fetch(`${API_URL}/team-games/${teamGameId}/status`, { cache: 'no-store' });
    if (!response.ok) return undefined;
    return (await response.json()) as TeamGameStatus;
  } catch (error) {
    console.error('Error fetching team game status:', error);
    return undefined;
  }
};

/** Get the current team assignments for a team game (by player ID) via the API server. */
export const getTeamGameAssignments = async (teamGameId: number): Promise<number[][]> => {
  try {
    const response = await fetch(`${API_URL}/team-games/${teamGameId}/assignments`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as number[][];
  } catch (error) {
    console.error('Error fetching team game assignments:', error);
    return [];
  }
};

/** Replace all teams for a manual-assignment team game via the API server. */
export const saveManualTeamGameTeams = async (teamGameId: number, teams: number[][]): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/team-games/${teamGameId}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teams }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error saving team game teams:', error);
    return false;
  }
};

/** Get the current team roster (with handicaps) for a team game via the API server. */
export const getTeamGameRoster = async (teamGameId: number): Promise<RandomTeamResult[]> => {
  try {
    const response = await fetch(`${API_URL}/team-games/${teamGameId}/roster`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as RandomTeamResult[];
  } catch (error) {
    console.error('Error fetching team game roster:', error);
    return [];
  }
};

/** Generate random teams for a random-assignment team game via the API server. */
export const createRandomTeamGameTeams = async (teamGameId: number): Promise<CreateRandomTeamsResult | undefined> => {
  try {
    const response = await fetch(`${API_URL}/team-games/${teamGameId}/random`, { method: 'POST' });
    if (!response.ok) return undefined;
    return (await response.json()) as CreateRandomTeamsResult;
  } catch (error) {
    console.error('Error creating random team game teams:', error);
    return undefined;
  }
};

/** Get team results (front/back/total + roster) for a team game via the API server. */
export const getTeamGameResults = async (teamGameId: number): Promise<TeamResultRow[]> => {
  try {
    const response = await fetch(`${API_URL}/team-games/${teamGameId}/results`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as TeamResultRow[];
  } catch (error) {
    console.error('Error fetching team game results:', error);
    return [];
  }
};

/** Get the Net Score to Make Cut summary (this slot's own cut line, missed-cut sorted low to high) for a team game via the API server. */
export const getTeamGameCutSummary = async (teamGameId: number): Promise<CutSummary> => {
  try {
    const response = await fetch(`${API_URL}/team-games/${teamGameId}/cut-summary`, { cache: 'no-store' });
    if (!response.ok) return { cutLine: null, missedCut: [] };
    return (await response.json()) as CutSummary;
  } catch (error) {
    console.error('Error fetching team game cut summary:', error);
    return { cutLine: null, missedCut: [] };
  }
};

export interface TeamGameScorecardResult {
  rows: TeamScorecardRow[];
  /** This team's actual kept-best net total per hole (same reduction the Front/Back/Total figures
   * use), keyed by HoleID — shown as a "Total" row below the per-player grid. */
  holeTotals: Record<number, number>;
}

/** Get a team's hole-by-hole net scorecard for a side (F/B/T) within a team game via the API server. */
export const getTeamGameScorecard = async (teamGameId: number, teamNumber: number, side: 'F' | 'B' | 'T'): Promise<TeamGameScorecardResult> => {
  try {
    const response = await fetch(`${API_URL}/team-games/${teamGameId}/scorecard/${teamNumber}?side=${side}`);
    if (!response.ok) return { rows: [], holeTotals: {} };
    return (await response.json()) as TeamGameScorecardResult;
  } catch (error) {
    console.error('Error fetching team game scorecard:', error);
    return { rows: [], holeTotals: {} };
  }
};

/** A score-vs-par figure paired with how many net scores went into it -- a bare "+3"/"-2" isn't
 * comparable between two teams without knowing how many scores each is built from, so the kept
 * count always travels alongside it. */
export interface TeamLiveSideScore {
  score: string;
  kept: number;
}

/** One 36/48 team's live standing -- Front/Back/Total, each score paired with its own kept
 * count. */
export interface TeamLiveLeaderboardRow {
  teamNumber: number;
  players: string[];
  thru: number;
  front: TeamLiveSideScore;
  back: TeamLiveSideScore;
  total: TeamLiveSideScore;
  target: number;
}

/** Live standings for every team in a 36/48 team game -- empty for a 'custom'-format team game. */
export const getTeamGameLiveLeaderboard = async (teamGameId: number): Promise<TeamLiveLeaderboardRow[]> => {
  try {
    const response = await fetch(`${API_URL}/team-games/${teamGameId}/live-leaderboard`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as TeamLiveLeaderboardRow[];
  } catch (error) {
    console.error('Error fetching team game live leaderboard:', error);
    return [];
  }
};

/** Actual result vs. the theoretical best a 36/48 team's round could have produced with perfect
 * hindsight -- a post-round-only comparison, not meant for an in-progress round. One row per
 * real team in the team game. */
export interface TeamBestPossible {
  teamNumber: number;
  players: string[];
  teamSize: number;
  target: number;
  actualScore: string;
  bestScore: string;
}

export const getTeamBestPossible = async (teamGameId: number): Promise<TeamBestPossible[]> => {
  try {
    const response = await fetch(`${API_URL}/team-games/${teamGameId}/best-possible`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as TeamBestPossible[];
  } catch (error) {
    console.error('Error fetching team best-possible:', error);
    return [];
  }
};

/** Weeks that had at least one 36/48 team game with a rostered, scored player -- for the Best
 * Possible screen's week picker, pre-filtered so every listed week is actually usable. */
export const getBestPossibleWeeks = async (eventId: number): Promise<GameWeek[]> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/best-possible-weeks`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as GameWeek[];
  } catch (error) {
    console.error('Error fetching best-possible weeks:', error);
    return [];
  }
};

/** One 36/48-format team game a foursome belongs to -- what the live per-hole keep prompt
 * (app/game.tsx) needs to render itself. teamSize/target are always this specific team's actual
 * headcount (and headcount x 12), never a size fixed in advance. */
export interface KeepFormatTeam {
  teamGameId: number;
  teamNumber: number;
  teamSize: number;
  target: number;
  label: string;
}

/** Every 36/48-format team game this exact foursome (by player ID) is registered as one team in,
 * for a given game -- empty for the vast majority of games, which don't use this format at all. */
export const getKeepTeamsForGame = async (gameId: number, playerIds: number[]): Promise<KeepFormatTeam[]> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/keep-teams?playerIds=${playerIds.join(',')}`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as KeepFormatTeam[];
  } catch (error) {
    console.error('Error fetching keep-format teams:', error);
    return [];
  }
};

/** A 36/48 team's already-recorded live keep choices, keyed by hole number. */
export const getTeamGameHoleKeep = async (teamGameId: number, teamNumber: number): Promise<Record<number, number>> => {
  try {
    const response = await fetch(`${API_URL}/team-games/${teamGameId}/hole-keep?teamNumber=${teamNumber}`, { cache: 'no-store' });
    if (!response.ok) return {};
    return (await response.json()) as Record<number, number>;
  } catch (error) {
    console.error('Error fetching team game hole keep counts:', error);
    return {};
  }
};

/** One Irish Rumble team a foursome belongs to -- includes the roster's player IDs so app/game.tsx
 * can look up each rostered player's own net score for the current hole locally and show a live
 * "score for this hole" card without a round trip per keystroke. */
export interface IrishRumbleTeam {
  teamGameId: number;
  teamNumber: number;
  label: string;
  playerIds: number[];
}

/** Every Irish Rumble team game this exact foursome (by player ID) is registered as one team in,
 * for a given game -- empty for the vast majority of games, which don't use this format at all. */
export const getIrishRumbleTeamsForGame = async (gameId: number, playerIds: number[]): Promise<IrishRumbleTeam[]> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/irish-teams?playerIds=${playerIds.join(',')}`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as IrishRumbleTeam[];
  } catch (error) {
    console.error('Error fetching Irish Rumble teams:', error);
    return [];
  }
};

/** One team's live standing for a fixed-keep-count format ('custom' or 'irish') -- simpler than
 * 36/48's, no target/kept to track since the keep count is a fixed rule, not a live per-hole
 * player choice. `score` is the whole round's total; `front`/`back` are the two 9s split out. */
export interface FixedKeepLiveRow {
  teamNumber: number;
  players: string[];
  thru: number;
  score: string;
  front: string;
  back: string;
}

export const getFixedKeepLiveLeaderboard = async (teamGameId: number): Promise<FixedKeepLiveRow[]> => {
  try {
    const response = await fetch(`${API_URL}/team-games/${teamGameId}/irish-leaderboard`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as FixedKeepLiveRow[];
  } catch (error) {
    console.error('Error fetching fixed-keep live leaderboard:', error);
    return [];
  }
};

/** Save one hole's live keep-count choice for a 36/48 team. Returns an error message on failure
 * (e.g. the choice was no longer valid by the time it reached the server) so the caller can show
 * it, rather than a bare boolean -- this is a hard-validated write, not a best-effort one. */
export const saveTeamGameHoleKeep = async (
  teamGameId: number,
  teamNumber: number,
  holeId: number,
  keepCount: number,
  holesRemaining: number
): Promise<{ ok: boolean; error?: string }> => {
  try {
    const response = await fetch(`${API_URL}/team-games/${teamGameId}/hole-keep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamNumber, holeId, keepCount, holesRemaining }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: body.error || 'Failed to save keep count.' };
    }
    return { ok: true };
  } catch (error) {
    console.error('Error saving team game hole keep count:', error);
    return { ok: false, error: 'Failed to save keep count.' };
  }
};

/**
 * One player's hole-by-hole scores within the full-game scorecard grid
 */
export interface ScorecardRow {
  name: string;
  holes: Record<number, number>;
  out: number | null;
  in: number | null;
  total: number;
}

/**
 * Get every player's hole-by-hole scores for a game/side/scoreType via the API server
 */
export const getGameScorecard = async (gameId: number, side: 'F' | 'B' | 'T', scoreType: 'G' | 'N' | 'S'): Promise<ScorecardRow[]> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/scorecard?side=${side}&scoreType=${scoreType}`);
    if (!response.ok) return [];
    return (await response.json()) as ScorecardRow[];
  } catch (error) {
    console.error('Error fetching game scorecard:', error);
    return [];
  }
};

/**
 * Get the hole numbers that have recorded scores for a game via the API server
 */
export const getScoredHoles = async (gameId: number): Promise<number[]> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/scored-holes`);
    if (!response.ok) return [];
    return (await response.json()) as number[];
  } catch (error) {
    console.error('Error fetching scored holes:', error);
    return [];
  }
};

/**
 * A player tied for the low (skins) score on a given hole
 */
export interface SkinsHoleRow {
  name: string;
  gross: number;
  skins: number;
}

export type SkinsValidationMode = 'none' | 'par' | 'lowestNet';

/**
 * Whether the outright low-score winner backed up the skin on the next hole, per the
 * event's Validate Skins By option.
 */
export interface SkinsValidation {
  mode: SkinsValidationMode;
  validated: boolean;
  holeId?: number;
  par?: number;
  score?: number;
  netScore?: number;
  /** Only set for 'lowestNet' mode when not validated: the lowest net score shot on the follow-up hole. */
  lowestNet?: number;
  /** Only set for 'lowestNet' mode when not validated: who shot it — a name, or 'Multiple players'. */
  lowestNetHolder?: string;
}

export interface SkinsHoleResult {
  rows: SkinsHoleRow[];
  validation: SkinsValidation | null;
}

/**
 * Get the net skins winner (and validation) for a single hole via the API server
 */
export const getSkinsForHole = async (gameId: number, holeId: number): Promise<SkinsHoleResult> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/skins?hole=${holeId}`);
    if (!response.ok) return { rows: [], validation: null };
    return (await response.json()) as SkinsHoleResult;
  } catch (error) {
    console.error('Error fetching skins for hole:', error);
    return { rows: [], validation: null };
  }
};

export interface SkinsTotalsHole {
  holeId: number;
  validated: boolean;
}

export interface SkinsTotalsRow {
  name: string;
  skins: number;
  holes: SkinsTotalsHole[];
  payout: number | null;
}

export interface SkinsTotals {
  perSkin: number;
  validationMode: 'none' | 'par' | 'lowestNet';
  rows: SkinsTotalsRow[];
}

/**
 * Get the skins totals summary for a game via the API server
 */
export const getSkinsTotals = async (gameId: number): Promise<SkinsTotals> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/skins?hole=T`);
    if (!response.ok) return { perSkin: 0, validationMode: 'none', rows: [] };
    return (await response.json()) as SkinsTotals;
  } catch (error) {
    console.error('Error fetching skins totals:', error);
    return { perSkin: 0, validationMode: 'none', rows: [] };
  }
};

/** One won skin, for the in-game Skins Summary (mid-round, not the post-round payout totals) */
export interface GameSkinRow {
  holeId: number;
  name: string;
  score: number;
  validated: boolean;
}

/**
 * Get every skin won so far in this game, one row per hole, via the API server — powers the
 * live "Skins" button next to Swap Side during scoring.
 */
export const getGameSkinsSummary = async (gameId: number): Promise<GameSkinRow[]> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/skins-summary`);
    if (!response.ok) return [];
    return (await response.json()) as GameSkinRow[];
  } catch (error) {
    console.error('Error fetching game skins summary:', error);
    return [];
  }
};

/**
 * Recompute every scored hole's skins in one pass via the API server — used once when the
 * Summary view opens, so it reads a fully up-to-date cache instead of whatever partial state
 * individual hole-by-hole views happened to leave it in.
 */
export const recalculateSkins = async (gameId: number): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/skins/recalculate`, { method: 'POST' });
    return response.ok;
  } catch (error) {
    console.error('Error recalculating skins:', error);
    return false;
  }
};

/** Whether Gross Skins should show at all for this week (>=1 player marked paid for it). */
export const getGrossSkinsVisible = async (gameId: number): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/gross-skins-visible`);
    if (!response.ok) return false;
    const data = (await response.json()) as { visible: boolean };
    return data.visible;
  } catch (error) {
    console.error('Error checking gross skins visibility:', error);
    return false;
  }
};

export interface GrossSkinsHoleRow {
  name: string;
  gross: number;
}

/** Whether the outright low-score winner backed up the gross skin on the next hole (gross score
 * <= par, no configurable mode unlike net skins' Validate Skins By option). */
export interface GrossSkinsValidation {
  validated: boolean;
  holeId?: number;
  par?: number;
  score?: number;
}

export interface GrossSkinsHoleResult {
  rows: GrossSkinsHoleRow[];
  validation: GrossSkinsValidation | null;
}

/**
 * Get the gross skins winner (and validation) for a single hole via the API server
 */
export const getGrossSkinsForHole = async (gameId: number, holeId: number): Promise<GrossSkinsHoleResult> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/gross-skins?hole=${holeId}`);
    if (!response.ok) return { rows: [], validation: null };
    return (await response.json()) as GrossSkinsHoleResult;
  } catch (error) {
    console.error('Error fetching gross skins for hole:', error);
    return { rows: [], validation: null };
  }
};

export interface GrossSkinsTotalsHole {
  holeId: number;
  validated: boolean;
}

export interface GrossSkinsTotalsRow {
  name: string;
  skins: number;
  holes: GrossSkinsTotalsHole[];
  payout: number | null;
}

export interface GrossSkinsTotals {
  perSkin: number;
  rows: GrossSkinsTotalsRow[];
}

/**
 * Get the gross skins totals summary for a game via the API server
 */
export const getGrossSkinsTotals = async (gameId: number): Promise<GrossSkinsTotals> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/gross-skins?hole=T`);
    if (!response.ok) return { perSkin: 0, rows: [] };
    return (await response.json()) as GrossSkinsTotals;
  } catch (error) {
    console.error('Error fetching gross skins totals:', error);
    return { perSkin: 0, rows: [] };
  }
};

/**
 * Recompute every scored hole's gross skins in one pass via the API server — used once when the
 * Gross Skins Summary view opens.
 */
export const recalculateGrossSkins = async (gameId: number): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/gross-skins/recalculate`, { method: 'POST' });
    return response.ok;
  } catch (error) {
    console.error('Error recalculating gross skins:', error);
    return false;
  }
};

/**
 * A player with scores in a game, removable via this screen. `optedOut` flags anyone already
 * in OptOut for this game (e.g. a partial removal that never deleted their scores).
 */
export interface ActivePlayer {
  id: number;
  lastName: string;
  firstName: string;
  optedOut: boolean;
}

/**
 * Get players with scores for a game via the API server
 */
export const getActivePlayers = async (gameId: number): Promise<ActivePlayer[]> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/active-players`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as ActivePlayer[];
  } catch (error) {
    console.error('Error fetching active players:', error);
    return [];
  }
};

/**
 * Remove (opt out) one or more players from a game via the API server
 */
export const removePlayers = async (gameId: number, playerIds: number[]): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/optout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerIds }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error removing players:', error);
    return false;
  }
};

export interface RandomTeamsGameInfo {
  gameId: number;
  gameDate: string;
  alreadySet: boolean;
  stillPlaying: string[];
}

/**
 * Get the latest game for an event and whether its teams have already been randomized
 * via the API server
 */
export const getRandomTeamsStatus = async (eventId: number): Promise<RandomTeamsGameInfo | undefined> => {
  try {
    const response = await fetch(`${API_URL}/events/${eventId}/random-teams-status`);
    if (!response.ok) return undefined;
    return (await response.json()) as RandomTeamsGameInfo;
  } catch (error) {
    console.error('Error fetching random teams status:', error);
    return undefined;
  }
};

export interface RandomTeamPlayer {
  name: string;
  hdcp: number | null;
}

export interface RandomTeamResult {
  teamId: number;
  players: RandomTeamPlayer[];
}

/**
 * Get the current team roster for a game via the API server
 */
export const getRandomTeamsListing = async (gameId: number): Promise<RandomTeamResult[]> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/random-teams`);
    if (!response.ok) return [];
    return (await response.json()) as RandomTeamResult[];
  } catch (error) {
    console.error('Error fetching random teams:', error);
    return [];
  }
};

/** One team game's roster, labeled when a game has more than one active "Teams N" card */
export interface LabeledTeamGameResult extends RandomTeamResult {
  groupLabel: string | null;
}

/**
 * Get every drawn team for a game via the API server (Show Teams) — checks the current
 * multi-team-games system first, falling back to the legacy single-team-game table only for
 * older events that never set up a "Teams N" card.
 */
export const getShowTeamsListing = async (gameId: number): Promise<LabeledTeamGameResult[]> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/show-teams`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as LabeledTeamGameResult[];
  } catch (error) {
    console.error('Error fetching show-teams listing:', error);
    return [];
  }
};

export interface CreateRandomTeamsResult {
  alreadySet: boolean;
  teams: RandomTeamResult[];
  stillPlaying?: string[];
  notEnoughPlayers?: boolean;
}

/**
 * Generate random teams for a game via the API server
 */
export const createRandomTeams = async (gameId: number): Promise<CreateRandomTeamsResult | undefined> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/random-teams`, { method: 'POST' });
    if (!response.ok) return undefined;
    return (await response.json()) as CreateRandomTeamsResult;
  } catch (error) {
    console.error('Error creating random teams:', error);
    return undefined;
  }
};

/**
 * Get or create this event/course's current game via the API server. Throws with the
 * server's error message on failure (matches Start Game's existing try/catch behavior).
 */
export const getOrCreateGame = async (eventId: number, courseId: number): Promise<number> => {
  const response = await fetch(`${API_URL}/game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, courseId }),
  });
  const data = (await response.json()) as { gameId: number; error?: string };
  if (!response.ok) throw new Error(data.error || 'Failed to get or create game');
  return data.gameId;
};

/**
 * Save a player's handicap as entered for this game via the API server (mirrors legacy
 * startgame.php's Hdcp write) — records the golfer's real, uncapped handicap so it prefills
 * correctly next time, even if the event's Max Hdcp option capped what's actually played with.
 *
 * Retries a couple of times before giving up — Start Game fires one of these per player in a
 * `Promise.all` burst the moment a foursome checks in, and under heavy concurrent load (e.g. a
 * large field all starting around the same time) that whole burst can lose the race for a
 * connection and fail. Confirmed real 2026-07-12: 14 players across 6 different groups had their
 * scores save fine but never got an Hdcp row for the game at all, with nothing telling anyone it
 * had happened — every downstream handicap lookup for them silently fell back to a stale prior
 * value instead of what they actually played with.
 */
export const saveGameHandicap = async (gameId: number, playerId: number, hdcp: number): Promise<boolean> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${API_URL}/games/${gameId}/handicap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, hdcp }),
      });
      if (response.ok) return true;
      console.error('Error saving handicap: server returned', response.status);
    } catch (error) {
      console.error('Error saving handicap:', error);
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return false;
};

/**
 * Start Game hook: register a checked-in foursome as a team in any 'group'-mode team game for
 * this round via the API server — a no-op unless the event has explicitly created one.
 */
export const addOrUpdateGroupTeam = async (gameId: number, playerIds: number[]): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/group-team`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerIds }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error updating group team:', error);
    return false;
  }
};

/**
 * Start Game hook: always record "who played together" for crash/exit recovery via the API
 * server — independent of any team-game scoring, runs for every event.
 */
export const upsertPlayingGroup = async (gameId: number, playerIds: number[]): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/playing-group`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerIds }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error updating playing group:', error);
    return false;
  }
};

/**
 * Get the other players recorded as part of a player's current group for this round via the API
 * server — powers Start Game's "resume this group?" prompt. Empty array if none recorded.
 */
export const getPlayingGroup = async (gameId: number, playerId: number): Promise<number[]> => {
  try {
    const response = await fetch(`${API_URL}/games/${gameId}/playing-group/${playerId}`, { cache: 'no-store' });
    if (!response.ok) return [];
    const data = (await response.json()) as { playerIds: number[] };
    return data.playerIds;
  } catch (error) {
    console.error('Error fetching playing group:', error);
    return [];
  }
};

/** A course's hole-by-hole par/handicap layout */
export interface CourseHole {
  holeNum: number;
  par: number;
  /** Gender-agnostic fallback ranking -- used when a gender's own cached tee data isn't
   * available. See hdcpMale/hdcpFemale and utils/handicap.ts's hdcpForPlayer. */
  hdcp: number;
  /** Men's stroke index at this hole, from the cached GHIN tee data -- every Men's tee at a
   * course shares one ranking. Null if the course has no cached Men's tee data. */
  hdcpMale: number | null;
  /** Women's stroke index -- can genuinely differ from hdcpMale hole-to-hole. */
  hdcpFemale: number | null;
}

/**
 * Get a course's hole-by-hole par/handicap details via the API server
 */
export const getCourseDetails = async (courseId: number): Promise<CourseHole[]> => {
  try {
    const response = await fetch(`${API_URL}/courses/${courseId}/details`);
    if (!response.ok) return [];
    return (await response.json()) as CourseHole[];
  } catch (error) {
    console.error('Error fetching course details:', error);
    return [];
  }
};

/** One hole's all-time stats for a course — mirrors chistory.php */
export interface CourseHoleHistory {
  holeNum: number;
  par: number;
  hdcp: number;
  avgScore: string | null;
  avgNet: string | null;
}

/**
 * Get a course's all-time per-hole average score/net via the API server
 */
export const getCourseHoleHistory = async (courseId: number): Promise<CourseHoleHistory[]> => {
  try {
    const response = await fetch(`${API_URL}/courses/${courseId}/history`);
    if (!response.ok) return [];
    return (await response.json()) as CourseHoleHistory[];
  } catch (error) {
    console.error('Error fetching course history:', error);
    return [];
  }
};

/**
 * Get a player's saved gross scores for a game, keyed by hole number, via the API server
 */
export const getPlayerGameScores = async (gameId: number, playerId: number): Promise<Record<number, number>> => {
  try {
    const response = await fetch(`${API_URL}/scores/${gameId}/${playerId}`);
    if (!response.ok) return {};
    return (await response.json()) as Record<number, number>;
  } catch (error) {
    console.error('Error fetching player scores:', error);
    return {};
  }
};

/** One player's hole score entry within a score-save payload */
export interface HoleScoreEntry {
  gameId: number;
  playerId: number;
  courseId: number;
  holeNumber: number;
  grossScore: number;
  netScore: number;
  skinsScore: number;
}

/** Payload for saving one player's hole score(s) */
export interface SaveScoresPayload {
  gameId: number;
  playerId: number;
  courseId: number;
  scores: HoleScoreEntry[];
}

/**
 * Save a player's hole score(s) for a game via the API server
 */
export const savePlayerHoleScores = async (payload: SaveScoresPayload): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) console.error('Failed to save score:', await response.text());
    return response.ok;
  } catch (error) {
    console.error('Error saving score:', error);
    return false;
  }
};

/**
 * Delete a player's saved scores for specific holes via the API server (Swap Sides, after
 * moving a hole's score to its mirrored hole).
 */
export const deletePlayerHoleScores = async (gameId: number, playerId: number, holeNumbers: number[]): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/scores/${gameId}/${playerId}/delete-holes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holeNumbers }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error deleting hole scores:', error);
    return false;
  }
};

/** One logged bug or idea (Menu -> Feedback) — app-wide, not scoped to any one event */
export interface FeedbackEntry {
  id: number;
  type: 'Bug' | 'Idea';
  title: string;
  description: string;
  submittedBy: string;
  dateEntered: string;
  /** Hidden from the log by default (see the "Show Resolved" toggle) once marked done. */
  resolved: boolean;
}

/** Log a bug or idea via the API server */
export const submitFeedback = async (
  type: 'Bug' | 'Idea',
  title: string,
  description: string,
  submittedBy: string
): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, title, description, submittedBy }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error submitting feedback:', error);
    return false;
  }
};

/** Get the full bug/idea log via the API server */
export const getFeedback = async (): Promise<FeedbackEntry[]> => {
  try {
    const response = await fetch(`${API_URL}/feedback`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as FeedbackEntry[];
  } catch (error) {
    console.error('Error fetching feedback:', error);
    return [];
  }
};

/** Delete one feedback entry (spam/duplicate cleanup) — only shown in the UI from the master
 * event, see app/feedback.tsx. */
export const deleteFeedback = async (feedbackId: number): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/feedback/${feedbackId}`, { method: 'DELETE' });
    return response.ok;
  } catch (error) {
    console.error('Error deleting feedback:', error);
    return false;
  }
};

/** Mark (or unmark) one feedback entry resolved — only shown in the UI from the master event,
 * see app/feedback.tsx. */
export const setFeedbackResolved = async (feedbackId: number, resolved: boolean): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/feedback/${feedbackId}/resolved`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error setting feedback resolved status:', error);
    return false;
  }
};
