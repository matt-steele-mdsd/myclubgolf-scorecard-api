"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTeamGameWeeks = getTeamGameWeeks;
exports.listTeamGames = listTeamGames;
exports.createTeamGame = createTeamGame;
exports.skipTeamGameSlot = skipTeamGameSlot;
exports.deleteTeamGame = deleteTeamGame;
exports.getTeamGameStatus = getTeamGameStatus;
exports.getTeamGameAssignments = getTeamGameAssignments;
exports.saveManualTeamGameTeams = saveManualTeamGameTeams;
exports.getTeamGameRoster = getTeamGameRoster;
exports.getShowTeamsListing = getShowTeamsListing;
exports.createRandomTeamGameTeams = createRandomTeamGameTeams;
exports.addOrUpdateGroupTeam = addOrUpdateGroupTeam;
exports.getTeamGameResults = getTeamGameResults;
exports.getTeamGameCutSummary = getTeamGameCutSummary;
exports.getTeamGameScorecard = getTeamGameScorecard;
const config_1 = __importDefault(require("../db/config"));
const randomTeamsService_1 = require("./randomTeamsService");
const optionsService_1 = require("./optionsService");
/** Which Options "Teams N" card (1-4) a given slot number maps to. */
function slotPrefix(slot) {
    const capped = Math.min(4, Math.max(1, slot));
    return capped === 1 ? 'teams' : `teams${capped}`;
}
/**
 * Every date Team Games can be viewed/managed for: every real Game this event already has (past
 * and today, regardless of whether scores exist yet), plus every future Setup Calendar date that
 * doesn't have a Game yet — confirmed with the user (2026-07-09): it's Wednesday, and they want
 * to look ahead to Friday's (not-yet-played) team games, using whatever's already scheduled in
 * Setup Calendar. Each real Game's own course is shown as-is (an event can change courses week to
 * week); a not-yet-created future date shows the most recently played game's course as its
 * default, editable before anything is saved (confirmed 2026-07-09: "so you could change the
 * course if you are shifting this week to a different course").
 */
async function getTeamGameWeeks(eventId) {
    const [gameRows] = await config_1.default.query(`SELECT DISTINCT g.GameID, g.GameDate, g.CourseID, c.CourseName
     FROM Game g INNER JOIN Course c ON c.CourseID = g.CourseID
     WHERE g.GroupID = ?`, [eventId]);
    const [calRows] = await config_1.default.query(`SELECT EventDate FROM EventCalendar WHERE EventID = ? AND DayType = 'event'`, [eventId]);
    const [defaultCourseRows] = await config_1.default.query(`SELECT g.CourseID, c.CourseName FROM Game g INNER JOIN Course c ON c.CourseID = g.CourseID
     WHERE g.GroupID = ? ORDER BY g.GameDate DESC LIMIT 1`, [eventId]);
    const defaultCourseId = defaultCourseRows[0]?.CourseID ?? 0;
    const defaultCourseName = defaultCourseRows[0]?.CourseName ?? '';
    const byDate = new Map();
    for (const g of gameRows) {
        const d = g.GameDate.toISOString().slice(0, 10);
        byDate.set(d, { date: d, gameId: g.GameID, courseId: g.CourseID, courseName: g.CourseName });
    }
    for (const c of calRows) {
        const d = c.EventDate.toISOString().slice(0, 10);
        if (!byDate.has(d)) {
            byDate.set(d, { date: d, gameId: null, courseId: defaultCourseId, courseName: defaultCourseName });
        }
    }
    return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
}
/**
 * List every team game (competition) set up for a day's shared Game — an event can now run
 * several concurrent team competitions off the same round (e.g. a 2-person random game and a
 * separate 4-person game). Entirely separate from the legacy `Team` table: an event that hasn't
 * created any of these has zero rows here and keeps using Random Teams / Pick Teams unchanged.
 */
async function listTeamGames(gameId) {
    const [rows] = await config_1.default.query(`SELECT tg.*, (SELECT COUNT(*) FROM TeamGamePlayer tgp WHERE tgp.TeamGameID = tg.TeamGameID) AS PlayerCount
     FROM TeamGame tg WHERE tg.GameID = ?
     ORDER BY (tg.Slot IS NULL), tg.Slot, tg.TeamGameID`, [gameId]);
    return rows.map((r) => ({
        teamGameId: r.TeamGameID,
        gameId: r.GameID,
        label: r.Label,
        teamSize: r.TeamSize,
        keepCount: r.KeepCount,
        assignMode: r.AssignMode,
        randomSet: r.RandomSet === 'T',
        lastHoleAll: r.LastHoleAll === 'T',
        skipped: r.Skipped === 'T',
        hasPlayers: Number(r.PlayerCount) > 0,
        slot: r.Slot === null || r.Slot === undefined ? null : Number(r.Slot),
    }));
}
/**
 * Create a new team game for a round. Random assignment is only ever valid for 2-person teams —
 * 3/4-person teams must be built manually (Pick Teams) or from the day's playing groups.
 *
 * `lastHoleAll` (the Tommy Davis rule) is stored directly on this row rather than read from
 * Options at score time — confirmed with the user (2026-07-08) it needs to be settable
 * independently for a "one-off" team game that isn't tied to any Options "Teams N" card at all.
 * The Options screen's `teamsN_lastholeall` is still used as a starting default when a team game
 * is created via the "Set Up Teams N" flow (see app/teamgames.tsx), but once created, this
 * column is authoritative and doesn't change if the Options value changes later.
 *
 * `slot` (1-4) records which Options "Teams N" card this row belongs to, explicitly — pass
 * `undefined`/omit for a one-off team game not tied to any card. Each configured slot is
 * independently settable up or skipped in any order (confirmed 2026-07-08: there's no
 * requirement to set up Teams 1 before Teams 2), so this can't be inferred from creation order.
 */
