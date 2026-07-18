"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLatestGameForRandomTeams = getLatestGameForRandomTeams;
exports.getRandomTeamsListing = getRandomTeamsListing;
exports.getGameEligibility = getGameEligibility;
exports.getCutSummary = getCutSummary;
exports.createRandomTeams = createRandomTeams;
const config_1 = __importDefault(require("../db/config"));
const optionsService_1 = require("./optionsService");
const teamService_1 = require("./teamService");
/**
 * Find the most recent game for an event and whether random teams have already
 * been generated for it — mirrors random.php's initial lookup.
 */
async function getLatestGameForRandomTeams(eventId) {
    const [rows] = await config_1.default.query(`SELECT DISTINCT g.GameID, g.GameDate, g.RandomSet
     FROM Game g
     INNER JOIN Score s ON s.GameID = g.GameID
     WHERE g.GroupID = ?
     ORDER BY g.GameDate DESC
     LIMIT 1`, [eventId]);
    if (rows.length === 0)
        return null;
    const gameId = rows[0].GameID;
    const { stillPlaying } = await getGameEligibility(gameId);
    return {
        gameId,
        gameDate: rows[0].GameDate,
        alreadySet: rows[0].RandomSet === 'T',
        stillPlaying: stillPlaying.map((p) => p.name),
    };
}
/**
 * Get the current team roster (with per-game handicap) for a game, grouped by team.
 *
 * A player only gets a row in Hdcp for this exact GameID if their foursome was started
 * through the app's Start Game screen — plenty of games only ever had handicaps recorded
 * under a different GameID (e.g. entered before this feature existed, or via the legacy
 * site). So when there's no exact-game record, fall back to the most recent handicap on
 * record at or before this game's date (or, failing that, the earliest one on record at all)
 * so everyone shows the handicap they actually started this game with, not a blank.
 */
async function getRandomTeamsListing(gameId) {
    const teamGameId = await (0, teamService_1.resolveTeamGameId)(gameId);
    if (teamGameId === null)
        return [];
    const [teamRows] = await config_1.default.query(`SELECT t.TeamNumber AS TeamID, t.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name, g.GameDate
     FROM TeamGamePlayer t
     INNER JOIN Player p ON p.PlayerID = t.PlayerID
     INNER JOIN TeamGame tg ON tg.TeamGameID = t.TeamGameID
     INNER JOIN Game g ON g.GameID = tg.GameID
     WHERE t.TeamGameID = ?
     ORDER BY t.TeamNumber, p.LastName, p.FirstName`, [teamGameId]);
    if (teamRows.length === 0)
        return [];
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
        if (!byTeam.has(r.TeamID))
            byTeam.set(r.TeamID, { teamId: r.TeamID, players: [] });
        byTeam.get(r.TeamID).players.push({ name: r.name, hdcp: resolveHdcp(r.PlayerID, r.GameDate) });
    }
    for (const team of byTeam.values()) {
        team.players.sort((a, b) => (a.hdcp ?? Infinity) - (b.hdcp ?? Infinity) || a.name.localeCompare(b.name));
    }
    return Array.from(byTeam.values()).sort((a, b) => a.teamId - b.teamId);
}
/** A player's shape using a strict, clean-only match — used only to detect the majority side. */
function strictShape(c) {
    if (c.front === 9 && c.back === 9)
        return 'full18';
    if (c.front === 9 && c.back === 0)
        return 'front9';
    if (c.back === 9 && c.front === 0)
        return 'back9';
    return 'incomplete';
}
/**
 * Get every active (non-opted-out, non-removed) player's raw front-9/back-9 hole counts and
 * net totals for a game.
 */
