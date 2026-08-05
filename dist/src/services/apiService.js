"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNaughtyList = exports.addTeeTime = exports.setGrossSkinsPaid = exports.getGrossSkinsPaidList = exports.getGrossSkinsTrackerDates = exports.setPaidTracker = exports.getPaidTrackerList = exports.getTeeTimes = exports.getCourses = exports.getPlayerCourseHandicaps = exports.getGamePlayerHandicap = exports.getPlayerHandicap = exports.getPlayerRecentSkins = exports.getPlayerSkinsStats = exports.getPlayerRounds = exports.getPlayerStats = exports.getAllPlayersWithHistory = exports.deleteEmptyGames = exports.getEmptyGames = exports.deleteOrphanedRows = exports.getOrphanedRows = exports.deleteOrphanedEventLinks = exports.getOrphanedEventLinks = exports.deleteOrphanedPlayers = exports.getInvalidNamePlayers = exports.getOrphanedPlayers = exports.ignoreMergeSuggestion = exports.getMergeSuggestions = exports.mergePlayers = exports.getMergePreview = exports.searchPlayersInEvent = exports.searchAllPlayers = exports.renamePlayer = exports.getPlayerListForEvent = exports.linkPlayers = exports.getUnlinkedPlayers = exports.assignGuestPlayer = exports.addPlayer = exports.getEventPlayers = exports.getCourseList = exports.getGhinCourseDetail = exports.searchGhinCourses = exports.createCourse = exports.renameEventCourse = exports.renameEvent = exports.getEventById = exports.deleteEvent = exports.getAllEventsWithCounts = exports.searchAllEventsForMaster = exports.searchEvents = void 0;
exports.swapPlayersInGame = exports.getGameSwapPreview = exports.getPlayersForGame = exports.getGamesForEvent = exports.getDefaultScorecardSide = exports.getLeaderboard = exports.updateGameCourse = exports.ensureGameForDate = exports.getTeamGameWeeks = exports.getLatestGame = exports.createEvent = exports.deleteCalendarDay = exports.setCalendarDay = exports.getEventCalendar = exports.deleteUpsCupWinner = exports.setUpsCupWinner = exports.getUpsCupWinners = exports.getHoleBirdieDetail = exports.getPlayerBirdieStatus = exports.getBirdieLeaderboard = exports.removePlayerPaid = exports.setPlayerPaid = exports.getPaidPlayers = exports.getCurrentStandings = exports.getIneligiblePlayers = exports.getUpsPoints = exports.getMajorWinners = exports.setAdminPassword = exports.verifyAdminPassword = exports.getAdminPasswordStatus = exports.getPayoutReview = exports.getSeasonPayoutSummary = exports.getHoleInOneCelebration = exports.getWeekPurse = exports.syncGamePayouts = exports.resetGamePayoutOptions = exports.saveGamePayoutOptions = exports.getGamePayoutOptions = exports.saveEventOptions = exports.getEventOptions = exports.savePlayerStatus = exports.getPlayerStatus = exports.getGhinYears = exports.getGhinSummary = exports.getEasyGhinLinks = exports.linkPlayerGhin = exports.searchGhin = exports.setPlayerGhinSkip = exports.getGhinPlayerList = exports.recheckNaughtyPosting = void 0;
exports.getRandomTeamsStatus = exports.removePlayers = exports.getActivePlayers = exports.recalculateGrossSkins = exports.getGrossSkinsTotals = exports.getGrossSkinsForHole = exports.getGrossSkinsVisible = exports.recalculateSkins = exports.getGameSkinsSummary = exports.getSkinsTotals = exports.getSkinsForHole = exports.getScoredHoles = exports.getGameScorecard = exports.saveTeamGameHoleKeep = exports.getFixedKeepLiveLeaderboard = exports.getIrishRumbleTeamsForGame = exports.getTeamGameHoleKeep = exports.getKeepTeamsForGame = exports.getBestPossibleWeeks = exports.getTeamBestPossible = exports.getTeamGameLiveLeaderboard = exports.getTeamGameScorecard = exports.getTeamGameCutSummary = exports.getTeamGameResults = exports.createRandomTeamGameTeams = exports.getTeamGameRoster = exports.saveManualTeamGameTeams = exports.getTeamGameAssignments = exports.getTeamGameStatus = exports.deleteTeamGame = exports.skipTeamGameSlot = exports.createTeamGame = exports.listTeamGames = exports.getPlayerScorecard = exports.getTeamScorecard = exports.saveTeams = exports.getTeamAssignments = exports.getOptedOutPlayers = exports.unignoreCleanupItem = exports.getIgnoredCleanupItems = exports.ignoreCleanupCandidates = exports.deleteCleanupCandidates = exports.getAllEventsCleanupCandidates = exports.getCleanupCandidates = exports.getCutSummary = exports.getTeamResults = exports.getTeamStatus = exports.getWeekResults = exports.getWhatIfResults = exports.getWhatIfTeamGameOptions = void 0;
exports.getFeedback = exports.submitFeedback = exports.deletePlayerHoleScores = exports.savePlayerHoleScores = exports.getPlayerGameScores = exports.getCourseHoleHistory = exports.getCourseDetails = exports.getPlayingGroup = exports.upsertPlayingGroup = exports.addOrUpdateGroupTeam = exports.saveGameHandicap = exports.getOrCreateGame = exports.createRandomTeams = exports.getShowTeamsListing = exports.getRandomTeamsListing = void 0;
// Production API URL - always use this for built apps
const API_URL = 'https://api.myclubgolf.com/api';
/**
 * Search events by name or course name via the API server
 */
const searchEvents = async (query) => {
    try {
        const url = query.trim() ? `${API_URL}/events?q=${encodeURIComponent(query)}` : `${API_URL}/events`;
        const response = await fetch(url);
        if (!response.ok)
            throw new Error('Failed to fetch events');
        const data = await response.json();
        return (Array.isArray(data) ? data : (data.value || []));
    }
    catch (error) {
        console.error('Error fetching events:', error);
        return [];
    }
};
exports.searchEvents = searchEvents;
/** Search every event including hidden/master ones — Master Tools only */
const searchAllEventsForMaster = async (query) => {
    try {
        const url = query.trim() ? `${API_URL}/master-events?q=${encodeURIComponent(query)}` : `${API_URL}/master-events`;
        const response = await fetch(url);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error searching all events:', error);
        return [];
    }
};
exports.searchAllEventsForMaster = searchAllEventsForMaster;
/** Get every event with linked-player/score counts via the API server — Master Tools -> Manage Events. */
const getAllEventsWithCounts = async () => {
    try {
        const response = await fetch(`${API_URL}/events/all-with-counts`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching events with counts:', error);
        return [];
    }
};
exports.getAllEventsWithCounts = getAllEventsWithCounts;
/** Permanently delete an event and every row of data it owns via the API server. */
const deleteEvent = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}`, { method: 'DELETE' });
        return response.ok;
    }
    catch (error) {
        console.error('Error deleting event:', error);
        return false;
    }
};
exports.deleteEvent = deleteEvent;
/**
 * Get a single event by ID via the API server
 */
const getEventById = async (id) => {
    try {
        const response = await fetch(`${API_URL}/events/${id}`);
        if (!response.ok)
            return undefined;
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching event:', error);
        return undefined;
    }
};
exports.getEventById = getEventById;
/** Rename an event's display name (Admin hub's pencil-edit). */
const renameEvent = async (eventId, eventName) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventName }),
        });
        if (response.ok)
            return { ok: true };
        const data = (await response.json());
        return { ok: false, error: data.error ?? 'Failed to rename event.' };
    }
    catch (error) {
        console.error('Error renaming event:', error);
        return { ok: false, error: 'Failed to rename event.' };
    }
};
exports.renameEvent = renameEvent;
/** Rename an event's default course label (Admin hub's pencil-edit). */
const renameEventCourse = async (eventId, courseName) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courseName }),
        });
        if (response.ok)
            return { ok: true };
        const data = (await response.json());
        return { ok: false, error: data.error ?? 'Failed to rename course.' };
    }
    catch (error) {
        console.error('Error renaming event course:', error);
        return { ok: false, error: 'Failed to rename course.' };
    }
};
exports.renameEventCourse = renameEventCourse;
/**
 * Create a new course with its hole-by-hole par/handicap/yardage layout via the API server.
 * `ghinInfo`/`ghinTeeSets` are only passed when the course came from GHIN's "Search GHIN Course
 * Database" flow — `ghinTeeSets` caches every tee GHIN has on file (not just the one used for
 * `holes`) so Start Game's tee picker doesn't need a second live GHIN fetch.
 */
const createCourse = async (courseName, holes, ghinInfo, ghinTeeSets) => {
    try {
        const response = await fetch(`${API_URL}/courses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courseName, holes, ghinInfo, ghinTeeSets }),
        });
        if (!response.ok)
            return null;
        const data = (await response.json());
        return data.id;
    }
    catch (error) {
        console.error('Error creating course:', error);
        return null;
    }
};
exports.createCourse = createCourse;
/**
 * Search GHIN's own course database by name, optionally narrowed to a 2-letter state — powers
 * Add Course's "Search GHIN Course Database" flow, so par/handicap/yardage come from GHIN's own
 * numbers instead of an OCR scan or manual entry.
 */