async function createTeamGame(gameId, label, teamSize, keepCount, assignMode, lastHoleAll, slot) {
    if (![2, 3, 4].includes(teamSize))
        throw new Error('teamSize must be 2, 3, or 4');
    if (keepCount < 1 || keepCount > teamSize)
        throw new Error('keepCount must be between 1 and teamSize');
    if (assignMode === 'R' && teamSize !== 2)
        throw new Error('Random assignment is only available for 2-person teams');
    const [result] = await config_1.default.query(`INSERT INTO TeamGame (GameID, Label, TeamSize, KeepCount, AssignMode, LastHoleAll, Slot, LastUpdateUser)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'App')`, [gameId, label, teamSize, keepCount, assignMode, lastHoleAll ? 'T' : 'F', slot ?? null]);
    return result.insertId;
}
/**
 * Skip a pending Options "Teams N" slot for just this week, without touching Options at all —
 * confirmed with the user (2026-07-08): the recurring Options definition must stay configured
 * ("ready to use again next time"), this only needs to make this week's "Set Up Teams N" prompt
 * go away for THIS slot. Inserts a minimal placeholder row (no real team size/keep count/assign
 * mode meaning anything — it's never scored) tagged with this exact slot. Deleting this row (the
 * same `deleteTeamGame` as any other) undoes the skip.
 */
async function skipTeamGameSlot(gameId, label, slot) {
    const [result] = await config_1.default.query(`INSERT INTO TeamGame (GameID, Label, TeamSize, KeepCount, AssignMode, Skipped, Slot, LastUpdateUser)
     VALUES (?, ?, 2, 1, 'M', 'T', ?, 'App')`, [gameId, label, slot]);
    return result.insertId;
}
/**
 * Undo an accidentally-created team game — but ONLY before it's actually been drawn/assigned.
 * Confirmed with the user (2026-07-08): once real teams exist (players assigned, whether via
 * Randomize, Manual, or Playing Groups), deletion must be refused outright — otherwise anyone on
 * a losing team could delete the game to make a bad result disappear. Enforced here server-side,
 * not just hidden in the UI, since that's the only way this actually can't be bypassed. A
 * "skipped" placeholder (see skipTeamGameSlot) always has zero players, so undoing a skip is
 * unaffected by this guard.
 */
async function deleteTeamGame(teamGameId) {
    const [rows] = await config_1.default.query('SELECT COUNT(*) AS cnt FROM TeamGamePlayer WHERE TeamGameID = ?', [teamGameId]);
    if (Number(rows[0].cnt) > 0) {
        throw new Error('This team game has already been drawn and can no longer be deleted.');
    }
    await config_1.default.query('DELETE FROM TeamGamePlayer WHERE TeamGameID = ?', [teamGameId]);
    await config_1.default.query('DELETE FROM TeamGame WHERE TeamGameID = ?', [teamGameId]);
}
/** A team game's config plus whether everyone's finished playing yet — mirrors getLatestGameForRandomTeams. */
async function getTeamGameStatus(teamGameId) {
    const [rows] = await config_1.default.query('SELECT * FROM TeamGame WHERE TeamGameID = ?', [teamGameId]);
    if (rows.length === 0)
        return null;
    const tg = rows[0];
    const { stillPlaying } = await (0, randomTeamsService_1.getGameEligibility)(tg.GameID);
    return {
        teamGameId: tg.TeamGameID,
        gameId: tg.GameID,
        label: tg.Label,
        teamSize: tg.TeamSize,
        keepCount: tg.KeepCount,
        assignMode: tg.AssignMode,
        alreadySet: tg.RandomSet === 'T',
        stillPlaying: stillPlaying.map((p) => p.name),
    };
}
/**
 * Get the current team assignments for a team game as an array of player-ID arrays, ordered by
 * TeamNumber — mirrors teamService.ts's getTeamAssignments, used to prefill the Pick Teams
 * builder when editing an existing manual team game.
 */
