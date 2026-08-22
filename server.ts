try {
  process.loadEnvFile();
} catch {
  // .env is optional locally if vars are already set in the shell/host environment
}

import express from 'express';
import cors from 'cors';
import pool from './src/db/config';
import { searchEvents, searchAllEventsForMaster, getEventById, createEvent, renameEvent, renameEventCourse } from './src/services/eventService';
import { getAllEventsWithCounts, deleteEvent } from './src/services/eventDeleteService';
import { getOrphanedRows, deleteOrphanedRows } from './src/services/orphanService';
import { getMergeSuggestions, ignoreMergeSuggestion } from './src/services/mergeSuggestionService';
import { initializeGame } from './src/services/gameService';
import { savePlayerScores, getPlayerScores, deletePlayerHoleScores, getPlayerScorecard } from './src/services/scoreService';
import { getOrCreateGame, getOrCreateGameForDate, updateGameCourse, getCourseDetails } from './src/services/gameService';
import { getLatestGameId, getLeaderboard, getGameScorecard, getDefaultScorecardSide } from './src/services/leaderboardService';
import { getGamesForEvent, getPlayersForGame, getWhatIfResults, getWhatIfTeamGameOptions } from './src/services/whatifService';
import { getWeekResults } from './src/services/weekResultsService';
import { hasTeams, getTeamResults, saveTeams, getTeamScorecard, getTeamAssignments } from './src/services/teamService';
import { getSkinsForHole, getSkinsTotals, getScoredHoles, recalculateAllSkins, getGameSkinsSummary, invalidateSkinsCache } from './src/services/skinsService';
import { getActivePlayersForGame, removePlayers } from './src/services/removePlayerService';
import { getLatestGameForRandomTeams, getRandomTeamsListing, createRandomTeams, getCutSummary } from './src/services/randomTeamsService';
import {
  listTeamGames, createTeamGame, deleteTeamGame, getTeamGameStatus, getTeamGameAssignments,
  saveManualTeamGameTeams, getTeamGameRoster, createRandomTeamGameTeams, getTeamGameResults,
  getTeamGameScorecard, addOrUpdateGroupTeam, skipTeamGameSlot, getTeamGameWeeks, getTeamGameCutSummary,
  getShowTeamsListing, getKeepFormatTeamsForPlayers, getTeamGameHoleKeepCounts, saveTeamGameHoleKeepCount,
  getTeamGameLiveLeaderboard, getTeamBestPossible, getBestPossibleWeeks,
  getIrishRumbleTeamsForPlayers, getFixedKeepLiveLeaderboard,
} from './src/services/teamGameService';
import { upsertPlayingGroup, getPlayingGroup } from './src/services/playingGroupService';
import { addPlayer, getUnlinkedPlayers, linkPlayers, getPlayerListForEvent, renamePlayer, assignGuestPlayer } from './src/services/playerService';
import {
  searchAllPlayers, searchPlayersInEvent, getMergePreview, mergePlayers, getOrphanedPlayers, deleteOrphanedPlayers,
  getOrphanedEventLinks, deleteOrphanedEventLinks, getEmptyGames, deleteEmptyGames,
  getInvalidNamePlayers, getGameSwapPreview, swapPlayersInGame,
} from './src/services/playerMergeService';
import { addTeeTime } from './src/services/teetimesService';
import { getPaidTrackerList, setPaidTracker, getRefundNeededList } from './src/services/paidTrackerService';
import { getGrossSkinsPaidList, setGrossSkinsPaid, hasAnyGrossSkinsPaidForGame, getGrossSkinsTrackerDates } from './src/services/grossSkinsPaidService';
import { getGrossSkinsForHole, getGrossSkinsTotals, recalculateAllGrossSkins } from './src/services/grossSkinsService';
import { getNaughtyList, recheckLatePosting, getGhinPlayerList, getGhinSummary, getGhinYears, searchGhinWithHistoryFallback, linkPlayerGhin, findEasyGhinLinks, setPlayerGhinSkip, getPlayerCourseHandicaps, refreshGhinIndexes, searchGhinCourses, getGhinCourseDetail } from './src/services/ghinService';
import { getEventOptions, saveEventOptions, setAdminPassword, verifyAdminPassword, hasAdminPassword, getEffectiveGamePayoutOptions, saveGamePayoutOverrides, resetGamePayoutOverrides, getGameDblBogeyOverride, saveGameDblBogeyOverride, getVenmoUsername, setVenmoUsername } from './src/services/optionsService';
import { getLinkedEventId, ensurePlayerLinkedToEvent } from './src/services/teeTimesLinkService';
import { syncGamePayoutLedger, getSeasonPayoutSummary, getPayoutReviewForEvent, getHoleInOneCelebration, getWeekPurse } from './src/services/payoutLedgerService';
import { submitFeedback, getFeedback } from './src/services/feedbackService';
import { getUpsCupWinners, setUpsCupWinner, deleteUpsCupWinner, getMajorWinners, getUpsPointsForGame, getIneligiblePlayers, getCurrentStandings, getPaidPlayers, setPlayerPaid, removePlayerPaid } from './src/services/upsCupService';
import { getBirdieLeaderboard, getPlayerBirdieStatus, getHoleBirdieDetail } from './src/services/birdieRaceService';
import { getCalendarForYear, setCalendarDay, deleteCalendarDay } from './src/services/calendarService';
import { getCourseHoleHistory } from './src/services/courseHistoryService';
import {
  getCleanupCandidates, deleteCleanupCandidates, ignoreCleanupCandidates, getIgnoredCleanupItems, unignoreCleanupItem,
  getAllEventsCleanupCandidates, getOptedOutPlayers,
} from './src/services/cleanupService';
import { getAllPlayersWithHistory, getPlayerStats, getPlayerRounds } from './src/services/playerHistoryService';
import { getPlayerSkinsStats, getPlayerRecentSkins } from './src/services/skinsHistoryService';
import { createCourse, saveCourseTeeSets } from './src/services/courseService';

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Search events endpoint
app.get('/api/events', async (req, res) => {
  try {
    const query = req.query.q as string || '';
    const events = await searchEvents(query);
    res.json(events);
  } catch (error: any) {
    console.error('Error searching events:', error.message);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Search every event including hidden/master ones endpoint (Master Tools only)
app.get('/api/master-events', async (req, res) => {
  try {
    const query = req.query.q as string || '';
    const events = await searchAllEventsForMaster(query);
    res.json(events);
  } catch (error: any) {
    console.error('Error searching all events:', error.message);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Get every event's cleanup candidates combined endpoint (Master Tools -> Cleanup Data -> All
// Events) — same route-order caveat as '/api/events/orphaned' below: must come before
// '/api/events/:id'.
app.get('/api/events/cleanup-candidates-all', async (req, res) => {
  try {
    const candidates = await getAllEventsCleanupCandidates();
    res.json(candidates);
  } catch (error: any) {
    console.error('Error fetching all-events cleanup candidates:', error.message);
    res.status(500).json({ error: 'Failed to fetch all-events cleanup candidates' });
  }
});

// Get every phantom EventID (still referenced but no Events row) endpoint (Master Tools -> Cleanup
// Data, no event selected) — must be registered before '/api/events/:id' below, otherwise that
// route's ':id' wildcard matches "orphaned" as a literal ID first and this is never reached.
// List every event with linked-player/score counts endpoint (Master Tools -> Manage Events) —
// same route-order requirement as above: must come before '/api/events/:id'.
app.get('/api/events/all-with-counts', async (req, res) => {
  try {
    const events = await getAllEventsWithCounts();
    res.json(events);
  } catch (error: any) {
    console.error('Error fetching events with counts:', error.message);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Permanently delete an event and every row of data it owns endpoint (Master Tools -> Manage Events)
app.delete('/api/events/:id', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    await deleteEvent(eventId);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting event:', error.message);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

app.get('/api/events/orphaned', async (req, res) => {
  try {
    const links = await getOrphanedEventLinks();
    res.json(links);
  } catch (error: any) {
    console.error('Error fetching orphaned event links:', error.message);
    res.status(500).json({ error: 'Failed to fetch orphaned event links' });
  }
});

// Delete leftover rows referencing a phantom EventID endpoint (Master Tools -> Cleanup Data, no event selected)
app.post('/api/events/orphaned/delete', async (req, res) => {
  try {
    const { eventIds } = req.body;
    if (!Array.isArray(eventIds)) {
      return res.status(400).json({ error: 'eventIds array is required' });
    }
    await deleteOrphanedEventLinks(eventIds.map(Number));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting orphaned event links:', error.message);
    res.status(500).json({ error: 'Failed to delete orphaned event links' });
  }
});

// Scan every FK-shaped relationship in the schema for dangling rows endpoint (Master Tools ->
// Cleanup Data, no event selected)
app.get('/api/orphaned-rows', async (req, res) => {
  try {
    const rows = await getOrphanedRows();
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching orphaned rows:', error.message);
    res.status(500).json({ error: 'Failed to fetch orphaned rows' });
  }
});

// Delete every dangling row for the selected relationships endpoint
app.post('/api/orphaned-rows/delete', async (req, res) => {
  try {
    const { keys } = req.body;
    if (!Array.isArray(keys)) {
      return res.status(400).json({ error: 'keys array is required' });
    }
    await deleteOrphanedRows(keys);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting orphaned rows:', error.message);
    res.status(500).json({ error: 'Failed to delete orphaned rows' });
  }
});

// Scan every player for likely duplicate identities endpoint (Master Tools -> Find Players to Merge)
app.get('/api/merge-suggestions', async (req, res) => {
  try {
    const suggestions = await getMergeSuggestions();
    res.json(suggestions);
  } catch (error: any) {
    console.error('Error fetching merge suggestions:', error.message);
    res.status(500).json({ error: 'Failed to fetch merge suggestions' });
  }
});

// Mark a suggested pair as reviewed and not the same person endpoint
app.post('/api/merge-suggestions/ignore', async (req, res) => {
  try {
    const { playerId1, playerId2 } = req.body;
    if (!playerId1 || !playerId2) {
      return res.status(400).json({ error: 'playerId1 and playerId2 are required' });
    }
    await ignoreMergeSuggestion(playerId1, playerId2);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error ignoring merge suggestion:', error.message);
    res.status(500).json({ error: 'Failed to ignore merge suggestion' });
  }
});

// Get single event endpoint
app.get('/api/events/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const event = await getEventById(id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json(event);
  } catch (error: any) {
    console.error('Error fetching event:', error.message);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// Rename an event's name and/or default course label (Admin hub's pencil-edit)
app.patch('/api/events/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { eventName, courseName } = req.body;
    if (eventName !== undefined) {
      const result = await renameEvent(id, eventName);
      if (!result.ok) return res.status(400).json({ error: result.error });
    }
    if (courseName !== undefined) {
      const result = await renameEventCourse(id, courseName);
      if (!result.ok) return res.status(400).json({ error: result.error });
    }
    res.json({ status: 'ok' });
  } catch (error: any) {
    console.error('Error updating event:', error.message);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Initialize a game session endpoint
app.post('/api/game/init', async (req, res) => {
  try {
    const { eventId, courseId, side, players } = req.body;

    if (!eventId || !courseId) {
      return res.status(400).json({ error: 'Event ID and Course ID are required' });
    }

    const session = await initializeGame({
      eventId: parseInt(eventId),
      courseId: parseInt(courseId),
      side: side || '18h',
      players: players || [],
    });

    res.json(session);
  } catch (error: any) {
    console.error('Error initializing game:', error.message);
    res.status(500).json({ error: 'Failed to initialize game' });
  }
});

// Get all courses endpoint
app.get('/api/courses', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT CourseID AS id, CourseName AS name FROM Course ORDER BY CourseName');
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching courses:', error.message);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

// Create a new course with its hole-by-hole par/handicap/yardage layout. If Add Course's GHIN
// search flow already fetched every tee set (not just the one picked), `ghinTeeSets` caches all
// of them for Start Game's tee picker — reuses the data the frontend already has rather than
// making the server re-fetch it from GHIN a second time.
app.post('/api/courses', async (req, res) => {
  try {
    const { courseName, holes, ghinInfo, ghinTeeSets } = req.body;
    if (!courseName || !Array.isArray(holes) || holes.length === 0) {
      return res.status(400).json({ error: 'courseName and a non-empty holes array are required' });
    }
    const courseId = await createCourse(courseName, holes, ghinInfo);
    if (Array.isArray(ghinTeeSets) && ghinTeeSets.length > 0) {
      await saveCourseTeeSets(courseId, ghinTeeSets);
    }
    res.json({ id: courseId });
  } catch (error: any) {
    console.error('Error creating course:', error.message);
    res.status(500).json({ error: 'Failed to create course' });
  }
});

// Search GHIN's own course database (CRDB) by name, optionally narrowed to a state
app.get('/api/ghin/course-search', async (req, res) => {
  try {
    const name = ((req.query.name as string) || '').trim();
    const state = ((req.query.state as string) || '').trim();
    if (!name) return res.status(400).json({ error: 'name query param is required' });
    const results = await searchGhinCourses(name, state);
    res.json(results);
  } catch (error: any) {
    console.error('Error searching GHIN courses:', error.message);
    res.status(500).json({ error: 'Failed to search GHIN courses' });
  }
});

// Fetch a GHIN course search result's full tee-set detail (par/handicap/yardage per tee)
app.get('/api/ghin/course-detail', async (req, res) => {
  try {
    const courseId = parseInt(req.query.courseId as string);
    if (!courseId) return res.status(400).json({ error: 'courseId query param is required' });
    const detail = await getGhinCourseDetail(courseId);
    if (!detail) return res.status(404).json({ error: 'Course not found' });
    res.json(detail);
  } catch (error: any) {
    console.error('Error fetching GHIN course detail:', error.message);
    res.status(500).json({ error: 'Failed to fetch GHIN course detail' });
  }
});

// Get a course's all-time per-hole average score/net (Course History) endpoint
app.get('/api/courses/:id/history', async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    const rows = await getCourseHoleHistory(courseId);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching course history:', error.message);
    res.status(500).json({ error: 'Failed to fetch course history' });
  }
});

// Get course details (par and handicap per hole) endpoint
app.get('/api/courses/:id/details', async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    res.json(await getCourseDetails(courseId));
  } catch (error: any) {
    console.error('Error fetching course details:', error.message);
    res.status(500).json({ error: 'Failed to fetch course details' });
  }
});

// Get players for an event endpoint
app.get('/api/events/:id/players', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const [rows] = await pool.query(
      `SELECT p.PlayerID AS id, p.LastName, p.FirstName, p.Gender
       FROM Player p
       WHERE p.PlayerID IN (
         SELECT ep.PlayerID FROM EventPlayers ep WHERE ep.EventID = ?
       )
       ORDER BY p.LastName, p.FirstName`,
      [eventId]
    );
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching players:', error.message);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// Players eligible to sign up on Tee Times -- this event's own roster, plus a linked event's
// roster too if Link Tee Times is on (see teeTimesLinkService.ts). Deliberately separate from
// the general /players endpoint above (used by Start Game, UPS Cup, etc.) -- merging rosters
// there would let a linked event's players show up for SCORING in the wrong event, not just
// tee-time sign-ups (confirmed real risk while building this, 2026-08-22).
app.get('/api/events/:id/teetimes-players', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const linkedEventId = await getLinkedEventId(eventId);
    const eventIds = linkedEventId ? [eventId, linkedEventId] : [eventId];
    const [rows] = await pool.query(
      `SELECT DISTINCT p.PlayerID AS id, p.LastName, p.FirstName, p.Gender
       FROM Player p
       WHERE p.PlayerID IN (
         SELECT ep.PlayerID FROM EventPlayers ep WHERE ep.EventID IN (?)
       )
       ORDER BY p.LastName, p.FirstName`,
      [eventIds]
    );
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching tee times players:', error.message);
    res.status(500).json({ error: 'Failed to fetch tee times players' });
  }
});

// Add a player to an event endpoint (mirrors addplayer.php, minus the Handicap field)
app.post('/api/events/:id/players', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { firstName, lastName, email, phone } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'firstName and lastName are required' });
    }
    await addPlayer(eventId, { firstName, lastName, email: email || '', phone: phone || '' });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error adding player:', error.message);
    res.status(500).json({ error: 'Failed to add player' });
  }
});

// Assign a guest player for a round endpoint (Start Game -> + Add Guest)
app.post('/api/events/:id/assign-guest', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { courseId, excludePlayerIds } = req.body;
    if (!courseId) {
      return res.status(400).json({ error: 'courseId is required' });
    }
    const guest = await assignGuestPlayer(eventId, Number(courseId), Array.isArray(excludePlayerIds) ? excludePlayerIds.map(Number) : []);
    res.json(guest);
  } catch (error: any) {
    console.error('Error assigning guest player:', error.message);
    res.status(500).json({ error: 'Failed to assign guest player' });
  }
});

// Get players eligible to link to an event endpoint (mirrors linkplayers.php)
app.get('/api/events/:id/unlinked-players', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const rows = await getUnlinkedPlayers(eventId);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching unlinked players:', error.message);
    res.status(500).json({ error: 'Failed to fetch unlinked players' });
  }
});