const searchGhinCourses = async (name, state) => {
    try {
        const params = new URLSearchParams({ name });
        if (state)
            params.set('state', state);
        const response = await fetch(`${API_URL}/ghin/course-search?${params.toString()}`);
        if (!response.ok)
            return [];
        const data = await response.json();
        return (Array.isArray(data) ? data : []);
    }
    catch (error) {
        console.error('Error searching GHIN courses:', error);
        return [];
    }
};
exports.searchGhinCourses = searchGhinCourses;
/** Fetch a GHIN course search result's full tee-set detail (par/handicap/yardage per tee). */
const getGhinCourseDetail = async (courseId) => {
    try {
        const response = await fetch(`${API_URL}/ghin/course-detail?courseId=${courseId}`);
        if (!response.ok)
            return null;
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching GHIN course detail:', error);
        return null;
    }
};
exports.getGhinCourseDetail = getGhinCourseDetail;
/**
 * Get all courses from the database via the API server
 */
const getCourseList = async () => {
    try {
        const response = await fetch(`${API_URL}/courses`);
        if (!response.ok)
            return [];
        const data = await response.json();
        return (Array.isArray(data) ? data : []);
    }
    catch (error) {
        console.error('Error fetching courses:', error);
        return [];
    }
};
exports.getCourseList = getCourseList;
/**
 * Get players registered for an event via the API server
 */
const getEventPlayers = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/players`);
        if (!response.ok)
            return [];
        const rows = (await response.json());
        // Build display names matching PHP logic: "LastName, FirstName" or just "FirstName"
        return rows.map((r) => ({
            id: r.id,
            lastName: r.LastName?.trim() || '',
            firstName: r.FirstName?.trim() || '',
            displayName: (r.LastName && r.LastName.trim()) ? `${r.LastName.trim()}, ${r.FirstName.trim()}` : r.FirstName?.trim() || `Player #${r.id}`,
        })).filter((p) => p.displayName && p.displayName !== '' && p.displayName !== ', ');
    }
    catch (error) {
        console.error('Error fetching event players:', error);
        return [];
    }
};
exports.getEventPlayers = getEventPlayers;
/**
 * Add a player to an event via the API server (mirrors addplayer.php, minus Handicap)
 */
const addPlayer = async (eventId, player) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/players`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(player),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error adding player:', error);
        return false;
    }
};
exports.addPlayer = addPlayer;
/**
 * Assign a guest player for a round (Start Game -> + Add Guest) — reuses an existing "Guest N"
 * at this course not already in today's game (or in `excludePlayerIds`, the other slots already
 * picked in this same foursome), only minting a new one if every existing slot is taken.
 */
const assignGuestPlayer = async (eventId, courseId, excludePlayerIds) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/assign-guest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courseId, excludePlayerIds }),
        });
        if (!response.ok)
            return null;
        return (await response.json());
    }
    catch (error) {
        console.error('Error assigning guest player:', error);
        return null;
    }
};
exports.assignGuestPlayer = assignGuestPlayer;
/**
 * Get players not yet linked to an event via the API server (mirrors linkplayers.php)
 */
const getUnlinkedPlayers = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/unlinked-players`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching unlinked players:', error);
        return [];
    }
};
exports.getUnlinkedPlayers = getUnlinkedPlayers;
/**
 * Link a batch of existing players to an event via the API server (mirrors savelinked.php)
 */
const linkPlayers = async (eventId, playerIds) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/link-players`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerIds }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error linking players:', error);
        return false;
    }
};
exports.linkPlayers = linkPlayers;
/**
 * Get players linked to an event, with contact info, via the API server (mirrors playerlist.php)
 */
const getPlayerListForEvent = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/player-list`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching player list:', error);
        return [];
    }
};
exports.getPlayerListForEvent = getPlayerListForEvent;
/** Rename a player (Admin -> Player List's pencil-edit) — keeps the same PlayerID, so scores
 * and history stay linked; rejected if the new name collides with any other player. */