async function getPlayerCounts(gameId) {
    const [rows] = await config_1.default.query(`SELECT s.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name,
            SUM(CASE WHEN s.HoleID BETWEEN 1 AND 9 THEN 1 ELSE 0 END) AS frontCount,
            SUM(CASE WHEN s.HoleID BETWEEN 10 AND 18 THEN 1 ELSE 0 END) AS backCount,
            SUM(CASE WHEN s.HoleID BETWEEN 1 AND 9 THEN s.NetScore ELSE 0 END) AS frontNet,
            SUM(CASE WHEN s.HoleID BETWEEN 10 AND 18 THEN s.NetScore ELSE 0 END) AS backNet
     FROM Score s
     INNER JOIN Player p ON p.PlayerID = s.PlayerID
     WHERE s.GameID = ? AND s.PlayerID NOT IN (SELECT o.PlayerID FROM OptOut o WHERE o.GameID = ?)
     GROUP BY s.PlayerID, p.LastName, p.FirstName`, [gameId, gameId]);
    return rows.map((r) => ({
        playerId: r.PlayerID,
        name: r.name,
        front: Number(r.frontCount),
        back: Number(r.backCount),
        frontNet: Number(r.frontNet),
        backNet: Number(r.backNet),
    }));
}
/**
 * Determine which players in a game are done, which side (18/front-9/back-9) most of them
 * played, and — among those matching that majority side — who's under the event's Net Score
 * to Make Cut and therefore eligible to be teamed up.
 *
 * The "has everyone finished" check always applies, whether or not a Net Score to Make Cut
 * is configured — random teams can't be drawn while players are still mid-round either way.
 * The Net Score to Make Cut option only adds a further filter on top: once everyone's done,
 * it excludes anyone over the cut line. With no cut configured, every player who finished
 * (and matched the majority side) is simply eligible immediately.
 *
 * Majority is detected first from each player's strict, clean-only shape. Once known:
 *  - If the majority is a full 18, there's no "wrong side" to mix up — both nines get played
 *    by everyone, so anyone not at a clean full 18 simply hasn't finished yet (still playing),
 *    no matter how their partial holes happen to be split.
 *  - If the majority is front-9-only or back-9-only (a genuinely 9-hole event), a player only
 *    needs a complete set of the *majority* side's 9 holes to count as finished — any stray
 *    holes they also have on the other side (e.g. a few holes entered on Front 9 by mistake
 *    before restarting correctly on Back 9) are simply ignored, not held against them. Someone
 *    with a complete *other*-side round and nothing on the majority side is the genuine
 *    wrong-side case and gets excluded.
 *
 * `cutOptionPrefix` selects which Options "Teams N" card's Net Score to Make Cut applies —
 * defaults to 'teams' (Teams 1 / the legacy single-team-game system's unprefixed keys) for
 * every existing caller. teamGameService.ts passes 'teams2'/'teams3'/'teams4' when drawing for
 * those slots, so each slot's own cut line is honored instead of always falling back to Teams 1's.
 */
async function getGameEligibility(gameId, cutOptionPrefix = 'teams') {
    const [gameRows] = await config_1.default.query('SELECT GroupID FROM Game WHERE GameID = ?', [gameId]);
    const options = gameRows.length > 0 ? await (0, optionsService_1.getEventOptions)(gameRows[0].GroupID) : null;
    const counts = await getPlayerCounts(gameId);
    const shapeCounts = {};
    for (const c of counts) {
        const shape = strictShape(c);
        shapeCounts[shape] = (shapeCounts[shape] || 0) + 1;
    }
    const shapePriority = ['full18', 'front9', 'back9'];
    let majorityShape = null;
    let bestCount = 0;
    for (const shape of shapePriority) {
        if ((shapeCounts[shape] || 0) > bestCount) {
            bestCount = shapeCounts[shape];
            majorityShape = shape;
        }
    }
    const stillPlaying = [];
    const matchingMajority = [];
    const excludedWrongSide = [];
    if (majorityShape === 'full18') {
        for (const c of counts) {
            if (c.front === 9 && c.back === 9) {
                matchingMajority.push({ playerId: c.playerId, name: c.name, shape: 'full18', total: c.frontNet + c.backNet });
            }
            else {
                stillPlaying.push({ playerId: c.playerId, name: c.name, shape: 'incomplete', total: 0 });
            }
        }
    }
    else if (majorityShape === 'front9' || majorityShape === 'back9') {
        const majorityIsFront = majorityShape === 'front9';
        for (const c of counts) {
            const majorityCount = majorityIsFront ? c.front : c.back;
            const minorityCount = majorityIsFront ? c.back : c.front;
            const majorityNet = majorityIsFront ? c.frontNet : c.backNet;
            const minorityNet = majorityIsFront ? c.backNet : c.frontNet;
            if (majorityCount === 9) {
                // Finished the correct side — any stray holes on the other side are ignored.
                matchingMajority.push({ playerId: c.playerId, name: c.name, shape: majorityShape, total: majorityNet });
            }
            else if (minorityCount === 9 && majorityCount === 0) {
                // Completed only the other side and never came back to fix it — the genuine wrong-side case.
                excludedWrongSide.push({ playerId: c.playerId, name: c.name, shape: majorityIsFront ? 'back9' : 'front9', total: minorityNet });
            }
            else {
                stillPlaying.push({ playerId: c.playerId, name: c.name, shape: 'incomplete', total: 0 });
            }
        }
    }
    else {
        // No majority could be determined (e.g. nobody has any complete side yet).
        for (const c of counts)
            stillPlaying.push({ playerId: c.playerId, name: c.name, shape: 'incomplete', total: 0 });
    }
    if (stillPlaying.length > 0) {
        return { stillPlaying, majorityShape: null, eligiblePlayerIds: [], excludedWrongSide: [], excludedOverCut: [], cut: null };
    }
    const cutKey = (majorityShape === 'full18' ? `${cutOptionPrefix}_netcut` : `${cutOptionPrefix}_netcut9`);
    const cutValue = options?.[cutKey];
    const cut = cutValue && cutValue !== '' ? Number(cutValue) : null;
    const excludedOverCut = [];
    const eligiblePlayerIds = [];
    for (const p of matchingMajority) {
        if (cut !== null && p.total > cut) {
            excludedOverCut.push(p);
        }
        else {
            eligiblePlayerIds.push(p.playerId);
        }
    }
    return { stillPlaying, majorityShape, eligiblePlayerIds, excludedWrongSide, excludedOverCut, cut };
}
/**
 * Get the Net Score to Make Cut summary for a game's Team results — the applicable cut line
 * (9- or 18-hole, based on the majority side) and who missed it, sorted low to high. Empty
 * (cutLine: null) when no cut is configured, or when not everyone has finished yet.
 */