// Link a batch of existing players to an event endpoint (mirrors savelinked.php)
app.post('/api/events/:id/link-players', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { playerIds } = req.body;
    if (!Array.isArray(playerIds)) {
      return res.status(400).json({ error: 'playerIds array is required' });
    }
    await linkPlayers(eventId, playerIds);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error linking players:', error.message);
    res.status(500).json({ error: 'Failed to link players' });
  }
});

// Get players linked to an event, with contact info, endpoint (mirrors playerlist.php)
app.get('/api/events/:id/player-list', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const rows = await getPlayerListForEvent(eventId);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching player list:', error.message);
    res.status(500).json({ error: 'Failed to fetch player list' });
  }
});

// Rename a player (Admin -> Player List's pencil-edit) — keeps the same PlayerID, so all
// scores/history stay linked; rejected if the new name collides with any other player
app.patch('/api/players/:id', async (req, res) => {
  try {
    const playerId = parseInt(req.params.id);
    const { firstName, lastName } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'firstName and lastName are required' });
    }
    const result = await renamePlayer(playerId, firstName, lastName);
    if (!result.ok) {
      return res.status(409).json({ error: result.error });
    }
    res.json({ status: 'ok' });
  } catch (error: any) {
    console.error('Error renaming player:', error.message);
    res.status(500).json({ error: 'Failed to rename player' });
  }
});

// Search every player in the system by name endpoint (Master Tools -> Merge Players)
app.get('/api/players/search', async (req, res) => {
  try {
    const query = (req.query.q as string) || '';
    const players = await searchAllPlayers(query);
    res.json(players);
  } catch (error: any) {
    console.error('Error searching players:', error.message);
    res.status(500).json({ error: 'Failed to search players' });
  }
});

// Search players within one event's roster endpoint (Admin -> Players -> Swap Players)
app.get('/api/events/:id/players/search', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const query = (req.query.q as string) || '';
    const players = await searchPlayersInEvent(eventId, query);
    res.json(players);
  } catch (error: any) {
    console.error('Error searching players in event:', error.message);
    res.status(500).json({ error: 'Failed to search players in event' });
  }
});

// Preview a player merge's affected row counts endpoint (Master Tools -> Merge Players)
app.get('/api/players/merge-preview', async (req, res) => {
  try {
    const duplicateId = parseInt(req.query.duplicateId as string);
    const targetId = parseInt(req.query.targetId as string);
    if (!duplicateId || !targetId) {
      return res.status(400).json({ error: 'duplicateId and targetId query params are required' });
    }
    const preview = await getMergePreview(duplicateId, targetId);
    res.json(preview);
  } catch (error: any) {
    console.error('Error previewing player merge:', error.message);
    res.status(500).json({ error: 'Failed to preview player merge' });
  }
});

// Merge a duplicate player into the correct player endpoint (Master Tools -> Merge Players)
app.post('/api/players/merge', async (req, res) => {
  try {
    const { duplicateId, targetId } = req.body;
    if (!duplicateId || !targetId) {
      return res.status(400).json({ error: 'duplicateId and targetId are required' });
    }
    const result = await mergePlayers(Number(duplicateId), Number(targetId));
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error merging players:', error.message);
    res.status(500).json({ error: 'Failed to merge players' });
  }
});

// Get every player not linked to any event endpoint (Master Tools -> Cleanup Data, no event selected)
app.get('/api/players/orphaned', async (req, res) => {
  try {
    const players = await getOrphanedPlayers();
    res.json(players);
  } catch (error: any) {
    console.error('Error fetching orphaned players:', error.message);
    res.status(500).json({ error: 'Failed to fetch orphaned players' });
  }
});

// Get every player with an invalid name (starting with blank first+last) endpoint (Master Tools -> Cleanup Data, no event selected)
app.get('/api/players/invalid-names', async (req, res) => {
  try {
    const players = await getInvalidNamePlayers();
    res.json(players);
  } catch (error: any) {
    console.error('Error fetching invalid-name players:', error.message);
    res.status(500).json({ error: 'Failed to fetch invalid-name players' });
  }
});

// Delete orphaned players entirely endpoint (Master Tools -> Cleanup Data, no event selected)
app.post('/api/players/orphaned/delete', async (req, res) => {
  try {
    const { playerIds } = req.body;
    if (!Array.isArray(playerIds)) {
      return res.status(400).json({ error: 'playerIds array is required' });
    }
    await deleteOrphanedPlayers(playerIds.map(Number));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting orphaned players:', error.message);
    res.status(500).json({ error: 'Failed to delete orphaned players' });
  }
});