const renamePlayer = async (playerId, firstName, lastName) => {
    try {
        const response = await fetch(`${API_URL}/players/${playerId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firstName, lastName }),
        });
        if (response.ok)
            return { ok: true };
        const data = (await response.json());
        return { ok: false, error: data.error ?? 'Failed to rename player.' };
    }
    catch (error) {
        console.error('Error renaming player:', error);
        return { ok: false, error: 'Failed to rename player.' };
    }
};
exports.renamePlayer = renamePlayer;
/** Search every player in the system by name, not scoped to one event's roster */
const searchAllPlayers = async (query) => {
    try {
        const response = await fetch(`${API_URL}/players/search?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error searching players:', error);
        return [];
    }
};
exports.searchAllPlayers = searchAllPlayers;
/** Search players within one event's roster — Admin -> Players -> Swap Players' "Correct
 * Player" picker, unlike Merge Players' system-wide search */
const searchPlayersInEvent = async (eventId, query) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/players/search?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error searching players in event:', error);
        return [];
    }
};
exports.searchPlayersInEvent = searchPlayersInEvent;
/** Preview a player merge's affected row counts before committing to it */
const getMergePreview = async (duplicateId, targetId) => {
    try {
        const response = await fetch(`${API_URL}/players/merge-preview?duplicateId=${duplicateId}&targetId=${targetId}`);
        if (!response.ok)
            return null;
        return (await response.json());
    }
    catch (error) {
        console.error('Error previewing player merge:', error);
        return null;
    }
};
exports.getMergePreview = getMergePreview;
/** Merge a duplicate player into the correct player, moving all their data over */
const mergePlayers = async (duplicateId, targetId) => {
    try {
        const response = await fetch(`${API_URL}/players/merge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ duplicateId, targetId }),
        });
        const data = (await response.json());
        if (response.ok)
            return { ok: true };
        return { ok: false, error: data.error ?? 'Failed to merge players.' };
    }
    catch (error) {
        console.error('Error merging players:', error);
        return { ok: false, error: 'Failed to merge players.' };
    }
};
exports.mergePlayers = mergePlayers;
/** Scan every player for likely duplicate identities via the API server. */
const getMergeSuggestions = async () => {
    try {
        const response = await fetch(`${API_URL}/merge-suggestions`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching merge suggestions:', error);
        return [];
    }
};
exports.getMergeSuggestions = getMergeSuggestions;
/** Mark a suggested pair as reviewed and not the same person via the API server. */
const ignoreMergeSuggestion = async (playerId1, playerId2) => {
    try {
        const response = await fetch(`${API_URL}/merge-suggestions/ignore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId1, playerId2 }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error ignoring merge suggestion:', error);
        return false;
    }
};
exports.ignoreMergeSuggestion = ignoreMergeSuggestion;
/** Every player not linked to any event */
const getOrphanedPlayers = async () => {
    try {
        const response = await fetch(`${API_URL}/players/orphaned`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching orphaned players:', error);
        return [];
    }
};
exports.getOrphanedPlayers = getOrphanedPlayers;
/** Every player with an invalid name — the first check is blank first+last name */
const getInvalidNamePlayers = async () => {
    try {
        const response = await fetch(`${API_URL}/players/invalid-names`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching invalid-name players:', error);
        return [];
    }
};
exports.getInvalidNamePlayers = getInvalidNamePlayers;
/** Delete orphaned players entirely, including any leftover data they still have */
const deleteOrphanedPlayers = async (playerIds) => {
    try {
        const response = await fetch(`${API_URL}/players/orphaned/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerIds }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error deleting orphaned players:', error);
        return false;
    }
};
exports.deleteOrphanedPlayers = deleteOrphanedPlayers;
/** Every phantom EventID still referenced somewhere but with no Events row */
const getOrphanedEventLinks = async () => {
    try {
        const response = await fetch(`${API_URL}/events/orphaned`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching orphaned event links:', error);
        return [];
    }
};
exports.getOrphanedEventLinks = getOrphanedEventLinks;
/** Delete the leftover EventPlayers/EventOptions/EventCalendar/TeeTimes rows for phantom EventIDs */
const deleteOrphanedEventLinks = async (eventIds) => {
    try {
        const response = await fetch(`${API_URL}/events/orphaned/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventIds }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error deleting orphaned event links:', error);
        return false;
    }
};
exports.deleteOrphanedEventLinks = deleteOrphanedEventLinks;
/** Scan every known relationship in the schema for dangling rows via the API server. */
const getOrphanedRows = async () => {
    try {
        const response = await fetch(`${API_URL}/orphaned-rows`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching orphaned rows:', error);
        return [];
    }
};
exports.getOrphanedRows = getOrphanedRows;
/** Delete every dangling row for the selected relationships via the API server. */
const deleteOrphanedRows = async (keys) => {
    try {
        const response = await fetch(`${API_URL}/orphaned-rows/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keys }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error deleting orphaned rows:', error);
        return false;
    }
};
exports.deleteOrphanedRows = deleteOrphanedRows;
/** Every game with zero Score rows, across every event */
const getEmptyGames = async () => {
    try {
        const response = await fetch(`${API_URL}/games/orphaned`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching empty games:', error);
        return [];
    }
};
exports.getEmptyGames = getEmptyGames;
/** Delete empty games entirely */
const deleteEmptyGames = async (gameIds) => {
    try {
        const response = await fetch(`${API_URL}/games/orphaned/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameIds }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error deleting empty games:', error);
        return false;
    }
};
exports.deleteEmptyGames = deleteEmptyGames;
/**
 * Get every player who has ever recorded a score, across all events, via the API server
 */
const getAllPlayersWithHistory = async () => {
    try {
        const response = await fetch(`${API_URL}/players/history-list`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching player history list:', error);
        return [];
    }
};
exports.getAllPlayersWithHistory = getAllPlayersWithHistory;
/**
 * Get a player's all-time gross/net average/min/max via the API server
 */
const getPlayerStats = async (playerId) => {
    try {
        const response = await fetch(`${API_URL}/players/${playerId}/stats`);
        if (!response.ok)
            return null;
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching player stats:', error);
        return null;
    }
};
exports.getPlayerStats = getPlayerStats;
/**
 * Get a player's 20 most recent full 18-hole rounds via the API server
 */
const getPlayerRounds = async (playerId) => {
    try {
        const response = await fetch(`${API_URL}/players/${playerId}/rounds`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching player rounds:', error);
        return [];
    }
};
exports.getPlayerRounds = getPlayerRounds;
/**
 * Get a player's all-time validated/unvalidated skins counts via the API server
 */
const getPlayerSkinsStats = async (playerId) => {
    try {
        const response = await fetch(`${API_URL}/players/${playerId}/skins-stats`);
        if (!response.ok)
            return { totalValidated: 0, totalUnvalidated: 0 };
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching player skins stats:', error);
        return { totalValidated: 0, totalUnvalidated: 0 };
    }
};
exports.getPlayerSkinsStats = getPlayerSkinsStats;
/**
 * Get a player's 20 most recent skins via the API server
 */
const getPlayerRecentSkins = async (playerId) => {
    try {
        const response = await fetch(`${API_URL}/players/${playerId}/recent-skins`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching player recent skins:', error);
        return [];
    }
};
exports.getPlayerRecentSkins = getPlayerRecentSkins;
/**
 * Get latest handicap for a player via the API server
 */
const getPlayerHandicap = async (playerId) => {
    try {
        // no-store: this is live data (their handicap can change between games) and repeat lookups
        // of the same URL in one browser session were getting served a 304 Not Modified from the
        // browser's HTTP cache — outside fetch's 200-299 "ok" range, so a perfectly valid response
        // was being treated as a failure (confirmed real case 2026-07-07: worked the first time,
        // silently failed on every repeat click of the same player).
        const response = await fetch(`${API_URL}/players/${playerId}/handicap`, { cache: 'no-store' });
        if (!response.ok)
            return '';
        const data = (await response.json());
        return String(data.handicap ?? '');
    }
    catch (error) {
        console.error('Error fetching handicap:', error);
        return '';
    }
};
exports.getPlayerHandicap = getPlayerHandicap;
/** A player's handicap already saved for THIS specific game -- null if they've never had one
 * saved for this exact round. Used by Start Game to skip the tee/handicap prompt entirely when
 * re-adding someone who already went through it earlier today (resuming after a crash, or being
 * re-picked after Resume Group), instead of re-asking every time. */
const getGamePlayerHandicap = async (gameId, playerId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/handicap/${playerId}`, { cache: 'no-store' });
        if (!response.ok)
            return null;
        const data = (await response.json());
        return data.hdcp ?? null;
    }
    catch (error) {
        console.error('Error fetching game player handicap:', error);
        return null;
    }
};
exports.getGamePlayerHandicap = getGamePlayerHandicap;
/**
 * Get a GHIN-linked player's live index + Course Handicap per tee via the API server. Returns
 * null if the player has no GHIN on file or this course has no known GHIN course id — caller
 * should fall back to manual handicap entry (getPlayerHandicap) either way.
 */
const getPlayerCourseHandicaps = async (playerId, courseId) => {
    try {
        // no-store: see getPlayerHandicap's comment — same 304-from-browser-cache issue applies here.
        const response = await fetch(`${API_URL}/players/${playerId}/course-handicaps?courseId=${courseId}`, { cache: 'no-store' });
        if (!response.ok)
            return null;
        const data = (await response.json());
        return data && data.options ? data : null;
    }
    catch (error) {
        console.error('Error fetching course handicaps:', error);
        return null;
    }
};
exports.getPlayerCourseHandicaps = getPlayerCourseHandicaps;
/**
 * Get all courses via the API server
 */
const getCourses = async () => {
    try {
        const response = await fetch(`${API_URL}/courses`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching courses:', error);
        return [];
    }
};
exports.getCourses = getCourses;
/**
 * Get tee times for an event via the API server
 */
const getTeeTimes = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/teetimes`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching tee times:', error);
        return [];
    }
};
exports.getTeeTimes = getTeeTimes;
/**
 * Get everyone registered for a tee date, with paid status, via the API server.
 */
const getPaidTrackerList = async (eventId, teeDate) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/paid-tracker?teeDate=${teeDate}`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching paid tracker list:', error);
        return [];
    }
};
exports.getPaidTrackerList = getPaidTrackerList;
/**
 * Mark a player paid/unpaid for a tee date via the API server.
 */
const setPaidTracker = async (eventId, teeDate, playerId, paid) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/paid-tracker`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId, teeDate, paid }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error setting paid tracker status:', error);
        return false;
    }
};
exports.setPaidTracker = setPaidTracker;
/**
 * Date list for Gross Skins Tracker's date picker -- last month through the future (unlike Paid
 * Tracker's future-only date list), with a suggested default sourced from the Setup Calendar's
 * next 'event'/'major' day.
 */
const getGrossSkinsTrackerDates = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/gross-skins-tracker-dates`);
        if (!response.ok)
            return { dates: [], defaultDate: null };
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching gross skins tracker dates:', error);
        return { dates: [], defaultDate: null };
    }
};
exports.getGrossSkinsTrackerDates = getGrossSkinsTrackerDates;
/**
 * Get everyone registered for a tee date, with Gross Skins paid status, via the API server.
 */
const getGrossSkinsPaidList = async (eventId, teeDate) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/gross-skins-tracker?teeDate=${teeDate}`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching gross skins paid list:', error);
        return [];
    }
};
exports.getGrossSkinsPaidList = getGrossSkinsPaidList;
/**
 * Mark a player paid/unpaid for Gross Skins for a tee date via the API server.
 */
const setGrossSkinsPaid = async (eventId, teeDate, playerId, paid) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/gross-skins-tracker`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId, teeDate, paid }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error setting gross skins paid status:', error);
        return false;
    }
};
exports.setGrossSkinsPaid = setGrossSkinsPaid;
/**
 * Add tee times for an event/date via the API server (mirrors addtimes.php)
 */
const addTeeTime = async (eventId, teeTime) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/teetimes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(teeTime),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error adding tee time:', error);
        return false;
    }
};
exports.addTeeTime = addTeeTime;
/**
 * Get GHIN posting compliance for a game via the API server (mirrors posted_scores.php)
 */
const getNaughtyList = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/naughty-list`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching naughty list:', error);
        return [];
    }
};
exports.getNaughtyList = getNaughtyList;
/**
 * Manually re-check GHIN for one "not posted" Naughty List row, widening the search to the next
 * 7 days and matching on exact gross score, via the API server.
 */