async function getTeamGameAssignments(teamGameId) {
    const [rows] = await config_1.default.query('SELECT TeamNumber, PlayerID FROM TeamGamePlayer WHERE TeamGameID = ? ORDER BY TeamNumber, PlayerID', [teamGameId]);
    const byTeam = new Map();
    for (const r of rows) {
        if (!byTeam.has(r.TeamNumber))
            byTeam.set(r.TeamNumber, []);
        byTeam.get(r.TeamNumber).push(r.PlayerID);
    }
    return Array.from(byTeam.keys())
        .sort((a, b) => a - b)
        .map((teamNumber) => byTeam.get(teamNumber));
}
/**
 * Replace all teams for a manual-assignment team game — mirrors teamService.ts's saveTeams.
 * `teams` is an array of player-ID arrays; each array's position (1-based) becomes the TeamNumber.
 */
async function saveManualTeamGameTeams(teamGameId, teams) {
    await config_1.default.query('DELETE FROM TeamGamePlayer WHERE TeamGameID = ?', [teamGameId]);
    const rows = [];
    teams.forEach((playerIds, index) => {
        const teamNumber = index + 1;
        for (const playerId of playerIds) {
            rows.push([teamGameId, teamNumber, playerId]);
        }
    });
    if (rows.length === 0)
        return;
    const rowPlaceholders = rows.map(() => `(?, ?, ?, 'App')`).join(', ');
    const params = rows.flat();
    await config_1.default.query(`INSERT INTO TeamGamePlayer (TeamGameID, TeamNumber, PlayerID, LastUpdateUser) VALUES ${rowPlaceholders}`, params);
}
/**
 * Get the current team roster (with per-game handicap) for a team game, grouped by team —
 * mirrors randomTeamsService.ts's getRandomTeamsListing, scoped to TeamGamePlayer/TeamGameID
 * instead of Team/GameID.
 */
async function getTeamGameRoster(teamGameId) {
    const [teamRows] = await config_1.default.query(`SELECT tgp.TeamNumber, tgp.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name, g.GameID, g.GameDate
     FROM TeamGamePlayer tgp
     INNER JOIN Player p ON p.PlayerID = tgp.PlayerID
     INNER JOIN TeamGame tg ON tg.TeamGameID = tgp.TeamGameID
     INNER JOIN Game g ON g.GameID = tg.GameID
     WHERE tgp.TeamGameID = ?
     ORDER BY tgp.TeamNumber, p.LastName, p.FirstName`, [teamGameId]);
    if (teamRows.length === 0)
        return [];
    const gameId = teamRows[0].GameID;
    const playerIds = [...new Set(teamRows.map((r) => r.PlayerID))];
    const [hdcpRows] = await config_1.default.query(`SELECT PlayerID, GameID, Hdcp, LastUpdateDt FROM Hdcp WHERE PlayerID IN (?) ORDER BY LastUpdateDt ASC`, [playerIds]);
    const historyByPlayer = new Map();
    for (const h of hdcpRows) {
        if (!historyByPlayer.has(h.PlayerID))
            historyByPlayer.set(h.PlayerID, []);
        historyByPlayer.get(h.PlayerID).push({ gameId: h.GameID, hdcp: h.Hdcp, date: h.LastUpdateDt });
    }
    function resolveHdcp(playerId, gameDate) {
        const history = historyByPlayer.get(playerId);
        if (!history || history.length === 0)
            return null;
        const exact = history.find((h) => h.gameId === gameId);
        if (exact)
            return exact.hdcp;
        const priorOrSame = history.filter((h) => h.date <= gameDate);
        if (priorOrSame.length > 0)
            return priorOrSame[priorOrSame.length - 1].hdcp;
        return history[0].hdcp;
    }
    const byTeam = new Map();
    for (const r of teamRows) {
        if (!byTeam.has(r.TeamNumber))
            byTeam.set(r.TeamNumber, { teamId: r.TeamNumber, players: [] });
        byTeam.get(r.TeamNumber).players.push({ name: r.name, hdcp: resolveHdcp(r.PlayerID, r.GameDate) });
    }
    for (const team of byTeam.values()) {
        team.players.sort((a, b) => (a.hdcp ?? Infinity) - (b.hdcp ?? Infinity) || a.name.localeCompare(b.name));
    }
    return Array.from(byTeam.values()).sort((a, b) => a.teamId - b.teamId);
}
/**
 * Every drawn team for a game, read-only — checks the current multi-team-games system
 * (TeamGame/TeamGamePlayer) first, since that's what Team Games actually writes to now, and
 * only falls back to the legacy single-team-game `Team` table for older events that never set
 * up a "Teams N" card at all. `groupLabel` is only set when more than one team game has players,
 * so a single-team-game event's display is unchanged. Fixes app/showteams.tsx showing "No teams
 * yet" for games whose teams were actually drawn through Team Games (confirmed real
 * 2026-07-12 — it was only ever reading the legacy table, which multi-team-games left empty).
 */