// Get every Game with zero Score rows endpoint (Master Tools -> Cleanup Data, no event selected)
app.get('/api/games/orphaned', async (req, res) => {
  try {
    const games = await getEmptyGames();
    res.json(games);
  } catch (error: any) {
    console.error('Error fetching empty games:', error.message);
    res.status(500).json({ error: 'Failed to fetch empty games' });
  }
});

// Delete empty games entirely endpoint (Master Tools -> Cleanup Data, no event selected)
app.post('/api/games/orphaned/delete', async (req, res) => {
  try {
    const { gameIds } = req.body;
    if (!Array.isArray(gameIds)) {
      return res.status(400).json({ error: 'gameIds array is required' });
    }
    await deleteEmptyGames(gameIds.map(Number));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting empty games:', error.message);
    res.status(500).json({ error: 'Failed to delete empty games' });
  }
});

// Get every player who has ever recorded a score, across all events (mirrors phistory.php's player list)
app.get('/api/players/history-list', async (req, res) => {
  try {
    const players = await getAllPlayersWithHistory();
    res.json(players);
  } catch (error: any) {
    console.error('Error fetching player history list:', error.message);
    res.status(500).json({ error: 'Failed to fetch player history list' });
  }
});

// Get a player's all-time validated/unvalidated skins counts endpoint
app.get('/api/players/:id/skins-stats', async (req, res) => {
  try {
    const playerId = parseInt(req.params.id);
    const stats = await getPlayerSkinsStats(playerId);
    res.json(stats);
  } catch (error: any) {
    console.error('Error fetching player skins stats:', error.message);
    res.status(500).json({ error: 'Failed to fetch player skins stats' });
  }
});

// Get a player's 20 most recent skins endpoint
app.get('/api/players/:id/recent-skins', async (req, res) => {
  try {
    const playerId = parseInt(req.params.id);
    const rounds = await getPlayerRecentSkins(playerId);
    res.json(rounds);
  } catch (error: any) {
    console.error('Error fetching player recent skins:', error.message);
    res.status(500).json({ error: 'Failed to fetch player recent skins' });
  }
});

// Get a player's all-time gross/net average/min/max endpoint (mirrors getstats.php)
app.get('/api/players/:id/stats', async (req, res) => {
  try {
    const playerId = parseInt(req.params.id);
    const stats = await getPlayerStats(playerId);
    res.json(stats);
  } catch (error: any) {
    console.error('Error fetching player stats:', error.message);
    res.status(500).json({ error: 'Failed to fetch player stats' });
  }
});

// Get a player's 20 most recent full 18-hole rounds endpoint (mirrors getprounds.php)
app.get('/api/players/:id/rounds', async (req, res) => {
  try {
    const playerId = parseInt(req.params.id);
    const rounds = await getPlayerRounds(playerId);
    res.json(rounds);
  } catch (error: any) {
    console.error('Error fetching player rounds:', error.message);
    res.status(500).json({ error: 'Failed to fetch player rounds' });
  }
});

// Get latest handicap for a player endpoint
app.get('/api/players/:id/handicap', async (req, res) => {
  try {
    const playerId = parseInt(req.params.id);
    // Mirror the PHP query: SELECT h.Hdcp FROM Hdcp WHERE PlayerID = ? ORDER BY LastUpdateDt DESC LIMIT 1
    const [rows] = await pool.query<any[]>(
      `SELECT h.Hdcp FROM Hdcp h WHERE h.PlayerID = ? ORDER BY h.LastUpdateDt DESC LIMIT 1`,
      [playerId]
    );
    if (rows.length > 0) {
      res.json({ handicap: rows[0].Hdcp });
    } else {
      res.json({ handicap: '' });
    }
  } catch (error: any) {
    console.error('Error fetching handicap:', error.message);
    res.status(500).json({ error: 'Failed to fetch handicap' });
  }
});

// Get a GHIN-linked player's live index + Course Handicap per tee for Start Game's tee picker
// (null if no GHIN on file or this course has no known GHIN course id — caller falls back to
// manual handicap entry either way)
app.get('/api/players/:id/course-handicaps', async (req, res) => {
  try {
    const playerId = parseInt(req.params.id);
    const courseId = parseInt(req.query.courseId as string);
    const result = await getPlayerCourseHandicaps(playerId, courseId);
    res.json(result);
  } catch (error: any) {
    console.error('Error fetching course handicaps:', error.message);
    res.status(500).json({ error: 'Failed to fetch course handicaps' });
  }
});

// Create event endpoint
app.post('/api/events', async (req, res) => {
  try {
    const { eventName, courseName } = req.body;
    if (!eventName || !courseName) {
      return res.status(400).json({ error: 'Event name and course are required' });
    }
    const event = await createEvent({ eventName, courseName });
    res.status(201).json(event);
  } catch (error: any) {
    console.error('Error creating event:', error.message);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Get tee times for an event endpoint -- merges a linked event's own tee-date rows in too, if
// Link Tee Times is on. If both events happen to have their own row for the same date (shouldn't
// really happen once whichever admin owns that date stops double-entering it), this event's own
// row wins -- see teeTimesLinkService.ts's doc comment for the real scenario this solves.
app.get('/api/events/:id/teetimes', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const linkedEventId = await getLinkedEventId(eventId);
    const eventIds = linkedEventId ? [eventId, linkedEventId] : [eventId];
    const [rows] = await pool.query<any[]>(
      `SELECT GroupID, TeeDate, Time1, Time2, Time3, Time4, Time5
       FROM TeeTimes
       WHERE GroupID IN (?) AND TeeDate >= CURDATE()
       ORDER BY TeeDate`,
      [eventIds]
    );
    const byDate = new Map<string, any>();
    for (const r of rows) {
      const key = String(r.TeeDate);
      if (!byDate.has(key) || r.GroupID === eventId) byDate.set(key, r);
    }
    const merged = Array.from(byDate.values())
      .sort((a, b) => (a.TeeDate < b.TeeDate ? -1 : a.TeeDate > b.TeeDate ? 1 : 0))
      .map(({ GroupID, ...rest }) => rest);
    res.json(merged);
  } catch (error: any) {
    console.error('Error fetching tee times:', error.message);
    res.status(500).json({ error: 'Failed to fetch tee times' });
  }
});

// Get everyone registered for a tee date, with paid status (Admin -> Paid Tracker)
app.get('/api/events/:id/paid-tracker', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const teeDate = req.query.teeDate as string;
    if (!teeDate) {
      return res.status(400).json({ error: 'teeDate query param required' });
    }
    const rows = await getPaidTrackerList(eventId, teeDate);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching paid tracker list:', error.message);
    res.status(500).json({ error: 'Failed to fetch paid tracker list' });
  }
});

// Mark a player paid/unpaid for a tee date (Admin -> Paid Tracker)
app.post('/api/events/:id/paid-tracker', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { playerId, teeDate, paid } = req.body;
    if (!playerId || !teeDate || typeof paid !== 'boolean') {
      return res.status(400).json({ error: 'playerId, teeDate, and paid are required' });
    }
    await setPaidTracker(eventId, teeDate, playerId, paid);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error setting paid tracker status:', error.message);
    res.status(500).json({ error: 'Failed to set paid tracker status' });
  }
});

// Who's marked Out for this tee date but still shows paid (Tee Times' refund-needed flag)
app.get('/api/events/:id/refund-needed', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const teeDate = req.query.teeDate as string;
    if (!teeDate) {
      return res.status(400).json({ error: 'teeDate query param required' });
    }
    const rows = await getRefundNeededList(eventId, teeDate);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching refund-needed list:', error.message);
    res.status(500).json({ error: 'Failed to fetch refund-needed list' });
  }
});

// Get everyone registered for a tee date, with Gross Skins paid status (Admin -> Gross Skins Tracker)
app.get('/api/events/:id/gross-skins-tracker', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const teeDate = req.query.teeDate as string;
    if (!teeDate) {
      return res.status(400).json({ error: 'teeDate query param required' });
    }
    const rows = await getGrossSkinsPaidList(eventId, teeDate);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching gross skins paid list:', error.message);
    res.status(500).json({ error: 'Failed to fetch gross skins paid list' });
  }
});

// Date list for Gross Skins Tracker (last month + future, unlike Paid Tracker's future-only /teetimes)
app.get('/api/events/:id/gross-skins-tracker-dates', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const result = await getGrossSkinsTrackerDates(eventId);
    res.json(result);
  } catch (error: any) {
    console.error('Error fetching gross skins tracker dates:', error.message);
    res.status(500).json({ error: 'Failed to fetch gross skins tracker dates' });
  }
});

// Mark a player paid/unpaid for Gross Skins for a tee date (Admin -> Gross Skins Tracker)
app.post('/api/events/:id/gross-skins-tracker', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { playerId, teeDate, paid } = req.body;
    if (!playerId || !teeDate || typeof paid !== 'boolean') {
      return res.status(400).json({ error: 'playerId, teeDate, and paid are required' });
    }
    await setGrossSkinsPaid(eventId, teeDate, playerId, paid);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error setting gross skins paid status:', error.message);
    res.status(500).json({ error: 'Failed to set gross skins paid status' });
  }
});

// Add tee times for an event/date endpoint (mirrors addtimes.php)
app.post('/api/events/:id/teetimes', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { teeDate, time1, time2, time3, time4, time5 } = req.body;
    if (!teeDate) {
      return res.status(400).json({ error: 'teeDate is required' });
    }
    await addTeeTime(eventId, { teeDate, time1, time2, time3, time4, time5 });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error adding tee time:', error.message);
    res.status(500).json({ error: 'Failed to add tee time' });
  }
});

// Get GHIN posting compliance for a game endpoint (mirrors posted_scores.php)
app.get('/api/games/:id/naughty-list', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const rows = await getNaughtyList(gameId);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching naughty list:', error.message);
    res.status(500).json({ error: 'Failed to fetch naughty list' });
  }
});

// Manually re-check GHIN for a "not posted" Naughty List row across the next 7 days, matching
// on exact gross score (catches late/wrong-date postings the daily cron scripts miss)
app.post('/api/games/:id/players/:playerId/naughty-recheck', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const playerId = parseInt(req.params.playerId);
    const result = await recheckLatePosting(gameId, playerId);
    res.json(result);
  } catch (error: any) {
    console.error('Error re-checking GHIN posting:', error.message);
    res.status(500).json({ error: 'Failed to re-check GHIN posting' });
  }
});

// Get GHIN-linking player list for an event endpoint (mirrors ghin_playerlist.php)
app.get('/api/events/:id/ghin-players', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const rows = await getGhinPlayerList(eventId);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching GHIN player list:', error.message);
    res.status(500).json({ error: 'Failed to fetch GHIN player list' });
  }
});