const recheckNaughtyPosting = async (gameId, playerId) => {
    const response = await fetch(`${API_URL}/games/${gameId}/players/${playerId}/naughty-recheck`, {
        method: 'POST',
    });
    if (!response.ok)
        throw new Error('Failed to re-check GHIN posting');
    return (await response.json());
};
exports.recheckNaughtyPosting = recheckNaughtyPosting;
/**
 * Get the GHIN-linking player list for an event via the API server (mirrors ghin_playerlist.php)
 */
const getGhinPlayerList = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/ghin-players`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching GHIN player list:', error);
        return [];
    }
};
exports.getGhinPlayerList = getGhinPlayerList;
/**
 * Skip (or un-skip) a player from the GHIN-linking flow — e.g. someone who will never have a
 * GHIN (a minor), so they stop showing up in the default missing-GHIN view and in Check Easy
 * Links, without losing the ability to un-skip and look again later.
 */
const setPlayerGhinSkip = async (playerId, skip) => {
    try {
        const response = await fetch(`${API_URL}/players/${playerId}/ghin-skip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skip }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error setting GHIN skip:', error);
        return false;
    }
};
exports.setPlayerGhinSkip = setPlayerGhinSkip;
/**
 * Search the real GHIN Network for a golfer by name/state, to find their real GHIN number.
 * Passing `course` also runs a nationwide "posted at our course" fallback check for anyone the
 * name/state search alone misses (e.g. a stale/blank club affiliation on GHIN's end).
 */
const searchGhin = async (firstName, lastName, state, course = '') => {
    try {
        const response = await fetch(`${API_URL}/ghin/search?fname=${encodeURIComponent(firstName)}&lname=${encodeURIComponent(lastName)}&state=${encodeURIComponent(state)}&course=${encodeURIComponent(course)}`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error searching GHIN:', error);
        return [];
    }
};
exports.searchGhin = searchGhin;
/**
 * Link a player to a real GHIN number found via `searchGhin`
 */
const linkPlayerGhin = async (playerId, ghin) => {
    try {
        const response = await fetch(`${API_URL}/players/${playerId}/ghin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ghin }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error linking GHIN:', error);
        return false;
    }
};
exports.linkPlayerGhin = linkPlayerGhin;
/**
 * Find unambiguous GHIN Network matches for every non-guest player linked to this event who
 * has no GHIN on file yet. This searches the real GHIN Network once per unlinked player (after a
 * single login), so a roster with many missing GHINs can take upwards of 15-20 seconds — unlike
 * the rest of this file, failures are rethrown rather than swallowed to `[]`, so a slow/dropped
 * request surfaces as a visible error instead of silently looking identical to "found nothing."
 */
const getEasyGhinLinks = async (eventId) => {
    const response = await fetch(`${API_URL}/events/${eventId}/ghin-easy-links`);
    if (!response.ok)
        throw new Error(`Server returned ${response.status}`);
    return (await response.json());
};
exports.getEasyGhinLinks = getEasyGhinLinks;
/**
 * Get GHIN posting record per player for a year via the API server (mirrors ghin_summary.php)
 */
const getGhinSummary = async (eventId, year) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/ghin-summary?year=${year}`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching GHIN summary:', error);
        return [];
    }
};
exports.getGhinSummary = getGhinSummary;
/**
 * Get the years with GHIN posting data for an event via the API server
 */
const getGhinYears = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/ghin-years`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching GHIN years:', error);
        return [];
    }
};
exports.getGhinYears = getGhinYears;
/**
 * Get player status for a specific date via the API server
 */
const getPlayerStatus = async (eventId, teeDate) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/status?teeDate=${encodeURIComponent(teeDate)}`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching player status:', error);
        return [];
    }
};
exports.getPlayerStatus = getPlayerStatus;
/**
 * Save player In/Out status via the API server
 */
const savePlayerStatus = async (eventId, playerId, teeDate, status) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId, teeDate, status }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error saving player status:', error);
        return false;
    }
};
exports.savePlayerStatus = savePlayerStatus;
/**
 * Get an event's options via the API server (mirrors options.php)
 */
const getEventOptions = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/options`);
        if (!response.ok)
            return undefined;
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching event options:', error);
        return undefined;
    }
};
exports.getEventOptions = getEventOptions;
/**
 * Save an event's options via the API server (mirrors saveoptions.php)
 */
const saveEventOptions = async (eventId, options) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/options`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error saving event options:', error);
        return false;
    }
};
exports.saveEventOptions = saveEventOptions;
/**
 * Get a single week's effective payout settings (event defaults merged with any override
 * saved just for that game) -- lets Week Results adjust one week's payout split inline without
 * ever touching the event-wide Options screen.
 */
const getGamePayoutOptions = async (gameId, eventId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/payout-options?eventId=${eventId}`);
        if (!response.ok)
            return undefined;
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching game payout options:', error);
        return undefined;
    }
};
exports.getGamePayoutOptions = getGamePayoutOptions;
/** Save a payout override for one specific week's game -- other weeks are unaffected. */
const saveGamePayoutOptions = async (gameId, overrides) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/payout-options`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(overrides),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error saving game payout options:', error);
        return false;
    }
};
exports.saveGamePayoutOptions = saveGamePayoutOptions;
/** Clear specific payout override keys for a week (e.g. just Net, or just one Teams slot),
 * reverting that section back to the event's default -- other overridden sections are untouched. */
const resetGamePayoutOptions = async (gameId, keys) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/payout-options`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keys }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error resetting game payout options:', error);
        return false;
    }
};
exports.resetGamePayoutOptions = resetGamePayoutOptions;
/** Recompute and persist this game's Net/Teams/Skins payout ledger rows -- call whenever a
 * week's payouts are displayed (Week Results does this on load and after an Adjust Payout save)
 * so the season summary always reflects current settings without a separate "finalize" step. */
const syncGamePayouts = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/sync-payouts`, { method: 'POST' });
        return response.ok;
    }
    catch (error) {
        console.error('Error syncing game payouts:', error);
        return false;
    }
};
exports.syncGamePayouts = syncGamePayouts;
/** Everyone's total winnings for a week across every payout type at once (Net, every Teams slot,
 * Skins, Gross Skins, Hole-in-One) -- what to Venmo each player, in one place. */
const getWeekPurse = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/purse`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching week purse:', error);
        return [];
    }
};
exports.getWeekPurse = getWeekPurse;
/** Hole-in-one celebration info for a game, or null if this game had no hole-in-one -- Week
 * Results checks this whenever a week is opened, to show the celebration screen. */
const getHoleInOneCelebration = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/hole-in-one`, { cache: 'no-store' });
        if (!response.ok)
            return null;
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching hole-in-one celebration:', error);
        return null;
    }
};
exports.getHoleInOneCelebration = getHoleInOneCelebration;
/** Season-long payout summary for an event: per player, total paid in vs. total won. */
const getSeasonPayoutSummary = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/payout-summary`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching season payout summary:', error);
        return [];
    }
};
exports.getSeasonPayoutSummary = getSeasonPayoutSummary;
/** Net + Teams payout totals for every calendar week of an event (Skins excluded -- flat rate
 * all year), for the Payout Review screen. Read-only. */
const getPayoutReview = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/payout-review`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching payout review:', error);
        return [];
    }
};
exports.getPayoutReview = getPayoutReview;
/**
 * Whether an event currently has an Admin password set (new events default to none)
 */
const getAdminPasswordStatus = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/admin-password-status`);
        if (!response.ok)
            return false;
        const data = (await response.json());
        return !!data.hasPassword;
    }
    catch (error) {
        console.error('Error checking admin password status:', error);
        return false;
    }
};
exports.getAdminPasswordStatus = getAdminPasswordStatus;
/**
 * Verify a candidate Admin password for an event
 */
const verifyAdminPassword = async (eventId, password) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/verify-admin-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
        });
        if (!response.ok)
            return false;
        const data = (await response.json());
        return !!data.valid;
    }
    catch (error) {
        console.error('Error verifying admin password:', error);
        return false;
    }
};
exports.verifyAdminPassword = verifyAdminPassword;
/**
 * Set (or clear, if blank) an event's Admin password
 */
const setAdminPassword = async (eventId, password) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/admin-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error setting admin password:', error);
        return false;
    }
};
exports.setAdminPassword = setAdminPassword;
/**
 * Get each Major's automatic UPS Cup qualifier for a given year
 */
const getMajorWinners = async (eventId, year) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/major-winners?year=${year}`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching major winners:', error);
        return [];
    }
};
exports.getMajorWinners = getMajorWinners;
/**
 * Get a game's UPS Cup points (standard competition ranking by net score)
 */
