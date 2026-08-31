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
exports.getKeepFormatTeamsForPlayers = getKeepFormatTeamsForPlayers;
exports.getIrishRumbleTeamsForPlayers = getIrishRumbleTeamsForPlayers;
exports.getTeamGameHoleKeepCounts = getTeamGameHoleKeepCounts;
exports.saveTeamGameHoleKeepCount = saveTeamGameHoleKeepCount;
exports.getTeamGameLiveLeaderboard = getTeamGameLiveLeaderboard;
exports.getFixedKeepLiveLeaderboard = getFixedKeepLiveLeaderboard;
exports.getBestPossibleWeeks = getBestPossibleWeeks;
exports.getTeamBestPossible = getTeamBestPossible;
const config_1 = __importDefault(require("../db/config"));
const randomTeamsService_1 = require("./randomTeamsService");
const optionsService_1 = require("./optionsService");
const teamKeep_1 = require("../utils/teamKeep");
/** Legacy per-size format values from before this collapsed into one -- still recognized so
 * existing TeamGame rows / EventOptions values created before this change keep working, without
 * needing a data migration. Only ever produced going forward is TEAMS_KEEP_FORMAT ('36/48'). */
function isKeepFormat(format) {
    return format === teamKeep_1.TEAMS_KEEP_FORMAT || format === '36' || format === '48';
}
/** Irish Rumble -- a fixed-foursome format with a deterministic, hole-varying keep count (see
 * irishRumbleKeepCountForHole), not a live per-hole choice, so it's scored through the same
 * fixed-KeepCount code path 'custom' uses (including padding for a short-handed group), just
 * with the "fixed" count swapped for one that depends on which hole it is. */
function isIrishFormat(format) {
    return format === teamKeep_1.IRISH_RUMBLE_FORMAT;
}
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
    const [calRows] = await config_1.default.query(`SELECT EventDate FROM EventCalendar WHERE EventID = ? AND DayType IN ('event', 'major')`, [eventId]);
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
function toNullableNumber(v) {
    if (v === undefined || v === null || v.trim() === '')
        return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
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
        format: r.Format || 'custom',
        netCut: r.NetCut === null || r.NetCut === undefined ? null : Number(r.NetCut),
        netCut9: r.NetCut9 === null || r.NetCut9 === undefined ? null : Number(r.NetCut9),
        payIn: r.PayIn === null || r.PayIn === undefined ? null : Number(r.PayIn),
        places: r.Places === null || r.Places === undefined ? null : Number(r.Places),
        pct1: r.Pct1 === null || r.Pct1 === undefined ? null : Number(r.Pct1),
        pct2: r.Pct2 === null || r.Pct2 === undefined ? null : Number(r.Pct2),
        pct3: r.Pct3 === null || r.Pct3 === undefined ? null : Number(r.Pct3),
        pct4: r.Pct4 === null || r.Pct4 === undefined ? null : Number(r.Pct4),
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
 *
 * `format` defaults to 'custom' (the classic configurable team size/keep count rule above). For
 * the two "predefined" formats (36/48 and Irish Rumble), `teamSize`/`keepCount` are ignored in
 * favor of the same placeholder-0 convention autoProvisionPartnerTeamsSlots uses (never read for
 * scoring), and `assignMode` must be 'G' -- there's no meaningful "Random" or "Manual" draw for a
 * format whose whole point is the real, physically-present foursome. This is what lets Team
 * Games' "+ One-Off Team Game" button offer a one-off 36/48 or Irish Rumble game for a single
 * week without touching the event's Options default (confirmed with Matt 2026-07-26: Options
 * describes the event's standard format, not something to toggle back and forth for a one-off
 * week) -- create it here with `slot` omitted, and it still auto-fills correctly from whichever
 * foursome checks in via Start Game, exactly like an Options-driven slot does.
 *
 * `payout` is this row's own Net Cut / Net Cut 9 / Pay In / Places / Pct1-4 -- same purpose as
 * `lastHoleAll` above: settable independently on a one-off game that has no Options "Teams N"
 * card to read these from (confirmed with Matt 2026-08-21: a one-off week needs the exact same
 * game-setup options as a real Teams N card -- payout, net cut, blind draw, playing partner
 * teams). Blind Draw / Playing Partner Teams have no columns of their own here -- they're just
 * `assignMode` 'R' (with teamSize locked to 2) / 'G' respectively, already fully expressible via
 * the existing params, so the create-game modal's Blind Draw / Playing Partner Teams switches
 * simply drive `teamSize`/`assignMode` before calling this, the same as Options' equivalent
 * switches already drive a slot's assignMode.
 */