// Skip (or un-skip) a player from the GHIN-linking flow
app.post('/api/players/:id/ghin-skip', async (req, res) => {
  try {
    const playerId = parseInt(req.params.id);
    const { skip } = req.body;
    await setPlayerGhinSkip(playerId, !!skip);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error setting GHIN skip:', error.message);
    res.status(500).json({ error: 'Failed to set GHIN skip' });
  }
});

// Refresh every GHIN-linked player's cached index — called once when the app launches
// (app/_layout.tsx); no-ops (no network calls) for anyone already refreshed today, see
// refreshGhinIndexes's doc comment. `force: true` re-pulls everyone regardless. Also the target
// of the nightly 4am cron job (refresh_handicaps.py).
app.post('/api/ghin/refresh-indexes', async (req, res) => {
  try {
    await refreshGhinIndexes(!!req.body?.force);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error refreshing GHIN indexes:', error.message);
    res.status(500).json({ error: 'Failed to refresh GHIN indexes' });
  }
});

// Search the real GHIN Network by name/state endpoint (mirrors search_ghin.php), with a
// nationwide "posted at our course" fallback for anyone the name/state search alone misses
app.get('/api/ghin/search', async (req, res) => {
  try {
    const fname = (req.query.fname as string) || '';
    const lname = (req.query.lname as string) || '';
    const state = (req.query.state as string) || '';
    const course = (req.query.course as string) || '';
    const results = await searchGhinWithHistoryFallback(fname, lname, state, course);
    res.json(results);
  } catch (error: any) {
    console.error('Error searching GHIN:', error.message);
    res.status(500).json({ error: 'Failed to search GHIN' });
  }
});

// Find unambiguous GHIN Network matches for every non-guest player with no GHIN on file
app.get('/api/events/:id/ghin-easy-links', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const candidates = await findEasyGhinLinks(eventId);
    res.json(candidates);
  } catch (error: any) {
    console.error('Error finding easy GHIN links:', error.message);
    res.status(500).json({ error: 'Failed to find easy GHIN links' });
  }
});

// Link a player to a real GHIN number endpoint (mirrors save_ghin.php)
app.post('/api/players/:id/ghin', async (req, res) => {
  try {
    const playerId = parseInt(req.params.id);
    const { ghin } = req.body;
    if (!ghin) {
      return res.status(400).json({ error: 'ghin is required' });
    }
    await linkPlayerGhin(playerId, Number(ghin));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error linking GHIN:', error.message);
    res.status(500).json({ error: 'Failed to link GHIN' });
  }
});

// Get GHIN posting record per player for a year endpoint (mirrors ghin_summary.php)
app.get('/api/events/:id/ghin-summary', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const year = parseInt(req.query.year as string);
    if (!year) {
      return res.status(400).json({ error: 'year query param is required' });
    }
    const rows = await getGhinSummary(eventId, year);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching GHIN summary:', error.message);
    res.status(500).json({ error: 'Failed to fetch GHIN summary' });
  }
});

// Get the years with GHIN posting data for an event endpoint
app.get('/api/events/:id/ghin-years', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const years = await getGhinYears(eventId);
    res.json(years);
  } catch (error: any) {
    console.error('Error fetching GHIN years:', error.message);
    res.status(500).json({ error: 'Failed to fetch GHIN years' });
  }
});

// Get an event's options endpoint (mirrors options.php)
app.get('/api/events/:id/options', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const options = await getEventOptions(eventId);
    res.json(options);
  } catch (error: any) {
    console.error('Error fetching event options:', error.message);
    res.status(500).json({ error: 'Failed to fetch event options' });
  }
});

// Save an event's options endpoint (mirrors saveoptions.php)
app.post('/api/events/:id/options', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    await saveEventOptions(eventId, req.body);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error saving event options:', error.message);
    res.status(500).json({ error: 'Failed to save event options' });
  }
});

// Get a single game's effective payout settings (event defaults merged with any per-game
// override) — lets Week Results show/adjust that week's payout split without touching every
// other week of the same recurring event.
app.get('/api/games/:id/payout-options', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const eventId = parseInt(req.query.eventId as string);
    const result = await getEffectiveGamePayoutOptions(gameId, eventId);
    res.json(result);
  } catch (error: any) {
    console.error('Error fetching game payout options:', error.message);
    res.status(500).json({ error: 'Failed to fetch game payout options' });
  }
});

// Save a per-game payout override (places/percentages only) for this one week.
app.post('/api/games/:id/payout-options', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    await saveGamePayoutOverrides(gameId, req.body);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error saving game payout options:', error.message);
    res.status(500).json({ error: 'Failed to save game payout options' });
  }
});

// Clear specific per-game payout override keys (e.g. just Net, or just one Teams slot),
// reverting that section back to the event's default -- other overridden sections are untouched.
app.delete('/api/games/:id/payout-options', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const keys = Array.isArray(req.body?.keys) ? req.body.keys : [];
    await resetGamePayoutOverrides(gameId, keys);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error resetting game payout options:', error.message);
    res.status(500).json({ error: 'Failed to reset game payout options' });
  }
});

// This week's Double Bogey Max override, if any -- null means "no override, follow the event
// default". Set up front (Team Games screen), not after the round like the payout overrides
// above, so the cap actually applies to live scoring (see game.tsx's loadOptions).
app.get('/api/games/:id/dblbogey-override', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const mode = await getGameDblBogeyOverride(gameId);
    res.json({ mode });
  } catch (error: any) {
    console.error('Error fetching game double bogey override:', error.message);
    res.status(500).json({ error: 'Failed to fetch game double bogey override' });
  }
});

// Set (mode: 'off'|'gross'|'net') or clear (mode: null) this week's override.
app.post('/api/games/:id/dblbogey-override', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const mode = req.body?.mode;
    if (mode !== null && mode !== 'off' && mode !== 'gross' && mode !== 'net') {
      return res.status(400).json({ error: 'mode must be "off", "gross", "net", or null' });
    }
    await saveGameDblBogeyOverride(gameId, mode);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error saving game double bogey override:', error.message);
    res.status(500).json({ error: 'Failed to save game double bogey override' });
  }
});

// Recompute and persist this game's Net/Teams/Skins payout ledger rows -- called by Week Results
// whenever it displays a week's payouts (browsing to it, or after an Adjust Payout save), so the
// season summary always has an up-to-date record without a separate "finalize" step.
app.post('/api/games/:id/sync-payouts', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    await syncGamePayoutLedger(gameId);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error syncing game payout ledger:', error.message);
    res.status(500).json({ error: 'Failed to sync game payout ledger' });
  }
});

// Everyone's total winnings for a week across every payout type at once (Purse tab)
app.get('/api/games/:id/purse', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const rows = await getWeekPurse(gameId);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching week purse:', error.message);
    res.status(500).json({ error: 'Failed to fetch week purse' });
  }
});

// Hole-in-one celebration info for a game -- null when there wasn't one. Week Results checks
// this whenever a week is opened, to show the "wins the entire pot" celebration screen.
app.get('/api/games/:id/hole-in-one', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const celebration = await getHoleInOneCelebration(gameId);
    res.json(celebration);
  } catch (error: any) {
    console.error('Error fetching hole-in-one celebration:', error.message);
    res.status(500).json({ error: 'Failed to fetch hole-in-one celebration' });
  }
});

// Season-long payout summary for an event: per player, total paid in vs. total won.
app.get('/api/events/:id/payout-summary', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const summary = await getSeasonPayoutSummary(eventId);
    res.json(summary);
  } catch (error: any) {
    console.error('Error fetching season payout summary:', error.message);
    res.status(500).json({ error: 'Failed to fetch season payout summary' });
  }
});

// Net + Teams payout totals for every calendar week of an event (Skins excluded -- flat rate
// all year) -- read-only, for the Payout Review screen's at-a-glance list.
app.get('/api/events/:id/payout-review', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const weeks = await getPayoutReviewForEvent(eventId);
    res.json(weeks);
  } catch (error: any) {
    console.error('Error fetching payout review:', error.message);
    res.status(500).json({ error: 'Failed to fetch payout review' });
  }
});

// Whether an event currently has an Admin password set endpoint
app.get('/api/events/:id/admin-password-status', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const hasPassword = await hasAdminPassword(eventId);
    res.json({ hasPassword });
  } catch (error: any) {
    console.error('Error checking admin password status:', error.message);
    res.status(500).json({ error: 'Failed to check admin password status' });
  }
});

// Verify a candidate Admin password for an event endpoint
app.post('/api/events/:id/verify-admin-password', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { password } = req.body;
    const valid = await verifyAdminPassword(eventId, password ?? '');
    res.json({ valid });
  } catch (error: any) {
    console.error('Error verifying admin password:', error.message);
    res.status(500).json({ error: 'Failed to verify admin password' });
  }
});

// Set (or clear, if blank) an event's Admin password endpoint
app.post('/api/events/:id/admin-password', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { password } = req.body;
    await setAdminPassword(eventId, password ?? '');
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error setting admin password:', error.message);
    res.status(500).json({ error: 'Failed to set admin password' });
  }
});

// Get the admin's saved Venmo username for this event (Tee Times' "pay now" prompt uses this as
// the payment recipient) -- '' if none is set yet.
app.get('/api/events/:id/venmo-username', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const username = await getVenmoUsername(eventId);
    res.json({ username });
  } catch (error: any) {
    console.error('Error fetching Venmo username:', error.message);
    res.status(500).json({ error: 'Failed to fetch Venmo username' });
  }
});

// Set (or clear, if blank) the admin's Venmo username for this event. 400s if the value doesn't
// match Venmo's real username format (see VENMO_USERNAME_PATTERN) -- there's no API to confirm
// the account actually exists, so format is the only check available.
app.post('/api/events/:id/venmo-username', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { username } = req.body;
    const ok = await setVenmoUsername(eventId, username ?? '');
    if (!ok) return res.status(400).json({ error: 'Not a valid Venmo username format' });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error setting Venmo username:', error.message);
    res.status(500).json({ error: 'Failed to set Venmo username' });
  }
});

// Get an event's recorded UPS Cup winners endpoint
app.get('/api/events/:id/ups-cup-winners', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const winners = await getUpsCupWinners(eventId);
    res.json(winners);
  } catch (error: any) {
    console.error('Error fetching UPS Cup winners:', error.message);
    res.status(500).json({ error: 'Failed to fetch UPS Cup winners' });
  }
});

// Set (or replace) an event's UPS Cup winner for a given year endpoint
app.post('/api/events/:id/ups-cup-winners', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { year, playerId } = req.body;
    if (!year || !playerId) {
      return res.status(400).json({ error: 'year and playerId are required' });
    }
    await setUpsCupWinner(eventId, parseInt(year), parseInt(playerId));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error setting UPS Cup winner:', error.message);
    res.status(500).json({ error: 'Failed to set UPS Cup winner' });
  }
});