const getUpsPoints = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/ups-points`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching UPS points:', error);
        return [];
    }
};
exports.getUpsPoints = getUpsPoints;
/**
 * Get players mathematically eliminated from UPS Cup qualification for a given year
 */
const getIneligiblePlayers = async (eventId, year) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/ineligible-players?year=${year}`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching ineligible players:', error);
        return [];
    }
};
exports.getIneligiblePlayers = getIneligiblePlayers;
/**
 * Get current UPS Cup standings for a given year
 */
const getCurrentStandings = async (eventId, year) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/ups-standings?year=${year}`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching UPS Cup standings:', error);
        return [];
    }
};
exports.getCurrentStandings = getCurrentStandings;
/**
 * Get players who've paid their UPS Cup entry for a given year
 */
const getPaidPlayers = async (eventId, year) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/ups-paid-players?year=${year}`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching paid players:', error);
        return [];
    }
};
exports.getPaidPlayers = getPaidPlayers;
/**
 * Mark a player as having paid their UPS Cup entry for a given year
 */
const setPlayerPaid = async (eventId, year, playerId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/ups-paid-players`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ year, playerId }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error marking player paid:', error);
        return false;
    }
};
exports.setPlayerPaid = setPlayerPaid;
/**
 * Remove a player's paid UPS Cup entry for a given year
 */
const removePlayerPaid = async (eventId, year, playerId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/ups-paid-players/${year}/${playerId}`, { method: 'DELETE' });
        return response.ok;
    }
    catch (error) {
        console.error('Error removing paid player:', error);
        return false;
    }
};
exports.removePlayerPaid = removePlayerPaid;
/**
 * Get the Birdie Race leaderboard for an event
 */
const getBirdieLeaderboard = async (eventId, year) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/birdie-leaderboard?year=${year}`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching birdie leaderboard:', error);
        return [];
    }
};
exports.getBirdieLeaderboard = getBirdieLeaderboard;
/**
 * Get one player's Birdie Race status (all 18 holes) for an event
 */
const getPlayerBirdieStatus = async (eventId, year, playerId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/birdie-player-status?year=${year}&playerId=${playerId}`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching player birdie status:', error);
        return [];
    }
};
exports.getPlayerBirdieStatus = getPlayerBirdieStatus;
/**
 * Get one hole's Birdie Race detail (every player who has net-birdied it) for an event
 */
const getHoleBirdieDetail = async (eventId, year, hole) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/birdie-hole-detail?year=${year}&hole=${hole}`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching hole birdie detail:', error);
        return [];
    }
};
exports.getHoleBirdieDetail = getHoleBirdieDetail;
/**
 * Get an event's recorded UPS Cup winners
 */
const getUpsCupWinners = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/ups-cup-winners`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching UPS Cup winners:', error);
        return [];
    }
};
exports.getUpsCupWinners = getUpsCupWinners;
/**
 * Set (or replace) an event's UPS Cup winner for a given year
 */
const setUpsCupWinner = async (eventId, year, playerId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/ups-cup-winners`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ year, playerId }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error setting UPS Cup winner:', error);
        return false;
    }
};
exports.setUpsCupWinner = setUpsCupWinner;
/**
 * Remove an event's UPS Cup winner for a given year
 */
const deleteUpsCupWinner = async (eventId, year) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/ups-cup-winners/${year}`, { method: 'DELETE' });
        return response.ok;
    }
    catch (error) {
        console.error('Error deleting UPS Cup winner:', error);
        return false;
    }
};
exports.deleteUpsCupWinner = deleteUpsCupWinner;
/**
 * Get an event's calendar for a given year
 */
const getEventCalendar = async (eventId, year) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/calendar?year=${year}`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching calendar:', error);
        return [];
    }
};
exports.getEventCalendar = getEventCalendar;
/**
 * Set (or replace) a single calendar day
 */
const setCalendarDay = async (eventId, date, dayType, note) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/calendar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, dayType, note }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error setting calendar day:', error);
        return false;
    }
};
exports.setCalendarDay = setCalendarDay;
/**
 * Remove a calendar day entirely
 */
const deleteCalendarDay = async (eventId, date) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/calendar/${date}`, { method: 'DELETE' });
        return response.ok;
    }
    catch (error) {
        console.error('Error deleting calendar day:', error);
        return false;
    }
};
exports.deleteCalendarDay = deleteCalendarDay;
/**
 * Create a new event via the API server
 */
const createEvent = async (event) => {
    try {
        const response = await fetch(`${API_URL}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event),
        });
        if (!response.ok)
            throw new Error('Failed to create event');
        return (await response.json());
    }
    catch (error) {
        console.error('Error creating event:', error);
        return null;
    }
};
exports.createEvent = createEvent;
/**
 * Get the latest game for an event via the API server
 */
const getLatestGame = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/latest-game`, { cache: 'no-store' });
        if (!response.ok)
            return undefined;
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching latest game:', error);
        return undefined;
    }
};
exports.getLatestGame = getLatestGame;
/** Every date Team Games can be viewed/managed for (past/current real games + future Setup
 * Calendar dates with no game yet) via the API server. */
const getTeamGameWeeks = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/team-game-weeks`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching team game weeks:', error);
        return [];
    }
};
exports.getTeamGameWeeks = getTeamGameWeeks;
/** Lazily find-or-create the Game for a specific (possibly future) date via the API server.
 * Pass `courseId` to override the default (most recently played) course — e.g. a week that's
 * moved to a different course. Returns the GameID, or null on failure. */
const ensureGameForDate = async (eventId, date, courseId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/ensure-game`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, courseId }),
        });
        if (!response.ok)
            return null;
        const data = (await response.json());
        return data.gameId;
    }
    catch (error) {
        console.error('Error ensuring game for date:', error);
        return null;
    }
};
exports.ensureGameForDate = ensureGameForDate;
/** Change which course an already-created game is played at via the API server. */
const updateGameCourse = async (gameId, courseId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/course`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courseId }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error updating game course:', error);
        return false;
    }
};
exports.updateGameCourse = updateGameCourse;
/**
 * Get leaderboard data for a game via the API server
 */
const getLeaderboard = async (gameId, scoreType) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/leaderboard?scoreType=${scoreType}`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching leaderboard:', error);
        return [];
    }
};
exports.getLeaderboard = getLeaderboard;
/**
 * Get which side (Front 9 / Back 9) the scorecard grid should default to for a game,
 * based on which side the majority of players actually played.
 */
const getDefaultScorecardSide = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/default-side`);
        if (!response.ok)
            return 'F';
        const data = (await response.json());
        return data.side;
    }
    catch (error) {
        console.error('Error fetching default scorecard side:', error);
        return 'F';
    }
};
exports.getDefaultScorecardSide = getDefaultScorecardSide;
/**
 * Get all games (weeks) played for an event via the API server
 */
const getGamesForEvent = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/games`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching games for event:', error);
        return [];
    }
};
exports.getGamesForEvent = getGamesForEvent;
/**
 * Get all players who have scores in a given game via the API server
 */
const getPlayersForGame = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/players`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching players for game:', error);
        return [];
    }
};
exports.getPlayersForGame = getPlayersForGame;
/** Preview what swapping two players' data for one game would move (Admin -> Players -> Swap Players) */
const getGameSwapPreview = async (gameId, playerAId, playerBId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/swap-preview?playerAId=${playerAId}&playerBId=${playerBId}`, { cache: 'no-store' });
        if (!response.ok)
            return null;
        return (await response.json());
    }
    catch (error) {
        console.error('Error previewing player swap:', error);
        return null;
    }
};
exports.getGameSwapPreview = getGameSwapPreview;
/** Swap two players' Score/Team/Skins/Hdcp data for one game — for when the wrong same-surname
 * player got picked when entering scores. Only affects this one game, not either player's
 * broader history. `playerBHandicap`, if given, is the correct player's real handicap for this
 * round — used to recompute their NetScore and Skins, since the moved data carries whatever
 * handicap the wrong player was entered under. */