async function getShowTeamsListing(gameId) {
    const teamGames = (await listTeamGames(gameId)).filter((tg) => tg.hasPlayers);
    if (teamGames.length > 0) {
        const multiple = teamGames.length > 1;
        const results = [];
        for (const tg of teamGames) {
            const roster = await getTeamGameRoster(tg.teamGameId);
            for (const team of roster) {
                results.push({ ...team, groupLabel: multiple ? tg.label : null });
            }
        }
        return results;
    }
    const legacy = await (0, randomTeamsService_1.getRandomTeamsListing)(gameId);
    return legacy.map((team) => ({ ...team, groupLabel: null }));
}
/**
 * Randomly pair up eligible players into 2-person teams for a random-assignment team game —
 * mirrors randomTeamsService.ts's createRandomTeams (same eligibility rules, same odd-player-out
 * tie-break), writing to TeamGamePlayer/TeamGame instead of Team/Game.
 */
async function createRandomTeamGameTeams(teamGameId) {
    const [tgRows] = await config_1.default.query('SELECT GameID, AssignMode, RandomSet, Slot FROM TeamGame WHERE TeamGameID = ?', [teamGameId]);
    if (tgRows.length === 0)
        throw new Error('Team game not found');
    const tg = tgRows[0];
    if (tg.AssignMode !== 'R')
        throw new Error('This team game is not set to random assignment');
    if (tg.RandomSet === 'T') {
        return { alreadySet: true, teams: await getTeamGameRoster(teamGameId) };
    }
    // A one-off team game (Slot null) has no Options "Teams N" card to pull a cut from — pass a
    // prefix that matches no real option key so getGameEligibility resolves cut to null, rather
    // than accidentally applying Teams 1's cut to an unrelated one-off game.
    const cutPrefix = tg.Slot ? slotPrefix(tg.Slot) : 'none';
    const eligibility = await (0, randomTeamsService_1.getGameEligibility)(tg.GameID, cutPrefix);
    if (eligibility.stillPlaying.length > 0) {
        return { alreadySet: false, teams: [], stillPlaying: eligibility.stillPlaying.map((p) => p.name) };
    }
    await config_1.default.query('DELETE FROM TeamGamePlayer WHERE TeamGameID = ?', [teamGameId]);
    const [playerRows] = await config_1.default.query(`SELECT PlayerID FROM Player WHERE PlayerID IN (?) ORDER BY RAND()`, [eligibility.eligiblePlayerIds.length > 0 ? eligibility.eligiblePlayerIds : [0]]);
    const PLAYERS_PER_TEAM = 2;
    let teamNumber = 0;
    let posInTeam = 0;
    let firstPlayerId = null;
    const teamRows = [];
    for (const row of playerRows) {
        if (posInTeam === PLAYERS_PER_TEAM)
            posInTeam = 0;
        posInTeam++;
        if (firstPlayerId === null)
            firstPlayerId = row.PlayerID;
        if (posInTeam === 1)
            teamNumber++;
        teamRows.push({ teamNumber, playerId: row.PlayerID });
    }
    // Odd player out (2/team, odd eligible count): rather than form one unfair 3-person team
    // (best-of-3 vs. everyone else's best-of-2 is a real scoring advantage/disadvantage, and for
    // a combined-score format 3 scores summed isn't comparable to 2 at all — confirmed with the
    // user, 2026-07-09), the leftover player joins the FIRST-drawn player's team as a second team
    // — every team stays exactly 2-person and directly comparable. The first-drawn player ends up
    // on two teams (their own, plus this extra one with the odd player out); that's the "prize" for
    // the luck of the draw, not an unfair scoring burden on anyone. Fixed 2026-07-09: this requires
    // TeamGamePlayer's primary key to be (TeamGameID, TeamNumber, PlayerID) — the same player
    // belonging to two different TeamNumbers in the same team game is a legitimate, supported row
    // shape (mirroring the legacy Team table's own (GameID, TeamID, PlayerID) key), not a
    // duplicate — the key was widened from (TeamGameID, PlayerID) to support this.
    if (posInTeam > 0 && posInTeam < PLAYERS_PER_TEAM && firstPlayerId !== null && playerRows.length > 1) {
        teamRows.push({ teamNumber, playerId: firstPlayerId });
    }
    if (teamRows.length > 0) {
        const rowPlaceholders = teamRows.map(() => `(?, ?, ?, 'App')`).join(', ');
        const params = teamRows.flatMap((t) => [teamGameId, t.teamNumber, t.playerId]);
        await config_1.default.query(`INSERT INTO TeamGamePlayer (TeamGameID, TeamNumber, PlayerID, LastUpdateUser) VALUES ${rowPlaceholders}`, params);
    }
    await config_1.default.query(`UPDATE TeamGame SET RandomSet = 'T' WHERE TeamGameID = ?`, [teamGameId]);
    return { alreadySet: false, teams: await getTeamGameRoster(teamGameId) };
}
/**
 * Auto-provision any Options-configured Playing Partner Teams slot that doesn't have a TeamGame
 * row yet for this week's game — confirmed with the user (2026-07-09): Playing Partner Teams has
 * nothing for an admin to manually "set up" (that's the whole point of it), so unlike Blind Draw
 * or Manual, it must never need a "Set Up Teams N" button click first. The very first foursome
 * submitted via Start Game is what switches it on for the week, not an admin action.
 */