// Remove an event's UPS Cup winner for a given year endpoint
app.delete('/api/events/:id/ups-cup-winners/:year', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const year = parseInt(req.params.year);
    await deleteUpsCupWinner(eventId, year);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting UPS Cup winner:', error.message);
    res.status(500).json({ error: 'Failed to delete UPS Cup winner' });
  }
});

// Get each Major's automatic UPS Cup qualifier for a given year endpoint
app.get('/api/events/:id/major-winners', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const winners = await getMajorWinners(eventId, year);
    res.json(winners);
  } catch (error: any) {
    console.error('Error fetching major winners:', error.message);
    res.status(500).json({ error: 'Failed to fetch major winners' });
  }
});

// Get a game's UPS Cup points (standard competition ranking by net score) endpoint
app.get('/api/games/:id/ups-points', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const points = await getUpsPointsForGame(gameId);
    res.json(points);
  } catch (error: any) {
    console.error('Error fetching UPS points:', error.message);
    res.status(500).json({ error: 'Failed to fetch UPS points' });
  }
});

// Get players mathematically eliminated from UPS Cup qualification for a given year endpoint
app.get('/api/events/:id/ineligible-players', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const ineligible = await getIneligiblePlayers(eventId, year);
    res.json(ineligible);
  } catch (error: any) {
    console.error('Error fetching ineligible players:', error.message);
    res.status(500).json({ error: 'Failed to fetch ineligible players' });
  }
});

// Get current UPS Cup standings for a given year endpoint
app.get('/api/events/:id/ups-standings', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const standings = await getCurrentStandings(eventId, year);
    res.json(standings);
  } catch (error: any) {
    console.error('Error fetching UPS Cup standings:', error.message);
    res.status(500).json({ error: 'Failed to fetch UPS Cup standings' });
  }
});

// Get players who've paid their UPS Cup entry for a given year endpoint
app.get('/api/events/:id/ups-paid-players', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const paid = await getPaidPlayers(eventId, year);
    res.json(paid);
  } catch (error: any) {
    console.error('Error fetching paid players:', error.message);
    res.status(500).json({ error: 'Failed to fetch paid players' });
  }
});

// Mark a player as having paid their UPS Cup entry for a given year endpoint
app.post('/api/events/:id/ups-paid-players', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { year, playerId } = req.body;
    if (!year || !playerId) {
      return res.status(400).json({ error: 'year and playerId are required' });
    }
    await setPlayerPaid(eventId, parseInt(year), parseInt(playerId));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error marking player paid:', error.message);
    res.status(500).json({ error: 'Failed to mark player paid' });
  }
});

// Remove a player's paid UPS Cup entry for a given year endpoint
app.delete('/api/events/:id/ups-paid-players/:year/:playerId', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const year = parseInt(req.params.year);
    const playerId = parseInt(req.params.playerId);
    await removePlayerPaid(eventId, year, playerId);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error removing paid player:', error.message);
    res.status(500).json({ error: 'Failed to remove paid player' });
  }
});

// Get the Birdie Race leaderboard (holes birdied per player this year) for an event endpoint
app.get('/api/events/:id/birdie-leaderboard', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const rows = await getBirdieLeaderboard(eventId, year);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching birdie leaderboard:', error.message);
    res.status(500).json({ error: 'Failed to fetch birdie leaderboard' });
  }
});

// Get one player's Birdie Race status (all 18 holes, birdied or not) for an event endpoint
app.get('/api/events/:id/birdie-player-status', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const playerId = parseInt(req.query.playerId as string);
    const rows = await getPlayerBirdieStatus(eventId, year, playerId);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching player birdie status:', error.message);
    res.status(500).json({ error: 'Failed to fetch player birdie status' });
  }
});

// Get one hole's Birdie Race detail (every player who has net-birdied it) for an event endpoint
app.get('/api/events/:id/birdie-hole-detail', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const hole = parseInt(req.query.hole as string);
    const rows = await getHoleBirdieDetail(eventId, year, hole);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching hole birdie detail:', error.message);
    res.status(500).json({ error: 'Failed to fetch hole birdie detail' });
  }
});

// Get an event's calendar for a given year endpoint
app.get('/api/events/:id/calendar', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const days = await getCalendarForYear(eventId, year);
    res.json(days);
  } catch (error: any) {
    console.error('Error fetching calendar:', error.message);
    res.status(500).json({ error: 'Failed to fetch calendar' });
  }
});

// Set (or replace) a single calendar day endpoint
app.post('/api/events/:id/calendar', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { date, dayType, note } = req.body;
    if (!date || !dayType) {
      return res.status(400).json({ error: 'date and dayType are required' });
    }
    await setCalendarDay(eventId, date, dayType, note ?? '');
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error setting calendar day:', error.message);
    res.status(500).json({ error: 'Failed to set calendar day' });
  }
});

// Remove a calendar day entirely endpoint
app.delete('/api/events/:id/calendar/:date', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const date = req.params.date;
    await deleteCalendarDay(eventId, date);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting calendar day:', error.message);
    res.status(500).json({ error: 'Failed to delete calendar day' });
  }
});

// Get likely test/abandoned games and incomplete rounds for an event (Admin -> Cleanup Scores)
app.get('/api/events/:id/cleanup-candidates', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const candidates = await getCleanupCandidates(eventId);
    res.json(candidates);
  } catch (error: any) {
    console.error('Error fetching cleanup candidates:', error.message);
    res.status(500).json({ error: 'Failed to fetch cleanup candidates' });
  }
});

// Delete selected cleanup candidates (Admin -> Cleanup Scores)
app.post('/api/events/:id/cleanup-candidates/delete', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' });
    }
    await deleteCleanupCandidates(eventId, items);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting cleanup candidates:', error.message);
    res.status(500).json({ error: 'Failed to delete cleanup candidates' });
  }
});

// Mark selected cleanup candidates as legit — no delete, just stop flagging them
app.post('/api/events/:id/cleanup-candidates/ignore', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' });
    }
    await ignoreCleanupCandidates(eventId, items);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error ignoring cleanup candidates:', error.message);
    res.status(500).json({ error: 'Failed to ignore cleanup candidates' });
  }
});

// Get everything currently marked as legit for this event (Admin -> Cleanup Scores)
app.get('/api/events/:id/cleanup-ignored', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const rows = await getIgnoredCleanupItems(eventId);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching ignored cleanup items:', error.message);
    res.status(500).json({ error: 'Failed to fetch ignored cleanup items' });
  }
});

// Un-ignore a single item — it'll show back up as a candidate if it still applies
app.delete('/api/events/:id/cleanup-ignored/:key', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const key = decodeURIComponent(req.params.key);
    await unignoreCleanupItem(eventId, key);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error un-ignoring cleanup item:', error.message);
    res.status(500).json({ error: 'Failed to un-ignore cleanup item' });
  }
});

// Get every opted-out (Remove Player) record for an event endpoint (Admin -> Cleanup Scores)
app.get('/api/events/:id/opted-out', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const rows = await getOptedOutPlayers(eventId);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching opted-out players:', error.message);
    res.status(500).json({ error: 'Failed to fetch opted-out players' });
  }
});


// Get player status for a date endpoint -- merges a linked event's own sign-ups in too, if Link
// Tee Times is on. A player who somehow has a status row in BOTH linked events for the same date
// (shouldn't normally happen once auto-provisioning keeps their roster membership in sync) has
// this event's own row win.
app.get('/api/events/:id/status', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const teeDate = req.query.teeDate as string;
    if (!teeDate) {
      return res.status(400).json({ error: 'teeDate query param required' });
    }
    const linkedEventId = await getLinkedEventId(eventId);
    const eventIds = linkedEventId ? [eventId, linkedEventId] : [eventId];
    const [rows] = await pool.query<any[]>(
      `SELECT ps.PlayerID, p.LastName, p.FirstName, ps.Status, ps.GroupID
       FROM PlayerStatus ps
       INNER JOIN Player p ON p.PlayerID = ps.PlayerID
       WHERE ps.GroupID IN (?) AND ps.TeeDate = ?
       ORDER BY ps.LastUpdateDt ASC`,
      [eventIds, teeDate]
    );
    const byPlayer = new Map<number, any>();
    for (const r of rows) {
      const existing = byPlayer.get(r.PlayerID);
      if (!existing || r.GroupID === eventId) byPlayer.set(r.PlayerID, r);
    }
    const merged = Array.from(byPlayer.values()).map(({ GroupID, PlayerID, ...rest }) => rest);
    res.json(merged);
  } catch (error: any) {
    console.error('Error fetching player status:', error.message);
    res.status(500).json({ error: 'Failed to fetch player status' });
  }
});

// Save player In/Out status endpoint -- writes to this event only (single source of truth per
// sign-up, the merged GET above handles surfacing it on either linked event's screen), but also
// auto-provisions the player onto a linked event's own roster if they're not already on it (see
// teeTimesLinkService.ts's ensurePlayerLinkedToEvent), so their name is selectable there too
// going forward without the admin ever adding them twice.
app.post('/api/events/:id/status', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { playerId, teeDate, status } = req.body;
    if (!playerId || !teeDate || !status) {
      return res.status(400).json({ error: 'playerId, teeDate, and status are required' });
    }
    // Validate status value
    const validStatuses = ['I', 'E', 'L', 'X', 'O'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be one of: I, E, L, X, O' });
    }
    await pool.query(
      `INSERT INTO PlayerStatus (GroupID, TeeDate, PlayerID, Status)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE Status = VALUES(Status)`,
      [eventId, teeDate, playerId, status]
    );
    const linkedEventId = await getLinkedEventId(eventId);
    if (linkedEventId) await ensurePlayerLinkedToEvent(playerId, linkedEventId);
    res.json({ message: 'Status saved' });
  } catch (error: any) {
    console.error('Error saving status:', error.message);
    res.status(500).json({ error: 'Failed to save status' });
  }
});

// Get or create game endpoint
app.post('/api/game', async (req, res) => {
  try {
    const { eventId, courseId } = req.body;
    if (!eventId || !courseId) {
      return res.status(400).json({ error: 'Event ID and course ID are required' });
    }
    
    const gameId = await getOrCreateGame(eventId, courseId);
    res.json({ gameId });
  } catch (error: any) {
    console.error('Error getting or creating game:', error.message);
    res.status(500).json({ error: 'Failed to get or create game' });
  }
});

