"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGamesForEvent = getGamesForEvent;
exports.getPlayersForGame = getPlayersForGame;
exports.getWhatIfTeamGameOptions = getWhatIfTeamGameOptions;
exports.getWhatIfResults = getWhatIfResults;
const config_1 = __importDefault(require("../db/config"));
const teamGameService_1 = require("./teamGameService");
/**
 * Get all games (weeks) played for an event, most recent first.
 */
async function getGamesForEvent(eventId) {
    const [rows] = await config_1.default.query(`SELECT DISTINCT g.GameID, g.GameDate
     FROM Game g
     INNER JOIN Score s ON s.GameID = g.GameID
     WHERE g.GroupID = ?
     ORDER BY g.GameDate DESC`, [eventId]);
    return rows.map((r) => ({ gameId: r.GameID, gameDate: r.GameDate }));
}
/**
 * Get all players who have scores in a given game, ordered by last/first name.
 */
async function getPlayersForGame(gameId) {
    const [rows] = await config_1.default.query(`SELECT DISTINCT p.PlayerID, p.LastName, p.FirstName
     FROM Player p
     INNER JOIN Score s ON s.PlayerID = p.PlayerID
     WHERE s.GameID = ?
     ORDER BY p.LastName, p.FirstName`, [gameId]);
    return rows.map((r) => ({ id: r.PlayerID, lastName: r.LastName, firstName: r.FirstName }));
}
/**
 * Which 2-person Teams N team game(s) this specific week's What-If simulation can run against —
 * What If is inherently a 2-person pairing tool (it always simulates exactly one other teammate),
 * so a slot with any other TeamSize doesn't apply. Fixed 2026-07-09: previously What If was always
 * shown/enabled regardless of team format, and always computed best-ball (min per hole) regardless
 * of the slot's actual KeepCount — wrong for a combined/aggregate 2-person format (Keep 2 of 2).
 *
 * Returns `null` for a "legacy" week — no new-system TeamGame rows at all for this GameID (an
 * event that's never used the multi-team-games feature, or a week that predates it) — callers
 * should fall back to the original always-2-person, always-best-ball behavior unchanged. An empty
 * array (not null) means this week DOES use the new system but has no eligible 2-person slot, so
 * What If genuinely doesn't apply this week.
 */
async function getWhatIfTeamGameOptions(gameId) {
    const teamGames = await (0, teamGameService_1.listTeamGames)(gameId);
    if (teamGames.length === 0)
        return null;
    return teamGames
        .filter((g) => g.teamSize === 2 && !g.skipped)
        .map((g) => ({ teamGameId: g.teamGameId, label: g.label, keepCount: g.keepCount }));
}
/**
 * For every player in the game, compute the hypothetical team result if that player were teamed
 * with `playerId` — mirrors calcwhatif.php. Sorted by total ascending (best hypothetical team
 * first). `teamGameId`, when given, resolves that specific Teams N slot's real KeepCount (1 =
 * best-ball/MIN per hole, 2 = combined/SUM of both) so the math matches how that slot actually
 * scores; omitted for a legacy week, which keeps the original best-ball-only behavior.
 */
async function getWhatIfResults(gameId, playerId, teamGameId) {
    let keepCount = 1;
    if (teamGameId) {
        const [tgRows] = await config_1.default.query('SELECT KeepCount FROM TeamGame WHERE TeamGameID = ?', [teamGameId]);
        if (tgRows.length > 0)
            keepCount = tgRows[0].KeepCount;
    }
    const holeAgg = keepCount >= 2 ? 'SUM' : 'MIN';
    const [rows] = await config_1.default.query(`SELECT CONCAT(p.LastName, ', ', p.FirstName) AS name,
            IFNULL(f.TeamNetFront, 0) AS front,
            IFNULL(b.TeamNetBack, 0) AS back,
            (IFNULL(f.TeamNetFront, 0) + IFNULL(b.TeamNetBack, 0)) AS total
     FROM (SELECT DISTINCT PlayerID FROM Score WHERE GameID = ?) allPlayers
     INNER JOIN Player p ON p.PlayerID = allPlayers.PlayerID
     LEFT OUTER JOIN (
       SELECT t1.TeamID, SUM(t1.HoleNet) AS TeamNetFront
       FROM (
         SELECT t.PlayerID AS TeamID, s.HoleID, ${holeAgg}(s.NetScore) AS HoleNet
         FROM (SELECT DISTINCT PlayerID FROM Score WHERE GameID = ?) t
         INNER JOIN Score s ON (s.PlayerID = t.PlayerID OR s.PlayerID = ?)
         WHERE s.GameID = ? AND s.HoleID < 10
         GROUP BY t.PlayerID, s.HoleID
       ) t1
       GROUP BY t1.TeamID
     ) f ON f.TeamID = allPlayers.PlayerID
     LEFT OUTER JOIN (
       SELECT t2.TeamID, SUM(t2.HoleNet) AS TeamNetBack
       FROM (
         SELECT t.PlayerID AS TeamID, s.HoleID, ${holeAgg}(s.NetScore) AS HoleNet
         FROM (SELECT DISTINCT PlayerID FROM Score WHERE GameID = ?) t
         INNER JOIN Score s ON (s.PlayerID = t.PlayerID OR s.PlayerID = ?)
         WHERE s.GameID = ? AND s.HoleID > 9
         GROUP BY t.PlayerID, s.HoleID
       ) t2
       GROUP BY t2.TeamID
     ) b ON b.TeamID = allPlayers.PlayerID
     ORDER BY (IFNULL(f.TeamNetFront, 0) + IFNULL(b.TeamNetBack, 0)) ASC`, [gameId, gameId, playerId, gameId, gameId, playerId, gameId]);
    return rows.map((r) => ({ name: r.name, front: r.front, back: r.back, total: r.total }));
}
