"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllPlayersWithHistory = getAllPlayersWithHistory;
exports.getPlayerStats = getPlayerStats;
exports.getPlayerRounds = getPlayerRounds;
const config_1 = __importDefault(require("../db/config"));
/**
 * Get every player who has ever recorded a score, across all events, ordered by name —
 * mirrors phistory.php's global player dropdown (not scoped to any one event).
 */
async function getAllPlayersWithHistory() {
    const [rows] = await config_1.default.query(`SELECT DISTINCT p.PlayerID, p.LastName, p.FirstName
     FROM Player p
     INNER JOIN Score s ON s.PlayerID = p.PlayerID
     ORDER BY p.LastName, p.FirstName`);
    return rows.map((r) => ({ id: r.PlayerID, lastName: r.LastName, firstName: r.FirstName }));
}
/**
 * Get a player's all-time gross/net average/min/max — mirrors getstats.php. Only games where
 * the player recorded all 18 holes count (9-hole rounds are excluded), same as the legacy site.
 */
async function getPlayerStats(playerId) {
    const [rows] = await config_1.default.query(`SELECT FORMAT(AVG(GrossScore), 2) AS avgScore, MIN(GrossScore) AS minScore, MAX(GrossScore) AS maxScore,
            FORMAT(AVG(NetScore), 2) AS avgNet, MIN(NetScore) AS minNet, MAX(NetScore) AS maxNet
     FROM (
       SELECT GameID, SUM(Score) AS GrossScore, SUM(NetScore) AS NetScore
       FROM Score
       WHERE PlayerID = ?
       GROUP BY GameID
       HAVING COUNT(HoleID) = 18
     ) AS rounds`, [playerId]);
    if (rows.length === 0 || rows[0].avgScore === null)
        return null;
    return {
        avgScore: rows[0].avgScore,
        minScore: Number(rows[0].minScore),
        maxScore: Number(rows[0].maxScore),
        avgNet: rows[0].avgNet,
        minNet: Number(rows[0].minNet),
        maxNet: Number(rows[0].maxNet),
    };
}
/**
 * Get a player's 20 most recent full 18-hole rounds, newest first — mirrors getprounds.php.
 */
async function getPlayerRounds(playerId) {
    const [rows] = await config_1.default.query(`SELECT g.GameID AS gameId, g.GameDate AS gameDate, SUM(s.Score) AS score, SUM(s.NetScore) AS net
     FROM Game g
     INNER JOIN Score s ON s.GameID = g.GameID
     WHERE s.PlayerID = ?
     GROUP BY g.GameID, g.GameDate
     HAVING COUNT(s.HoleID) = 18
     ORDER BY g.GameDate DESC
     LIMIT 20`, [playerId]);
    return rows.map((r) => ({ gameId: r.gameId, gameDate: r.gameDate, score: Number(r.score), net: Number(r.net) }));
}