const swapPlayersInGame = async (gameId, playerAId, playerBId, playerBHandicap) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/swap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerAId, playerBId, playerBHandicap }),
        });
        const data = (await response.json());
        if (response.ok)
            return { ok: true };
        return { ok: false, error: data.error ?? 'Failed to swap players.' };
    }
    catch (error) {
        console.error('Error swapping players:', error);
        return { ok: false, error: 'Failed to swap players.' };
    }
};
exports.swapPlayersInGame = swapPlayersInGame;
/**
 * Get which 2-person Teams N team game(s), if any, this week's What If can run against via the
 * API server. `null` = a legacy week (no new-system team games at all) — What If just works as
 * it always has, no picker needed. An empty array = this week has no eligible 2-person slot.
 */
const getWhatIfTeamGameOptions = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/whatif-team-games`, { cache: 'no-store' });
        if (!response.ok)
            return null;
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching what-if team game options:', error);
        return null;
    }
};
exports.getWhatIfTeamGameOptions = getWhatIfTeamGameOptions;
/**
 * Get "What If" team results for a game/player via the API server. `teamGameId`, when given,
 * resolves that specific Teams N slot's real scoring rule (best-ball vs. combined) server-side.
 */
const getWhatIfResults = async (gameId, playerId, teamGameId) => {
    try {
        const teamGameParam = teamGameId ? `&teamGameId=${teamGameId}` : '';
        const response = await fetch(`${API_URL}/games/${gameId}/whatif?playerId=${playerId}${teamGameParam}`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching what-if results:', error);
        return [];
    }
};
exports.getWhatIfResults = getWhatIfResults;
/**
 * Get individual gross/net totals for a game via the API server
 */
const getWeekResults = async (gameId, scoreType) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/results?scoreType=${scoreType}`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching week results:', error);
        return [];
    }
};
exports.getWeekResults = getWeekResults;
/**
 * Check whether teams have already been set up for a game via the API server
 */
const getTeamStatus = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/teams/status`);
        if (!response.ok)
            return false;
        const data = (await response.json());
        return data.hasTeams;
    }
    catch (error) {
        console.error('Error checking team status:', error);
        return false;
    }
};
exports.getTeamStatus = getTeamStatus;
/**
 * Get team results for a game via the API server
 */
const getTeamResults = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/teams`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching team results:', error);
        return [];
    }
};
exports.getTeamResults = getTeamResults;
/**
 * Get the Net Score to Make Cut summary for a game's team results via the API server
 */
const getCutSummary = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/cut-summary`);
        if (!response.ok)
            return { cutLine: null, missedCut: [] };
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching cut summary:', error);
        return { cutLine: null, missedCut: [] };
    }
};
exports.getCutSummary = getCutSummary;
/**
 * Get likely test/abandoned games and incomplete rounds for an event via the API server.
 */
const getCleanupCandidates = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/cleanup-candidates`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching cleanup candidates:', error);
        return [];
    }
};
exports.getCleanupCandidates = getCleanupCandidates;
/** Get every event's cleanup candidates combined — Master Tools -> Cleanup Data -> All Events */
const getAllEventsCleanupCandidates = async () => {
    try {
        const response = await fetch(`${API_URL}/events/cleanup-candidates-all`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching all-events cleanup candidates:', error);
        return [];
    }
};
exports.getAllEventsCleanupCandidates = getAllEventsCleanupCandidates;
/**
 * Delete selected cleanup candidates via the API server.
 */
const deleteCleanupCandidates = async (eventId, items) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/cleanup-candidates/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error deleting cleanup candidates:', error);
        return false;
    }
};
exports.deleteCleanupCandidates = deleteCleanupCandidates;
/**
 * Mark selected cleanup candidates as legit via the API server — no delete, just stops
 * flagging them on future scans.
 */
const ignoreCleanupCandidates = async (eventId, items) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/cleanup-candidates/ignore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error ignoring cleanup candidates:', error);
        return false;
    }
};
exports.ignoreCleanupCandidates = ignoreCleanupCandidates;
/**
 * Get everything currently marked as legit for this event via the API server.
 */
const getIgnoredCleanupItems = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/cleanup-ignored`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching ignored cleanup items:', error);
        return [];
    }
};
exports.getIgnoredCleanupItems = getIgnoredCleanupItems;
/**
 * Un-ignore a single cleanup item via the API server — it'll show back up as a candidate if
 * it still applies.
 */
const unignoreCleanupItem = async (eventId, key) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/cleanup-ignored/${encodeURIComponent(key)}`, {
            method: 'DELETE',
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error un-ignoring cleanup item:', error);
        return false;
    }
};
exports.unignoreCleanupItem = unignoreCleanupItem;
/** Get every opted-out (Remove Player) record for an event */
const getOptedOutPlayers = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/opted-out`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching opted-out players:', error);
        return [];
    }
};
exports.getOptedOutPlayers = getOptedOutPlayers;
/**
 * Get the current team assignments for a game (by player ID) via the API server, for
 * prefilling the Pick Teams builder when a game already has manually-picked teams to edit.
 */
const getTeamAssignments = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/team-assignments`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching team assignments:', error);
        return [];
    }
};
exports.getTeamAssignments = getTeamAssignments;
/**
 * Replace all teams for a game via the API server. `teams` is an array of
 * player-ID arrays; each array's position (1-based) becomes the TeamID.
 */
const saveTeams = async (gameId, teams) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/teams`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teams }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error saving teams:', error);
        return false;
    }
};
exports.saveTeams = saveTeams;
/**
 * Get a team's hole-by-hole net scorecard for a side (F/B/T) via the API server
 */
const getTeamScorecard = async (gameId, teamId, side) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/teams/${teamId}/scorecard?side=${side}`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching team scorecard:', error);
        return [];
    }
};
exports.getTeamScorecard = getTeamScorecard;
/**
 * Get one player's hole-by-hole gross+net scorecard for a side (F/B/T) via the API server --
 * powers the Leaderboard's tap-a-name drill-down.
 */
const getPlayerScorecard = async (gameId, playerId, side) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/players/${playerId}/scorecard?side=${side}`);
        if (!response.ok)
            return { holes: [], totalGross: 0, totalNet: 0 };
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching player scorecard:', error);
        return { holes: [], totalGross: 0, totalNet: 0 };
    }
};
exports.getPlayerScorecard = getPlayerScorecard;
/** List every team game set up for a round via the API server. */
const listTeamGames = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/team-games`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching team games:', error);
        return [];
    }
};
exports.listTeamGames = listTeamGames;
/** Create a new team game for a round via the API server. Returns the new TeamGameID, or null on
 * failure. `format` defaults to 'custom' when omitted -- pass '36/48' or 'irish' to create a
 * one-off predefined-format team game (teamSize/keepCount are ignored for those, assignMode must
 * be 'G'), e.g. to run a different format for a single week without touching the event's
 * standard Options setting. */