// Get a player's handicap already saved for THIS SPECIFIC game (not just their most recent
// handicap anywhere) -- lets Start Game skip the tee/handicap prompt entirely when re-adding
// someone who already went through it earlier today for this exact round (e.g. resuming after a
// crash, or being re-picked after a Resume Group).
app.get('/api/games/:id/handicap/:playerId', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const playerId = parseInt(req.params.playerId);
    const [rows] = await pool.query<any[]>(
      'SELECT Hdcp FROM Hdcp WHERE GameID = ? AND PlayerID = ?',
      [gameId, playerId]
    );
    res.json({ hdcp: rows.length > 0 ? rows[0].Hdcp : null });
  } catch (error: any) {
    console.error('Error fetching game player handicap:', error.message);
    res.status(500).json({ error: 'Failed to fetch game player handicap' });
  }
});

// Save a player's handicap as entered for this game endpoint (mirrors legacy startgame.php's Hdcp write)
app.post('/api/games/:id/handicap', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const { playerId, hdcp } = req.body;
    if (!playerId || hdcp === undefined || hdcp === null) {
      return res.status(400).json({ error: 'playerId and hdcp are required' });
    }
    await pool.query(
      `INSERT INTO Hdcp (GameID, PlayerID, Hdcp, LastUpdateUser)
       VALUES (?, ?, ?, 'app')
       ON DUPLICATE KEY UPDATE Hdcp = VALUES(Hdcp), LastUpdateDt = CURRENT_TIMESTAMP`,
      [gameId, playerId, hdcp]
    );
    await invalidateSkinsCache(gameId);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error saving handicap:', error.message);
    res.status(500).json({ error: 'Failed to save handicap' });
  }
});

// Save player scores endpoint
app.post('/api/scores', async (req, res) => {
  try {
    const { gameId, playerId, scores } = req.body;
    if (!playerId || !scores) {
      return res.status(400).json({ error: 'Player ID and scores are required' });
    }
    
    // scores is now an array of pre-calculated entries from the frontend
    const success = await savePlayerScores(gameId, playerId, scores);
    if (success) {
      res.json({ message: 'Scores saved successfully' });
    } else {
      res.status(500).json({ error: 'Failed to save scores' });
    }
  } catch (error: any) {
    console.error('Error saving scores:', error.message);
    res.status(500).json({ error: 'Failed to save scores' });
  }
});

// Delete a player's saved scores for specific holes (Swap Sides, after moving a hole's score
// to its mirrored hole)
app.post('/api/scores/:gameId/:playerId/delete-holes', async (req, res) => {
  try {
    const gameId = parseInt(req.params.gameId);
    const playerId = parseInt(req.params.playerId);
    const { holeNumbers } = req.body;
    if (!Array.isArray(holeNumbers)) {
      return res.status(400).json({ error: 'holeNumbers array is required' });
    }
    const success = await deletePlayerHoleScores(gameId, playerId, holeNumbers);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to delete hole scores' });
    }
  } catch (error: any) {
    console.error('Error deleting hole scores:', error.message);
    res.status(500).json({ error: 'Failed to delete hole scores' });
  }
});

// Get player scores endpoint
app.get('/api/scores/:gameId/:playerId', async (req, res) => {
  try {
    const gameId = parseInt(req.params.gameId);
    const playerId = parseInt(req.params.playerId);

    if (!gameId || !playerId) {
      return res.status(400).json({ error: 'Game ID and player ID are required' });
    }

    const scores = await getPlayerScores(gameId, playerId);
    res.json(scores);
  } catch (error: any) {
    console.error('Error getting scores:', error.message);
    res.status(500).json({ error: 'Failed to get scores' });
  }
});

// One player's hole-by-hole gross+net scorecard for a side (Leaderboard tap-a-name drill-down)
app.get('/api/games/:gameId/players/:playerId/scorecard', async (req, res) => {
  try {
    const gameId = parseInt(req.params.gameId);
    const playerId = parseInt(req.params.playerId);
    const side = (req.query.side as string) || 'T';
    if (!gameId || !playerId) {
      return res.status(400).json({ error: 'Game ID and player ID are required' });
    }
    if (side !== 'F' && side !== 'B' && side !== 'T') {
      return res.status(400).json({ error: 'side must be F, B, or T' });
    }
    const scorecard = await getPlayerScorecard(gameId, playerId, side);
    res.json(scorecard);
  } catch (error: any) {
    console.error('Error getting player scorecard:', error.message);
    res.status(500).json({ error: 'Failed to get player scorecard' });
  }
});

// Get latest game for an event endpoint
app.get('/api/events/:id/latest-game', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const gameInfo = await getLatestGameId(eventId);
    if (!gameInfo) {
      return res.status(404).json({ error: 'No games found for this event' });
    }
    res.json(gameInfo);
  } catch (error: any) {
    console.error('Error fetching latest game:', error.message);
    res.status(500).json({ error: 'Failed to fetch latest game' });
  }
});

// Every date Team Games can be viewed for (past/current real games + future Setup Calendar dates)
app.get('/api/events/:id/team-game-weeks', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const weeks = await getTeamGameWeeks(eventId);
    res.json(weeks);
  } catch (error: any) {
    console.error('Error fetching team game weeks:', error.message);
    res.status(500).json({ error: 'Failed to fetch team game weeks' });
  }
});

// Lazily find-or-create the Game for a specific (possibly future) date, for Team Games
app.post('/api/events/:id/ensure-game', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { date, courseId } = req.body;
    if (!date) return res.status(400).json({ error: 'date is required' });
    const gameId = await getOrCreateGameForDate(eventId, date, courseId);
    res.json({ gameId });
  } catch (error: any) {
    console.error('Error ensuring game for date:', error.message);
    res.status(400).json({ error: error.message || 'Failed to ensure game for date' });
  }
});

// Change which course an already-created game is played at endpoint
app.post('/api/games/:id/course', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const { courseId } = req.body;
    if (!courseId) return res.status(400).json({ error: 'courseId is required' });
    await updateGameCourse(gameId, courseId);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating game course:', error.message);
    res.status(400).json({ error: error.message || 'Failed to update game course' });
  }
});

// Get leaderboard for a game endpoint
app.get('/api/games/:id/leaderboard', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const scoreType = req.query.scoreType as 'G' | 'N';
    if (!scoreType || !['G', 'N'].includes(scoreType)) {
      return res.status(400).json({ error: 'scoreType query param required (G or N)' });
    }
    const rows = await getLeaderboard(gameId, scoreType);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching leaderboard:', error.message);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get which side (F/B) the scorecard grid should default to opening on for a game
app.get('/api/games/:id/default-side', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const side = await getDefaultScorecardSide(gameId);
    res.json({ side });
  } catch (error: any) {
    console.error('Error fetching default scorecard side:', error.message);
    res.status(500).json({ error: 'Failed to fetch default scorecard side' });
  }
});

// Get every player's hole-by-hole scores for a game and side/scoreType (mirrors showscorecard.php)
app.get('/api/games/:id/scorecard', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const side = req.query.side as 'F' | 'B' | 'T';
    const scoreType = req.query.scoreType as 'G' | 'N' | 'S';
    if (!side || !['F', 'B', 'T'].includes(side)) {
      return res.status(400).json({ error: 'side query param required (F, B, or T)' });
    }
    if (!scoreType || !['G', 'N', 'S'].includes(scoreType)) {
      return res.status(400).json({ error: 'scoreType query param required (G, N, or S)' });
    }
    const rows = await getGameScorecard(gameId, side, scoreType);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching scorecard:', error.message);
    res.status(500).json({ error: 'Failed to fetch scorecard' });
  }
});

// Get all games (weeks) played for an event endpoint
app.get('/api/events/:id/games', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const games = await getGamesForEvent(eventId);
    res.json(games);
  } catch (error: any) {
    console.error('Error fetching games for event:', error.message);
    res.status(500).json({ error: 'Failed to fetch games for event' });
  }
});

// Get players who have scores in a game endpoint
app.get('/api/games/:id/players', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const players = await getPlayersForGame(gameId);
    res.json(players);
  } catch (error: any) {
    console.error('Error fetching players for game:', error.message);
    res.status(500).json({ error: 'Failed to fetch players for game' });
  }
});

// Preview swapping two players' data for a game endpoint (Admin -> Players -> Swap Players)
app.get('/api/games/:id/swap-preview', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const playerAId = parseInt(req.query.playerAId as string);
    const playerBId = parseInt(req.query.playerBId as string);
    if (!playerAId || !playerBId) {
      return res.status(400).json({ error: 'playerAId and playerBId query params are required' });
    }
    const preview = await getGameSwapPreview(gameId, playerAId, playerBId);
    res.json(preview);
  } catch (error: any) {
    console.error('Error previewing player swap:', error.message);
    res.status(500).json({ error: 'Failed to preview player swap' });
  }
});

// Swap two players' data for a game endpoint (Admin -> Players -> Swap Players)
app.post('/api/games/:id/swap', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const { playerAId, playerBId, playerBHandicap } = req.body;
    if (!playerAId || !playerBId) {
      return res.status(400).json({ error: 'playerAId and playerBId are required' });
    }
    const handicap = playerBHandicap !== undefined && playerBHandicap !== null && playerBHandicap !== '' ? Number(playerBHandicap) : undefined;
    const result = await swapPlayersInGame(gameId, Number(playerAId), Number(playerBId), handicap);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error swapping players:', error.message);
    res.status(500).json({ error: 'Failed to swap players' });
  }
});

// Get which 2-person Teams N team game(s), if any, this week's What If can run against
app.get('/api/games/:id/whatif-team-games', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const options = await getWhatIfTeamGameOptions(gameId);
    res.json(options);
  } catch (error: any) {
    console.error('Error fetching what-if team game options:', error.message);
    res.status(500).json({ error: 'Failed to fetch what-if team game options' });
  }
});

// Get "What If" team results for a game/player endpoint
app.get('/api/games/:id/whatif', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const playerId = parseInt(req.query.playerId as string);
    const teamGameId = req.query.teamGameId ? parseInt(req.query.teamGameId as string) : undefined;
    if (!playerId) {
      return res.status(400).json({ error: 'playerId query param is required' });
    }
    const rows = await getWhatIfResults(gameId, playerId, teamGameId);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching what-if results:', error.message);
    res.status(500).json({ error: 'Failed to fetch what-if results' });
  }
});

// Get Week Results (individual gross/net totals) for a game endpoint
app.get('/api/games/:id/results', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const scoreType = req.query.scoreType as 'G' | 'N';
    if (!scoreType || !['G', 'N'].includes(scoreType)) {
      return res.status(400).json({ error: 'scoreType query param required (G or N)' });
    }
    const rows = await getWeekResults(gameId, scoreType);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching week results:', error.message);
    res.status(500).json({ error: 'Failed to fetch week results' });
  }
});

// Check whether teams already exist for a game endpoint
app.get('/api/games/:id/teams/status', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const exists = await hasTeams(gameId);
    res.json({ hasTeams: exists });
  } catch (error: any) {
    console.error('Error checking team status:', error.message);
    res.status(500).json({ error: 'Failed to check team status' });
  }
});