async function autoProvisionPartnerTeamsSlots(gameId) {
    const [gameRows] = await config_1.default.query('SELECT GroupID FROM Game WHERE GameID = ?', [gameId]);
    if (gameRows.length === 0)
        return;
    const eventId = gameRows[0].GroupID;
    const options = await (0, optionsService_1.getEventOptions)(eventId);
    const totalConfiguredSlots = Math.min(4, (Number(options.teams_extra_count) || 0) + 1);
    const [existingSlotRows] = await config_1.default.query('SELECT Slot FROM TeamGame WHERE GameID = ? AND Slot IS NOT NULL', [gameId]);
    const existingSlots = new Set(existingSlotRows.map((r) => Number(r.Slot)));
    for (let slot = 1; slot <= totalConfiguredSlots; slot++) {
        if (existingSlots.has(slot))
            continue;
        const prefix = slotPrefix(slot);
        if (!options[`${prefix}_partnerteams`])
            continue;
        const teamSize = Number(options[`${prefix}_teamsize`]) || 2;
        const keepCount = Math.min(teamSize, Number(options[`${prefix}_keepcount`]) || 1);
        const lastHoleAll = !!options[`${prefix}_lastholeall`];
        await config_1.default.query(`INSERT INTO TeamGame (GameID, Label, TeamSize, KeepCount, AssignMode, LastHoleAll, Slot, LastUpdateUser)
       VALUES (?, ?, ?, ?, 'G', ?, ?, 'App')`, [gameId, `Teams ${slot}`, teamSize, keepCount, lastHoleAll ? 'T' : 'F', slot]);
    }
}
/**
 * The Start Game hook: whenever a foursome checks in together, register them as one team in
 * every 'group'-assignment team game for this round. First auto-provisions any configured
 * Playing Partner Teams slot that isn't set up yet this week (see autoProvisionPartnerTeamsSlots)
 * — beyond that, a no-op unless an organizer has explicitly created a 'G' team game for this
 * GameID (which is what keeps every event that hasn't opted into this feature completely
 * untouched). Idempotent (re-submitting the exact same set of players does nothing), and resolves
 * conflicts by moving any of the incoming players out of whatever team they were previously
 * grouped into within that same team game — "this player's current group wins."
 */
async function addOrUpdateGroupTeam(gameId, playerIds) {
    if (playerIds.length < 2)
        return { teamGameIds: [] };
    await autoProvisionPartnerTeamsSlots(gameId);
    const [groupTeamGames] = await config_1.default.query(`SELECT TeamGameID FROM TeamGame WHERE GameID = ? AND AssignMode = 'G'`, [gameId]);
    if (groupTeamGames.length === 0)
        return { teamGameIds: [] };
    const sortedIncoming = [...playerIds].sort((a, b) => a - b);
    const updatedIds = [];
    for (const tg of groupTeamGames) {
        const teamGameId = tg.TeamGameID;
        const [existingRows] = await config_1.default.query('SELECT TeamNumber, PlayerID FROM TeamGamePlayer WHERE TeamGameID = ?', [teamGameId]);
        const byTeam = new Map();
        for (const r of existingRows) {
            if (!byTeam.has(r.TeamNumber))
                byTeam.set(r.TeamNumber, []);
            byTeam.get(r.TeamNumber).push(r.PlayerID);
        }
        const alreadyMatches = Array.from(byTeam.values()).some((members) => {
            const sortedMembers = [...members].sort((a, b) => a - b);
            return sortedMembers.length === sortedIncoming.length && sortedMembers.every((id, i) => id === sortedIncoming[i]);
        });
        if (alreadyMatches)
            continue;
        const maxTeamNumber = existingRows.length > 0 ? Math.max(...existingRows.map((r) => r.TeamNumber)) : 0;
        const newTeamNumber = maxTeamNumber + 1;
        await config_1.default.query('DELETE FROM TeamGamePlayer WHERE TeamGameID = ? AND PlayerID IN (?)', [teamGameId, playerIds]);
        const rowPlaceholders = playerIds.map(() => `(?, ?, ?, 'App')`).join(', ');
        const params = playerIds.flatMap((pid) => [teamGameId, newTeamNumber, pid]);
        await config_1.default.query(`INSERT INTO TeamGamePlayer (TeamGameID, TeamNumber, PlayerID, LastUpdateUser) VALUES ${rowPlaceholders}`, params);
        updatedIds.push(teamGameId);
    }
    return { teamGameIds: updatedIds };
}
// Simple string hash -> stable, non-negative integer. Not cryptographic — just needs to spread
// evenly enough to pick fairly among a handful of players, and to be 100% reproducible from the
// same inputs every time (no stored state), so the same hole/team always picks the same "random"
// player across repeated views instead of reshuffling on every page load.
// Murmur3-style integer finalizer (full avalanche) rather than a naive string polynomial hash —
// fixed 2026-07-09 after the user noticed a short-handed team's padded-player picks weren't
// actually random-looking (e.g. the same player for 4+ holes in a row, another player never
// picked across all 18 holes). The old hashSeed(`${teamGameId}-${teamNumber}-${holeId}`) hashed
// the SEED STRING's characters — since only the trailing digit(s) differ between consecutive
// holes ("...-1", "...-2", "...-3"...), the polynomial hash barely changed hole to hole, so the
// single LCG draw feeding the shuffle was itself barely different, producing long runs instead of
// an even spread. This finalizer mixes the three integers directly with enough bit-diffusion that
// changing holeId by 1 scrambles the entire output, restoring genuine random-looking spread while
// staying fully deterministic (same inputs -> same output, still reproducible across page loads).
function hashSeed(teamGameId, teamNumber, holeId) {
    let h = ((teamGameId * 374761393) ^ (teamNumber * 668265263) ^ (holeId * 2654435761)) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
}
/** Largest actual roster size (distinct players) among all teams in this team game — the target
 * every shorter-handed team gets padded up to for Playing Partner Teams (see pickPadPlayerIds). */
