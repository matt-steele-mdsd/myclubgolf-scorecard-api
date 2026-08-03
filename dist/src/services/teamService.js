"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTeamGameId = resolveTeamGameId;
exports.getOrCreateDefaultTeamGameId = getOrCreateDefaultTeamGameId;
exports.hasTeams = hasTeams;
exports.getTeamAssignments = getTeamAssignments;
exports.getTeamResults = getTeamResults;
exports.saveTeams = saveTeams;
exports.getTeamScorecard = getTeamScorecard;
const config_1 = __importDefault(require("../db/config"));
/** Resolve which TeamGame a plain gameId-scoped call (hasTeams/getTeamResults/saveTeams/
 * getTeamScorecard — the pre-Team-Games single-team-game API weekresults.tsx and pickteams.tsx
 * still use) should read/write. Prefers Slot 1 (or whichever slot-less/first TeamGame exists)
 * so these calls keep working unmodified against whatever "Teams 1"-equivalent card already
 * exists for the game, created either here or via the Team Games screen. Returns null if none
 * exists yet. Replaces the legacy `Team` table (dropped 2026-07-13) as this file's storage. */
async function resolveTeamGameId(gameId) {
    const [rows] = await config_1.default.query(`SELECT TeamGameID FROM TeamGame WHERE GameID = ? ORDER BY (Slot IS NULL), Slot, TeamGameID LIMIT 1`, [gameId]);
    return rows.length > 0 ? rows[0].TeamGameID : null;
}
async function getOrCreateDefaultTeamGameId(gameId) {
    const existing = await resolveTeamGameId(gameId);
    if (existing !== null)
        return existing;
    await config_1.default.query(`INSERT INTO TeamGame (GameID, Label, TeamSize, KeepCount, AssignMode, RandomSet, LastUpdateUser, Slot)
     VALUES (?, 'Teams 1', 2, 1, 'M', 'F', 'App', 1)`, [gameId]);
    const [result] = await config_1.default.query('SELECT LAST_INSERT_ID() AS TeamGameID');
    return result[0].TeamGameID;
}
/**
 * Check whether teams have already been set up for a game (mirrors showresults.php's $selteams check).
 */
async function hasTeams(gameId) {
    const teamGameId = await resolveTeamGameId(gameId);
    if (teamGameId === null)
        return false;
    const [rows] = await config_1.default.query('SELECT COUNT(*) AS cnt FROM TeamGamePlayer WHERE TeamGameID = ?', [teamGameId]);
    return rows[0].cnt > 0;
}
/**
 * Get the current team assignments for a game as an array of player-ID arrays, ordered by
 * TeamNumber — the inverse of saveTeams, used to prefill the Pick Teams builder when a game
 * already has manually-picked (non-randomized) teams to edit.
 */
async function getTeamAssignments(gameId) {
    const teamGameId = await resolveTeamGameId(gameId);
    if (teamGameId === null)
        return [];
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
async function getTeamResults(gameId) {
    const teamGameId = await resolveTeamGameId(gameId);
    if (teamGameId === null)
        return [];
    const [totalsRows] = await config_1.default.query(`SELECT allTeams.TeamNumber,
            IFNULL(f.TeamNetFront, 0) AS front,
            IFNULL(b.TeamNetBack, 0) AS back,
            (IFNULL(f.TeamNetFront, 0) + IFNULL(b.TeamNetBack, 0)) AS total
     FROM (SELECT DISTINCT TeamNumber FROM TeamGamePlayer WHERE TeamGameID = ?) allTeams
     LEFT OUTER JOIN (
       SELECT t1.TeamNumber, SUM(t1.HoleNet) AS TeamNetFront
       FROM (
         SELECT t.TeamNumber, s.HoleID, MIN(s.NetScore) AS HoleNet
         FROM TeamGamePlayer t
         INNER JOIN Score s ON s.GameID = ? AND s.PlayerID = t.PlayerID AND s.HoleID < 10
         WHERE t.TeamGameID = ?
         GROUP BY t.TeamNumber, s.HoleID
       ) t1
       GROUP BY t1.TeamNumber
     ) f ON f.TeamNumber = allTeams.TeamNumber
     LEFT OUTER JOIN (
       SELECT t2.TeamNumber, SUM(t2.HoleNet) AS TeamNetBack
       FROM (
         SELECT t.TeamNumber, s.HoleID, MIN(s.NetScore) AS HoleNet
         FROM TeamGamePlayer t
         INNER JOIN Score s ON s.GameID = ? AND s.PlayerID = t.PlayerID AND s.HoleID > 9
         WHERE t.TeamGameID = ?
         GROUP BY t.TeamNumber, s.HoleID
       ) t2
       GROUP BY t2.TeamNumber
     ) b ON b.TeamNumber = allTeams.TeamNumber
     ORDER BY allTeams.TeamNumber`, [teamGameId, gameId, teamGameId, gameId, teamGameId]);
    const [rosterRows] = await config_1.default.query(`SELECT t.TeamNumber, CONCAT(p.LastName, ', ', p.FirstName) AS name
     FROM TeamGamePlayer t
     INNER JOIN Player p ON p.PlayerID = t.PlayerID
     WHERE t.TeamGameID = ?
     ORDER BY t.TeamNumber, p.LastName, p.FirstName`, [teamGameId]);
    const rosterByTeam = new Map();
    for (const r of rosterRows) {
        if (!rosterByTeam.has(r.TeamNumber))
            rosterByTeam.set(r.TeamNumber, []);
        rosterByTeam.get(r.TeamNumber).push(r.name);
    }
    return totalsRows
        .map((r) => ({
        teamId: r.TeamNumber,
        front: r.front,
        back: r.back,
        total: r.total,
        players: rosterByTeam.get(r.TeamNumber) || [],
    }))
        .sort((a, b) => a.total - b.total);
}
/**
 * Replace all teams for a game — mirrors saveteams.php. `teams` is an array of
 * player-ID arrays; each array's position (1-based) becomes the TeamNumber.
 */
async function saveTeams(gameId, teams) {
    const teamGameId = await getOrCreateDefaultTeamGameId(gameId);
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
async function getTeamScorecard(gameId, teamId, side) {
    const holeStart = side === 'B' ? 10 : 1;
    const holeEnd = side === 'F' ? 9 : 18;
    const teamGameId = await resolveTeamGameId(gameId);
    if (teamGameId === null)
        return [];
    const [rows] = await config_1.default.query(`SELECT sc.PlayerID, CONCAT(p.LastName, ', ', p.FirstName) AS name, sc.HoleID, sc.NetScore
     FROM Score sc
     INNER JOIN TeamGamePlayer t ON t.TeamGameID = ? AND t.TeamNumber = ? AND t.PlayerID = sc.PlayerID
     INNER JOIN Player p ON p.PlayerID = sc.PlayerID
     WHERE sc.GameID = ? AND sc.HoleID >= ? AND sc.HoleID <= ?
     ORDER BY sc.PlayerID, sc.HoleID`, [teamGameId, teamId, gameId, holeStart, holeEnd]);
    const byPlayer = new Map();
    for (const r of rows) {
        if (!byPlayer.has(r.PlayerID)) {
            byPlayer.set(r.PlayerID, { name: r.name, holes: {}, total: 0 });
        }
        const entry = byPlayer.get(r.PlayerID);
        entry.holes[r.HoleID] = r.NetScore;
        entry.total += r.NetScore;
    }
    return Array.from(byPlayer.values());
}