// Get team results (front/back/total + roster) for a game endpoint
app.get('/api/games/:id/teams', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const rows = await getTeamResults(gameId);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching team results:', error.message);
    res.status(500).json({ error: 'Failed to fetch team results' });
  }
});

// Get the Net Score to Make Cut summary for a game's team results endpoint
app.get('/api/games/:id/cut-summary', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const summary = await getCutSummary(gameId);
    res.json(summary);
  } catch (error: any) {
    console.error('Error fetching cut summary:', error.message);
    res.status(500).json({ error: 'Failed to fetch cut summary' });
  }
});

// Get current team assignments (by player ID, for editing) for a game endpoint
app.get('/api/games/:id/team-assignments', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const teams = await getTeamAssignments(gameId);
    res.json(teams);
  } catch (error: any) {
    console.error('Error fetching team assignments:', error.message);
    res.status(500).json({ error: 'Failed to fetch team assignments' });
  }
});

// Save (replace) all teams for a game endpoint
app.post('/api/games/:id/teams', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const { teams } = req.body;
    if (!Array.isArray(teams)) {
      return res.status(400).json({ error: 'teams array is required' });
    }
    await saveTeams(gameId, teams);
    res.json({ message: 'Teams saved successfully' });
  } catch (error: any) {
    console.error('Error saving teams:', error.message);
    res.status(500).json({ error: 'Failed to save teams' });
  }
});

// Get a team's hole-by-hole net scorecard for a side (F/B/T) endpoint
app.get('/api/games/:id/teams/:teamId/scorecard', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const teamId = parseInt(req.params.teamId);
    const side = req.query.side as 'F' | 'B' | 'T';
    if (!side || !['F', 'B', 'T'].includes(side)) {
      return res.status(400).json({ error: 'side query param required (F, B, or T)' });
    }
    const rows = await getTeamScorecard(gameId, teamId, side);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching team scorecard:', error.message);
    res.status(500).json({ error: 'Failed to fetch team scorecard' });
  }
});

// ── Team Games (multiple concurrent team competitions per round) ──

// List every team game set up for a round endpoint
app.get('/api/games/:id/team-games', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const teamGames = await listTeamGames(gameId);
    res.json(teamGames);
  } catch (error: any) {
    console.error('Error fetching team games:', error.message);
    res.status(500).json({ error: 'Failed to fetch team games' });
  }
});

// Create a new team game for a round endpoint -- format defaults to 'custom' when omitted (see
// createTeamGame); teamSize/keepCount aren't required for the two predefined formats (36/48,
// Irish Rumble), which ignore them entirely.
app.post('/api/games/:id/team-games', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const { label, teamSize, keepCount, assignMode, lastHoleAll, slot, format, payout } = req.body;
    if (!label || !assignMode) {
      return res.status(400).json({ error: 'label and assignMode are required' });
    }
    const teamGameId = await createTeamGame(gameId, label, teamSize, keepCount, assignMode, !!lastHoleAll, slot, format, payout);
    res.json({ teamGameId });
  } catch (error: any) {
    console.error('Error creating team game:', error.message);
    res.status(400).json({ error: error.message || 'Failed to create team game' });
  }
});

// Skip a pending Options "Teams N" slot for just this week endpoint
app.post('/api/games/:id/team-games/skip', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const { label, slot } = req.body;
    if (!label || !slot) {
      return res.status(400).json({ error: 'label and slot are required' });
    }
    const teamGameId = await skipTeamGameSlot(gameId, label, slot);
    res.json({ teamGameId });
  } catch (error: any) {
    console.error('Error skipping team game slot:', error.message);
    res.status(400).json({ error: error.message || 'Failed to skip team game slot' });
  }
});

// Delete a team game endpoint
app.delete('/api/team-games/:teamGameId', async (req, res) => {
  try {
    const teamGameId = parseInt(req.params.teamGameId);
    await deleteTeamGame(teamGameId);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting team game:', error.message);
    res.status(400).json({ error: error.message || 'Failed to delete team game' });
  }
});

// Get a team game's config and eligibility status endpoint
app.get('/api/team-games/:teamGameId/status', async (req, res) => {
  try {
    const teamGameId = parseInt(req.params.teamGameId);
    const status = await getTeamGameStatus(teamGameId);
    if (!status) {
      return res.status(404).json({ error: 'Team game not found' });
    }
    res.json(status);
  } catch (error: any) {
    console.error('Error fetching team game status:', error.message);
    res.status(500).json({ error: 'Failed to fetch team game status' });
  }
});

// Get current team assignments (by player ID, for editing) for a team game endpoint
app.get('/api/team-games/:teamGameId/assignments', async (req, res) => {
  try {
    const teamGameId = parseInt(req.params.teamGameId);
    const teams = await getTeamGameAssignments(teamGameId);
    res.json(teams);
  } catch (error: any) {
    console.error('Error fetching team game assignments:', error.message);
    res.status(500).json({ error: 'Failed to fetch team game assignments' });
  }
});

// Save (replace) all teams for a manual-assignment team game endpoint
app.post('/api/team-games/:teamGameId/teams', async (req, res) => {
  try {
    const teamGameId = parseInt(req.params.teamGameId);
    const { teams } = req.body;
    if (!Array.isArray(teams)) {
      return res.status(400).json({ error: 'teams array is required' });
    }
    const status = await getTeamGameStatus(teamGameId);
    if (!status) {
      return res.status(404).json({ error: 'Team game not found' });
    }
    if (status.assignMode !== 'M') {
      return res.status(400).json({ error: 'This team game is not set to manual assignment' });
    }
    await saveManualTeamGameTeams(teamGameId, teams);
    res.json({ message: 'Teams saved successfully' });
  } catch (error: any) {
    console.error('Error saving team game teams:', error.message);
    res.status(500).json({ error: 'Failed to save team game teams' });
  }
});

// Get the current team roster (with handicaps) for a team game endpoint
app.get('/api/team-games/:teamGameId/roster', async (req, res) => {
  try {
    const teamGameId = parseInt(req.params.teamGameId);
    const roster = await getTeamGameRoster(teamGameId);
    res.json(roster);
  } catch (error: any) {
    console.error('Error fetching team game roster:', error.message);
    res.status(500).json({ error: 'Failed to fetch team game roster' });
  }
});

// Generate random teams for a random-assignment team game endpoint
app.post('/api/team-games/:teamGameId/random', async (req, res) => {
  try {
    const teamGameId = parseInt(req.params.teamGameId);
    const result = await createRandomTeamGameTeams(teamGameId);
    res.json(result);
  } catch (error: any) {
    console.error('Error creating random team game teams:', error.message);
    res.status(400).json({ error: error.message || 'Failed to create random team game teams' });
  }
});

// Get team results (front/back/total + roster) for a team game endpoint
app.get('/api/team-games/:teamGameId/results', async (req, res) => {
  try {
    const teamGameId = parseInt(req.params.teamGameId);
    const rows = await getTeamGameResults(teamGameId);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching team game results:', error.message);
    res.status(500).json({ error: 'Failed to fetch team game results' });
  }
});

// Get the Net Score to Make Cut summary (this slot's own cut line + missed-cut list) for a team game endpoint
app.get('/api/team-games/:teamGameId/cut-summary', async (req, res) => {
  try {
    const teamGameId = parseInt(req.params.teamGameId);
    const summary = await getTeamGameCutSummary(teamGameId);
    res.json(summary);
  } catch (error: any) {
    console.error('Error fetching team game cut summary:', error.message);
    res.status(500).json({ error: 'Failed to fetch team game cut summary' });
  }
});

// Get a team's hole-by-hole net scorecard for a side (F/B/T) within a team game endpoint
app.get('/api/team-games/:teamGameId/scorecard/:teamNumber', async (req, res) => {
  try {
    const teamGameId = parseInt(req.params.teamGameId);
    const teamNumber = parseInt(req.params.teamNumber);
    const side = req.query.side as 'F' | 'B' | 'T';
    if (!side || !['F', 'B', 'T'].includes(side)) {
      return res.status(400).json({ error: 'side query param required (F, B, or T)' });
    }
    const rows = await getTeamGameScorecard(teamGameId, teamNumber, side);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching team game scorecard:', error.message);
    res.status(500).json({ error: 'Failed to fetch team game scorecard' });
  }
});

// Live standings for a 36/48 team game (thru, score vs. par so far, kept-scores-used) --
// empty for a 'custom'-format team game, this view doesn't apply there.
app.get('/api/team-games/:teamGameId/live-leaderboard', async (req, res) => {
  try {
    const teamGameId = parseInt(req.params.teamGameId);
    const rows = await getTeamGameLiveLeaderboard(teamGameId);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching team game live leaderboard:', error.message);
    res.status(500).json({ error: 'Failed to fetch team game live leaderboard' });
  }
});

// Live standings for a fixed-keep-count team game -- 'custom' (plain 2-person Teams N) or
// 'irish' (thru, score vs. par so far); empty for the '36/48' live-picker format.
app.get('/api/team-games/:teamGameId/irish-leaderboard', async (req, res) => {
  try {
    const teamGameId = parseInt(req.params.teamGameId);
    const rows = await getFixedKeepLiveLeaderboard(teamGameId);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching fixed-keep live leaderboard:', error.message);
    res.status(500).json({ error: 'Failed to fetch fixed-keep live leaderboard' });
  }
});

// Weeks that had at least one 36/48 team game with a rostered, scored player -- for the Best
// Possible screen's week picker.
app.get('/api/events/:eventId/best-possible-weeks', async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId);
    const weeks = await getBestPossibleWeeks(eventId);
    res.json(weeks);
  } catch (error: any) {
    console.error('Error fetching best-possible weeks:', error.message);
    res.status(500).json({ error: 'Failed to fetch best-possible weeks' });
  }
});

// Actual vs. best-possible (perfect hindsight) score for every team in a 36/48 team game --
// empty for a 'custom'-format team game, meant to only ever be checked post-round.
app.get('/api/team-games/:teamGameId/best-possible', async (req, res) => {
  try {
    const teamGameId = parseInt(req.params.teamGameId);
    const results = await getTeamBestPossible(teamGameId);
    res.json(results);
  } catch (error: any) {
    console.error('Error fetching team best-possible:', error.message);
    res.status(500).json({ error: 'Failed to fetch team best-possible' });
  }
});

// Start Game hook: register a checked-in foursome as a team in any 'group'-mode team game
// for this round — a no-op unless the event has explicitly created one.
app.post('/api/games/:id/group-team', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const { playerIds } = req.body;
    if (!Array.isArray(playerIds)) {
      return res.status(400).json({ error: 'playerIds array is required' });
    }
    const result = await addOrUpdateGroupTeam(gameId, playerIds);
    res.json(result);
  } catch (error: any) {
    console.error('Error updating group team:', error.message);
    res.status(500).json({ error: 'Failed to update group team' });
  }
});