const createTeamGame = async (gameId, label, teamSize, keepCount, assignMode, lastHoleAll, slot, format) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/team-games`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label, teamSize, keepCount, assignMode, lastHoleAll, slot, format }),
        });
        if (!response.ok)
            return null;
        const data = (await response.json());
        return data.teamGameId;
    }
    catch (error) {
        console.error('Error creating team game:', error);
        return null;
    }
};
exports.createTeamGame = createTeamGame;
/** Skip a pending Options "Teams N" slot for just this week, via the API server. Returns the new
 * placeholder TeamGameID, or null on failure. */
const skipTeamGameSlot = async (gameId, label, slot) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/team-games/skip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label, slot }),
        });
        if (!response.ok)
            return null;
        const data = (await response.json());
        return data.teamGameId;
    }
    catch (error) {
        console.error('Error skipping team game slot:', error);
        return null;
    }
};
exports.skipTeamGameSlot = skipTeamGameSlot;
/** Delete a team game via the API server. Refused (with a reason) once it's already been drawn. */
const deleteTeamGame = async (teamGameId) => {
    try {
        const response = await fetch(`${API_URL}/team-games/${teamGameId}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = (await response.json().catch(() => ({})));
            return { ok: false, error: data.error };
        }
        return { ok: true };
    }
    catch (error) {
        console.error('Error deleting team game:', error);
        return { ok: false, error: 'Network error' };
    }
};
exports.deleteTeamGame = deleteTeamGame;
/** Get a team game's config and eligibility status via the API server. */
const getTeamGameStatus = async (teamGameId) => {
    try {
        const response = await fetch(`${API_URL}/team-games/${teamGameId}/status`, { cache: 'no-store' });
        if (!response.ok)
            return undefined;
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching team game status:', error);
        return undefined;
    }
};
exports.getTeamGameStatus = getTeamGameStatus;
/** Get the current team assignments for a team game (by player ID) via the API server. */
const getTeamGameAssignments = async (teamGameId) => {
    try {
        const response = await fetch(`${API_URL}/team-games/${teamGameId}/assignments`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching team game assignments:', error);
        return [];
    }
};
exports.getTeamGameAssignments = getTeamGameAssignments;
/** Replace all teams for a manual-assignment team game via the API server. */
const saveManualTeamGameTeams = async (teamGameId, teams) => {
    try {
        const response = await fetch(`${API_URL}/team-games/${teamGameId}/teams`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teams }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error saving team game teams:', error);
        return false;
    }
};
exports.saveManualTeamGameTeams = saveManualTeamGameTeams;
/** Get the current team roster (with handicaps) for a team game via the API server. */
const getTeamGameRoster = async (teamGameId) => {
    try {
        const response = await fetch(`${API_URL}/team-games/${teamGameId}/roster`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching team game roster:', error);
        return [];
    }
};
exports.getTeamGameRoster = getTeamGameRoster;
/** Generate random teams for a random-assignment team game via the API server. */
const createRandomTeamGameTeams = async (teamGameId) => {
    try {
        const response = await fetch(`${API_URL}/team-games/${teamGameId}/random`, { method: 'POST' });
        if (!response.ok)
            return undefined;
        return (await response.json());
    }
    catch (error) {
        console.error('Error creating random team game teams:', error);
        return undefined;
    }
};
exports.createRandomTeamGameTeams = createRandomTeamGameTeams;
/** Get team results (front/back/total + roster) for a team game via the API server. */
const getTeamGameResults = async (teamGameId) => {
    try {
        const response = await fetch(`${API_URL}/team-games/${teamGameId}/results`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching team game results:', error);
        return [];
    }
};
exports.getTeamGameResults = getTeamGameResults;
/** Get the Net Score to Make Cut summary (this slot's own cut line, missed-cut sorted low to high) for a team game via the API server. */
const getTeamGameCutSummary = async (teamGameId) => {
    try {
        const response = await fetch(`${API_URL}/team-games/${teamGameId}/cut-summary`, { cache: 'no-store' });
        if (!response.ok)
            return { cutLine: null, missedCut: [] };
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching team game cut summary:', error);
        return { cutLine: null, missedCut: [] };
    }
};
exports.getTeamGameCutSummary = getTeamGameCutSummary;
/** Get a team's hole-by-hole net scorecard for a side (F/B/T) within a team game via the API server. */
const getTeamGameScorecard = async (teamGameId, teamNumber, side) => {
    try {
        const response = await fetch(`${API_URL}/team-games/${teamGameId}/scorecard/${teamNumber}?side=${side}`);
        if (!response.ok)
            return { rows: [], holeTotals: {} };
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching team game scorecard:', error);
        return { rows: [], holeTotals: {} };
    }
};
exports.getTeamGameScorecard = getTeamGameScorecard;
/** Live standings for every team in a 36/48 team game -- empty for a 'custom'-format team game. */
const getTeamGameLiveLeaderboard = async (teamGameId) => {
    try {
        const response = await fetch(`${API_URL}/team-games/${teamGameId}/live-leaderboard`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching team game live leaderboard:', error);
        return [];
    }
};
exports.getTeamGameLiveLeaderboard = getTeamGameLiveLeaderboard;
const getTeamBestPossible = async (teamGameId) => {
    try {
        const response = await fetch(`${API_URL}/team-games/${teamGameId}/best-possible`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching team best-possible:', error);
        return [];
    }
};
exports.getTeamBestPossible = getTeamBestPossible;
/** Weeks that had at least one 36/48 team game with a rostered, scored player -- for the Best
 * Possible screen's week picker, pre-filtered so every listed week is actually usable. */
const getBestPossibleWeeks = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/best-possible-weeks`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching best-possible weeks:', error);
        return [];
    }
};
exports.getBestPossibleWeeks = getBestPossibleWeeks;
/** Every 36/48-format team game this exact foursome (by player ID) is registered as one team in,
 * for a given game -- empty for the vast majority of games, which don't use this format at all. */
const getKeepTeamsForGame = async (gameId, playerIds) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/keep-teams?playerIds=${playerIds.join(',')}`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching keep-format teams:', error);
        return [];
    }
};
exports.getKeepTeamsForGame = getKeepTeamsForGame;
/** A 36/48 team's already-recorded live keep choices, keyed by hole number. */
const getTeamGameHoleKeep = async (teamGameId, teamNumber) => {
    try {
        const response = await fetch(`${API_URL}/team-games/${teamGameId}/hole-keep?teamNumber=${teamNumber}`, { cache: 'no-store' });
        if (!response.ok)
            return {};
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching team game hole keep counts:', error);
        return {};
    }
};
exports.getTeamGameHoleKeep = getTeamGameHoleKeep;
/** Every Irish Rumble team game this exact foursome (by player ID) is registered as one team in,
 * for a given game -- empty for the vast majority of games, which don't use this format at all. */
const getIrishRumbleTeamsForGame = async (gameId, playerIds) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/irish-teams?playerIds=${playerIds.join(',')}`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching Irish Rumble teams:', error);
        return [];
    }
};
exports.getIrishRumbleTeamsForGame = getIrishRumbleTeamsForGame;
const getFixedKeepLiveLeaderboard = async (teamGameId) => {
    try {
        const response = await fetch(`${API_URL}/team-games/${teamGameId}/irish-leaderboard`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching fixed-keep live leaderboard:', error);
        return [];
    }
};
exports.getFixedKeepLiveLeaderboard = getFixedKeepLiveLeaderboard;
/** Save one hole's live keep-count choice for a 36/48 team. Returns an error message on failure
 * (e.g. the choice was no longer valid by the time it reached the server) so the caller can show
 * it, rather than a bare boolean -- this is a hard-validated write, not a best-effort one. */
const saveTeamGameHoleKeep = async (teamGameId, teamNumber, holeId, keepCount, holesRemaining) => {
    try {
        const response = await fetch(`${API_URL}/team-games/${teamGameId}/hole-keep`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teamNumber, holeId, keepCount, holesRemaining }),
        });
        if (!response.ok) {
            const body = (await response.json().catch(() => ({})));
            return { ok: false, error: body.error || 'Failed to save keep count.' };
        }
        return { ok: true };
    }
    catch (error) {
        console.error('Error saving team game hole keep count:', error);
        return { ok: false, error: 'Failed to save keep count.' };
    }
};
exports.saveTeamGameHoleKeep = saveTeamGameHoleKeep;
/**
 * Get every player's hole-by-hole scores for a game/side/scoreType via the API server
 */
const getGameScorecard = async (gameId, side, scoreType) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/scorecard?side=${side}&scoreType=${scoreType}`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching game scorecard:', error);
        return [];
    }
};
exports.getGameScorecard = getGameScorecard;
/**
 * Get the hole numbers that have recorded scores for a game via the API server
 */
const getScoredHoles = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/scored-holes`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching scored holes:', error);
        return [];
    }
};
exports.getScoredHoles = getScoredHoles;
/**
 * Get the net skins winner (and validation) for a single hole via the API server
 */
const getSkinsForHole = async (gameId, holeId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/skins?hole=${holeId}`);
        if (!response.ok)
            return { rows: [], validation: null };
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching skins for hole:', error);
        return { rows: [], validation: null };
    }
};
exports.getSkinsForHole = getSkinsForHole;
/**
 * Get the skins totals summary for a game via the API server
 */
const getSkinsTotals = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/skins?hole=T`);
        if (!response.ok)
            return { perSkin: 0, validationMode: 'none', rows: [] };
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching skins totals:', error);
        return { perSkin: 0, validationMode: 'none', rows: [] };
    }
};
exports.getSkinsTotals = getSkinsTotals;
/**
 * Get every skin won so far in this game, one row per hole, via the API server — powers the
 * live "Skins" button next to Swap Side during scoring.
 */
const getGameSkinsSummary = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/skins-summary`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching game skins summary:', error);
        return [];
    }
};
exports.getGameSkinsSummary = getGameSkinsSummary;
/**
 * Recompute every scored hole's skins in one pass via the API server — used once when the
 * Summary view opens, so it reads a fully up-to-date cache instead of whatever partial state
 * individual hole-by-hole views happened to leave it in.
 */