async function createTeamGame(gameId, label, teamSize, keepCount, assignMode, lastHoleAll, slot, format = 'custom', payout) {
    const netCut = toNullableNumber(payout?.netCut);
    const netCut9 = toNullableNumber(payout?.netCut9);
    const payIn = toNullableNumber(payout?.payIn);
    const places = payout?.places && payout.places.trim() !== '' ? Math.max(0, Math.min(4, Number(payout.places) || 0)) : null;
    const pct1 = toNullableNumber(payout?.pct1);
    const pct2 = toNullableNumber(payout?.pct2);
    const pct3 = toNullableNumber(payout?.pct3);
    const pct4 = toNullableNumber(payout?.pct4);
    if (isKeepFormat(format) || isIrishFormat(format)) {
        if (assignMode !== 'G') {
            throw new Error('36/48 and Irish Rumble team games must use Playing Groups assignment');
        }
        const [result] = await config_1.default.query(`INSERT INTO TeamGame (GameID, Label, TeamSize, KeepCount, AssignMode, LastHoleAll, Slot, Format,
                              NetCut, NetCut9, PayIn, Places, Pct1, Pct2, Pct3, Pct4, LastUpdateUser)
       VALUES (?, ?, 0, 0, 'G', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'App')`, [gameId, label, lastHoleAll ? 'T' : 'F', slot ?? null, format, netCut, netCut9, payIn, places, pct1, pct2, pct3, pct4]);
        return result.insertId;
    }
    if (![2, 3, 4].includes(teamSize))
        throw new Error('teamSize must be 2, 3, or 4');
    if (keepCount < 1 || keepCount > teamSize)
        throw new Error('keepCount must be between 1 and teamSize');
    if (assignMode === 'R' && teamSize !== 2)
        throw new Error('Random assignment is only available for 2-person teams');
    const [result] = await config_1.default.query(`INSERT INTO TeamGame (GameID, Label, TeamSize, KeepCount, AssignMode, LastHoleAll, Slot, Format,
                            NetCut, NetCut9, PayIn, Places, Pct1, Pct2, Pct3, Pct4, LastUpdateUser)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'App')`, [gameId, label, teamSize, keepCount, assignMode, lastHoleAll ? 'T' : 'F', slot ?? null, format,
        netCut, netCut9, payIn, places, pct1, pct2, pct3, pct4]);
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
    const [tgRows] = await config_1.default.query('SELECT GameID, AssignMode, RandomSet, Slot, NetCut, NetCut9 FROM TeamGame WHERE TeamGameID = ?', [teamGameId]);
    if (tgRows.length === 0)
        throw new Error('Team game not found');
    const tg = tgRows[0];
    if (tg.AssignMode !== 'R')
        throw new Error('This team game is not set to random assignment');
    if (tg.RandomSet === 'T') {
        return { alreadySet: true, teams: await getTeamGameRoster(teamGameId) };
    }
    // A one-off team game (Slot null) has no Options "Teams N" card to pull a cut from — it has its
    // own Net Cut / Net Cut 9 stored directly on this row instead (see createTeamGame), passed
    // through directly rather than accidentally applying Teams 1's cut to an unrelated one-off game.
    const eligibility = tg.Slot
        ? await (0, randomTeamsService_1.getGameEligibility)(tg.GameID, slotPrefix(tg.Slot))
        : await (0, randomTeamsService_1.getGameEligibility)(tg.GameID, 'none', {
            full18: tg.NetCut === null || tg.NetCut === undefined ? null : Number(tg.NetCut),
            nineHole: tg.NetCut9 === null || tg.NetCut9 === undefined ? null : Number(tg.NetCut9),
        });
    if (eligibility.stillPlaying.length > 0) {
        return { alreadySet: false, teams: [], stillPlaying: eligibility.stillPlaying.map((p) => p.name) };
    }
    if (eligibility.eligiblePlayerIds.length < 4) {
        return { alreadySet: false, teams: [], notEnoughPlayers: true };
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
        const format = options[`${prefix}_format`] || 'custom';
        // 36/48 has no fixed team size or KeepCount at all -- team size is whatever headcount
        // actually shows up (see getKeepFormatTeamsForPlayers), and KeepCount is chosen live, hole
        // by hole (see TeamGameHoleKeep). Irish Rumble assumes a real foursome (its "2/3/4" counts
        // are fixed, not headcount-scaled) and its KeepCount varies by hole (see
        // irishRumbleKeepCountForHole), never a single fixed number. TeamSize/KeepCount below are
        // just harmless placeholders for both formats, never read for scoring
        // (getTeamGameResults/getTeamGameScorecard branch on Format instead).
        const teamSize = isKeepFormat(format) ? 0 : isIrishFormat(format) ? 4 : Number(options[`${prefix}_teamsize`]) || 2;
        const keepCount = isKeepFormat(format) || isIrishFormat(format) ? 0 : Math.min(teamSize, Number(options[`${prefix}_keepcount`]) || 1);
        const lastHoleAll = !!options[`${prefix}_lastholeall`];
        await config_1.default.query(`INSERT INTO TeamGame (GameID, Label, TeamSize, KeepCount, AssignMode, LastHoleAll, Slot, Format, LastUpdateUser)
       VALUES (?, ?, ?, ?, 'G', ?, ?, ?, 'App')`, [gameId, `Teams ${slot}`, teamSize, keepCount, lastHoleAll ? 'T' : 'F', slot, format]);
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
 * If this team game's "All Scores 18th Hole" (Tommy Davis rule) is on, hole 18 counts every
 * rostered player's net score instead of just the kept-best `KeepCount` — confirmed with the user
 * (2026-07-08), independently settable per team game (e.g. off for "Teams 1" but on for "Teams 2"
 * in the same event, or for a one-off team game not tied to any Options "Teams N" card at all).
 * Stored directly on `TeamGame.LastHoleAll`, set at creation time (see createTeamGame) — not
 * inferred from Options by creation-order slot, since a one-off team game has no Options card to
 * infer from.
 *
 * "Last hole" always means the physical 18th hole specifically (confirmed with Matt 2026-08-02) —
 * not "whichever hole this team happened to finish on," so it simply never fires for a
 * front-9-only round (hole 18 was never played) regardless of which hole the round started on.
 */
async function getTeamGameResults(teamGameId) {
    const [tgRows] = await config_1.default.query(`SELECT tg.GameID, tg.KeepCount, tg.LastHoleAll, tg.Format FROM TeamGame tg WHERE tg.TeamGameID = ?`, [teamGameId]);
    if (tgRows.length === 0)
        return [];
    const gameId = tgRows[0].GameID;
    const keepCount = tgRows[0].KeepCount;
    const lastHoleAll = tgRows[0].LastHoleAll === 'T';
    const format = tgRows[0].Format || 'custom';
    const usesLiveKeepPicker = isKeepFormat(format);
    // A bare net total doesn't mean anything to compare across teams for these two formats (36/48
    // teams can be different sizes; Irish Rumble's keep count varies by hole) -- show +/- to par
    // instead. 'custom' and the legacy Team-table path are unaffected, still showing raw net.
    const showParRelative = usesLiveKeepPicker || isIrishFormat(format);
    const maxRosterSize = await getMaxRosterSize(teamGameId);
    let parByHole = new Map();
    if (showParRelative) {
        const [gameCourseRows] = await config_1.default.query('SELECT CourseID FROM Game WHERE GameID = ?', [gameId]);
        const courseId = gameCourseRows[0]?.CourseID;
        const [holeRows] = await config_1.default.query('SELECT HoleNum, Par FROM CourseDetails WHERE CourseID = ?', [courseId]);
        parByHole = new Map(holeRows.map((h) => [h.HoleNum, h.Par]));
    }
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
    // 36/48: each team's own live, hole-by-hole choice of how many net scores to keep (see
    // TeamGameHoleKeep) replaces the fixed KeepCount slice entirely for this team game.
    const holeKeepByTeam = new Map();
    if (usesLiveKeepPicker) {
        const [keepRows] = await config_1.default.query('SELECT TeamNumber, HoleID, KeepCount FROM TeamGameHoleKeep WHERE TeamGameID = ?', [teamGameId]);
        for (const r of keepRows) {
            if (!holeKeepByTeam.has(r.TeamNumber))
                holeKeepByTeam.set(r.TeamNumber, new Map());
            holeKeepByTeam.get(r.TeamNumber).set(r.HoleID, r.KeepCount);
        }
    }
    function sumSide(teamNumber, perHole, holeFilter) {
        const lastHole = lastHoleAll ? 18 : null;
        let net = 0;
        let par = 0;
        for (const [holeId, present] of perHole) {
            if (!holeFilter(holeId) || present.length === 0)
                continue;
            const nets = present.map((p) => p.net);
            // Padding (borrowing a teammate's score twice to match the largest team's roster size)
            // only applies to 'custom' -- it existed so a smaller team wasn't unfairly stuck choosing
            // from fewer scores under one shared fixed KeepCount. 36/48 doesn't need it: each team's
            // target already scales with its own real headcount, so a smaller team is never
            // disadvantaged, and padding would double-count a player and distort which scores actually
            // get kept (confirmed with Matt 2026-07-24).
            const padCount = usesLiveKeepPicker ? 0 : Math.max(0, maxRosterSize - present.length);
            if (padCount > 0) {
                const presentIds = present.map((p) => p.playerId);
                for (const pickedId of pickPadPlayerIds(teamGameId, teamNumber, holeId, presentIds, padCount)) {
                    nets.push(present.find((p) => p.playerId === pickedId).net);
                }
            }
            const sorted = nets.sort((a, b) => a - b);
            let kept;
            if (usesLiveKeepPicker) {
                // The team's own live choice for this hole -- falls back to keeping every present score
                // if no choice was ever recorded (shouldn't happen under normal play, since the live
                // picker hard-blocks advancing past a hole until it's chosen, but this stays safe rather
                // than silently shorting a team's honest total for old or edge-case data).
                const chosen = holeKeepByTeam.get(teamNumber)?.get(holeId);
                kept = chosen !== undefined ? sorted.slice(0, chosen) : sorted;
            }
            else {
                // Irish Rumble's keep count is a fixed rule of the hole number itself (2/3/4), not a
                // single number for the whole round like 'custom' -- everything else (padding, Tommy
                // Davis) works exactly the same as 'custom'.
                const effectiveKeepCount = isIrishFormat(format) ? (0, teamKeep_1.irishRumbleKeepCountForHole)(holeId) : keepCount;
                kept = holeId === lastHole ? sorted : sorted.slice(0, effectiveKeepCount);
            }
            net += kept.reduce((sum, s) => sum + s, 0);
            par += (parByHole.get(holeId) ?? 0) * kept.length;
        }
        return { net, par };
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
    function scoreVsPar(net, par) {
        const diff = net - par;
        return diff === 0 ? 'Even' : diff > 0 ? `+${diff}` : `${diff}`;
    }
    const teamNumbers = new Set([...holeScores.keys(), ...rosterByTeam.keys()]);
    return Array.from(teamNumbers)
        .map((teamNumber) => {
        const perHole = holeScores.get(teamNumber) || new Map();
        const front = sumSide(teamNumber, perHole, (h) => h < 10);
        const back = sumSide(teamNumber, perHole, (h) => h > 9);
        return {
            teamId: teamNumber,
            front: front.net,
            back: back.net,
            total: front.net + back.net,
            players: rosterByTeam.get(teamNumber) || [],
            ...(showParRelative ? {
                frontPar: scoreVsPar(front.net, front.par),
                backPar: scoreVsPar(back.net, back.par),
                totalPar: scoreVsPar(front.net + back.net, front.par + back.par),
            } : {}),
        };
    })
        .sort((a, b) => a.total - b.total);
}
/**
 * The Net Score to Make Cut summary for a specific Teams N team game — unlike
 * randomTeamsService.ts's getCutSummary (which always reads the unprefixed/Teams-1 cut), this
 * reads whichever slot this team game actually belongs to, so Teams 2/3/4 each show their own
 * cut line and missed-cut list instead of Teams 1's. A one-off team game (Slot null) uses its own
 * Net Cut / Net Cut 9 stored directly on this row instead (see createTeamGame).
 */
async function getTeamGameCutSummary(teamGameId) {
    const [tgRows] = await config_1.default.query('SELECT GameID, Slot, NetCut, NetCut9 FROM TeamGame WHERE TeamGameID = ?', [teamGameId]);
    if (tgRows.length === 0)
        return { cutLine: null, missedCut: [] };
    const { GameID: gameId, Slot: slot, NetCut: netCut, NetCut9: netCut9 } = tgRows[0];
    if (!slot && netCut === null && netCut9 === null)
        return { cutLine: null, missedCut: [] };
    const eligibility = slot
        ? await (0, randomTeamsService_1.getGameEligibility)(gameId, slotPrefix(slot))
        : await (0, randomTeamsService_1.getGameEligibility)(gameId, 'none', {
            full18: netCut === null || netCut === undefined ? null : Number(netCut),
            nineHole: netCut9 === null || netCut9 === undefined ? null : Number(netCut9),
        });
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
    const [tgRows] = await config_1.default.query('SELECT GameID, KeepCount, LastHoleAll, Format FROM TeamGame WHERE TeamGameID = ?', [teamGameId]);
    if (tgRows.length === 0)
        return { rows: [], holeTotals: {} };
    const gameId = tgRows[0].GameID;
    const keepCount = tgRows[0].KeepCount;
    const lastHoleAll = tgRows[0].LastHoleAll === 'T';
    const format = tgRows[0].Format || 'custom';
    const usesLiveKeepPicker = isKeepFormat(format);
    const maxRosterSize = await getMaxRosterSize(teamGameId);
    // 36/48: this team's own live, hole-by-hole keep choices (see TeamGameHoleKeep) replace the
    // fixed KeepCount slice below, same as getTeamGameResults.
    let holeKeep = new Map();
    if (usesLiveKeepPicker) {
        const [keepRows] = await config_1.default.query('SELECT HoleID, KeepCount FROM TeamGameHoleKeep WHERE TeamGameID = ? AND TeamNumber = ?', [teamGameId, teamNumber]);
        holeKeep = new Map(keepRows.map((r) => [r.HoleID, r.KeepCount]));
    }
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
    // No padding for 36/48 -- see the matching note in getTeamGameResults.
    const maxPadCount = usesLiveKeepPicker ? 0 : Math.max(0, ...Array.from(byHole.values()).map((ids) => maxRosterSize - ids.length));
    const ghostRows = Array.from({ length: maxPadCount }, (_, g) => ({
        name: `Ghost Player ${realPlayerCount + g + 1}`,
        holes: {},
        total: 0,
        isGhost: true,
    }));
    // "All Scores 18th Hole" always means the physical 18th hole, never whichever hole a team
    // happened to finish on or whichever side is being viewed — a front-9-only round simply never
    // triggers this rule, since hole 18 was never played (confirmed with Matt: the rule is tied to
    // the actual 18th hole, not "the last hole of whatever was played").
    const lastHole = lastHoleAll ? 18 : null;
    const holeTotals = {};
    for (const [holeId, presentIds] of byHole) {
        const padCount = usesLiveKeepPicker ? 0 : Math.max(0, maxRosterSize - presentIds.length);
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
        let kept;
        if (usesLiveKeepPicker) {
            const chosen = holeKeep.get(holeId);
            kept = chosen !== undefined ? sorted.slice(0, chosen) : sorted;
        }
        else {
            const effectiveKeepCount = isIrishFormat(format) ? (0, teamKeep_1.irishRumbleKeepCountForHole)(holeId) : keepCount;
            kept = holeId === lastHole ? sorted : sorted.slice(0, effectiveKeepCount);
        }
        holeTotals[holeId] = kept.reduce((sum, s) => sum + s, 0);
    }
    return { rows: [...Array.from(byPlayer.values()), ...ghostRows], holeTotals };
}
/**
 * Every 36/48-format team game this exact foursome is registered as one team in, for a given
 * game — app/game.tsx calls this once per round (using its own pid1-4) to know whether it needs
 * to show the live "keep how many" prompt at all, and if so for which team game(s). "This exact
 * foursome" means every one of that team's rostered players is present in the submitted player
 * list — a partial overlap (e.g. a short-handed Playing Partner Teams pad scenario) doesn't
 * count as a match, since the prompt is meant for the real, physically-present team making the
 * decision together, not a borrowed/padded roster.
 */
async function getKeepFormatTeamsForPlayers(gameId, playerIds) {
    if (playerIds.length === 0)
        return [];
    const [rows] = await config_1.default.query(`SELECT tg.TeamGameID, tg.Format, tg.Label, tgp.TeamNumber, tgp.PlayerID
     FROM TeamGame tg
     INNER JOIN TeamGamePlayer tgp ON tgp.TeamGameID = tg.TeamGameID
     WHERE tg.GameID = ? AND tg.Format IN ('36/48', '36', '48')`, [gameId]);
    const byTeam = new Map();
    for (const r of rows) {
        const k = `${r.TeamGameID}-${r.TeamNumber}`;
        if (!byTeam.has(k)) {
            byTeam.set(k, {
                teamGameId: r.TeamGameID,
                teamNumber: r.TeamNumber,
                label: r.Label,
                playerIds: new Set(),
            });
        }
        byTeam.get(k).playerIds.add(r.PlayerID);
    }
    const inputSet = new Set(playerIds);
    const result = [];
    for (const team of byTeam.values()) {
        const isMatch = team.playerIds.size > 0 && [...team.playerIds].every((pid) => inputSet.has(pid));
        if (isMatch) {
            const teamSize = team.playerIds.size;
            result.push({
                teamGameId: team.teamGameId,
                teamNumber: team.teamNumber,
                teamSize,
                target: (0, teamKeep_1.targetForTeamSize)(teamSize),
                label: team.label,
            });
        }
    }
    return result;
}
/**
 * Every Irish Rumble team game this exact foursome is registered as one team in, for a given
 * game -- app/game.tsx calls this once per round (using its own pid1-4) to know whether to show
 * the live per-hole score card, mirrors getKeepFormatTeamsForPlayers's exact-match rule (every
 * one of the team's rostered players must be present in the submitted list).
 */
async function getIrishRumbleTeamsForPlayers(gameId, playerIds) {
    if (playerIds.length === 0)
        return [];
    const [rows] = await config_1.default.query(`SELECT tg.TeamGameID, tg.Label, tgp.TeamNumber, tgp.PlayerID
     FROM TeamGame tg
     INNER JOIN TeamGamePlayer tgp ON tgp.TeamGameID = tg.TeamGameID
     WHERE tg.GameID = ? AND tg.Format = ?`, [gameId, teamKeep_1.IRISH_RUMBLE_FORMAT]);
    const byTeam = new Map();
    for (const r of rows) {
        const k = `${r.TeamGameID}-${r.TeamNumber}`;
        if (!byTeam.has(k)) {
            byTeam.set(k, { teamGameId: r.TeamGameID, teamNumber: r.TeamNumber, label: r.Label, playerIds: new Set() });
        }
        byTeam.get(k).playerIds.add(r.PlayerID);
    }
    const inputSet = new Set(playerIds);
    const result = [];
    for (const team of byTeam.values()) {
        const isMatch = team.playerIds.size > 0 && [...team.playerIds].every((pid) => inputSet.has(pid));
        if (isMatch) {
            result.push({
                teamGameId: team.teamGameId,
                teamNumber: team.teamNumber,
                label: team.label,
                playerIds: [...team.playerIds],
            });
        }
    }
    return result;
}
/** A team's already-recorded live keep choices, keyed by HoleID -- what's already been decided
 * so far this round, for the live prompt to resume from and total up. */
async function getTeamGameHoleKeepCounts(teamGameId, teamNumber) {
    const [rows] = await config_1.default.query('SELECT HoleID, KeepCount FROM TeamGameHoleKeep WHERE TeamGameID = ? AND TeamNumber = ?', [teamGameId, teamNumber]);
    const result = {};
    for (const r of rows)
        result[r.HoleID] = r.KeepCount;
    return result;
}
/**
 * Save one hole's live keep-count choice for a 36/48-format team — re-validates against
 * computeValidKeepChoices server-side (the same function the live picker itself uses to grey out
 * invalid buttons) before writing anything, so a stale or tampered request can't record a choice
 * that would make the round's target unreachable. `holesRemainingIncludingThisOne` comes from the
 * caller (app/game.tsx knows the round's actual hole range -- 18h/9f/9b -- this service doesn't).
 */
async function saveTeamGameHoleKeepCount(teamGameId, teamNumber, holeId, keepCount, holesRemainingIncludingThisOne) {
    const [tgRows] = await config_1.default.query('SELECT Format FROM TeamGame WHERE TeamGameID = ?', [teamGameId]);
    if (tgRows.length === 0)
        return { ok: false, error: 'Team game not found.' };
    const format = tgRows[0].Format;
    if (!isKeepFormat(format))
        return { ok: false, error: 'This team game is not a 36/48 format.' };
    // Team size is always this specific team's actual headcount, not a value fixed in advance.
    const [rosterRows] = await config_1.default.query('SELECT COUNT(DISTINCT PlayerID) AS cnt FROM TeamGamePlayer WHERE TeamGameID = ? AND TeamNumber = ?', [teamGameId, teamNumber]);
    const teamSize = Number(rosterRows[0]?.cnt) || 0;
    const target = (0, teamKeep_1.targetForTeamSize)(teamSize);
    const [otherRows] = await config_1.default.query('SELECT KeepCount FROM TeamGameHoleKeep WHERE TeamGameID = ? AND TeamNumber = ? AND HoleID != ?', [teamGameId, teamNumber, holeId]);
    const keptOnOtherHoles = otherRows.reduce((sum, r) => sum + Number(r.KeepCount), 0);
    const validChoices = (0, teamKeep_1.computeValidKeepChoices)(teamSize, target, keptOnOtherHoles, holesRemainingIncludingThisOne);
    if (!validChoices.includes(keepCount)) {
        return { ok: false, error: `${keepCount} isn't a valid choice for this hole.` };
    }
    await config_1.default.query(`INSERT INTO TeamGameHoleKeep (TeamGameID, TeamNumber, HoleID, KeepCount, LastUpdateUser)
     VALUES (?, ?, ?, ?, 'App')
     ON DUPLICATE KEY UPDATE KeepCount = VALUES(KeepCount), LastUpdateDt = CURRENT_TIMESTAMP, LastUpdateUser = VALUES(LastUpdateUser)`, [teamGameId, teamNumber, holeId, keepCount]);
    return { ok: true };
}
/**
 * Live standings for every team in a 36/48 team game: holes finished, net score vs. par so far
 * (using each hole's actual live-chosen keep count, same reduction getTeamGameResults uses), and
 * how many of the target's net scores they've used up. Empty for a 'custom'-format team game --
 * this view only makes sense where there's a live per-hole choice and a fixed target to track.
 */
async function getTeamGameLiveLeaderboard(teamGameId) {
    const [tgRows] = await config_1.default.query('SELECT GameID, Format FROM TeamGame WHERE TeamGameID = ?', [teamGameId]);
    if (tgRows.length === 0)
        return [];
    const gameId = tgRows[0].GameID;
    const format = tgRows[0].Format;
    if (!isKeepFormat(format))
        return [];
    const [gameRows] = await config_1.default.query('SELECT CourseID FROM Game WHERE GameID = ?', [gameId]);
    const courseId = gameRows[0]?.CourseID;
    const [holeRows] = await config_1.default.query('SELECT HoleNum, Par FROM CourseDetails WHERE CourseID = ?', [courseId]);
    const parByHole = new Map(holeRows.map((h) => [h.HoleNum, h.Par]));
    const [keepRows] = await config_1.default.query('SELECT TeamNumber, HoleID, KeepCount FROM TeamGameHoleKeep WHERE TeamGameID = ?', [teamGameId]);
    const keepByTeam = new Map();
    for (const r of keepRows) {
        if (!keepByTeam.has(r.TeamNumber))
            keepByTeam.set(r.TeamNumber, new Map());
        keepByTeam.get(r.TeamNumber).set(r.HoleID, r.KeepCount);
    }
    const [rosterRows] = await config_1.default.query(`SELECT tgp.TeamNumber, CONCAT(p.LastName, ', ', p.FirstName) AS name
     FROM TeamGamePlayer tgp INNER JOIN Player p ON p.PlayerID = tgp.PlayerID
     WHERE tgp.TeamGameID = ? ORDER BY tgp.TeamNumber, p.LastName, p.FirstName`, [teamGameId]);
    const rosterByTeam = new Map();
    for (const r of rosterRows) {
        if (!rosterByTeam.has(r.TeamNumber))
            rosterByTeam.set(r.TeamNumber, []);
        rosterByTeam.get(r.TeamNumber).push(r.name);
    }
    const [scoreRows] = await config_1.default.query(`SELECT tgp.TeamNumber, s.HoleID, s.NetScore
     FROM TeamGamePlayer tgp
     INNER JOIN Score s ON s.PlayerID = tgp.PlayerID AND s.GameID = ?
     WHERE tgp.TeamGameID = ?`, [gameId, teamGameId]);
    const netByTeamHole = new Map();
    for (const r of scoreRows) {
        if (!netByTeamHole.has(r.TeamNumber))
            netByTeamHole.set(r.TeamNumber, new Map());
        const perHole = netByTeamHole.get(r.TeamNumber);
        if (!perHole.has(r.HoleID))
            perHole.set(r.HoleID, []);
        perHole.get(r.HoleID).push(Number(r.NetScore));
    }
    /** Score-vs-par plus kept count for whichever holes pass `holeFilter` -- a bare score never
     * means anything alone for this format (two teams' totals aren't comparable without knowing
     * how many scores each is built from), so every figure always carries its kept count with it. */
    function computeSide(keepMap, netMap, holeFilter) {
        let netTotal = 0;
        let parTotal = 0;
        let kept = 0;
        for (const [holeId, keepCount] of keepMap) {
            if (!holeFilter(holeId))
                continue;
            const sortedNets = (netMap.get(holeId) || []).slice().sort((a, b) => a - b);
            netTotal += sortedNets.slice(0, keepCount).reduce((sum, n) => sum + n, 0);
            // netTotal sums `keepCount` net scores for this hole, so par has to be counted the same
            // number of times -- comparing N kept scores against a single hole's par once (not N
            // times) was the bug: it made the total balloon further off with every hole a team kept
            // more than one score on, instead of tracking true cumulative over/under (confirmed real
            // case 2026-07-24: a team sitting around -2 through several holes showed +106 by hole 18).
            parTotal += (parByHole.get(holeId) ?? 0) * keepCount;
            kept += keepCount;
        }
        // No holes decided yet naturally computes to 0 - 0 = Even, which is exactly right here (not
        // a placeholder dash): a team that hasn't started owes nothing yet, same as one already
        // sitting dead even.
        const diff = netTotal - parTotal;
        const score = diff === 0 ? 'Even' : diff > 0 ? `+${diff}` : `${diff}`;
        return { score, kept };
    }
    const teamNumbers = new Set([...rosterByTeam.keys(), ...keepByTeam.keys()]);
    const result = Array.from(teamNumbers)
        .sort((a, b) => a - b)
        .map((teamNumber) => {
        const keepMap = keepByTeam.get(teamNumber) || new Map();
        const netMap = netByTeamHole.get(teamNumber) || new Map();
        const front = computeSide(keepMap, netMap, (h) => h <= 9);
        const back = computeSide(keepMap, netMap, (h) => h > 9);
        const total = computeSide(keepMap, netMap, () => true);
        const players = rosterByTeam.get(teamNumber) || [];
        return { teamNumber, players, thru: keepMap.size, front, back, total, target: (0, teamKeep_1.targetForTeamSize)(players.length) };
    });
    // Sort by total score (lower/better first); teams with no holes finished yet sink to the bottom.
    return result.sort((a, b) => {
        if (a.thru === 0 && b.thru === 0)
            return a.teamNumber - b.teamNumber;
        if (a.thru === 0)
            return 1;
        if (b.thru === 0)
            return -1;
        const aDiff = a.total.score === 'Even' ? 0 : parseInt(a.total.score, 10);
        const bDiff = b.total.score === 'Even' ? 0 : parseInt(b.total.score, 10);
        return aDiff - bDiff;
    });
}
/**
 * Live standings for every team in a fixed-keep-count team game (the 'custom' format used by
 * plain 2-person Teams N games, and 'irish'): holes finished and net score vs. par so far, using
 * the same fixed/hole-varying keep rule, padding-for-a-short-handed-group, and "All Scores 18th
 * Hole" (Tommy Davis) rule that getTeamGameResults uses. Empty for the '36/48' live-picker format,
 * which has no fixed keep count to compute a running total from until each hole's live choice is
 * made (see getTeamGameLiveLeaderboard instead).
 */
async function getFixedKeepLiveLeaderboard(teamGameId) {
    const [tgRows] = await config_1.default.query('SELECT GameID, Format, KeepCount, LastHoleAll FROM TeamGame WHERE TeamGameID = ?', [teamGameId]);
    if (tgRows.length === 0)
        return [];
    const gameId = tgRows[0].GameID;
    const format = tgRows[0].Format;
    if (format !== 'custom' && !isIrishFormat(format))
        return [];
    const keepCount = tgRows[0].KeepCount;
    const lastHoleAll = tgRows[0].LastHoleAll === 'T';
    const maxRosterSize = await getMaxRosterSize(teamGameId);
    const [gameRows] = await config_1.default.query('SELECT CourseID FROM Game WHERE GameID = ?', [gameId]);
    const courseId = gameRows[0]?.CourseID;
    const [holeRows] = await config_1.default.query('SELECT HoleNum, Par FROM CourseDetails WHERE CourseID = ?', [courseId]);
    const parByHole = new Map(holeRows.map((h) => [h.HoleNum, h.Par]));
    const [rosterRows] = await config_1.default.query(`SELECT tgp.TeamNumber, CONCAT(p.LastName, ', ', p.FirstName) AS name
     FROM TeamGamePlayer tgp INNER JOIN Player p ON p.PlayerID = tgp.PlayerID
     WHERE tgp.TeamGameID = ? ORDER BY tgp.TeamNumber, p.LastName, p.FirstName`, [teamGameId]);
    const rosterByTeam = new Map();
    for (const r of rosterRows) {
        if (!rosterByTeam.has(r.TeamNumber))
            rosterByTeam.set(r.TeamNumber, []);
        rosterByTeam.get(r.TeamNumber).push(r.name);
    }
    const [scoreRows] = await config_1.default.query(`SELECT tgp.TeamNumber, tgp.PlayerID, s.HoleID, s.NetScore
     FROM TeamGamePlayer tgp
     INNER JOIN Score s ON s.PlayerID = tgp.PlayerID AND s.GameID = ?
     WHERE tgp.TeamGameID = ?`, [gameId, teamGameId]);
    const holeScores = new Map();
    for (const r of scoreRows) {
        if (!holeScores.has(r.TeamNumber))
            holeScores.set(r.TeamNumber, new Map());
        const perHole = holeScores.get(r.TeamNumber);
        if (!perHole.has(r.HoleID))
            perHole.set(r.HoleID, []);
        perHole.get(r.HoleID).push({ playerId: r.PlayerID, net: Number(r.NetScore) });
    }
    const teamNumbers = new Set([...rosterByTeam.keys(), ...holeScores.keys()]);
    /** Net-vs-par for whichever holes pass `holeFilter`, applying the same padding + fixed
     * hole-range keep rule getTeamGameResults uses. */
    function computeSide(teamGameId, teamNumber, perHole, holeFilter) {
        let netTotal = 0;
        let parTotal = 0;
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
            const effectiveKeepCount = isIrishFormat(format) ? (0, teamKeep_1.irishRumbleKeepCountForHole)(holeId) : keepCount;
            // "All Scores 18th Hole" (Tommy Davis rule): every rostered score counts on hole 18
            // instead of just the kept-best, same as getTeamGameResults.
            const kept = lastHoleAll && holeId === 18 ? sorted : sorted.slice(0, effectiveKeepCount);
            netTotal += kept.reduce((sum, s) => sum + s, 0);
            parTotal += (parByHole.get(holeId) ?? 0) * kept.length;
        }
        const diff = netTotal - parTotal;
        return diff === 0 ? 'Even' : diff > 0 ? `+${diff}` : `${diff}`;
    }
    const result = Array.from(teamNumbers)
        .sort((a, b) => a - b)
        .map((teamNumber) => {
        const perHole = holeScores.get(teamNumber) || new Map();
        const thru = Array.from(perHole.values()).filter((present) => present.length > 0).length;
        const front = computeSide(teamGameId, teamNumber, perHole, (h) => h <= 9);
        const back = computeSide(teamGameId, teamNumber, perHole, (h) => h > 9);
        const score = computeSide(teamGameId, teamNumber, perHole, () => true);
        return { teamNumber, players: rosterByTeam.get(teamNumber) || [], thru, score, front, back };
    });
    // Sort by score (lower/better first); teams with no holes finished yet sink to the bottom.
    return result.sort((a, b) => {
        if (a.thru === 0 && b.thru === 0)
            return a.teamNumber - b.teamNumber;
        if (a.thru === 0)
            return 1;
        if (b.thru === 0)
            return -1;
        const aDiff = a.score === 'Even' ? 0 : parseInt(a.score, 10);
        const bDiff = b.score === 'Even' ? 0 : parseInt(b.score, 10);
        return aDiff - bDiff;
    });
}
/** A past week that had at least one 36/48 team game with a rostered, scored player -- for the
 * Best Possible screen's week picker, so it only ever offers weeks the feature can actually run
 * against instead of every week with any score and then saying "not eligible" after the pick. */
async function getBestPossibleWeeks(eventId) {
    const [rows] = await config_1.default.query(`SELECT DISTINCT g.GameID, g.GameDate
     FROM Game g
     INNER JOIN TeamGame tg ON tg.GameID = g.GameID
     INNER JOIN TeamGamePlayer tgp ON tgp.TeamGameID = tg.TeamGameID
     INNER JOIN Score s ON s.GameID = g.GameID AND s.PlayerID = tgp.PlayerID
     WHERE g.GroupID = ? AND tg.Format IN ('36/48', '36', '48')
     ORDER BY g.GameDate DESC`, [eventId]);
    return rows.map((r) => ({ gameId: r.GameID, gameDate: r.GameDate }));
}
/**
 * The best possible score every team in a 36/48 team game could have produced with perfect
 * hindsight, against what each actually scored. Flatten every net score a team's real roster (no
 * padding -- see the note on getTeamGameResults) shot across every hole into one list, but rank
 * each by its value *relative to that hole's own par* (net - par), not by raw net -- holes have
 * different pars (3/4/5), so a net 4 on a par 5 is a great score while a net 4 on a par 3 is a
 * poor one, and raw net can't distinguish them. Sort by that relative value and take the lowest
 * `target` of them; their sum is already the +/- to par directly, no separate par-weighting step
 * needed. (Fixed 2026-07-24: an earlier version sorted by raw net, which could rank a mediocre
 * score on a low-par hole above a great score on a high-par hole -- caught because it let a
 * team's "best possible" come out worse than what they actually scored, which is impossible for
 * a true hindsight optimum.) Confirmed with Matt 2026-07-24: this is meant to only ever be
 * checked post-round -- an in-progress round simply won't have `target` scores to draw from yet,
 * so the comparison degrades to "best of what's been played so far" rather than erroring, but the
 * UI should only offer this once a round is done. Shown for every team in the game at once, not
 * one team at a time -- this never re-pairs anyone, it only re-picks which of a fixed team's own
 * scores count.
 */
async function getTeamBestPossible(teamGameId) {
    const [tgRows] = await config_1.default.query('SELECT GameID, Format FROM TeamGame WHERE TeamGameID = ?', [teamGameId]);
    if (tgRows.length === 0)
        return [];
    const gameId = tgRows[0].GameID;
    const format = tgRows[0].Format;
    if (!isKeepFormat(format))
        return [];
    const [rosterRows] = await config_1.default.query(`SELECT tgp.TeamNumber, tgp.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name
     FROM TeamGamePlayer tgp
     INNER JOIN Player p ON p.PlayerID = tgp.PlayerID
     WHERE tgp.TeamGameID = ?
     ORDER BY tgp.TeamNumber, p.LastName, p.FirstName`, [teamGameId]);
    if (rosterRows.length === 0)
        return [];
    const playersByTeam = new Map();
    for (const r of rosterRows) {
        if (!playersByTeam.has(r.TeamNumber))
            playersByTeam.set(r.TeamNumber, []);
        playersByTeam.get(r.TeamNumber).push({ playerId: r.PlayerID, name: r.name });
    }
    const allPlayerIds = [...new Set(rosterRows.map((r) => r.PlayerID))];
    const [gameRows] = await config_1.default.query('SELECT CourseID FROM Game WHERE GameID = ?', [gameId]);
    const courseId = gameRows[0]?.CourseID;
    const [holeRows] = await config_1.default.query('SELECT HoleNum, Par FROM CourseDetails WHERE CourseID = ?', [courseId]);
    const parByHole = new Map(holeRows.map((h) => [h.HoleNum, h.Par]));
    const [scoreRows] = await config_1.default.query('SELECT PlayerID, HoleID, NetScore FROM Score WHERE GameID = ? AND PlayerID IN (?)', [gameId, allPlayerIds]);
    const netsByPlayer = new Map();
    for (const r of scoreRows) {
        if (!netsByPlayer.has(r.PlayerID))
            netsByPlayer.set(r.PlayerID, []);
        netsByPlayer.get(r.PlayerID).push({ holeId: r.HoleID, net: Number(r.NetScore) });
    }
    const [keepRows] = await config_1.default.query('SELECT TeamNumber, HoleID, KeepCount FROM TeamGameHoleKeep WHERE TeamGameID = ?', [teamGameId]);
    const keepByTeam = new Map();
    for (const r of keepRows) {
        if (!keepByTeam.has(r.TeamNumber))
            keepByTeam.set(r.TeamNumber, []);
        keepByTeam.get(r.TeamNumber).push({ holeId: r.HoleID, keepCount: r.KeepCount });
    }
    function scoreVsPar(totalNet, totalPar) {
        const diff = totalNet - totalPar;
        return diff === 0 ? 'Even' : diff > 0 ? `+${diff}` : `${diff}`;
    }
    const results = [];
    for (const [teamNumber, teamPlayers] of playersByTeam) {
        const teamSize = teamPlayers.length;
        const target = (0, teamKeep_1.targetForTeamSize)(teamSize);
        const allDiffs = [];
        const netsByHole = new Map();
        for (const { playerId } of teamPlayers) {
            for (const { holeId, net } of netsByPlayer.get(playerId) || []) {
                allDiffs.push(net - (parByHole.get(holeId) ?? 0));
                if (!netsByHole.has(holeId))
                    netsByHole.set(holeId, []);
                netsByHole.get(holeId).push(net);
            }
        }
        // Actual: whatever the team really chose to keep, hole by hole.
        let actualNet = 0;
        let actualPar = 0;
        for (const r of keepByTeam.get(teamNumber) || []) {
            const sorted = (netsByHole.get(r.holeId) || []).slice().sort((a, b) => a - b);
            actualNet += sorted.slice(0, r.keepCount).reduce((sum, n) => sum + n, 0);
            actualPar += (parByHole.get(r.holeId) ?? 0) * r.keepCount;
        }
        // Best possible: the globally lowest `target` scores relative to their own hole's par --
        // NOT the lowest raw net scores, since holes have different pars (a net 4 on a par 5 is a
        // great score, a net 4 on a par 3 is a poor one, and raw net can't tell them apart).
        const bestDiffSum = allDiffs.slice().sort((a, b) => a - b).slice(0, target).reduce((sum, d) => sum + d, 0);
        results.push({
            teamNumber,
            players: teamPlayers.map((p) => p.name),
            teamSize,
            target,
            actualScore: scoreVsPar(actualNet, actualPar),
            bestScore: scoreVsPar(bestDiffSum, 0),
            bestDiffSum,
        });
    }
    // Best possible first (lowest/best relative-to-par sum), ties broken by team number.
    return results
        .sort((a, b) => a.bestDiffSum - b.bestDiffSum || a.teamNumber - b.teamNumber)
        .map(({ bestDiffSum, ...rest }) => rest);
}