async function getMaxRosterSize(teamGameId) {
    const [rows] = await config_1.default.query('SELECT TeamNumber, COUNT(*) AS cnt FROM TeamGamePlayer WHERE TeamGameID = ? GROUP BY TeamNumber', [teamGameId]);
    return rows.length > 0 ? Math.max(...rows.map((r) => Number(r.cnt))) : 0;
}
/**
 * Which of a short-handed team's present players gets their hole score counted an extra time(s),
 * to pad that team up to the game's largest roster size — confirmed with the user (2026-07-08):
 * if Playing Partner Teams groups came out uneven (e.g. one foursome of 4, another of 3), the
 * 3-person team borrows one of its own players' scores again each hole, chosen at random, rather
 * than the smaller team simply having fewer scores to choose its kept-best-X from (which would
 * otherwise unfairly favor larger teams' odds of a low kept score). Deliberately NOT a real extra
 * roster row/"ghost player" — the borrowed player can differ hole to hole, so it's computed fresh
 * per hole here rather than being a fixed team member.
 *
 * Returns exactly `padCount` player IDs by cycling through a deterministically-shuffled order of
 * `presentPlayerIds`, rather than drawing each pad slot independently — confirmed with the user
 * (2026-07-09): independent draws meant a 2-person team needing 2 pad slots could (by chance)
 * land on the SAME player twice, giving them their score counted 3 times total against their
 * partner's 1, which isn't the "random player" fairness this feature is meant to provide.
 * Cycling instead guarantees every present player gets at least one extra count before anyone
 * gets a second, for as long as there are enough pad slots to go around. Same seed formula used
 * by both getTeamGameResults (for scoring) and getTeamGameScorecard (for display), so the two
 * views always agree on who was picked, and results don't change between page loads.
 */