const recalculateSkins = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/skins/recalculate`, { method: 'POST' });
        return response.ok;
    }
    catch (error) {
        console.error('Error recalculating skins:', error);
        return false;
    }
};
exports.recalculateSkins = recalculateSkins;
/** Whether Gross Skins should show at all for this week (>=1 player marked paid for it). */
const getGrossSkinsVisible = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/gross-skins-visible`);
        if (!response.ok)
            return false;
        const data = (await response.json());
        return data.visible;
    }
    catch (error) {
        console.error('Error checking gross skins visibility:', error);
        return false;
    }
};
exports.getGrossSkinsVisible = getGrossSkinsVisible;
/**
 * Get the gross skins winner (and validation) for a single hole via the API server
 */
const getGrossSkinsForHole = async (gameId, holeId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/gross-skins?hole=${holeId}`);
        if (!response.ok)
            return { rows: [], validation: null };
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching gross skins for hole:', error);
        return { rows: [], validation: null };
    }
};
exports.getGrossSkinsForHole = getGrossSkinsForHole;
/**
 * Get the gross skins totals summary for a game via the API server
 */
const getGrossSkinsTotals = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/gross-skins?hole=T`);
        if (!response.ok)
            return { perSkin: 0, rows: [] };
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching gross skins totals:', error);
        return { perSkin: 0, rows: [] };
    }
};
exports.getGrossSkinsTotals = getGrossSkinsTotals;
/**
 * Recompute every scored hole's gross skins in one pass via the API server — used once when the
 * Gross Skins Summary view opens.
 */
const recalculateGrossSkins = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/gross-skins/recalculate`, { method: 'POST' });
        return response.ok;
    }
    catch (error) {
        console.error('Error recalculating gross skins:', error);
        return false;
    }
};
exports.recalculateGrossSkins = recalculateGrossSkins;
/**
 * Get players with scores for a game via the API server
 */
const getActivePlayers = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/active-players`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching active players:', error);
        return [];
    }
};
exports.getActivePlayers = getActivePlayers;
/**
 * Remove (opt out) one or more players from a game via the API server
 */
const removePlayers = async (gameId, playerIds) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/optout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerIds }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error removing players:', error);
        return false;
    }
};
exports.removePlayers = removePlayers;
/**
 * Get the latest game for an event and whether its teams have already been randomized
 * via the API server
 */
const getRandomTeamsStatus = async (eventId) => {
    try {
        const response = await fetch(`${API_URL}/events/${eventId}/random-teams-status`);
        if (!response.ok)
            return undefined;
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching random teams status:', error);
        return undefined;
    }
};
exports.getRandomTeamsStatus = getRandomTeamsStatus;
/**
 * Get the current team roster for a game via the API server
 */
const getRandomTeamsListing = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/random-teams`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching random teams:', error);
        return [];
    }
};
exports.getRandomTeamsListing = getRandomTeamsListing;
/**
 * Get every drawn team for a game via the API server (Show Teams) — checks the current
 * multi-team-games system first, falling back to the legacy single-team-game table only for
 * older events that never set up a "Teams N" card.
 */
const getShowTeamsListing = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/show-teams`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching show-teams listing:', error);
        return [];
    }
};
exports.getShowTeamsListing = getShowTeamsListing;
/**
 * Generate random teams for a game via the API server
 */
const createRandomTeams = async (gameId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/random-teams`, { method: 'POST' });
        if (!response.ok)
            return undefined;
        return (await response.json());
    }
    catch (error) {
        console.error('Error creating random teams:', error);
        return undefined;
    }
};
exports.createRandomTeams = createRandomTeams;
/**
 * Get or create this event/course's current game via the API server. Throws with the
 * server's error message on failure (matches Start Game's existing try/catch behavior).
 */
const getOrCreateGame = async (eventId, courseId) => {
    const response = await fetch(`${API_URL}/game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, courseId }),
    });
    const data = (await response.json());
    if (!response.ok)
        throw new Error(data.error || 'Failed to get or create game');
    return data.gameId;
};
exports.getOrCreateGame = getOrCreateGame;
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
const saveGameHandicap = async (gameId, playerId, hdcp) => {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await fetch(`${API_URL}/games/${gameId}/handicap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerId, hdcp }),
            });
            if (response.ok)
                return true;
            console.error('Error saving handicap: server returned', response.status);
        }
        catch (error) {
            console.error('Error saving handicap:', error);
        }
        if (attempt < 2)
            await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
    return false;
};
exports.saveGameHandicap = saveGameHandicap;
/**
 * Start Game hook: register a checked-in foursome as a team in any 'group'-mode team game for
 * this round via the API server — a no-op unless the event has explicitly created one.
 */
const addOrUpdateGroupTeam = async (gameId, playerIds) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/group-team`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerIds }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error updating group team:', error);
        return false;
    }
};
exports.addOrUpdateGroupTeam = addOrUpdateGroupTeam;
/**
 * Start Game hook: always record "who played together" for crash/exit recovery via the API
 * server — independent of any team-game scoring, runs for every event.
 */
const upsertPlayingGroup = async (gameId, playerIds) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/playing-group`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerIds }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error updating playing group:', error);
        return false;
    }
};
exports.upsertPlayingGroup = upsertPlayingGroup;
/**
 * Get the other players recorded as part of a player's current group for this round via the API
 * server — powers Start Game's "resume this group?" prompt. Empty array if none recorded.
 */
const getPlayingGroup = async (gameId, playerId) => {
    try {
        const response = await fetch(`${API_URL}/games/${gameId}/playing-group/${playerId}`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        const data = (await response.json());
        return data.playerIds;
    }
    catch (error) {
        console.error('Error fetching playing group:', error);
        return [];
    }
};
exports.getPlayingGroup = getPlayingGroup;
/**
 * Get a course's hole-by-hole par/handicap details via the API server
 */
const getCourseDetails = async (courseId) => {
    try {
        const response = await fetch(`${API_URL}/courses/${courseId}/details`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching course details:', error);
        return [];
    }
};
exports.getCourseDetails = getCourseDetails;
/**
 * Get a course's all-time per-hole average score/net via the API server
 */
const getCourseHoleHistory = async (courseId) => {
    try {
        const response = await fetch(`${API_URL}/courses/${courseId}/history`);
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching course history:', error);
        return [];
    }
};
exports.getCourseHoleHistory = getCourseHoleHistory;
/**
 * Get a player's saved gross scores for a game, keyed by hole number, via the API server
 */
const getPlayerGameScores = async (gameId, playerId) => {
    try {
        const response = await fetch(`${API_URL}/scores/${gameId}/${playerId}`);
        if (!response.ok)
            return {};
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching player scores:', error);
        return {};
    }
};
exports.getPlayerGameScores = getPlayerGameScores;
/**
 * Save a player's hole score(s) for a game via the API server
 */
const savePlayerHoleScores = async (payload) => {
    try {
        const response = await fetch(`${API_URL}/scores`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok)
            console.error('Failed to save score:', await response.text());
        return response.ok;
    }
    catch (error) {
        console.error('Error saving score:', error);
        return false;
    }
};
exports.savePlayerHoleScores = savePlayerHoleScores;
/**
 * Delete a player's saved scores for specific holes via the API server (Swap Sides, after
 * moving a hole's score to its mirrored hole).
 */
const deletePlayerHoleScores = async (gameId, playerId, holeNumbers) => {
    try {
        const response = await fetch(`${API_URL}/scores/${gameId}/${playerId}/delete-holes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ holeNumbers }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error deleting hole scores:', error);
        return false;
    }
};
exports.deletePlayerHoleScores = deletePlayerHoleScores;
/** Log a bug or idea via the API server */
const submitFeedback = async (type, title, description, submittedBy) => {
    try {
        const response = await fetch(`${API_URL}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, title, description, submittedBy }),
        });
        return response.ok;
    }
    catch (error) {
        console.error('Error submitting feedback:', error);
        return false;
    }
};
exports.submitFeedback = submitFeedback;
/** Get the full bug/idea log via the API server */
const getFeedback = async () => {
    try {
        const response = await fetch(`${API_URL}/feedback`, { cache: 'no-store' });
        if (!response.ok)
            return [];
        return (await response.json());
    }
    catch (error) {
        console.error('Error fetching feedback:', error);
        return [];
    }
};
exports.getFeedback = getFeedback;