async function getCutSummary(gameId) {
    const eligibility = await getGameEligibility(gameId);
    if (eligibility.stillPlaying.length > 0 || eligibility.cut === null) {
        return { cutLine: null, missedCut: [] };
    }
    const missedCut = eligibility.excludedOverCut
        .slice()
        .sort((a, b) => a.total - b.total)
        .map((p) => ({ name: p.name, total: p.total }));
    return { cutLine: eligibility.cut, missedCut };
}
/**
 * Randomly pair up eligible players in a game into teams of two, replacing any existing
 * teams — mirrors random.php, extended with the event's Net Score to Make Cut: only players
 * who (a) have finished all their holes, (b) played the same side (18/front-9/back-9) as the
 * majority of the field, and (c) shot at or under the applicable cut are included in the draw.
 * Refuses to run until every active player has finished, and refuses to re-run once a game's
 * teams have already been randomized (Game.RandomSet = 'T').
 *
 * A leftover odd player out is paired onto the same team as the very first player
 * drawn (rather than left alone or forming a 3-person team) — this mirrors the PHP's
 * exact (if unusual) tie-breaking rule, so that player ends up rostered on two teams.
 */
async function createRandomTeams(gameId) {
    const [gameRows] = await config_1.default.query('SELECT RandomSet FROM Game WHERE GameID = ?', [gameId]);
    if (gameRows.length > 0 && gameRows[0].RandomSet === 'T') {
        return { alreadySet: true, teams: await getRandomTeamsListing(gameId) };
    }
    const eligibility = await getGameEligibility(gameId);
    if (eligibility.stillPlaying.length > 0) {
        return { alreadySet: false, teams: [], stillPlaying: eligibility.stillPlaying.map((p) => p.name) };
    }
    const teamGameId = await (0, teamService_1.getOrCreateDefaultTeamGameId)(gameId);
    await config_1.default.query('DELETE FROM TeamGamePlayer WHERE TeamGameID = ?', [teamGameId]);
    const [playerRows] = await config_1.default.query(`SELECT PlayerID FROM Player WHERE PlayerID IN (?) ORDER BY RAND()`, [eligibility.eligiblePlayerIds.length > 0 ? eligibility.eligiblePlayerIds : [0]]);
    const PLAYERS_PER_TEAM = 2;
    let teamId = 0;
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
            teamId++;
        teamRows.push({ teamId, playerId: row.PlayerID });
    }
    // Odd player out (2/team, odd eligible count): rather than form one unfair 3-person team
    // (best-of-3 vs. everyone else's best-of-2 is a real scoring advantage/disadvantage,
    // and for a combined-score format 3 scores summed isn't comparable to 2 at all — confirmed
    // with the user, 2026-07-09), the leftover player joins the FIRST-drawn player's team as a
    // second team — every team stays exactly 2-person and directly comparable. The first-drawn
    // player ends up on two teams (their own, plus this extra one with the odd player out); that's
    // the "prize" for the luck of the draw, not an unfair scoring burden on anyone.
    // TeamGamePlayer's primary key is (TeamGameID, TeamNumber, PlayerID), so the same player
    // belonging to two different TeamNumbers in the same team game is a legitimate, supported row
    // shape, not a duplicate.
    if (posInTeam > 0 && posInTeam < PLAYERS_PER_TEAM && firstPlayerId !== null && playerRows.length > 1) {
        teamRows.push({ teamId, playerId: firstPlayerId });
    }
    if (teamRows.length > 0) {
        const rowPlaceholders = teamRows.map(() => `(?, ?, ?, 'App')`).join(', ');
        const params = teamRows.flatMap((t) => [teamGameId, t.teamId, t.playerId]);
        await config_1.default.query(`INSERT INTO TeamGamePlayer (TeamGameID, TeamNumber, PlayerID, LastUpdateUser) VALUES ${rowPlaceholders}`, params);
    }
    await config_1.default.query(`UPDATE Game SET RandomSet = 'T' WHERE GameID = ?`, [gameId]);
    return { alreadySet: false, teams: await getRandomTeamsListing(gameId) };
}