// Which 36/48-format team game(s) (if any) this exact foursome is registered as one team in for
// this round — app/game.tsx calls this once to know whether it needs to show the live per-hole
// "keep how many" prompt at all.
app.get('/api/games/:id/keep-teams', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const playerIds = String(req.query.playerIds ?? '')
      .split(',')
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n));
    const teams = await getKeepFormatTeamsForPlayers(gameId, playerIds);
    res.json(teams);
  } catch (error: any) {
    console.error('Error fetching keep-format teams:', error.message);
    res.status(500).json({ error: 'Failed to fetch keep-format teams' });
  }
});

// Which Irish Rumble team game(s) (if any) this exact foursome is registered as one team in for
// this round — app/game.tsx calls this once to know whether it needs to show the live per-hole
// score card at all.
app.get('/api/games/:id/irish-teams', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const playerIds = String(req.query.playerIds ?? '')
      .split(',')
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n));
    const teams = await getIrishRumbleTeamsForPlayers(gameId, playerIds);
    res.json(teams);
  } catch (error: any) {
    console.error('Error fetching Irish Rumble teams:', error.message);
    res.status(500).json({ error: 'Failed to fetch Irish Rumble teams' });
  }
});

// A 36/48 team's already-recorded live keep choices, keyed by hole -- what the live prompt
// resumes from.
app.get('/api/team-games/:teamGameId/hole-keep', async (req, res) => {
  try {
    const teamGameId = parseInt(req.params.teamGameId);
    const teamNumber = parseInt(req.query.teamNumber as string);
    if (!Number.isFinite(teamNumber)) {
      return res.status(400).json({ error: 'teamNumber query param is required' });
    }
    const counts = await getTeamGameHoleKeepCounts(teamGameId, teamNumber);
    res.json(counts);
  } catch (error: any) {
    console.error('Error fetching team game hole keep counts:', error.message);
    res.status(500).json({ error: 'Failed to fetch hole keep counts' });
  }
});

// Save one hole's live keep-count choice for a 36/48 team -- hard-validated server-side against
// the same reachability math the live picker itself uses, so an invalid choice can't be recorded.
app.post('/api/team-games/:teamGameId/hole-keep', async (req, res) => {
  try {
    const teamGameId = parseInt(req.params.teamGameId);
    const { teamNumber, holeId, keepCount, holesRemaining } = req.body;
    if ([teamNumber, holeId, keepCount, holesRemaining].some((v) => typeof v !== 'number')) {
      return res.status(400).json({ error: 'teamNumber, holeId, keepCount, and holesRemaining (numbers) are required' });
    }
    const result = await saveTeamGameHoleKeepCount(teamGameId, teamNumber, holeId, keepCount, holesRemaining);
    if (!result.ok) {
      return res.status(400).json({ error: result.error || 'Failed to save keep count' });
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error saving team game hole keep count:', error.message);
    res.status(500).json({ error: 'Failed to save keep count' });
  }
});

// Start Game hook: always record "who played together" for crash/exit recovery — independent
// of any team-game scoring, runs for every event.
app.post('/api/games/:id/playing-group', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const { playerIds } = req.body;
    if (!Array.isArray(playerIds)) {
      return res.status(400).json({ error: 'playerIds array is required' });
    }
    await upsertPlayingGroup(gameId, playerIds);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating playing group:', error.message);
    res.status(500).json({ error: 'Failed to update playing group' });
  }
});

// Get the other players recorded as part of a player's current group for this round endpoint
app.get('/api/games/:id/playing-group/:playerId', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const playerId = parseInt(req.params.playerId);
    const teammateIds = await getPlayingGroup(gameId, playerId);
    res.json({ playerIds: teammateIds });
  } catch (error: any) {
    console.error('Error fetching playing group:', error.message);
    res.status(500).json({ error: 'Failed to fetch playing group' });
  }
});

// Get the hole numbers that have recorded scores for a game endpoint
app.get('/api/games/:id/scored-holes', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const holes = await getScoredHoles(gameId);
    res.json(holes);
  } catch (error: any) {
    console.error('Error fetching scored holes:', error.message);
    res.status(500).json({ error: 'Failed to fetch scored holes' });
  }
});

// Get net skins winner (and validate) for a hole, or the skins totals summary, endpoint
app.get('/api/games/:id/skins', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const hole = req.query.hole as string;
    if (!hole) {
      return res.status(400).json({ error: 'hole query param is required (1-18 or "T")' });
    }
    if (hole === 'T') {
      const totals = await getSkinsTotals(gameId);
      return res.json(totals);
    }
    const holeId = parseInt(hole);
    const result = await getSkinsForHole(gameId, holeId);
    res.json(result);
  } catch (error: any) {
    console.error('Error fetching skins:', error.message);
    res.status(500).json({ error: 'Failed to fetch skins' });
  }
});

// Get every skin won so far in this game, one row per hole, for the live in-game Skins Summary
app.get('/api/games/:id/skins-summary', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const rows = await getGameSkinsSummary(gameId);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching game skins summary:', error.message);
    res.status(500).json({ error: 'Failed to fetch game skins summary' });
  }
});

// Recompute every scored hole's skins in one pass endpoint (used by the Summary view)
app.post('/api/games/:id/skins/recalculate', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    await recalculateAllSkins(gameId);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error recalculating skins:', error.message);
    res.status(500).json({ error: 'Failed to recalculate skins' });
  }
});

// Whether Gross Skins should even show for this week (>=1 player marked paid for it)
app.get('/api/games/:id/gross-skins-visible', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const visible = await hasAnyGrossSkinsPaidForGame(gameId);
    res.json({ visible });
  } catch (error: any) {
    console.error('Error checking gross skins visibility:', error.message);
    res.status(500).json({ error: 'Failed to check gross skins visibility' });
  }
});

// Get gross skins winner (and validate) for a hole, or the gross skins totals summary, endpoint
app.get('/api/games/:id/gross-skins', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const hole = req.query.hole as string;
    if (!hole) {
      return res.status(400).json({ error: 'hole query param is required (1-18 or "T")' });
    }
    if (hole === 'T') {
      const totals = await getGrossSkinsTotals(gameId);
      return res.json(totals);
    }
    const holeId = parseInt(hole);
    const result = await getGrossSkinsForHole(gameId, holeId);
    res.json(result);
  } catch (error: any) {
    console.error('Error fetching gross skins:', error.message);
    res.status(500).json({ error: 'Failed to fetch gross skins' });
  }
});

// Recompute every scored hole's gross skins in one pass endpoint (used by the Summary view)
app.post('/api/games/:id/gross-skins/recalculate', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const holes = await getScoredHoles(gameId);
    await recalculateAllGrossSkins(gameId, holes);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error recalculating gross skins:', error.message);
    res.status(500).json({ error: 'Failed to recalculate gross skins' });
  }
});

// Get active (not opted-out) players for a game endpoint
app.get('/api/games/:id/active-players', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const players = await getActivePlayersForGame(gameId);
    res.json(players);
  } catch (error: any) {
    console.error('Error fetching active players:', error.message);
    res.status(500).json({ error: 'Failed to fetch active players' });
  }
});

// Remove one or more players from a game entirely endpoint (Admin -> Remove Player)
app.post('/api/games/:id/optout', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const { playerIds } = req.body;
    if (!Array.isArray(playerIds) || playerIds.length === 0) {
      return res.status(400).json({ error: 'playerIds array is required' });
    }
    await removePlayers(gameId, playerIds);
    res.json({ message: 'Player(s) removed successfully' });
  } catch (error: any) {
    console.error('Error removing players:', error.message);
    res.status(500).json({ error: 'Failed to remove players' });
  }
});

// Get the latest game (and random-teams status) for an event endpoint
app.get('/api/events/:id/random-teams-status', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const info = await getLatestGameForRandomTeams(eventId);
    if (!info) {
      return res.status(404).json({ error: 'No games found for this event' });
    }
    res.json(info);
  } catch (error: any) {
    console.error('Error fetching random teams status:', error.message);
    res.status(500).json({ error: 'Failed to fetch random teams status' });
  }
});

// Get every drawn team for a game, read-only, checking the multi-team-games system first and
// falling back to the legacy single-team-game table (Admin -> Show Teams)
app.get('/api/games/:id/show-teams', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const teams = await getShowTeamsListing(gameId);
    res.json(teams);
  } catch (error: any) {
    console.error('Error fetching show-teams listing:', error.message);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// Get the current team roster for a game endpoint
app.get('/api/games/:id/random-teams', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const teams = await getRandomTeamsListing(gameId);
    res.json(teams);
  } catch (error: any) {
    console.error('Error fetching random teams:', error.message);
    res.status(500).json({ error: 'Failed to fetch random teams' });
  }
});

// Generate random teams for a game endpoint
app.post('/api/games/:id/random-teams', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const result = await createRandomTeams(gameId);
    res.json(result);
  } catch (error: any) {
    console.error('Error creating random teams:', error.message);
    res.status(500).json({ error: 'Failed to create random teams' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'running',
    environment: process.env.NODE_ENV || 'development',
    isBeta: process.env.BETA === 'true',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Log a bug or idea endpoint (Menu -> Feedback) — app-wide, not scoped to any one event
app.post('/api/feedback', async (req, res) => {
  try {
    const { type, title, description, submittedBy } = req.body;
    if (type !== 'Bug' && type !== 'Idea') {
      return res.status(400).json({ error: 'type must be "Bug" or "Idea"' });
    }
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'title is required' });
    }
    await submitFeedback(type, String(title).trim(), description || '', submittedBy || '');
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error submitting feedback:', error.message);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// Get the full bug/idea log endpoint (Menu -> Feedback)
app.get('/api/feedback', async (req, res) => {
  try {
    const entries = await getFeedback();
    res.json(entries);
  } catch (error: any) {
    console.error('Error fetching feedback:', error.message);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

// Database connectivity test endpoint
app.get('/api/db-test', async (req, res) => {
  try {
    const [rows] = await pool.query<any[]>('SELECT VERSION() AS version');
    res.json({ status: 'connected', database: rows[0], timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('Database connection failed:', error.message);
    res.status(503).json({ 
      status: 'disconnected', 
      error: error.message,
      host: process.env.DB_HOST || (process.env.NODE_ENV === 'production' ? '68.178.198.174' : 'localhost'),
      timestamp: new Date().toISOString() 
    });
  }
});

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, '0.0.0.0', () => {
  const env = process.env.NODE_ENV || 'development';
  const beta = process.env.BETA === 'true' ? ' - BETA' : '';
  console.log(`API server running on http://0.0.0.0:${PORT} [${env}${beta}]`);
});