function pickPadPlayerIds(teamGameId, teamNumber, holeId, presentPlayerIds, padCount) {
    let state = hashSeed(teamGameId, teamNumber, holeId);
    const nextRandom = () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0xffffffff;
    };
    const shuffled = [...presentPlayerIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(nextRandom() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return Array.from({ length: padCount }, (_, i) => shuffled[i % shuffled.length]);
}
/**
 * A team game's best-(keep-X-of-N) net front/back/total, plus its roster — generalizes
 * teamService.ts's getTeamResults (which is always keep-1-of-N) to a configurable KeepCount.
 * The "keep the X lowest of N scores per hole" reduction is done in JS after fetching each
 * team's raw per-player-per-hole net scores (small dataset — a handful of teams, 18 holes, up to
 * 4 players each — safer than relying on window functions across MySQL/MariaDB versions).
 *
 * If this team game's "All players last hole" (Tommy Davis rule) is on, the last hole of the
 * round counts every rostered player's net score instead of just the kept-best `KeepCount` —
 * confirmed with the user (2026-07-08), independently settable per team game (e.g. off for
 * "Teams 1" but on for "Teams 2" in the same event, or for a one-off team game not tied to any
 * Options "Teams N" card at all). Stored directly on `TeamGame.LastHoleAll`, set at creation time
 * (see createTeamGame) — not inferred from Options by creation-order slot, since a one-off team
 * game has no Options card to infer from.
 *
 * "Last hole" is the highest HoleID this team actually has scores for (18 for a normal 18h round,
 * 9 for a 9f-only round, 18 for a 9b-only round), NOT hardcoded to 18 — but note this can't
 * detect a round that started on the back nine and wrapped to finish on the front (e.g. 10..18
 * then 1..9): nothing in the schema records which hole was actually played last, only the
 * physical HoleID, and the app's own hole-entry screens (app/game.tsx) don't support that
 * wraparound mode today anyway (side is always '18h'=1-18, '9f'=1-9, or '9b'=10-18, never a
 * wrap). If that scenario becomes real, this needs an actual "which hole finished the round"
 * signal added first.
 */
async function getTeamGameResults(teamGameId) {
    const [tgRows] = await config_1.default.query(`SELECT tg.GameID, tg.KeepCount, tg.LastHoleAll FROM TeamGame tg WHERE tg.TeamGameID = ?`, [teamGameId]);
    if (tgRows.length === 0)
        return [];
    const gameId = tgRows[0].GameID;
    const keepCount = tgRows[0].KeepCount;
    const lastHoleAll = tgRows[0].LastHoleAll === 'T';
    const maxRosterSize = await getMaxRosterSize(teamGameId);
    const [rows] = await config_1.default.query(`SELECT tgp.TeamNumber, tgp.PlayerID, s.HoleID, s.NetScore
     FROM TeamGamePlayer tgp
     INNER JOIN Score s ON s.PlayerID = tgp.PlayerID AND s.GameID = ?
     WHERE tgp.TeamGameID = ?`, [gameId, teamGameId]);
    // holeScores.get(teamNumber).get(holeId) = [{playerId, net}] among the team's rostered players on that hole
    const holeScores = new Map();
    for (const r of rows) {
        if (!holeScores.has(r.TeamNumber))
            holeScores.set(r.TeamNumber, new Map());
        const perHole = holeScores.get(r.TeamNumber);
        if (!perHole.has(r.HoleID))
            perHole.set(r.HoleID, []);
        perHole.get(r.HoleID).push({ playerId: r.PlayerID, net: Number(r.NetScore) });
    }
    function sumSide(teamNumber, perHole, holeFilter) {
        const holeIds = [...perHole.keys()];
        const lastHole = lastHoleAll && holeIds.length > 0 ? Math.max(...holeIds) : null;
        let total = 0;
        for (const [holeId, present] of perHole) {
            if (!holeFilter(holeId) || present.length === 0)
                continue;
            const nets = present.map((p) => p.net);
            const padCount = Math.max(0, maxRosterSize - present.length);
            if (padCount > 0) {
                const presentIds = present.map((p) => p.playerId);
                for (const pickedId of pickPadPlayerIds(teamGameId, teamNumber, holeId, presentIds, padCount)) {
                    nets.push(present.find((p) => p.playerId === pickedId).net);
                }
            }
            const sorted = nets.sort((a, b) => a - b);
            const kept = holeId === lastHole ? sorted : sorted.slice(0, keepCount);
            total += kept.reduce((sum, s) => sum + s, 0);
        }
        return total;
    }
    const [rosterRows] = await config_1.default.query(`SELECT tgp.TeamNumber, CONCAT(p.LastName, ', ', p.FirstName) AS name
     FROM TeamGamePlayer tgp
     INNER JOIN Player p ON p.PlayerID = tgp.PlayerID
     WHERE tgp.TeamGameID = ?
     ORDER BY tgp.TeamNumber, p.LastName, p.FirstName`, [teamGameId]);
    const rosterByTeam = new Map();
    for (const r of rosterRows) {
        if (!rosterByTeam.has(r.TeamNumber))
            rosterByTeam.set(r.TeamNumber, []);
        rosterByTeam.get(r.TeamNumber).push(r.name);
    }
    const teamNumbers = new Set([...holeScores.keys(), ...rosterByTeam.keys()]);
    return Array.from(teamNumbers)
        .sort((a, b) => a - b)
        .map((teamNumber) => {
        const perHole = holeScores.get(teamNumber) || new Map();
        const front = sumSide(teamNumber, perHole, (h) => h < 10);
        const back = sumSide(teamNumber, perHole, (h) => h > 9);
        return {
            teamId: teamNumber,
            front,
            back,
            total: front + back,
            players: rosterByTeam.get(teamNumber) || [],
        };
    });
}
/**
 * The Net Score to Make Cut summary for a specific Teams N team game — unlike
 * randomTeamsService.ts's getCutSummary (which always reads the unprefixed/Teams-1 cut), this
 * reads whichever slot this team game actually belongs to, so Teams 2/3/4 each show their own
 * cut line and missed-cut list instead of Teams 1's.
 */
async function getTeamGameCutSummary(teamGameId) {
    const [tgRows] = await config_1.default.query('SELECT GameID, Slot FROM TeamGame WHERE TeamGameID = ?', [teamGameId]);
    if (tgRows.length === 0)
        return { cutLine: null, missedCut: [] };
    const { GameID: gameId, Slot: slot } = tgRows[0];
    if (!slot)
        return { cutLine: null, missedCut: [] };
    const eligibility = await (0, randomTeamsService_1.getGameEligibility)(gameId, slotPrefix(slot));
    if (eligibility.stillPlaying.length > 0 || eligibility.cut === null) {
        return { cutLine: null, missedCut: [] };
    }
    const missedCut = eligibility.excludedOverCut
        .slice()
        .sort((a, b) => a.total - b.total)
        .map((p) => ({ name: p.name, total: p.total }));
    return { cutLine: eligibility.cut, missedCut };
}
async function getTeamGameScorecard(teamGameId, teamNumber, side) {
    const holeStart = side === 'B' ? 10 : 1;
    const holeEnd = side === 'F' ? 9 : 18;
    const [tgRows] = await config_1.default.query('SELECT GameID, KeepCount, LastHoleAll FROM TeamGame WHERE TeamGameID = ?', [teamGameId]);
    if (tgRows.length === 0)
        return { rows: [], holeTotals: {} };
    const gameId = tgRows[0].GameID;
    const keepCount = tgRows[0].KeepCount;
    const lastHoleAll = tgRows[0].LastHoleAll === 'T';
    const maxRosterSize = await getMaxRosterSize(teamGameId);
    // The true last hole of the WHOLE round (not just whichever side is being viewed) — needed so
    // the "All players last hole" rule only ever fires on the actual final hole (18 for a full
    // round). Fixed 2026-07-09: computing this from the side-scoped rows below instead (Math.max of
    // just the fetched Front-9 holes, say) mistook hole 9 for the round's last hole whenever viewing
    // Front alone, wrongly counting every player's hole 9 score instead of just the kept-best —
    // inflating the Front total (e.g. 73 shown vs the real kept-best 65) while Back/Total stayed
    // correct (both happen to include the real last hole, 18, so the bug never showed there).
    const [lastHoleRows] = await config_1.default.query(`SELECT MAX(sc.HoleID) AS maxHole FROM Score sc
     INNER JOIN TeamGamePlayer tgp ON tgp.TeamGameID = ? AND tgp.TeamNumber = ? AND tgp.PlayerID = sc.PlayerID
     WHERE sc.GameID = ?`, [teamGameId, teamNumber, gameId]);
    const trueLastHole = lastHoleRows[0]?.maxHole ?? null;
    const [rows] = await config_1.default.query(`SELECT sc.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name, sc.HoleID, sc.NetScore
     FROM Score sc
     INNER JOIN TeamGamePlayer tgp ON tgp.TeamGameID = ? AND tgp.TeamNumber = ? AND tgp.PlayerID = sc.PlayerID
     INNER JOIN Player p ON p.PlayerID = sc.PlayerID
     WHERE sc.GameID = ? AND sc.HoleID >= ? AND sc.HoleID <= ?
     ORDER BY sc.PlayerID, sc.HoleID`, [teamGameId, teamNumber, gameId, holeStart, holeEnd]);
    const byPlayer = new Map();
    const byHole = new Map();
    for (const r of rows) {
        if (!byPlayer.has(r.PlayerID)) {
            byPlayer.set(r.PlayerID, { name: r.name, holes: {}, total: 0, paddedHoles: [] });
        }
        const entry = byPlayer.get(r.PlayerID);
        entry.holes[r.HoleID] = r.NetScore;
        entry.total += r.NetScore;
        if (!byHole.has(r.HoleID))
            byHole.set(r.HoleID, []);
        byHole.get(r.HoleID).push(r.PlayerID);
    }
    // Synthetic "Ghost Player" row(s): rather than only marking the real player's own row with a
    // `*`, also show the padded pick as its own row (e.g. "Ghost Player 4") so it's visible at a
    // glance which score got double-counted each hole — confirmed with the user (2026-07-09), purely
    // a display aid, never written to TeamGamePlayer or counted separately in getTeamGameResults.
    const realPlayerCount = byPlayer.size;
    const maxPadCount = Math.max(0, ...Array.from(byHole.values()).map((ids) => maxRosterSize - ids.length));
    const ghostRows = Array.from({ length: maxPadCount }, (_, g) => ({
        name: `Ghost Player ${realPlayerCount + g + 1}`,
        holes: {},
        total: 0,
        isGhost: true,
    }));
    const lastHole = lastHoleAll ? trueLastHole : null;
    const holeTotals = {};
    for (const [holeId, presentIds] of byHole) {
        const padCount = Math.max(0, maxRosterSize - presentIds.length);
        const picked = pickPadPlayerIds(teamGameId, teamNumber, holeId, presentIds, padCount);
        picked.forEach((pickedId, i) => {
            byPlayer.get(pickedId)?.paddedHoles.push(holeId);
            const net = byPlayer.get(pickedId)?.holes[holeId];
            if (net !== undefined && ghostRows[i]) {
                ghostRows[i].holes[holeId] = net;
                ghostRows[i].total += net;
            }
        });
        const nets = [...presentIds, ...picked].map((pid) => byPlayer.get(pid).holes[holeId]);
        const sorted = nets.slice().sort((a, b) => a - b);
        const kept = holeId === lastHole ? sorted : sorted.slice(0, keepCount);
        holeTotals[holeId] = kept.reduce((sum, s) => sum + s, 0);
    }
    return { rows: [...Array.from(byPlayer.values()), ...ghostRows], holeTotals };
}
